import time
import uuid
import json
import asyncio
import httpx
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..config import NANOGPT_API_KEY, NANOGPT_BASE_URL
from ..database import get_db
from ..models_store import get_models_config
from ..prompts import SYSTEM_PROMPT

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

class CreateSessionRequest(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = "New Session"
    model: Optional[str] = None

class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = None
    thinking: Optional[str] = None

class MessageSchema(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    thinking: Optional[str] = ""
    created_at: int

class SessionDetailSchema(BaseModel):
    id: str
    title: str
    model: str
    created_at: int
    updated_at: int
    messages: List[MessageSchema]

# Global strong-reference set to prevent Python GC from dropping active background tasks
_active_background_tasks: set[asyncio.Task] = set()

@router.get("")
async def list_sessions():
    """List all sessions sorted by updated_at DESC."""
    query = """
    SELECT 
        s.id, s.title, s.model, s.created_at, s.updated_at,
        COUNT(m.id) as message_count,
        (SELECT content FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM sessions s
    LEFT JOIN messages m ON s.id = m.session_id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    """
    async with get_db() as db:
        async with db.execute(query) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "model": row["model"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "message_count": row["message_count"],
                    "last_message": row["last_message"] or ""
                }
                for row in rows
            ]

@router.post("")
async def create_session(payload: CreateSessionRequest):
    """Create a new session."""
    session_id = payload.id or uuid.uuid4().hex
    now = int(time.time() * 1000)

    # Resolve default model if not provided
    model = payload.model
    if not model:
        cfg = await get_models_config()
        model = cfg.default_model

    title = payload.title or "New Session"

    async with get_db() as db:
        await db.execute(
            "INSERT INTO sessions (id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (session_id, title, model, now, now)
        )
        await db.commit()

    return {
        "id": session_id,
        "title": title,
        "model": model,
        "created_at": now,
        "updated_at": now
    }

@router.get("/{session_id}")
async def get_session(session_id: str):
    """Retrieve session metadata and chronological messages."""
    async with get_db() as db:
        async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cursor:
            sess_row = await cursor.fetchone()
            if not sess_row:
                raise HTTPException(status_code=404, detail="Session not found")

        async with db.execute(
            "SELECT id, session_id, role, content, thinking, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,)
        ) as cursor:
            msg_rows = await cursor.fetchall()

    return {
        "id": sess_row["id"],
        "title": sess_row["title"],
        "model": sess_row["model"],
        "created_at": sess_row["created_at"],
        "updated_at": sess_row["updated_at"],
        "messages": [
            {
                "id": row["id"],
                "session_id": row["session_id"],
                "role": row["role"],
                "content": row["content"],
                "thinking": row["thinking"] or "",
                "created_at": row["created_at"]
            }
            for row in msg_rows
        ]
    }

@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """Delete session and cascade delete messages."""
    async with get_db() as db:
        # PRAGMA foreign_keys is ON, cascade delete will remove messages
        cursor = await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "id": session_id}

@router.patch("/{session_id}")
async def update_session(session_id: str, payload: UpdateSessionRequest):
    """Update session title or active model."""
    now = int(time.time() * 1000)
    updates = []
    params = []

    if payload.title is not None:
        updates.append("title = ?")
        params.append(payload.title)
    if payload.model is not None:
        updates.append("model = ?")
        params.append(payload.model)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates.append("updated_at = ?")
    params.append(now)
    params.append(session_id)

    async with get_db() as db:
        cursor = await db.execute(
            f"UPDATE sessions SET {', '.join(updates)} WHERE id = ?",
            params
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")

        async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cur:
            row = await cur.fetchone()

    return {
        "id": row["id"],
        "title": row["title"],
        "model": row["model"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"]
    }

async def save_assistant_message(session_id: str, msg_id: str, content: str, created_at: int, thinking: str = ""):
    """Commit completed assistant prompt to SQLite."""
    if not content:
        content = ""
    cleaned_content = content.strip()
    # Strip any enclosing markdown code block if present
    if cleaned_content.startswith("```") and cleaned_content.endswith("```"):
        lines = cleaned_content.splitlines()
        if len(lines) >= 2:
            cleaned_content = "\n".join(lines[1:-1]).strip()

    now = int(time.time() * 1000)
    try:
        async with get_db() as db:
            await db.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, role, content, thinking, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (msg_id, session_id, "assistant", cleaned_content, thinking or "", created_at)
            )
            await db.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id)
            )
            await db.commit()
    except Exception as e:
        print(f"[ERROR] Failed to save assistant message: {e}")

@router.post("/{session_id}/chat")
async def chat_stream(session_id: str, payload: ChatRequest, request: Request):
    """
    Chat completion with SSE streaming.
    Saves user message immediately to SQLite.
    Loads chronological history with system prompt.
    Dispatches to NanoGPT with extended thinking.
    Streams SSE to client and guarantees SQLite persistence even on disconnect.
    """
    now = int(time.time() * 1000)
    user_msg_id = uuid.uuid4().hex
    assistant_msg_id = uuid.uuid4().hex

    # 1. Verify session exists & save user message
    async with get_db() as db:
        async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cursor:
            sess_row = await cursor.fetchone()
            if not sess_row:
                raise HTTPException(status_code=404, detail="Session not found")

        # Save user message immediately
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_msg_id, session_id, "user", payload.message.strip(), now)
        )

        # Auto-update session title if it's default
        current_title = sess_row["title"]
        if current_title in ("New Session", "Untitled", ""):
            new_title = payload.message.strip().split("\n")[0][:45]
            if len(payload.message.strip().split("\n")[0]) > 45:
                new_title += "..."
            await db.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                (new_title, now, session_id)
            )
        else:
            await db.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id)
            )
        await db.commit()

        # Load complete chronological messages
        async with db.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,)
        ) as cursor:
            all_msgs = await cursor.fetchall()

    # 2. Determine model and thinking level
    cfg = await get_models_config()
    model = payload.model or sess_row["model"] or cfg.default_model
    thinking_level = payload.thinking or cfg.default_thinking or "high"

    # 3. Construct NanoGPT OpenAI-compatible payload
    messages_payload = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in all_msgs:
        messages_payload.append({
            "role": m["role"],
            "content": m["content"]
        })

    api_payload: Dict[str, Any] = {
        "model": model,
        "messages": messages_payload,
        "stream": True,
    }

    # Pass extended thinking according to NanoGPT docs
    if thinking_level and thinking_level != "none":
        api_payload["reasoning_effort"] = thinking_level

    # 4. Asynchronous resilient stream consumer
    # We use an asyncio.Queue to decouple upstream NanoGPT fetching from client SSE delivery
    queue: asyncio.Queue[Optional[dict]] = asyncio.Queue()
    completed_event = asyncio.Event()

    async def fetch_upstream_and_persist():
        buffer_content = []
        buffer_thinking = []
        target_url = f"{NANOGPT_BASE_URL}/chat/completions"
        headers = {
            "Authorization": f"Bearer {NANOGPT_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            timeout = httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", target_url, headers=headers, json=api_payload) as response:
                    if response.status_code != 200:
                        error_body = await response.aread()
                        err_text = error_body.decode("utf-8", errors="replace")
                        await queue.put({
                            "type": "error",
                            "error": f"NanoGPT upstream error {response.status_code}: {err_text}"
                        })
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line = line.strip()
                        if line == "data: [DONE]":
                            break
                        if line.startswith("data: "):
                            raw_json = line[6:]
                            try:
                                chunk_obj = json.loads(raw_json)
                                choices = chunk_obj.get("choices", [])
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})

                                # Extract reasoning / thinking delta if present
                                reasoning_delta = delta.get("reasoning") or delta.get("reasoning_content") or ""
                                if reasoning_delta:
                                    buffer_thinking.append(reasoning_delta)
                                    await queue.put({
                                        "type": "thinking",
                                        "delta": reasoning_delta
                                    })

                                # Extract prompt content delta
                                content_delta = delta.get("content") or ""
                                if content_delta:
                                    buffer_content.append(content_delta)
                                    await queue.put({
                                        "type": "content",
                                        "delta": content_delta
                                    })
                            except Exception:
                                pass
        except Exception as e:
            await queue.put({
                "type": "error",
                "error": f"Upstream connection failure: {str(e)}"
            })
        finally:
            full_content = "".join(buffer_content)
            full_thinking = "".join(buffer_thinking)
            # CRITICAL: Always persist completed prompt into SQLite regardless of client disconnect
            created_time = int(time.time() * 1000)
            if full_content:
                await save_assistant_message(session_id, assistant_msg_id, full_content, created_time, full_thinking)
            
            await queue.put({
                "type": "done",
                "id": assistant_msg_id,
                "content": full_content,
                "thinking": full_thinking
            })
            await queue.put(None)  # Sentinel to close consumer
            completed_event.set()

    # Launch background fetch task and retain strong reference so disconnect or GC cannot cancel the DB write
    bg_task = asyncio.create_task(fetch_upstream_and_persist())
    _active_background_tasks.add(bg_task)
    bg_task.add_done_callback(_active_background_tasks.discard)

    async def sse_event_generator():
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    # Stop SSE generator; background task continues running to save SQLite prompt
                    break

                try:
                    item = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if completed_event.is_set() and queue.empty():
                        break
                    # Send keep-alive comment
                    yield ": ping\n\n"
                    continue

                if item is None:
                    break

                event_type = item.get("type", "message")
                data_str = json.dumps(item)
                yield f"event: {event_type}\ndata: {data_str}\n\n"
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        sse_event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

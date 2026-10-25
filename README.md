# PromptForge: AI Image-Prompt Architect (Full-Stack Minimal)

A full-stack, mobile-first Progressive Web App (PWA) designed as an iterative AI image-prompt architect for state-of-the-art vision models (Nano Banana, GPT Image, Grok Image, Seedream, Meta Muse Image) connecting to NanoGPT's OpenAI-compatible endpoint with extended thinking support.

---

## 1. Features

- **Iterative AI Prompt Engineering**: Multi-turn conversational flow preserving unchanged elements while surgical modifications are applied.
- **Pure Output Law**: Raw, self-contained prompt generation ready for immediate use in image generators without greetings, commentary, or markdown code fences.
- **NanoGPT Extended Thinking**: Deep reasoning support defaulted to `high` (`reasoning_effort: "high"`) with thinking trace inspection.
- **Dynamic Model Swapping**: Switch between GLM 5.3 Flash, Meta Muse Spark, DeepSeek R1, Qwen 3.8 27B Thinking, or register any custom NanoGPT model ID.
- **1-Tap Prompt Copy UX**: Independent one-tap copy button with copied state and haptic feedback on every assistant card.
- **Crash & Disconnect Resilience**: Server buffers stream tokens and commits the completed assistant prompt into SQLite even if the client disconnects or mobile tab sleeps.
- **Mobile First & iOS PWA Optimized**: OLED black UI (`#000000`), touch containment, 16px minimum font size (suppressing iOS auto-zoom), safe area inset handling, standalone display.

---

## 2. Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLite with `aiosqlite`, SSE streaming proxy, `httpx`, `pydantic`.
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, `lucide-react`.
- **Persistence**: SQLite database stored in `backend/data/promptforge.db`.

---

## 3. Quick Start (Local Development)

### Backend
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
# Edit backend/.env with your NANOGPT_API_KEY
uvicorn backend.app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Production Build & Single Process Serving
```bash
npm run build
bash start.sh
```

---

## 4. API Endpoints

- `GET /api/sessions`: List sessions ordered by `updated_at DESC`.
- `POST /api/sessions`: Create session (`{ id, title, model }`).
- `GET /api/sessions/{session_id}`: Retrieve session and its chronological message history.
- `DELETE /api/sessions/{session_id}`: Delete session with cascade deletion.
- `PATCH /api/sessions/{session_id}`: Update session title or active model.
- `POST /api/sessions/{session_id}/chat`: SSE stream generation proxy with extended thinking.
- `GET /api/models`: List available models and thinking configuration.
- `POST /api/models`: Register a new custom model ID.
- `DELETE /api/models/{model_id}`: Remove a model.
- `PATCH /api/models/settings`: Update default model and thinking depth.
- `GET /api/health`: Health status.

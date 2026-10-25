import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from ..config import NANOGPT_API_KEY, NANOGPT_BASE_URL
from ..models_store import (
    ModelItem,
    get_models_config,
    add_or_update_model,
    remove_model,
    update_settings
)

router = APIRouter(prefix="/api/models", tags=["models"])

class UpdateSettingsRequest(BaseModel):
    default_model: Optional[str] = None
    default_thinking: Optional[str] = None

@router.get("")
async def get_models():
    """Retrieve full models configuration and thinking levels."""
    cfg = await get_models_config()
    return cfg.model_dump()

@router.post("")
async def create_model(model: ModelItem):
    """Add or update a model in configuration."""
    cfg = await add_or_update_model(model)
    return cfg.model_dump()

@router.delete("/{model_id:path}")
async def delete_model(model_id: str):
    """Delete a custom model."""
    cfg = await remove_model(model_id)
    return cfg.model_dump()

@router.patch("/settings")
async def change_settings(payload: UpdateSettingsRequest):
    """Update default model and default thinking depth."""
    cfg = await update_settings(payload.default_model, payload.default_thinking)
    return cfg.model_dump()

@router.get("/upstream")
async def list_upstream_nanogpt_models():
    """Fetch live catalog from NanoGPT to discover models."""
    target_url = f"{NANOGPT_BASE_URL}/models"
    headers = {
        "Authorization": f"Bearer {NANOGPT_API_KEY}"
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(target_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                model_ids = [m["id"] for m in data.get("data", []) if "id" in m]
                return {"models": model_ids}
            return {"models": []}
    except Exception as e:
        return {"models": [], "error": str(e)}

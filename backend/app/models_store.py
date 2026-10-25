import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from .config import MODELS_FILE

DEFAULT_MODELS = [
    {
        "id": "z-ai/glm-5.3-flash",
        "name": "GLM 5.3 Flash (Default)",
        "description": "Fast reasoning flagship with deep thinking capabilities",
        "supports_thinking": True,
        "is_default": True
    },
    {
        "id": "z-ai/glm-5.3-flash-uncensored",
        "name": "GLM 5.3 Flash Uncensored",
        "description": "Uncensored fast reasoning flagship",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "z-ai/glm-5.3:thinking",
        "name": "GLM 5.3 Thinking",
        "description": "Flagship reasoning model fine-tuned for deep thinking",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "moonshotai/kimi-k2.6:thinking",
        "name": "Kimi k2.6 (Thinking)",
        "description": "Advanced long-context reasoning with deep thought traces",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "deepseek/deepseek-v4.1-flash-1017:thinking",
        "name": "DeepSeek V4.1 Flash (Thinking)",
        "description": "Ultra-fast reasoning model with thinking capabilities",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "meta/muse-spark-1.3-contributor",
        "name": "Muse Spark 1.3 Contributor",
        "description": "Meta Muse specialized vision-prompt synthesis",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "deepseek-ai/DeepSeek-R1-0528",
        "name": "DeepSeek R1",
        "description": "State-of-the-art open reasoning model",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "qwen/qwen3.8-27b:thinking",
        "name": "Qwen 3.8 27B Thinking",
        "description": "Dense reasoning model fine-tuned for structured prompts",
        "supports_thinking": True,
        "is_default": False
    },
    {
        "id": "meta/muse-glimmer-30b",
        "name": "Meta Muse Glimmer 30B",
        "description": "Large parameter prompt & creative vision architect",
        "supports_thinking": False,
        "is_default": False
    }
]

THINKING_LEVELS = ["none", "low", "medium", "high", "max"]

class ModelItem(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    supports_thinking: bool = True
    is_default: bool = False

class ModelsConfig(BaseModel):
    default_model: str = "z-ai/glm-5.3-flash"
    default_thinking: str = "high"
    thinking_levels: List[str] = THINKING_LEVELS
    models: List[ModelItem] = Field(default_factory=lambda: [ModelItem(**m) for m in DEFAULT_MODELS])

_lock = asyncio.Lock()

def _load_config_sync() -> ModelsConfig:
    if not MODELS_FILE.exists():
        cfg = ModelsConfig()
        _save_config_sync(cfg)
        return cfg
    try:
        with open(MODELS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            cfg = ModelsConfig(**data)
            # Ensure all DEFAULT_MODELS exist in cfg.models
            existing_ids = {m.id for m in cfg.models}
            added = False
            for default_m in DEFAULT_MODELS:
                if default_m["id"] not in existing_ids:
                    cfg.models.append(ModelItem(**default_m))
                    added = True
            if added:
                _save_config_sync(cfg)
            return cfg
    except Exception:
        cfg = ModelsConfig()
        _save_config_sync(cfg)
        return cfg

def _save_config_sync(cfg: ModelsConfig) -> None:
    with open(MODELS_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg.model_dump(), f, indent=2)

async def get_models_config() -> ModelsConfig:
    async with _lock:
        return _load_config_sync()

async def add_or_update_model(model: ModelItem) -> ModelsConfig:
    async with _lock:
        cfg = _load_config_sync()
        existing_idx = next((i for i, m in enumerate(cfg.models) if m.id == model.id), -1)
        if existing_idx >= 0:
            cfg.models[existing_idx] = model
        else:
            cfg.models.append(model)
        _save_config_sync(cfg)
        return cfg

async def remove_model(model_id: str) -> ModelsConfig:
    async with _lock:
        cfg = _load_config_sync()
        cfg.models = [m for m in cfg.models if m.id != model_id]
        if cfg.default_model == model_id and cfg.models:
            cfg.default_model = cfg.models[0].id
        _save_config_sync(cfg)
        return cfg

async def update_settings(default_model: Optional[str] = None, default_thinking: Optional[str] = None) -> ModelsConfig:
    async with _lock:
        cfg = _load_config_sync()
        if default_model:
            cfg.default_model = default_model
        if default_thinking and default_thinking in THINKING_LEVELS:
            cfg.default_thinking = default_thinking
        _save_config_sync(cfg)
        return cfg

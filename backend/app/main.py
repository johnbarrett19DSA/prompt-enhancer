from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import CORS_ORIGINS, BASE_DIR
from .database import init_db
from .models_store import get_models_config
from .routes.sessions import router as sessions_router
from .routes.models import router as models_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and models config
    await init_db()
    await get_models_config()
    yield

app = FastAPI(
    title="PromptForge API",
    description="Iterative AI Image-Prompt Architect for State-of-the-Art Vision Models",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(sessions_router)
app.include_router(models_router)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "promptforge"}

# Production Static Files & SPA Fallback
frontend_dist = BASE_DIR.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow /api to return 404 if not matched
        if full_path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Fallback to index.html for client-side routing
        return FileResponse(frontend_dist / "index.html")

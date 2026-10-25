import os
from pathlib import Path
from dotenv import load_dotenv

# Base backend directory
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

NANOGPT_API_KEY = os.getenv("NANOGPT_API_KEY", "sk-nano-66cf2976-cae0-44d4-9a29-34a0dd825ffb")
NANOGPT_BASE_URL = os.getenv("NANOGPT_BASE_URL", "https://nano-gpt.com/api/v1").rstrip("/")
PORT = int(os.getenv("PORT", "4002"))
CORS_ORIGINS = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()]

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "promptforge.db"
MODELS_FILE = DATA_DIR / "models.json"

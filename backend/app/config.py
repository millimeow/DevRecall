import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
DB_PATH = os.getenv("DEVRECALL_DB", str(Path(__file__).resolve().parents[1] / "devrecall.db"))
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
TIMEOUT = float(os.getenv("MODEL_TIMEOUT", "240"))

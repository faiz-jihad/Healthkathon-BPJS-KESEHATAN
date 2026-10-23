"""
AURA-JKN: Backend Proxy Entrypoint for FastAPI Service
Allows running `uvicorn app:app --port 8000 --reload` directly from the `backend/` directory.
"""
import importlib.util
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
parent_app_path = ROOT_DIR / "app.py"

spec = importlib.util.spec_from_file_location("aura_jkn_root_app", str(parent_app_path))
if spec and spec.loader:
    _mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_mod)
    app = getattr(_mod, "app")
else:
    raise ImportError(f"Could not load FastAPI app from {parent_app_path}")

__all__ = ["app"]

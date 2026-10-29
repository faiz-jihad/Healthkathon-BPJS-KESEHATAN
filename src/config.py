"""
AURA-JKN: Centralized Configuration & Environment Settings
"""

import os
from pathlib import Path
from typing import Dict

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*args, **kwargs):  # type: ignore
        return False

# Load .env file from project root
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# Directory Paths
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
DOCS_DIR = ROOT_DIR / "docs"

# Model and Graph Checkpoints (Checks models/ first, falls back to root)
def get_model_path() -> Path:
    candidates = [MODELS_DIR / "aura_jkn_rgcn_model.pt", ROOT_DIR / "aura_jkn_rgcn_model.pt"]
    for path in candidates:
        if path.exists():
            return path
    return MODELS_DIR / "aura_jkn_rgcn_model.pt"


def get_graph_path() -> Path:
    candidates = [MODELS_DIR / "aura_jkn_hetero_graph.pt", ROOT_DIR / "aura_jkn_hetero_graph.pt"]
    for path in candidates:
        if path.exists():
            return path
    return MODELS_DIR / "aura_jkn_hetero_graph.pt"


MODEL_CHECKPOINT_PATH = get_model_path()
GRAPH_DATA_PATH = get_graph_path()

# Parquet Data Paths
FACILITIES_PARQUET = DATA_DIR / "facilities.parquet"
DOCTORS_PARQUET = DATA_DIR / "doctors.parquet"
PATIENTS_PARQUET = DATA_DIR / "patients.parquet"
CLAIMS_PARQUET = DATA_DIR / "claims.parquet"

# Pre-Payment Decision Gate Thresholds (Supports dynamic environment overrides)
GATE_HIGH_RISK_THRESHOLD = float(os.environ.get("GATE_HIGH_RISK_THRESHOLD", "0.70"))
GATE_WARNING_THRESHOLD = float(os.environ.get("GATE_WARNING_THRESHOLD", "0.40"))

# Spatiotemporal Benchmark Thresholds
DOCTOR_PEER_AVERAGE_DAILY_VOLUME = 25
DOCTOR_NORMAL_CAPACITY_LIMIT = 45   # ~180% of peer avg
DOCTOR_EXTREME_CAPACITY_LIMIT = 80  # >300% of peer avg
SPATIAL_DISTANCE_KM_THRESHOLD = 400.0  # Impossible speed if > 400 km in 1 day
SPATIAL_DEGREE_THRESHOLD = 4.5         # ~500 km across Indonesian regions

# GNN Model Architecture Parameters (Dynamic dimension resolution)
def get_node_input_dims() -> Dict[str, int]:
    """Dynamically resolves node feature input dimensions from graph or defaults."""
    dims = {
        "patient": 8,
        "doctor": 8,
        "facility": 4,
        "claim": 115,  # Fallback
        "diagnosis": 690,
    }
    graph_p = get_graph_path()
    if graph_p.exists():
        try:
            import torch
            g = torch.load(graph_p, weights_only=False, map_location="cpu")
            for nt in g.node_types:
                if hasattr(g[nt], "x") and g[nt].x is not None:
                    dims[nt] = int(g[nt].x.size(1))
        except Exception:
            pass
    return dims


NODE_INPUT_DIMS = get_node_input_dims()
HIDDEN_CHANNELS = 64
CLASSIFIER_DROPOUT = 0.3
CONV_DROPOUT = 0.2
RANDOM_SEED = 42

# Database Configuration
def resolve_database_url() -> str:
    """Builds database connection URL from .env variables."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    db_name = os.environ.get("DB_NAME", "aura_jkn")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"


DATABASE_URL = os.environ.get("DATABASE_URL") or resolve_database_url()
API_PORT = int(os.environ.get("PORT", 8000))

# Generative AI Layer Configuration
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "auto")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "auto")
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "3.0"))

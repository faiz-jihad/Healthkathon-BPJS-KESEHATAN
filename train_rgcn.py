"""
AURA-JKN: train_rgcn Root Compatibility Shim
============================================
Re-exports the training pipeline and model definitions from scripts/train_rgcn.py
and src.models.rgcn.

This shim ensures full backward compatibility for:
1. PyTorch checkpoint unpickling (when checkpoints reference the 'train_rgcn' namespace).
2. Backend services / API integrations that import directly from 'train_rgcn'.
"""

import sys
from pathlib import Path

# Ensure project root and scripts/ are in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

# Re-export model architecture from canonical source
from src.models.rgcn import AuraJKNRGCN

# Re-export entire scripts.train_rgcn module contents
from scripts.train_rgcn import *

if __name__ == "__main__":
    main()


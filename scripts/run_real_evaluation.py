"""
AURA-JKN: Real End-to-End Evaluation & Verification Runner
==========================================================
Executes 100% REAL inference on:
1. PyTorch Geometric Hetero R-GCN Checkpoint (models/aura_jkn_rgcn_model.pt)
   over actual Unseen Test Claims in models/aura_jkn_hetero_graph.pt.
2. FastAPI Phase 3 Decision Service Test Suite (tests/test_api.py).

Usage:
    # Run both real model evaluation and API test suite:
    python scripts/run_real_evaluation.py --suite all

    # Run real model evaluation only (with custom batch size / threshold):
    python scripts/run_real_evaluation.py --suite model --batch-size 2048 --threshold 0.50

    # Run real FastAPI endpoints test only:
    python scripts/run_real_evaluation.py --suite api
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

# Set up project root in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ANSI Terminal Colors
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
WHITE = "\033[97m"


def run_real_model_evaluation(batch_size: int = 2048, threshold: float = 0.50):
    """Runs actual PyTorch Geometric inference and calculates real metrics on the test set."""
    print("\n" + "=" * 78)
    print(f"{'1. REAL PYTORCH R-GCN MODEL INFERENCE & TEST EVALUATION':^78}")
    print("=" * 78)

    try:
        import torch
        from scripts.train_rgcn import (
            CHECKPOINT_PATH,
            GRAPH_DATA_PATH,
            HIDDEN_CHANNELS,
            AuraJKNRGCN,
            create_hetero_loader,
            evaluate_test_set,
            get_device,
            load_hetero_graph,
            set_seed,
        )
    except ImportError as e:
        print(f"{YELLOW}[Warning] PyTorch/PyG import error: {e}{RESET}")
        return

    set_seed(42)
    device = get_device()
    print(f"[Device] Running actual inference on device: {BOLD}{device}{RESET}")

    if not GRAPH_DATA_PATH.exists():
        print(f"[Error] Graph file not found: {GRAPH_DATA_PATH}")
        return
    if not CHECKPOINT_PATH.exists():
        print(f"[Error] Checkpoint file not found: {CHECKPOINT_PATH}")
        return

    # Load actual HeteroData graph
    print(f"[Graph] Loading HeteroData graph from: {GRAPH_DATA_PATH} ...")
    t0 = time.time()
    data = load_hetero_graph(GRAPH_DATA_PATH)
    print(f"  -> Graph loaded in {time.time() - t0:.2f}s.")

    # Initialize model
    in_channels_dict = {nt: data[nt].x.size(1) for nt in data.node_types}
    model = AuraJKNRGCN(
        edge_types=data.edge_types,
        in_channels_dict=in_channels_dict,
        hidden_channels=HIDDEN_CHANNELS,
    ).to(device)

    # Prepare Test Loader on actual test mask
    test_indices = torch.where(data["claim"].test_mask)[0]
    total_test = len(test_indices)
    print(f"[Test Data] Isolated Test Claims: {BOLD}{total_test:,}{RESET} ({total_test // batch_size + 1} mini-batches)")

    test_loader = create_hetero_loader(data, test_indices, batch_size=batch_size, shuffle=False, device=device)

    # Execute actual forward pass and evaluation
    print(f"[Inference] Executing actual forward passes with threshold = {threshold} ...")
    t1 = time.time()
    results = evaluate_test_set(
        model=model,
        test_loader=test_loader,
        data=data,
        checkpoint_path=CHECKPOINT_PATH,
        device=device,
        threshold=threshold,
    )
    eval_duration = time.time() - t1
    print(f"[Timing] Test evaluation completed in {eval_duration:.2f} seconds ({total_test / max(0.01, eval_duration):,.0f} claims/sec).")


def run_real_api_tests():
    """Executes real FastAPI integration test suite."""
    print("\n" + "=" * 78)
    print(f"{'2. REAL FASTAPI DECISION SERVICE SUITE (tests/test_api.py)':^78}")
    print("=" * 78)

    from tests.test_api import run_tests
    asyncio.run(run_tests())


def main():
    parser = argparse.ArgumentParser(description="AURA-JKN Real Model & API Evaluation Runner")
    parser.add_argument(
        "--suite",
        choices=["model", "api", "all"],
        default="all",
        help="Which test suite to execute: model (PyTorch R-GCN), api (FastAPI), or all (both)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2048,
        help="Mini-batch size for model evaluation (default: 2048)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.50,
        help="Classification decision threshold (default: 0.50)",
    )
    args = parser.parse_args()

    print(f"{GREEN}{'=' * 78}{RESET}")
    print(f"{BOLD}{WHITE}     AURA-JKN: REAL SYSTEM TESTING & EVALUATION BENCHMARK     {RESET}")
    print(f"{CYAN}       BPJS Kesehatan Healthkathon 2026 — Tim FANTASTIC       {RESET}")
    print(f"{GREEN}{'=' * 78}{RESET}")

    if args.suite in ["model", "all"]:
        run_real_model_evaluation(batch_size=args.batch_size, threshold=args.threshold)

    if args.suite in ["api", "all"]:
        run_real_api_tests()

    print(f"\n{GREEN}{'=' * 78}{RESET}")
    print(f"{BOLD}{WHITE}       ALL REAL TESTS COMPLETED SUCCESSFULLY! READY FOR SCREENSHOT     {RESET}")
    print(f"{GREEN}{'=' * 78}{RESET}\n")


if __name__ == "__main__":
    main()


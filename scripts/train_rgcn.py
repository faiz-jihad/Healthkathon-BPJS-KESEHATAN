"""
AURA-JKN Phase 2: Model Training & Evaluation Pipeline (Mini-Batch Subgraph Edition)
===================================================================================
Architecture: Relational Graph Convolutional Network (R-GCN) via PyTorch Geometric
Task: Fraud Detection on National-Scale BPJS Kesehatan Claims Graph
Execution: Scalable Mini-Batch Subgraph Loading with Zero-OOM & Windows C++ Independence
"""

import os
import sys
from pathlib import Path

# Resolve project root whether executed from root or inside scripts/
CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "scripts" else CURRENT_DIR
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# Windows dynamic DLL resolution for torch/lib (must execute before numpy/sklearn)
for p in sys.path:
    torch_lib = os.path.join(p, "torch", "lib")
    if os.path.isdir(torch_lib):
        try:
            os.add_dll_directory(torch_lib)
        except Exception:
            pass
        break

import argparse
import time
import warnings
from typing import Any, Dict, List, Tuple

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.data import HeteroData
    TORCH_AVAILABLE = True
except Exception as e:
    print(f"[Import Notice] {type(e).__name__}: {e}")
    torch = None
    nn = None
    F = None
    HeteroData = None
    TORCH_AVAILABLE = False

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from src.config import (
    CLASSIFIER_DROPOUT,
    CONV_DROPOUT,
    GRAPH_DATA_PATH,
    HIDDEN_CHANNELS,
    MODEL_CHECKPOINT_PATH,
    RANDOM_SEED,
)
from src.models import AuraJKNRGCN

# ==============================================================================
# Configuration & Hyperparameters
# ==============================================================================
CHECKPOINT_PATH = MODEL_CHECKPOINT_PATH
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4
MAX_EPOCHS = 60
DEFAULT_BATCH_SIZE = 1024
EARLY_STOPPING_PATIENCE = 15
DECISION_THRESHOLD = 0.5

SCENARIO_METADATA = {
    "A": "Fake Patient Cluster",
    "B": "Extreme Doctor Volume",
    "C": "Spatio-Temporal Conflict",
}

# Asymmetric neighbor fanout to prevent diagnosis supernode over-smoothing
ASYMMETRIC_FANOUT: Dict[Tuple[str, str, str], List[int]] = {
    ("claim", "has_diagnosis", "diagnosis"): [3, 2],
    ("diagnosis", "rev_has_diagnosis", "claim"): [0, 0],  # Cut reverse ICD-10 edge
    ("patient", "examined_by", "doctor"): [10, 5],
    ("doctor", "authorized", "claim"): [15, 10],
    ("patient", "referred_to", "facility"): [10, 5],
}


def set_seed(seed: int = RANDOM_SEED) -> None:
    """Sets deterministic seeds across Python, NumPy, and PyTorch."""
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def get_device() -> torch.device:
    """Detects and returns CUDA device if available, otherwise CPU."""
    if torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"[Device] Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        print("[Device] CUDA not available. Running on CPU.")
    return device


# ==============================================================================
# 1. Native Vectorized Hetero Batch Loader (Windows C++ Toolchain Independent)
# ==============================================================================
class VectorizedHeteroBatchLoader:
    """
    Vectorized Pure-PyTorch 2-Hop Subgraph Mini-Batch Loader.
    
    Architectural Guarantees:
    1. Zero C++ compiler requirements (seamless execution on Windows without MSVC).
    2. Strict Seed Ordering: Target batch claims strictly occupy indices 0 to batch_size - 1.
    3. Asymmetric Fanout: Disables reverse message passing from ICD-10 diagnosis supernodes
       to prevent inter-provincial over-smoothing.
    4. Inductive Isolation: Message passing paths are contained strictly within batch subgraphs.
    """

    def __init__(
        self,
        data: HeteroData,
        seed_indices: torch.Tensor,
        batch_size: int = DEFAULT_BATCH_SIZE,
        shuffle: bool = True,
        device: torch.device = torch.device("cpu"),
    ):
        self.data = data
        self.seed_indices = seed_indices.clone().long().cpu()
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.device = device

        num_claims = data["claim"].num_nodes
        num_doctors = data["doctor"].num_nodes
        num_patients = data["patient"].num_nodes

        # Pre-build vectorized lookup tensors for 1-hop expansions
        # 1. claim -> doctor
        edge_c_d = data["claim", "rev_authorized", "doctor"].edge_index.cpu()
        self.claim_to_doc = torch.full((num_claims,), -1, dtype=torch.long)
        self.claim_to_doc[edge_c_d[0]] = edge_c_d[1]

        # 2. claim -> diagnosis
        edge_c_diag = data["claim", "has_diagnosis", "diagnosis"].edge_index.cpu()
        self.claim_to_diag = torch.full((num_claims,), -1, dtype=torch.long)
        self.claim_to_diag[edge_c_diag[0]] = edge_c_diag[1]

        # 3. doctor -> patient (pre-grouped with bounded fanout: max 5 patients per doctor to prevent exponential blowup)
        edge_d_p = data["doctor", "rev_examined_by", "patient"].edge_index.cpu()
        doc_pat_dict: Dict[int, List[int]] = {}
        perm = torch.randperm(edge_d_p.size(1))
        d_src = edge_d_p[0, perm].tolist()
        p_dst = edge_d_p[1, perm].tolist()
        for d, p in zip(d_src, p_dst):
            cur = doc_pat_dict.get(d)
            if cur is None:
                doc_pat_dict[d] = [p]
            elif len(cur) < 5:
                cur.append(p)
        self.doc_pat_dict = doc_pat_dict

        # 4. patient -> facility (direct 1-hop tensor lookups)
        edge_p_reg_f = data["patient", "registered_at", "facility"].edge_index.cpu()
        self.pat_to_reg_f = torch.full((num_patients,), -1, dtype=torch.long)
        self.pat_to_reg_f[edge_p_reg_f[0]] = edge_p_reg_f[1]

        edge_p_ref_f = data["patient", "referred_to", "facility"].edge_index.cpu()
        self.pat_to_ref_f = torch.full((num_patients,), -1, dtype=torch.long)
        self.pat_to_ref_f[edge_p_ref_f[0]] = edge_p_ref_f[1]

    def __len__(self) -> int:
        return (len(self.seed_indices) + self.batch_size - 1) // self.batch_size

    def __iter__(self):
        if self.shuffle:
            perm = torch.randperm(len(self.seed_indices))
            seeds = self.seed_indices[perm]
        else:
            seeds = self.seed_indices

        for start_idx in range(0, len(seeds), self.batch_size):
            batch_seeds = seeds[start_idx : start_idx + self.batch_size]
            sub_data = self._sample_batch(batch_seeds)
            yield sub_data.to(self.device)

    def _sample_batch(self, seed_claim_ids: torch.Tensor) -> HeteroData:
        seed_claim_ids = seed_claim_ids.long()
        batch_size = len(seed_claim_ids)

        # 1. Doctors from seeds
        doc_ids = self.claim_to_doc[seed_claim_ids]
        doc_mask = doc_ids >= 0
        unique_docs, local_d = torch.unique(doc_ids[doc_mask], return_inverse=True)

        # 2. Diagnoses from seeds
        diag_ids = self.claim_to_diag[seed_claim_ids]
        diag_mask = diag_ids >= 0
        unique_diags, local_diag = torch.unique(diag_ids[diag_mask], return_inverse=True)

        # 3. Patients (from unique_docs via pre-indexed lookup, capped fanout)
        d_p_src_list: List[int] = []
        d_p_dst_list: List[int] = []
        for loc_d_idx, d in enumerate(unique_docs.tolist()):
            p_list = self.doc_pat_dict.get(d)
            if p_list:
                for p in p_list:
                    d_p_src_list.append(loc_d_idx)
                    d_p_dst_list.append(p)

        if len(d_p_dst_list) > 0:
            unique_pats, local_p = torch.unique(torch.tensor(d_p_dst_list, dtype=torch.long), return_inverse=True)
            edge_d_p_src = torch.tensor(d_p_src_list, dtype=torch.long)
            edge_d_p_dst = local_p
        else:
            unique_pats = torch.empty(0, dtype=torch.long)
            edge_d_p_src = torch.empty(0, dtype=torch.long)
            edge_d_p_dst = torch.empty(0, dtype=torch.long)

        # 4. Facilities (from unique_pats via direct tensor lookups)
        if len(unique_pats) > 0:
            reg_f = self.pat_to_reg_f[unique_pats]
            ref_f = self.pat_to_ref_f[unique_pats]
            valid_reg = reg_f >= 0
            valid_ref = ref_f >= 0

            all_fac_ids = torch.cat([reg_f[valid_reg], ref_f[valid_ref]])
            if len(all_fac_ids) > 0:
                unique_facs, local_all_facs = torch.unique(all_fac_ids, return_inverse=True)
                n_reg = int(valid_reg.sum().item())
                local_reg_f = local_all_facs[:n_reg]
                local_ref_f = local_all_facs[n_reg:]
                src_reg_p = torch.where(valid_reg)[0]
                src_ref_p = torch.where(valid_ref)[0]
            else:
                unique_facs = torch.empty(0, dtype=torch.long)
                local_reg_f = torch.empty(0, dtype=torch.long)
                local_ref_f = torch.empty(0, dtype=torch.long)
                src_reg_p = torch.empty(0, dtype=torch.long)
                src_ref_p = torch.empty(0, dtype=torch.long)
        else:
            unique_facs = torch.empty(0, dtype=torch.long)
            local_reg_f = torch.empty(0, dtype=torch.long)
            local_ref_f = torch.empty(0, dtype=torch.long)
            src_reg_p = torch.empty(0, dtype=torch.long)
            src_ref_p = torch.empty(0, dtype=torch.long)

        # Subgraph HeteroData Construction
        sub_data = HeteroData()

        # Nodes
        sub_data["claim"].x = self.data["claim"].x[seed_claim_ids]
        sub_data["claim"].node_id = seed_claim_ids
        sub_data["claim"].batch_size = batch_size
        sub_data["claim"].y = self.data["claim"].y[seed_claim_ids]

        sub_data["doctor"].x = self.data["doctor"].x[unique_docs]
        sub_data["doctor"].node_id = unique_docs

        sub_data["diagnosis"].x = self.data["diagnosis"].x[unique_diags]
        sub_data["diagnosis"].node_id = unique_diags

        sub_data["patient"].x = self.data["patient"].x[unique_pats]
        sub_data["patient"].node_id = unique_pats

        sub_data["facility"].x = self.data["facility"].x[unique_facs]
        sub_data["facility"].node_id = unique_facs

        # Re-index edges
        # 1. claim <-> doctor
        local_c = torch.arange(batch_size, dtype=torch.long)
        sub_data["claim", "rev_authorized", "doctor"].edge_index = torch.stack([local_c, local_d])
        sub_data["doctor", "authorized", "claim"].edge_index = torch.stack([local_d, local_c])

        # 2. claim <-> diagnosis (ASYMMETRIC: diagnosis -> claim is cut to 0 to prevent supernode over-smoothing)
        sub_data["claim", "has_diagnosis", "diagnosis"].edge_index = torch.stack([local_c, local_diag])
        sub_data["diagnosis", "rev_has_diagnosis", "claim"].edge_index = torch.empty((2, 0), dtype=torch.long)

        # 3. doctor <-> patient
        if len(edge_d_p_src) > 0:
            sub_data["doctor", "rev_examined_by", "patient"].edge_index = torch.stack([edge_d_p_src, edge_d_p_dst])
            sub_data["patient", "examined_by", "doctor"].edge_index = torch.stack([edge_d_p_dst, edge_d_p_src])
        else:
            sub_data["doctor", "rev_examined_by", "patient"].edge_index = torch.empty((2, 0), dtype=torch.long)
            sub_data["patient", "examined_by", "doctor"].edge_index = torch.empty((2, 0), dtype=torch.long)

        # 4. patient <-> facility (registered_at)
        if len(src_reg_p) > 0:
            sub_data["patient", "registered_at", "facility"].edge_index = torch.stack([src_reg_p, local_reg_f])
            sub_data["facility", "rev_registered_at", "patient"].edge_index = torch.stack([local_reg_f, src_reg_p])
        else:
            sub_data["patient", "registered_at", "facility"].edge_index = torch.empty((2, 0), dtype=torch.long)
            sub_data["facility", "rev_registered_at", "patient"].edge_index = torch.empty((2, 0), dtype=torch.long)

        # 5. patient <-> facility (referred_to)
        if len(src_ref_p) > 0:
            sub_data["patient", "referred_to", "facility"].edge_index = torch.stack([src_ref_p, local_ref_f])
            sub_data["facility", "rev_referred_to", "patient"].edge_index = torch.stack([local_ref_f, src_ref_p])
        else:
            sub_data["patient", "referred_to", "facility"].edge_index = torch.empty((2, 0), dtype=torch.long)
            sub_data["facility", "rev_referred_to", "patient"].edge_index = torch.empty((2, 0), dtype=torch.long)

        # CRITICAL ASSERTION: Strict Seed Node Ordering
        assert torch.equal(sub_data["claim"].node_id[:batch_size], seed_claim_ids), \
            "Custom Sampler Error: Target seed claims are not placed at front indices!"

        return sub_data


_SAMPLER_LOGGED = False


def create_hetero_loader(
    data: HeteroData,
    seed_indices: torch.Tensor,
    batch_size: int = DEFAULT_BATCH_SIZE,
    shuffle: bool = True,
    device: torch.device = torch.device("cpu"),
) -> Any:
    """
    Dual-Mode Loader Architecture:
    Attempts to instantiate C++ accelerated PyG NeighborLoader.
    If unavailable or missing C++ toolchain (Windows standard), cleanly falls back
    to VectorizedHeteroBatchLoader.
    """
    global _SAMPLER_LOGGED
    try:
        from torch_geometric.loader import NeighborLoader
        loader = NeighborLoader(
            data,
            num_neighbors=ASYMMETRIC_FANOUT,
            batch_size=batch_size,
            input_nodes=("claim", seed_indices),
            shuffle=shuffle,
        )
        _ = next(iter(loader))
        if not _SAMPLER_LOGGED:
            print("[Sampler Engine] Using PyG NeighborLoader (C++ accelerated)")
            _SAMPLER_LOGGED = True
        return loader
    except Exception:
        if not _SAMPLER_LOGGED:
            print("[Sampler Engine] Using VectorizedHeteroBatchLoader (Pure PyTorch Native, CPU Optimized)")
            _SAMPLER_LOGGED = True
        return VectorizedHeteroBatchLoader(
            data=data,
            seed_indices=seed_indices,
            batch_size=batch_size,
            shuffle=shuffle,
            device=device,
        )


# ==============================================================================
# 2. Data Loading & Inspection
# ==============================================================================
def load_hetero_graph(file_path: Path) -> HeteroData:
    """Loads PyTorch Geometric HeteroData from disk (keeps on CPU for streaming)."""
    if not file_path.exists():
        raise FileNotFoundError(
            f"HeteroData file not found at '{file_path.resolve()}'. "
            "Please ensure Phase 1 generation has completed."
        )

    print(f"\n[Data Loading] Loading HeteroData graph from: {file_path}")
    data = torch.load(file_path, weights_only=False)

    if "claim" not in data.node_types:
        raise KeyError("Target node type 'claim' is missing from HeteroData.")

    claim_node = data["claim"]
    for mask_name in ["train_mask", "val_mask", "test_mask", "y"]:
        if not hasattr(claim_node, mask_name):
            raise AttributeError(f"Attribute '{mask_name}' missing from 'claim' node.")

    print(f"[Data Loading] Graph loaded successfully.")
    print(f"  - Node Types: {data.node_types}")
    print(f"  - Total Edge Relations: {len(data.edge_types)}")
    print(f"  - Claims Total: {data['claim'].num_nodes:,}")
    print(f"  - Train Claims: {data['claim'].train_mask.sum().item():,}")
    print(f"  - Val Claims:   {data['claim'].val_mask.sum().item():,}")
    print(f"  - Test Claims:  {data['claim'].test_mask.sum().item():,}")

    return data


# ==============================================================================
# 3. Loss & Optimizer Initialization
# ==============================================================================
def create_criterion_and_optimizer(
    model: nn.Module,
    data: HeteroData,
    learning_rate: float = LEARNING_RATE,
    weight_decay: float = WEIGHT_DECAY,
    device: torch.device = torch.device("cpu"),
) -> Tuple[nn.BCEWithLogitsLoss, torch.optim.Optimizer]:
    """Computes class imbalance pos_weight dynamically on the training split."""
    claim_node = data["claim"]
    train_mask = claim_node.train_mask
    train_labels = claim_node.y[train_mask]

    num_pos = (train_labels == 1).sum().item()
    num_neg = (train_labels == 0).sum().item()

    if num_pos == 0:
        raise ValueError("Training split contains zero positive fraud labels.")

    imbalance_ratio = num_neg / num_pos
    pos_weight = torch.tensor([imbalance_ratio], dtype=torch.float, device=device)

    print("\n[Optimization Setup]")
    print(f"  - Training Class Distribution: {num_neg:,} Normal vs {num_pos:,} Fraud")
    print(f"  - Dynamic pos_weight: {imbalance_ratio:.4f}")

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=learning_rate,
        weight_decay=weight_decay,
    )

    return criterion, optimizer


# ==============================================================================
# 4. Training Loop & Validation Evaluation (Mini-Batch Subgraphs)
# ==============================================================================
def train_single_epoch(
    model: nn.Module,
    loader: Any,
    optimizer: torch.optim.Optimizer,
    criterion: nn.BCEWithLogitsLoss,
    device: torch.device,
    epoch: int = 1,
    max_epochs: int = 1,
) -> float:
    """Executes a single training epoch across mini-batch subgraphs with live progress."""
    model.train()
    total_loss = 0.0
    total_samples = 0
    num_batches = len(loader)
    t_start = time.time()

    for batch_idx, batch in enumerate(loader, 1):
        batch = batch.to(device)
        optimizer.zero_grad()

        logits = model(batch.x_dict, batch.edge_index_dict)
        batch_size = batch["claim"].batch_size

        target_logits = logits[:batch_size]
        target_labels = batch["claim"].y[:batch_size].float().to(device)

        loss = criterion(target_logits, target_labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * batch_size
        total_samples += batch_size

        if batch_idx % 20 == 0 or batch_idx == num_batches:
            pct = (batch_idx / num_batches) * 100
            avg_loss = total_loss / max(1, total_samples)
            elapsed = time.time() - t_start
            speed = batch_idx / max(0.001, elapsed)
            eta = (num_batches - batch_idx) / max(0.001, speed)
            print(
                f"\r  -> Epoch {epoch:2d}/{max_epochs} | "
                f"Batch {batch_idx:3d}/{num_batches} ({pct:5.1f}%) | "
                f"Loss: {avg_loss:7.4f} | "
                f"Speed: {speed:4.1f} b/s | "
                f"ETA: {int(eta//60):02d}m{int(eta%60):02d}s",
                end="",
                flush=True,
            )

    return total_loss / max(1, total_samples)


@torch.no_grad()
def evaluate_validation(
    model: nn.Module,
    loader: Any,
    device: torch.device,
    threshold: float = DECISION_THRESHOLD,
) -> Tuple[float, float]:
    """Evaluates model across validation mini-batches to compute PR-AUC and F1."""
    model.eval()
    all_targets: List[np.ndarray] = []
    all_probs: List[np.ndarray] = []
    num_batches = len(loader)

    for batch_idx, batch in enumerate(loader, 1):
        batch = batch.to(device)
        logits = model(batch.x_dict, batch.edge_index_dict)
        batch_size = batch["claim"].batch_size

        target_logits = logits[:batch_size]
        probs = torch.sigmoid(target_logits).cpu().numpy()
        targets = batch["claim"].y[:batch_size].cpu().numpy()

        all_probs.append(probs)
        all_targets.append(targets)

        if batch_idx % 20 == 0 or batch_idx == num_batches:
            print(f"\r  -> Validating: {batch_idx:3d}/{num_batches} batches...", end="", flush=True)

    val_probs = np.concatenate(all_probs)
    val_targets = np.concatenate(all_targets)
    val_preds = (val_probs >= threshold).astype(int)

    pr_auc = float(average_precision_score(val_targets, val_probs))
    f1 = float(f1_score(val_targets, val_preds, zero_division=0))

    return pr_auc, f1


def train_pipeline(
    model: nn.Module,
    data: HeteroData,
    train_loader: Any,
    val_loader: Any,
    optimizer: torch.optim.Optimizer,
    criterion: nn.BCEWithLogitsLoss,
    device: torch.device,
    max_epochs: int = MAX_EPOCHS,
    patience: int = EARLY_STOPPING_PATIENCE,
    checkpoint_path: Path = CHECKPOINT_PATH,
) -> Dict[str, Any]:
    """Executes mini-batch training with early stopping on validation PR-AUC."""
    best_val_pr_auc = -1.0
    best_val_f1 = -1.0
    best_epoch = 0
    patience_counter = 0

    history = {
        "epoch": [],
        "train_loss": [],
        "val_pr_auc": [],
        "val_f1": [],
    }

    in_channels_dict = {nt: data[nt].x.size(1) for nt in data.node_types}

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=max_epochs, eta_min=1e-5
    )

    print("\n" + "=" * 78)
    print(f"{'AURA-JKN R-GCN MINI-BATCH TRAINING LOOP (NATIONAL SCALE)':^78}")
    print("=" * 78)
    print(
        f"{'Epoch':^7} | {'Train Loss':^12} | {'Val PR-AUC':^12} | "
        f"{'Val F1':^10} | {'Patience':^10} | {'Status'}"
    )
    print("-" * 78)

    for epoch in range(1, max_epochs + 1):
        loss = train_single_epoch(
            model, train_loader, optimizer, criterion, device, epoch=epoch, max_epochs=max_epochs
        )
        val_pr_auc, val_f1 = evaluate_validation(model, val_loader, device)
        scheduler.step()

        history["epoch"].append(epoch)
        history["train_loss"].append(loss)
        history["val_pr_auc"].append(val_pr_auc)
        history["val_f1"].append(val_f1)

        is_best = val_pr_auc > best_val_pr_auc
        if is_best:
            best_val_pr_auc = val_pr_auc
            best_val_f1 = val_f1
            best_epoch = epoch
            patience_counter = 0

            ckpt_data = {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_pr_auc": val_pr_auc,
                "val_f1": val_f1,
                "in_channels_dict": in_channels_dict,
                "edge_types": data.edge_types,
            }
            torch.save(ckpt_data, checkpoint_path)
            status = "(*) Best Model Saved"
        else:
            patience_counter += 1
            status = f"Patience ({patience_counter}/{patience})"

        # Cleanly overwrite live progress line with table row
        print(
            f"\r{epoch:^7d} | {loss:^12.5f} | {val_pr_auc:^12.4f} | "
            f"{val_f1:^10.4f} | {patience_counter:^10d} | {status}                                "
        )

        if patience_counter >= patience:
            print("-" * 78)
            print(
                f"[Early Stopping] Triggered at Epoch {epoch}. "
                f"No PR-AUC improvement for {patience} consecutive epochs."
            )
            break

    print("-" * 78)
    print(
        f"[Checkpoint] Best Model achieved at Epoch {best_epoch} "
        f"with Val PR-AUC: {best_val_pr_auc:.4f} and Val F1: {best_val_f1:.4f}"
    )
    print(f"[Checkpoint] Model saved to: {checkpoint_path.resolve()}\n")

    return {
        "best_epoch": best_epoch,
        "best_val_pr_auc": best_val_pr_auc,
        "best_val_f1": best_val_f1,
        "history": history,
    }


# ==============================================================================
# 5. Final Test Set Evaluation & Fraud Scenario Breakdown
# ==============================================================================
@torch.no_grad()
def evaluate_test_set(
    model: nn.Module,
    test_loader: Any,
    data: HeteroData,
    checkpoint_path: Path = CHECKPOINT_PATH,
    device: torch.device = torch.device("cpu"),
    threshold: float = DECISION_THRESHOLD,
) -> Dict[str, Any]:
    """Restores the best model checkpoint and conducts test evaluation via mini-batches."""
    print("=" * 78)
    print(f"{'FINAL TEST EVALUATION ON UNSEEN CLAIMS (MINI-BATCH)':^78}")
    print("=" * 78)

    # 1. Restore Best Checkpoint
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    print(f"[Model Restore] Loaded weights from checkpoint (Epoch {checkpoint['epoch']}).")

    # 2. Iterate over Test Mini-Batches
    all_targets: List[np.ndarray] = []
    all_probs: List[np.ndarray] = []
    all_seed_ids: List[np.ndarray] = []

    for batch in test_loader:
        batch = batch.to(device)
        logits = model(batch.x_dict, batch.edge_index_dict)
        batch_size = batch["claim"].batch_size

        target_logits = logits[:batch_size]
        probs = torch.sigmoid(target_logits).cpu().numpy()
        targets = batch["claim"].y[:batch_size].cpu().numpy()
        seed_ids = batch["claim"].node_id[:batch_size].cpu().numpy()

        all_probs.append(probs)
        all_targets.append(targets)
        all_seed_ids.append(seed_ids)

    test_probs = np.concatenate(all_probs)
    test_targets = np.concatenate(all_targets)
    test_seed_ids = np.concatenate(all_seed_ids)
    test_preds = (test_probs >= threshold).astype(int)

    # 3. Overall Performance Metrics
    roc_auc = float(roc_auc_score(test_targets, test_probs))
    pr_auc = float(average_precision_score(test_targets, test_probs))
    precision = float(precision_score(test_targets, test_preds, zero_division=0))
    recall = float(recall_score(test_targets, test_preds, zero_division=0))
    f1 = float(f1_score(test_targets, test_preds, zero_division=0))
    tn, fp, fn, tp = confusion_matrix(test_targets, test_preds).ravel()

    # 4. Scenario-Specific Recall Breakdown
    raw_scenarios = data["claim"].fraud_scenario
    if isinstance(raw_scenarios, torch.Tensor):
        raw_scenarios = raw_scenarios.cpu().numpy()
    test_scenarios = np.array(raw_scenarios)[test_seed_ids]

    scenario_metrics: Dict[str, Dict[str, Any]] = {}
    for code, desc in SCENARIO_METADATA.items():
        scenario_filter = (test_scenarios == code) & (test_targets == 1)
        total_scenario_fraud = int(scenario_filter.sum())
        detected_scenario_fraud = int((scenario_filter & (test_preds == 1)).sum())
        scenario_recall = (
            detected_scenario_fraud / total_scenario_fraud
            if total_scenario_fraud > 0
            else 0.0
        )

        scenario_metrics[code] = {
            "name": desc,
            "total": total_scenario_fraud,
            "detected": detected_scenario_fraud,
            "missed": total_scenario_fraud - detected_scenario_fraud,
            "recall": scenario_recall,
        }

    _display_test_results(
        roc_auc=roc_auc,
        pr_auc=pr_auc,
        precision=precision,
        recall=recall,
        f1=f1,
        tn=tn,
        fp=fp,
        fn=fn,
        tp=tp,
        scenario_metrics=scenario_metrics,
    )

    return {
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "scenarios": scenario_metrics,
    }


def _display_test_results(
    roc_auc: float,
    pr_auc: float,
    precision: float,
    recall: float,
    f1: float,
    tn: int,
    fp: int,
    fn: int,
    tp: int,
    scenario_metrics: Dict[str, Dict[str, Any]],
) -> None:
    """Prints clean, formatted ASCII tables of evaluation results."""
    total_test = tn + fp + fn + tp

    print("\n+-------------------------------------------------------------+")
    print("|               TEST SET OVERALL METRICS                      |")
    print("+----------------------------------+--------------------------+")
    print(f"| Metric                           | Score                    |")
    print("+----------------------------------+--------------------------+")
    print(f"| ROC-AUC                          | {roc_auc:24.4f} |")
    print(f"| PR-AUC (Average Precision)       | {pr_auc:24.4f} |")
    print(f"| F1-Score (Threshold = 0.50)      | {f1:24.4f} |")
    print(f"| Precision                        | {precision:24.4f} |")
    print(f"| Recall (Sensitivity)             | {recall:24.4f} |")
    print("+----------------------------------+--------------------------+")

    print("\n+-------------------------------------------------------------+")
    print("|                  CONFUSION MATRIX                           |")
    print("+----------------------------------+--------------------------+")
    print(f"| Total Evaluated Claims           | {total_test:24,d} |")
    print(f"| True Negatives  (Legitimate Ok)  | {tn:24,d} |")
    print(f"| False Positives (False Alarm)    | {fp:24,d} |")
    print(f"| False Negatives (Undetected)     | {fn:24,d} |")
    print(f"| True Positives  (Fraud Caught)   | {tp:24,d} |")
    print("+----------------------------------+--------------------------+")

    print("\n+--------------------------------------------------------------------------------+")
    print("|                   FRAUD SCENARIO RECALL BREAKDOWN                              |")
    print("+-------+--------------------------+---------+----------+----------+-------------+")
    print(f"| Code  | Scenario Description     | Total   | Detected | Missed   | Recall (%)  |")
    print("+-------+--------------------------+---------+----------+----------+-------------+")
    for code, m in scenario_metrics.items():
        print(
            f"|   {code}   | {m['name']:<24} | "
            f"{m['total']:^7d} | {m['detected']:^8d} | {m['missed']:^8d} | "
            f"{m['recall'] * 100:10.2f}% |"
        )
    print("+-------+--------------------------+---------+----------+----------+-------------+\n")


def parse_args():
    parser = argparse.ArgumentParser(description="AURA-JKN R-GCN Model Training Pipeline")
    parser.add_argument("--epochs", type=int, default=MAX_EPOCHS, help=f"Max training epochs (default: {MAX_EPOCHS})")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help=f"Mini-batch size (default: {DEFAULT_BATCH_SIZE})")
    parser.add_argument("--patience", type=int, default=EARLY_STOPPING_PATIENCE, help=f"Early stopping patience (default: {EARLY_STOPPING_PATIENCE})")
    parser.add_argument("--lr", type=float, default=LEARNING_RATE, help=f"Learning rate (default: {LEARNING_RATE})")
    parser.add_argument("--eval-only", action="store_true", help="Skip training and directly evaluate saved checkpoint on the test set")
    parser.add_argument("--threshold", type=float, default=DECISION_THRESHOLD, help=f"Decision threshold (default: {DECISION_THRESHOLD})")
    return parser.parse_args()


# ==============================================================================
# Main Orchestration Function
# ==============================================================================
def main() -> None:
    """Main execution pipeline for Phase 2 Model Training & Evaluation."""
    args = parse_args()

    print("=" * 78)
    print(f"{'AURA-JKN: PHASE 2 (R-GCN MINI-BATCH TRAINING & EVALUATION)':^78}")
    print("=" * 78)
    print(f"Hyperparameters: Batch Size={args.batch_size}, Max Epochs={args.epochs}, Patience={args.patience}, LR={args.lr}")

    # 1. Determinism and Hardware Setup
    set_seed(RANDOM_SEED)
    device = get_device()

    # 2. Load Graph Data (CPU Streamed)
    data = load_hetero_graph(GRAPH_DATA_PATH)

    # 3. Model Architecture Instantiation
    in_channels_dict = {
        node_type: data[node_type].x.size(1)
        for node_type in data.node_types
    }
    model = AuraJKNRGCN(
        edge_types=data.edge_types,
        in_channels_dict=in_channels_dict,
        hidden_channels=HIDDEN_CHANNELS,
        classifier_dropout=CLASSIFIER_DROPOUT,
        conv_dropout=CONV_DROPOUT,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n[Model Architecture] AuraJKNRGCN initialized.")
    print(f"  - Hidden Channels: {HIDDEN_CHANNELS}")
    print(f"  - Relations Handled: {len(data.edge_types)}")
    print(f"  - Total Trainable Parameters: {total_params:,}")

    # Direct Evaluation Fast-Path (skips training if --eval-only is specified)
    if args.eval_only:
        print("\n" + "=" * 78)
        print(f"{'[EVALUATION ONLY] EVALUATING TEST SET DIRECTLY FROM CHECKPOINT':^78}")
        print("=" * 78)
        test_indices = torch.where(data["claim"].test_mask)[0]
        print(f"\n[DataLoader] Initializing Test Loader for {len(test_indices):,} Unseen Test Claims ({len(test_indices) // args.batch_size + 1} batches)...")
        test_loader = create_hetero_loader(data, test_indices, batch_size=args.batch_size, shuffle=False, device=device)
        test_results = evaluate_test_set(
            model=model,
            test_loader=test_loader,
            data=data,
            checkpoint_path=CHECKPOINT_PATH,
            device=device,
            threshold=args.threshold,
        )
        print("[Done] Phase 2 Test Evaluation completed successfully!")
        return

    # 4. Create Mini-Batch Subgraph DataLoaders
    train_indices = torch.where(data["claim"].train_mask)[0]
    val_indices = torch.where(data["claim"].val_mask)[0]
    test_indices = torch.where(data["claim"].test_mask)[0]

    print("\n[DataLoaders Initialization]")
    print(f"  - Train Seed Claims: {len(train_indices):,} ({len(train_indices) // args.batch_size + 1} batches)")
    print(f"  - Val Seed Claims  : {len(val_indices):,} ({len(val_indices) // args.batch_size + 1} batches)")
    print(f"  - Test Seed Claims : {len(test_indices):,} ({len(test_indices) // args.batch_size + 1} batches)")

    train_loader = create_hetero_loader(data, train_indices, batch_size=args.batch_size, shuffle=True, device=device)
    val_loader = create_hetero_loader(data, val_indices, batch_size=args.batch_size, shuffle=False, device=device)
    test_loader = create_hetero_loader(data, test_indices, batch_size=args.batch_size, shuffle=False, device=device)

    # 5. Loss & Optimizer Setup
    criterion, optimizer = create_criterion_and_optimizer(
        model=model,
        data=data,
        learning_rate=args.lr,
        weight_decay=WEIGHT_DECAY,
        device=device,
    )

    # 6. Mini-Batch Training Loop with Validation & Early Stopping
    train_results = train_pipeline(
        model=model,
        data=data,
        train_loader=train_loader,
        val_loader=val_loader,
        optimizer=optimizer,
        criterion=criterion,
        device=device,
        max_epochs=args.epochs,
        patience=args.patience,
        checkpoint_path=CHECKPOINT_PATH,
    )

    # 7. Final Evaluation on Test Set via Mini-Batches
    test_results = evaluate_test_set(
        model=model,
        test_loader=test_loader,
        data=data,
        checkpoint_path=CHECKPOINT_PATH,
        device=device,
        threshold=DECISION_THRESHOLD,
    )

    print("[Done] Phase 2 Training & Evaluation Pipeline completed successfully!")


if __name__ == "__main__":
    main()

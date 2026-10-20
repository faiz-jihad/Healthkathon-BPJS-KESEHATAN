"""
AURA-JKN Phase 2: Model Training & Evaluation Pipeline
======================================================
Architecture: Relational Graph Convolutional Network (R-GCN) via PyTorch Geometric
Task: Fraud Detection on BPJS Kesehatan Healthcare Claims Graph
"""

import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch_geometric.data import HeteroData
from torch_geometric.nn import HeteroConv, SAGEConv

# ==============================================================================
# Configuration & Hyperparameters
# ==============================================================================
GRAPH_DATA_PATH = Path("aura_jkn_hetero_graph.pt")
CHECKPOINT_PATH = Path("aura_jkn_rgcn_model.pt")

NODE_INPUT_DIMS = {
    "patient": 34,
    "doctor": 6,
    "facility": 4,
    "claim": 23,
    "diagnosis": 10,
}

HIDDEN_CHANNELS = 64
CLASSIFIER_DROPOUT = 0.3
CONV_DROPOUT = 0.2
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-4
MAX_EPOCHS = 100
EARLY_STOPPING_PATIENCE = 15
DECISION_THRESHOLD = 0.5
RANDOM_SEED = 42

SCENARIO_METADATA = {
    "A": "Fake Patient Cluster",
    "B": "Extreme Doctor Volume",
    "C": "Spatio-Temporal Conflict",
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
# 1. Data Loading & Inspection
# ==============================================================================
def load_hetero_graph(file_path: Path, device: torch.device) -> HeteroData:
    """
    Loads PyTorch Geometric HeteroData from disk and moves it to the target device.

    Args:
        file_path: Path to serialized PyG HeteroData file (.pt).
        device: Target execution device (cuda or cpu).

    Returns:
        HeteroData object moved to device.
    """
    if not file_path.exists():
        raise FileNotFoundError(
            f"HeteroData file not found at '{file_path.resolve()}'. "
            "Please ensure Phase 1 generation has completed."
        )

    print(f"\n[Data Loading] Loading HeteroData graph from: {file_path}")
    data = torch.load(file_path, weights_only=False)

    # Validate required node type and split masks
    if "claim" not in data.node_types:
        raise KeyError("Target node type 'claim' is missing from HeteroData.")

    claim_node = data["claim"]
    for mask_name in ["train_mask", "val_mask", "test_mask", "y"]:
        if not hasattr(claim_node, mask_name):
            raise AttributeError(f"Attribute '{mask_name}' missing from 'claim' node.")

    data = data.to(device)
    print(f"[Data Loading] Graph loaded successfully on {device}.")
    print(f"  - Node Types: {data.node_types}")
    print(f"  - Total Edge Relations: {len(data.edge_types)}")
    print(f"  - Claims Total: {data['claim'].num_nodes:,}")
    print(f"  - Train Claims: {data['claim'].train_mask.sum().item():,}")
    print(f"  - Val Claims:   {data['claim'].val_mask.sum().item():,}")
    print(f"  - Test Claims:  {data['claim'].test_mask.sum().item():,}")

    return data


# ==============================================================================
# 2. Model Architecture: AuraJKNRGCN
# ==============================================================================
class AuraJKNRGCN(nn.Module):
    """
    Relational Graph Convolutional Network (R-GCN) tailored for AURA-JKN.

    Architecture Components:
    1. Projection Layer:
       ModuleDict mapping diverse raw input dimensions to uniform hidden_channels.
    2. Message Passing:
       2-layer HeteroConv using relational SAGE convolutions across all 10 edge types.
    3. Classifier Head:
       Multi-Layer Perceptron (hidden -> hidden//2 -> ReLU -> Dropout -> 1)
       specifically dedicated to predicting claim-level fraud probability.
    """

    def __init__(
        self,
        edge_types: List[Tuple[str, str, str]],
        in_channels_dict: Dict[str, int],
        hidden_channels: int = HIDDEN_CHANNELS,
        classifier_dropout: float = CLASSIFIER_DROPOUT,
        conv_dropout: float = CONV_DROPOUT,
    ):
        super().__init__()
        self.hidden_channels = hidden_channels
        self.conv_dropout = conv_dropout
        self.classifier_dropout = classifier_dropout

        # a. Projection Layer: Project heterogeneous raw feature dimensions
        self.projection = nn.ModuleDict({
            node_type: nn.Linear(in_dim, hidden_channels)
            for node_type, in_dim in in_channels_dict.items()
        })

        # b. Message Passing: 2-layer HeteroConv across all relational edge types
        conv1_relations = {
            edge_type: SAGEConv((hidden_channels, hidden_channels), hidden_channels)
            for edge_type in edge_types
        }
        self.conv1 = HeteroConv(conv1_relations, aggr="sum")

        conv2_relations = {
            edge_type: SAGEConv((hidden_channels, hidden_channels), hidden_channels)
            for edge_type in edge_types
        }
        self.conv2 = HeteroConv(conv2_relations, aggr="sum")

        # c. Classifier Head: Dedicated binary fraud scoring head on 'claim' node
        self.classifier = nn.Sequential(
            nn.Linear(hidden_channels, hidden_channels // 2),
            nn.ReLU(),
            nn.Dropout(p=self.classifier_dropout),
            nn.Linear(hidden_channels // 2, 1),
        )

    def forward(
        self,
        x_dict: Dict[str, torch.Tensor],
        edge_index_dict: Dict[Tuple[str, str, str], torch.Tensor],
    ) -> torch.Tensor:
        """
        Forward propagation across the heterogeneous relational graph.

        Args:
            x_dict: Dictionary mapping node_type to raw feature tensor.
            edge_index_dict: Dictionary mapping edge_type tuple to edge_index tensor.

        Returns:
            Logits tensor for 'claim' nodes with shape [num_claims].
        """
        # Step 1: Feature Projection with Non-Linearity
        h_dict: Dict[str, torch.Tensor] = {}
        for node_type, x in x_dict.items():
            if node_type in self.projection:
                h_dict[node_type] = F.relu(self.projection[node_type](x))
            else:
                h_dict[node_type] = x

        # Step 2: First Relational Message Passing Layer
        h_dict_layer1 = self.conv1(h_dict, edge_index_dict)
        h_dict = {
            node_type: F.dropout(
                F.relu(h_dict_layer1[node_type]),
                p=self.conv_dropout,
                training=self.training,
            )
            if node_type in h_dict_layer1
            else h_dict[node_type]
            for node_type in h_dict
        }

        # Step 3: Second Relational Message Passing Layer
        h_dict_layer2 = self.conv2(h_dict, edge_index_dict)
        h_dict = {
            node_type: F.relu(h_dict_layer2[node_type])
            if node_type in h_dict_layer2
            else h_dict[node_type]
            for node_type in h_dict
        }

        # Step 4: Extract 'claim' Node Embeddings and Pass Through Classifier Head
        claim_embeddings = h_dict["claim"]
        logits = self.classifier(claim_embeddings).squeeze(-1)

        return logits


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
    """
    Computes class imbalance pos_weight dynamically on the training split
    and configures BCEWithLogitsLoss and AdamW optimizer.

    Args:
        model: AuraJKNRGCN neural network module.
        data: HeteroData containing claim labels and train mask.
        learning_rate: AdamW learning rate.
        weight_decay: AdamW weight decay penalty.
        device: Device to place pos_weight tensor on.

    Returns:
        Tuple of (criterion, optimizer).
    """
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
# 4. Training Loop & Validation Evaluation
# ==============================================================================
def train_single_epoch(
    model: nn.Module,
    data: HeteroData,
    optimizer: torch.optim.Optimizer,
    criterion: nn.BCEWithLogitsLoss,
) -> float:
    """Executes a single training epoch masked exclusively on train_mask claims."""
    model.train()
    optimizer.zero_grad()

    logits = model(data.x_dict, data.edge_index_dict)

    train_mask = data["claim"].train_mask
    train_targets = data["claim"].y[train_mask].float()
    train_logits = logits[train_mask]

    loss = criterion(train_logits, train_targets)
    loss.backward()
    optimizer.step()

    return loss.item()


@torch.no_grad()
def evaluate_validation(
    model: nn.Module,
    data: HeteroData,
    threshold: float = DECISION_THRESHOLD,
) -> Tuple[float, float]:
    """
    Evaluates model on val_mask claims to compute PR-AUC and F1-Score.

    Returns:
        Tuple of (pr_auc, f1_score).
    """
    model.eval()
    logits = model(data.x_dict, data.edge_index_dict)

    val_mask = data["claim"].val_mask
    val_logits = logits[val_mask]
    val_targets = data["claim"].y[val_mask].cpu().numpy()

    val_probs = torch.sigmoid(val_logits).cpu().numpy()
    val_preds = (val_probs >= threshold).astype(int)

    pr_auc = float(average_precision_score(val_targets, val_probs))
    f1 = float(f1_score(val_targets, val_preds, zero_division=0))

    return pr_auc, f1


def train_pipeline(
    model: nn.Module,
    data: HeteroData,
    optimizer: torch.optim.Optimizer,
    criterion: nn.BCEWithLogitsLoss,
    max_epochs: int = MAX_EPOCHS,
    patience: int = EARLY_STOPPING_PATIENCE,
    checkpoint_path: Path = CHECKPOINT_PATH,
) -> Dict[str, Any]:
    """
    Executes training loop with Early Stopping based on validation PR-AUC.

    Returns:
        Dictionary containing training history and best metrics.
    """
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

    print("\n" + "=" * 78)
    print(f"{'AURA-JKN R-GCN TRAINING LOOP':^78}")
    print("=" * 78)
    print(
        f"{'Epoch':^7} | {'Train Loss':^12} | {'Val PR-AUC':^12} | "
        f"{'Val F1':^10} | {'Patience':^10} | {'Status'}"
    )
    print("-" * 78)

    for epoch in range(1, max_epochs + 1):
        loss = train_single_epoch(model, data, optimizer, criterion)
        val_pr_auc, val_f1 = evaluate_validation(model, data)

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

            # Checkpoint the best model parameters
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "val_pr_auc": val_pr_auc,
                    "val_f1": val_f1,
                },
                checkpoint_path,
            )
            status = "(*) Best Model Saved"
        else:
            patience_counter += 1
            status = f"Patience ({patience_counter}/{patience})"

        if epoch % 5 == 0 or is_best or epoch == 1:
            print(
                f"{epoch:^7d} | {loss:^12.5f} | {val_pr_auc:^12.4f} | "
                f"{val_f1:^10.4f} | {patience_counter:^10d} | {status}"
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
    data: HeteroData,
    checkpoint_path: Path = CHECKPOINT_PATH,
    device: torch.device = torch.device("cpu"),
    threshold: float = DECISION_THRESHOLD,
) -> Dict[str, Any]:
    """
    Restores the best model checkpoint and conducts comprehensive test evaluation.

    Metrics Computed:
    - ROC-AUC, PR-AUC, Precision, Recall, F1-Score, Confusion Matrix
    - Breakdown of Recall per Fraud Scenario (A, B, C)
    """
    print("=" * 78)
    print(f"{'FINAL TEST EVALUATION ON UNSEEN CLAIMS':^78}")
    print("=" * 78)

    # 1. Restore Best Checkpoint
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    print(f"[Model Restore] Loaded weights from checkpoint (Epoch {checkpoint['epoch']}).")

    # 2. Inference on Entire Graph & Filter Test Split
    logits = model(data.x_dict, data.edge_index_dict)
    test_mask = data["claim"].test_mask

    test_logits = logits[test_mask]
    test_probs = torch.sigmoid(test_logits).cpu().numpy()
    test_preds = (test_probs >= threshold).astype(int)
    test_targets = data["claim"].y[test_mask].cpu().numpy()

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
    test_scenarios = np.array(raw_scenarios)[test_mask.cpu().numpy()]

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

    # Format and display test evaluation summary
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


# ==============================================================================
# Main Orchestration Function
# ==============================================================================
def main() -> None:
    """Main execution pipeline for Phase 2 Model Training & Evaluation."""
    print("=" * 78)
    print(f"{'AURA-JKN: PHASE 2 (R-GCN TRAINING & EVALUATION)':^78}")
    print("=" * 78)

    # 1. Determinism and Hardware Setup
    set_seed(RANDOM_SEED)
    device = get_device()

    # 2. Load Graph Data
    data = load_hetero_graph(GRAPH_DATA_PATH, device)

    # 3. Model Architecture Instantiation
    model = AuraJKNRGCN(
        edge_types=data.edge_types,
        in_channels_dict=NODE_INPUT_DIMS,
        hidden_channels=HIDDEN_CHANNELS,
        classifier_dropout=CLASSIFIER_DROPOUT,
        conv_dropout=CONV_DROPOUT,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\n[Model Architecture] AuraJKNRGCN initialized.")
    print(f"  - Hidden Channels: {HIDDEN_CHANNELS}")
    print(f"  - Relations Handled: {len(data.edge_types)}")
    print(f"  - Total Trainable Parameters: {total_params:,}")

    # 4. Loss & Optimizer Setup
    criterion, optimizer = create_criterion_and_optimizer(
        model=model,
        data=data,
        learning_rate=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
        device=device,
    )

    # 5. Training Loop with Validation & Early Stopping
    train_results = train_pipeline(
        model=model,
        data=data,
        optimizer=optimizer,
        criterion=criterion,
        max_epochs=MAX_EPOCHS,
        patience=EARLY_STOPPING_PATIENCE,
        checkpoint_path=CHECKPOINT_PATH,
    )

    # 6. Final Evaluation on Test Set
    test_results = evaluate_test_set(
        model=model,
        data=data,
        checkpoint_path=CHECKPOINT_PATH,
        device=device,
        threshold=DECISION_THRESHOLD,
    )

    print("[Done] Phase 2 Training & Evaluation Pipeline completed successfully!")


if __name__ == "__main__":
    main()

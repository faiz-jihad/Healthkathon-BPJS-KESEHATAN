"""
Relational Graph Convolutional Network (R-GCN) Architecture for AURA-JKN
"""

from __future__ import annotations
from typing import Dict, List, Tuple

import os
import sys

# Windows dynamic DLL resolution for torch/lib
for p in sys.path:
    torch_lib = os.path.join(p, "torch", "lib")
    if os.path.isdir(torch_lib):
        try:
            os.add_dll_directory(torch_lib)
        except Exception:
            pass
        break

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch_geometric.nn import HeteroConv, SAGEConv
    TORCH_AVAILABLE = True
except (ImportError, OSError):
    torch = None
    nn = None
    F = None
    HeteroConv = None
    SAGEConv = None
    TORCH_AVAILABLE = False

from src.config import CLASSIFIER_DROPOUT, CONV_DROPOUT, HIDDEN_CHANNELS, NODE_INPUT_DIMS

BaseModule = nn.Module if (TORCH_AVAILABLE and nn is not None) else object


class AuraJKNRGCN(BaseModule):  # type: ignore
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
        in_channels_dict: Dict[str, int] = None,
        hidden_channels: int = HIDDEN_CHANNELS,
        classifier_dropout: float = CLASSIFIER_DROPOUT,
        conv_dropout: float = CONV_DROPOUT,
    ):
        super().__init__()
        if not TORCH_AVAILABLE or nn is None:
            return

        if in_channels_dict is None:
            in_channels_dict = NODE_INPUT_DIMS

        self.hidden_channels = hidden_channels
        self.conv_dropout = conv_dropout
        self.classifier_dropout = classifier_dropout

        # 1. Projection Layer: Project heterogeneous raw feature dimensions
        self.projection = nn.ModuleDict({
            node_type: nn.Linear(in_dim, hidden_channels)
            for node_type, in_dim in in_channels_dict.items()
        })

        # 2. Message Passing: 2-layer HeteroConv across all relational edge types
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

        # 3. Classifier Head: Dedicated binary fraud scoring head on 'claim' node
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

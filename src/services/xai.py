"""
Module 4: Explainable AI (XAI) & Subgraph Evidence Generator
=============================================================
Constructs graph neighborhoods via NetworkX and synthesizes natural language rationales.
"""

from typing import Any, Dict, List, Optional
import networkx as nx

from src.config import DOCTOR_EXTREME_CAPACITY_LIMIT, GATE_HIGH_RISK_THRESHOLD, GATE_WARNING_THRESHOLD
from src.database.registry import DatasetRegistry
from src.schemas.claim import SpatiotemporalMetrics, SubgraphEdge, SubgraphEvidence, SubgraphNode, XAIExplanation


class XAIEvidenceService:
    """
    Constructs explainable graph neighborhoods via NetworkX and formulates
    natural language evidence trails for human review committees.
    """

    def __init__(self, registry: DatasetRegistry):
        self.registry = registry

    def generate_explanation(
        self,
        claim_id: str,
        patient_id: str,
        doctor_id: str,
        facility_id: str,
        icd10_code: str,
        fraud_proba: float,
        spatio_metrics: SpatiotemporalMetrics,
        spatio_notes: List[str],
        conflicting_record: Optional[Dict[str, Any]] = None,
    ) -> XAIExplanation:
        """
        Builds graph topology and clinical/operational explanatory narrative.
        """
        evidence_reasons = list(spatio_notes)

        # Entity metadata lookups
        fac_info = self.registry.facility_map.get(facility_id, {})
        doc_info = self.registry.doctor_map.get(doctor_id, {})
        pat_info = self.registry.patient_map.get(patient_id, {})

        fac_class = fac_info.get("facility_class", "Faskes")
        doc_specialty = doc_info.get("specialty", "Umum")
        home_region = pat_info.get("home_region", "Wilayah")

        # Graph Neural Network Risk Rationale
        if fraud_proba >= GATE_HIGH_RISK_THRESHOLD:
            evidence_reasons.append(
                f"Model R-GCN mendeteksi pola relasi anomali berbobot tinggi dengan "
                f"probabilitas fraud {fraud_proba * 100:.1f}%."
            )
        elif fraud_proba >= GATE_WARNING_THRESHOLD:
            evidence_reasons.append(
                f"Model R-GCN menandai deviasi fitur heterogen klaim pada tingkat "
                f"peringatan ({fraud_proba * 100:.1f}%)."
            )

        # Determine Primary Fraud Trigger Label
        if spatio_metrics.spatial_conflict_detected and spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT:
            primary_trigger = "Spatio-Temporal Conflict & Extreme Doctor Volume"
        elif spatio_metrics.spatial_conflict_detected:
            primary_trigger = "Spatio-Temporal Conflict"
        elif spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT:
            primary_trigger = "Extreme Doctor Daily Volume"
        elif fraud_proba >= GATE_HIGH_RISK_THRESHOLD:
            primary_trigger = "High-Risk Graph Structural Anomaly"
        elif fraud_proba >= GATE_WARNING_THRESHOLD:
            primary_trigger = "Moderate Relational Risk"
        else:
            primary_trigger = "Normal / Low Risk"
            if not evidence_reasons:
                evidence_reasons.append(
                    "Parameter transaksi konsisten dengan profil wajar dan lolos verifikasi pra-pembayaran."
                )

        # --- NetworkX Subgraph Construction ---
        g = nx.DiGraph()

        # Add Core Entities as Nodes
        g.add_node(claim_id, type="claim", label=f"Klaim {claim_id}")
        g.add_node(doctor_id, type="doctor", label=f"Dr. {doctor_id} ({doc_specialty})")
        g.add_node(facility_id, type="facility", label=f"{facility_id} ({fac_class})")
        g.add_node(patient_id, type="patient", label=f"Pasien {patient_id[:10]}...")
        g.add_node(icd10_code, type="diagnosis", label=f"ICD-10: {icd10_code}")

        # Add Relational Edges
        g.add_edge(doctor_id, claim_id, relation="authorized")
        g.add_edge(claim_id, icd10_code, relation="has_diagnosis")
        g.add_edge(patient_id, doctor_id, relation="examined_by")
        g.add_edge(patient_id, facility_id, relation="referred_to")

        # If spatial conflict occurred, add conflicting facility to highlight trajectory
        if conflicting_record:
            other_fid = conflicting_record["conflicting_facility_id"]
            other_fac_info = self.registry.facility_map.get(other_fid, {})
            other_fclass = other_fac_info.get("facility_class", "Faskes")

            g.add_node(
                other_fid,
                type="facility",
                label=f"Konflik Faskes {other_fid} ({other_fclass})",
            )
            g.add_edge(doctor_id, other_fid, relation="concurrent_practice_conflict")

        # Convert to Output Subgraph Evidence Schema
        subgraph_nodes = [
            SubgraphNode(
                id=node,
                type=g.nodes[node].get("type", "entity"),
                label=g.nodes[node].get("label", node),
            )
            for node in g.nodes()
        ]

        subgraph_edges = [
            SubgraphEdge(
                source=u,
                target=v,
                relation=data.get("relation", "connected_to"),
            )
            for u, v, data in g.edges(data=True)
        ]

        return XAIExplanation(
            primary_fraud_trigger=primary_trigger,
            evidence_reasons=evidence_reasons,
            subgraph_evidence=SubgraphEvidence(nodes=subgraph_nodes, edges=subgraph_edges),
        )

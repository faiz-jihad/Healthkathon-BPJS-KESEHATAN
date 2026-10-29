"""
AURA-JKN Phase 3: End-to-End FastAPI Inference, Decision & Generative AI Service
================================================================================
Combines:
  - Phase 2: PyTorch Geometric Relational GCN (R-GCN) Model (models/aura_jkn_rgcn_model.pt & root checkpoint)
  - Module 3: Spatiotemporal Risk Analysis (Spatial conflict & doctor volume anomaly)
  - Module 4: Explainable AI (XAI) & NetworkX Evidence Subgraph Generation
  - Module 5: Generative AI Layer (Multi-tier Executive Audit Brief & Interactive Copilot Chat:
              GroqCloud -> NVIDIA NIM -> Local Factual Rule Engine Fallback)
"""

import asyncio
import logging
import math
import os
import sys
import time as time_module
from contextlib import asynccontextmanager
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Path as FastApiPath, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

try:
    import httpx
except ImportError:
    httpx = None

from src.services.llm_service import (
    _build_local_fallback_brief,
    chat_with_copilot,
    generate_audit_brief,
)

audit_logger = logging.getLogger("aura_jkn.audit")

# ==============================================================================
# Configuration & Paths
# ==============================================================================
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

GRAPH_DATA_PATH = (
    MODELS_DIR / "aura_jkn_hetero_graph.pt"
    if (MODELS_DIR / "aura_jkn_hetero_graph.pt").exists() and (MODELS_DIR / "aura_jkn_hetero_graph.pt").stat().st_size > 0
    else BASE_DIR / "aura_jkn_hetero_graph.pt"
)
MODEL_CHECKPOINT_PATH = (
    MODELS_DIR / "aura_jkn_rgcn_model.pt"
    if (MODELS_DIR / "aura_jkn_rgcn_model.pt").exists()
    else BASE_DIR / "aura_jkn_rgcn_model.pt"
)

FACILITIES_PARQUET = DATA_DIR / "facilities.parquet"
DOCTORS_PARQUET = DATA_DIR / "doctors.parquet"
PATIENTS_PARQUET = DATA_DIR / "patients.parquet"
CLAIMS_PARQUET = DATA_DIR / "claims.parquet"

# Thresholds for decision gate
GATE_HIGH_RISK_THRESHOLD = float(os.environ.get("GATE_HIGH_RISK_THRESHOLD", "0.70"))
GATE_WARNING_THRESHOLD = float(os.environ.get("GATE_WARNING_THRESHOLD", "0.40"))
LLM_TIMEOUT = float(os.environ.get("LLM_TIMEOUT", "3.0"))

# Doctor volume benchmark thresholds
DOCTOR_PEER_AVERAGE_DAILY_VOLUME = 25
DOCTOR_NORMAL_CAPACITY_LIMIT = 45  # ~180% of peer avg
DOCTOR_EXTREME_CAPACITY_LIMIT = 80  # >300% of peer avg
SPATIAL_DISTANCE_KM_THRESHOLD = 400.0  # Conflict if served > 400 km apart in 1 day
SPATIAL_DEGREE_THRESHOLD = 4.5  # ~500 km in Indonesian archipelago

NODE_INPUT_DIMS = {
    "patient": 34,
    "doctor": 6,
    "facility": 4,
    "claim": 23,
    "diagnosis": 10,
}
HIDDEN_CHANNELS = 64


# ==============================================================================
# Pydantic Schemas (Request & Response)
# ==============================================================================
class ClaimPredictionRequest(BaseModel):
    """Input payload for single claim fraud risk assessment."""

    claim_id: str = Field(..., description="Unique Claim Identifier", examples=["CLM00010650"])
    patient_id: str = Field(..., description="Pseudonymized Patient Identifier", examples=["pat_9f83a012c4"])
    doctor_id: str = Field(..., description="Doctor Identifier", examples=["DOC0086"])
    facility_id: str = Field(..., description="Healthcare Facility (Faskes) ID", examples=["FAC0005"])
    icd10_code: str = Field(..., description="Primary Diagnosis ICD-10 Code", examples=["I25.1"])
    service_date: str = Field(..., description="Date of Service (YYYY-MM-DD)", examples=["2026-03-15"])
    service_time: str = Field(..., description="Time of Service (HH:MM:SS)", examples=["09:30:00"])
    ina_cbgs_tariff: float = Field(..., description="Claim Tariff Amount in IDR", examples=[850000.0])
    length_of_stay: int = Field(0, description="Length of Inpatient Stay in Days", examples=[2])
    fktp_referral_id: Optional[str] = Field(None, description="FKTP Referral Visit ID (if applicable)")
    referral_facility_id: Optional[str] = Field(None, description="Referred FKTP Facility ID (if applicable)")
    dati2: Optional[int] = Field(None, description="Kab/Kota Dati2 Code")

    @field_validator("claim_id", "patient_id", "doctor_id", "facility_id", "icd10_code")
    @classmethod
    def validate_non_empty_strings(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field identifier tidak boleh kosong.")
        return v.strip()

    @field_validator("service_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("service_date harus berformat YYYY-MM-DD dan merupakan tanggal kalender yang valid.")
        return v

    @field_validator("service_time")
    @classmethod
    def validate_time(cls, v: str) -> str:
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                datetime.strptime(v, fmt)
                return v
            except ValueError:
                pass
        raise ValueError("service_time harus berformat HH:MM atau HH:MM:SS.")

    @field_validator("ina_cbgs_tariff")
    @classmethod
    def validate_tariff(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("ina_cbgs_tariff harus berupa angka positif (> 0).")
        return v

    @field_validator("length_of_stay")
    @classmethod
    def validate_los(cls, v: int) -> int:
        if v < 0:
            raise ValueError("length_of_stay harus bernilai >= 0.")
        return v

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "claim_id": "CLM00010650",
                "patient_id": "98127389172391283",
                "doctor_id": "DOC0086",
                "facility_id": "FAC0005",
                "icd10_code": "I25.1",
                "service_date": "2026-03-15",
                "service_time": "09:30:00",
                "ina_cbgs_tariff": 850000.0,
                "length_of_stay": 2,
            }
        },
    )


class SpatiotemporalMetrics(BaseModel):
    """Metrics produced by Module 3 Spatiotemporal Risk Analysis."""

    spatial_conflict_detected: bool = Field(..., description="Whether impossible geographical trajectory was flagged")
    doctor_daily_volume: int = Field(..., description="Total claims authorized by doctor on this service date")
    spatiotemporal_risk_score: float = Field(..., description="Composite risk score from 0.0 to 100.0")


class SubgraphNode(BaseModel):
    """Node in the explanatory relational subgraph."""

    id: str = Field(..., description="Unique entity ID")
    type: str = Field(..., description="Entity category: claim, patient, doctor, facility, diagnosis")
    label: Optional[str] = Field(None, description="Human-readable display title")


class SubgraphEdge(BaseModel):
    """Directed relational edge in the explanatory subgraph."""

    source: str = Field(..., description="Origin node ID")
    target: str = Field(..., description="Destination node ID")
    relation: str = Field(..., description="Relational predicate (e.g. authorized, examined_by)")


class SubgraphEvidence(BaseModel):
    """Graph data structure for frontend visualization."""

    nodes: List[SubgraphNode] = Field(default_factory=list)
    edges: List[SubgraphEdge] = Field(default_factory=list)


class AuditBrief(BaseModel):
    """Generative AI Audit Narrative Summary."""

    audit_narrative: str = Field(..., description="1-2 sentence executive audit brief")
    llm_provider_used: str = Field(..., description="LLM provider name: groq, nvidia_nim, or local_fallback")
    is_fallback: bool = Field(..., description="Whether fallback provider or local rule engine was used")


class XAIExplanation(BaseModel):
    """Explainable AI package from Module 4 & Module 5."""

    primary_fraud_trigger: str = Field(..., description="Dominant detected fraud pattern")
    evidence_reasons: List[str] = Field(..., description="Explicit text-based explanatory rationales")
    subgraph_evidence: SubgraphEvidence = Field(..., description="Relational neighborhood subgraph")
    audit_brief: Optional[AuditBrief] = Field(None, description="Generative AI executive audit narrative")


class ClaimPredictionResponse(BaseModel):
    """Complete response payload for AURA-JKN Pre-Payment Verification Gate."""

    claim_id: str
    analysis_status: str = Field(
        default="ANALYSIS_SUCCESS",
        description="Status asesmen: ANALYSIS_SUCCESS | NOT_ANALYZED | ANALYSIS_UNAVAILABLE",
    )
    fraud_probability: Optional[float] = Field(
        None, description="Calibrated fraud score from 0.0 to 1.0 (None jika belum dianalisis/gagal)"
    )
    risk_level: str = Field(..., description="Risk categorization: HIGH, MEDIUM, LOW, UNASSESSED")
    pre_payment_gate: str = Field(
        ...,
        description="Automated gate screening recommendation: REJECT_FOR_HUMAN_REVIEW, FLAGGED_WARNING, AUTO_APPROVE, or PENDING_ASSESSMENT",
    )
    applied_threshold: float = Field(default=0.70, description="Active High Risk threshold applied")
    warning_threshold: float = Field(default=0.40, description="Active Warning threshold applied")
    referral_distance_to_fktp: Optional[float] = Field(None, description="Imputed/measured Haversine distance to referral FKTP (km)")
    referral_distance_missing: Optional[bool] = Field(None, description="Whether referral distance was missing/imputed")
    spatiotemporal_metrics: Optional[SpatiotemporalMetrics] = None
    xai_explanation: Optional[XAIExplanation] = None


class ClaimChatMessage(BaseModel):
    """Single message turn in the Audit Copilot conversation."""

    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ClaimChatRequest(BaseModel):
    """Input payload for interactive claim audit copilot chat."""

    user_message: str = Field(..., description="Question or instruction from the BPJS auditor")
    chat_history: List[ClaimChatMessage] = Field(
        default_factory=list,
        description="Conversation history (automatically truncated to last 5 turns)",
    )


class ClaimChatResponse(BaseModel):
    """Response payload for interactive claim audit copilot conversation."""

    claim_id: str = Field(..., description="Audited Claim Identifier")
    reply: str = Field(..., description="Copilot's factual answer based on claim evidence")
    provider_used: str = Field(..., description="groq | nvidia_nim | local_fallback")
    is_fallback: bool = Field(..., description="Whether fallback provider or local engine was used")


class HealthCheckResponse(BaseModel):
    """API Health and diagnostic readiness status."""

    status: str
    service: str
    version: str
    device: str
    model_loaded: bool
    graph_loaded: bool
    num_claims_in_registry: int
    num_facilities_in_registry: int
    num_doctors_in_registry: int


# ==============================================================================
# Helper: Haversine Distance Calculation
# ==============================================================================
def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two geographical points in kilometers."""
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return earth_radius_km * c


# ==============================================================================
# Service 1: Knowledge Registry & Dataset Provider
# ==============================================================================
class DatasetRegistry:
    """Loads and indexes entity parquet stores for real-time querying."""

    def __init__(self, data_dir: Path = DATA_DIR):
        self.data_dir = data_dir
        self.facilities_df: pd.DataFrame = pd.DataFrame()
        self.doctors_df: pd.DataFrame = pd.DataFrame()
        self.patients_df: pd.DataFrame = pd.DataFrame()
        self.claims_df: pd.DataFrame = pd.DataFrame()

        # Indexed lookups
        self.facility_map: Dict[str, Dict[str, Any]] = {}
        self.doctor_map: Dict[str, Dict[str, Any]] = {}
        self.patient_map: Dict[str, Dict[str, Any]] = {}
        self.claim_map: Dict[str, Dict[str, Any]] = {}

        # Spatiotemporal group indexes
        self.doctor_claims_by_date: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        self.patient_claims_by_date: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}

    def load_data(self) -> None:
        """Loads parquet records into memory and constructs fast hash maps."""
        if not (self.data_dir / "facilities.parquet").exists():
            print(f"[DatasetRegistry] Parquet files not found in {self.data_dir}. Initializing empty.")
            return

        print("[DatasetRegistry] Loading columnar tables from parquet...")
        self.facilities_df = pd.read_parquet(self.data_dir / "facilities.parquet")
        self.doctors_df = pd.read_parquet(self.data_dir / "doctors.parquet")
        self.patients_df = pd.read_parquet(self.data_dir / "patients.parquet")
        self.claims_df = pd.read_parquet(self.data_dir / "claims.parquet")

        # Normalize string dates and times
        self.claims_df["service_date_str"] = self.claims_df["service_date"].astype(str)
        self.claims_df["service_time_str"] = self.claims_df["service_time"].astype(str)

        # Build dictionaries
        self.facility_map = self.facilities_df.set_index("facility_id").to_dict(orient="index")
        self.doctor_map = self.doctors_df.set_index("doctor_id").to_dict(orient="index")
        self.patient_map = self.patients_df.set_index("patient_id").to_dict(orient="index")
        self.claim_map = self.claims_df.set_index("claim_id").to_dict(orient="index")

        # Group claims for spatiotemporal lookups: (doctor_id, date) -> claims
        for row in self.claims_df.to_dict(orient="records"):
            doc_key = (str(row["doctor_id"]), str(row["service_date_str"]))
            self.doctor_claims_by_date.setdefault(doc_key, []).append(row)

            pat_key = (str(row["patient_id"]), str(row["service_date_str"]))
            self.patient_claims_by_date.setdefault(pat_key, []).append(row)

        print(
            f"[DatasetRegistry] Loaded {len(self.claims_df):,} claims, "
            f"{len(self.doctors_df):,} doctors, {len(self.facilities_df):,} facilities."
        )

    def register_claim(self, record: Dict[str, Any]) -> None:
        """Dynamically registers or updates a claim record in memory."""
        cid = str(record.get("claim_id", ""))
        if not cid:
            return
        record["service_date_str"] = str(record.get("service_date_str") or record.get("service_date", ""))
        record["service_time_str"] = str(record.get("service_time_str") or record.get("service_time", ""))
        self.claim_map[cid] = record


# ==============================================================================
# Service 2: Spatiotemporal Risk Analyzer (Proposal Module 3)
# ==============================================================================
class SpatiotemporalRiskAnalyzer:
    """
    Executes Spatiotemporal integrity rules:
    1. Spatial Impossibility: Identifies same-day transactions across facilities
       with geographical distance exceeding physical travel speed limits (>5 deg or >400 km).
    2. Extreme Doctor Volume: Identifies abnormal claim authoring volumes
       surpassing daily capacity peer limits.
    """

    def __init__(self, registry: DatasetRegistry):
        self.registry = registry

    def analyze(
        self,
        claim_id: str,
        doctor_id: str,
        facility_id: str,
        patient_id: str,
        service_date: str,
    ) -> Tuple[SpatiotemporalMetrics, List[str], Optional[Dict[str, Any]]]:
        evidence_notes: List[str] = []
        spatial_conflict = False
        conflicting_record: Optional[Dict[str, Any]] = None
        max_conflict_dist_km = 0.0

        current_fac = self.registry.facility_map.get(facility_id)
        current_lat = current_fac["latitude"] if current_fac else 0.0
        current_lon = current_fac["longitude"] if current_fac else 0.0

        # --- 1. Doctor Daily Volume Anomaly Check ---
        doc_key = (doctor_id, service_date)
        daily_claims = self.registry.doctor_claims_by_date.get(doc_key, [])
        volume_count = len(daily_claims)

        is_existing_in_day = any(c.get("claim_id") == claim_id for c in daily_claims)
        if not is_existing_in_day:
            volume_count += 1

        if volume_count >= DOCTOR_EXTREME_CAPACITY_LIMIT:
            ratio_pct = int((volume_count / DOCTOR_NORMAL_CAPACITY_LIMIT) * 100)
            evidence_notes.append(
                f"Dokter {doctor_id} memproses {volume_count} klaim pada tanggal {service_date} "
                f"({ratio_pct}% dari ambang kapasitas normal {DOCTOR_NORMAL_CAPACITY_LIMIT} klaim/hari)."
            )
        elif volume_count > DOCTOR_NORMAL_CAPACITY_LIMIT:
            evidence_notes.append(
                f"Volume transaksi dokter {doctor_id} tergolong tinggi ({volume_count} klaim/hari) "
                f"melebihi rata-rata peer {DOCTOR_PEER_AVERAGE_DAILY_VOLUME} klaim/hari."
            )

        # --- 2. Doctor Spatial Impossible Movement Check ---
        has_valid_current_coords = current_fac and not (abs(current_lat) < 0.001 and abs(current_lon) < 0.001)
        if has_valid_current_coords:
            for past_claim in daily_claims:
                if str(past_claim.get("claim_id")) == str(claim_id):
                    continue
                other_fac_id = str(past_claim.get("facility_id"))
                if other_fac_id != facility_id:
                    other_fac = self.registry.facility_map.get(other_fac_id)
                    has_valid_other_coords = other_fac and not (
                        abs(other_fac.get("latitude", 0.0)) < 0.001 and abs(other_fac.get("longitude", 0.0)) < 0.001
                    )
                    if has_valid_other_coords:
                        lat_diff = abs(current_lat - other_fac["latitude"])
                        lon_diff = abs(current_lon - other_fac["longitude"])
                        dist_km = calculate_haversine_distance(
                            current_lat, current_lon, other_fac["latitude"], other_fac["longitude"]
                        )

                        if (lat_diff >= SPATIAL_DEGREE_THRESHOLD or lon_diff >= SPATIAL_DEGREE_THRESHOLD) and dist_km >= SPATIAL_DISTANCE_KM_THRESHOLD:
                            spatial_conflict = True
                            if dist_km > max_conflict_dist_km:
                                max_conflict_dist_km = dist_km
                                conflicting_record = {
                                    "conflicting_facility_id": other_fac_id,
                                    "distance_km": round(dist_km, 1),
                                    "time_a": str(past_claim.get("service_time_str", "")),
                                    "other_claim_id": str(past_claim.get("claim_id", "")),
                                }

        if spatial_conflict and conflicting_record:
            other_fid = conflicting_record["conflicting_facility_id"]
            dist = conflicting_record["distance_km"]
            evidence_notes.append(
                f"Dokter {doctor_id} melayani klaim di faskes {facility_id} dan {other_fid} "
                f"berjarak ~{dist:,.0f} km pada hari yang sama (Konflik Spasio-Temporal)."
            )

        # --- 3. Compute Composite Spatiotemporal Risk Score (0 - 100) ---
        spatiotemporal_score = 0.0

        if spatial_conflict:
            spatiotemporal_score += 55.0

        if volume_count >= DOCTOR_EXTREME_CAPACITY_LIMIT:
            spatiotemporal_score += 40.0
        elif volume_count > DOCTOR_NORMAL_CAPACITY_LIMIT:
            volume_excess = volume_count - DOCTOR_NORMAL_CAPACITY_LIMIT
            spatiotemporal_score += min(30.0, volume_excess * 1.0)
        else:
            spatiotemporal_score += (volume_count / DOCTOR_NORMAL_CAPACITY_LIMIT) * 10.0

        spatiotemporal_score = min(100.0, max(0.0, spatiotemporal_score))

        metrics = SpatiotemporalMetrics(
            spatial_conflict_detected=spatial_conflict,
            doctor_daily_volume=volume_count,
            spatiotemporal_risk_score=round(spatiotemporal_score, 1),
        )

        return metrics, evidence_notes, conflicting_record


# ==============================================================================
# Service 3: XAI & Subgraph Evidence Generator (Proposal Module 4)
# ==============================================================================
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
        evidence_reasons = list(spatio_notes)

        fac_info = self.registry.facility_map.get(facility_id, {})
        doc_info = self.registry.doctor_map.get(doctor_id, {})

        fac_class = fac_info.get("facility_class", "Faskes")
        doc_specialty = doc_info.get("specialty", "Umum")

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

        if fraud_proba < GATE_WARNING_THRESHOLD:
            primary_trigger = "Normal / Low Risk"
            if not evidence_reasons:
                evidence_reasons.append(
                    "Parameter transaksi konsisten dengan profil wajar dan lolos verifikasi pra-pembayaran."
                )
        else:
            if spatio_metrics.spatial_conflict_detected and spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT:
                primary_trigger = "Spatio-Temporal Conflict & Extreme Doctor Volume"
            elif spatio_metrics.spatial_conflict_detected:
                primary_trigger = "Spatio-Temporal Conflict"
            elif spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT:
                primary_trigger = "Extreme Doctor Daily Volume"
            elif fraud_proba >= GATE_HIGH_RISK_THRESHOLD:
                primary_trigger = "High-Risk Graph Structural Anomaly"
            else:
                primary_trigger = "Moderate Relational Risk"

        # --- NetworkX Subgraph Construction ---
        g = nx.DiGraph()

        g.add_node(claim_id, type="claim", label=f"Klaim {claim_id}")
        g.add_node(doctor_id, type="doctor", label=f"Dr. {doctor_id} ({doc_specialty})")
        g.add_node(facility_id, type="facility", label=f"{facility_id} ({fac_class})")
        g.add_node(patient_id, type="patient", label=f"Pasien {patient_id[:10]}...")
        g.add_node(icd10_code, type="diagnosis", label=f"ICD-10: {icd10_code}")

        g.add_edge(doctor_id, claim_id, relation="authorized")
        g.add_edge(claim_id, icd10_code, relation="has_diagnosis")
        g.add_edge(patient_id, doctor_id, relation="examined_by")
        g.add_edge(patient_id, facility_id, relation="referred_to")

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


# ==============================================================================
# Service 4: R-GCN Graph Model Engine (Phase 2 Integration)
# ==============================================================================
class RGCNModelEngine:
    """
    Integrates the Phase 2 PyTorch Geometric Relational GCN checkpoint.
    Supports both models/aura_jkn_rgcn_model.pt and root aura_jkn_rgcn_model.pt
    with automatic dimension resolution.
    """

    def __init__(self, checkpoint_path: Path, graph_path: Path):
        self.checkpoint_path = checkpoint_path
        self.graph_path = graph_path
        self.device = "cpu"
        self.is_loaded = False
        self.load_error: Optional[str] = None
        self.model: Optional[Any] = None
        self.hetero_data: Optional[Any] = None
        self.cached_predictions: Dict[str, float] = {}

    def initialize(self, registry: DatasetRegistry) -> None:
        """Loads weights and executes R-GCN inference across the heterogeneous graph."""
        print("\n[RGCNModelEngine] Initializing Model Engine...")

        try:
            import torch

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[RGCNModelEngine] PyTorch runtime detected on device: {self.device}")

            if not self.graph_path.exists():
                raise FileNotFoundError(f"Hetero graph data file not found at {self.graph_path}")

            print(f"[RGCNModelEngine] Loading graph from {self.graph_path}...")
            self.hetero_data = torch.load(self.graph_path, weights_only=False, map_location=self.device)

            graph_dims = {
                node_type: int(self.hetero_data[node_type].x.size(1))
                for node_type in self.hetero_data.node_types
                if hasattr(self.hetero_data[node_type], "x") and self.hetero_data[node_type].x is not None
            }

            # Candidate checkpoints: try compatible checkpoint first
            candidate_ckpts = [
                self.checkpoint_path,
                BASE_DIR / "aura_jkn_rgcn_model.pt",
                MODELS_DIR / "aura_jkn_rgcn_model.pt",
            ]
            loaded_model = None
            probs = None
            last_exc: Optional[Exception] = None

            try:
                from src.models.rgcn import AuraJKNRGCN
            except ImportError:
                from train_rgcn import AuraJKNRGCN

            for ckpt_p in candidate_ckpts:
                if not ckpt_p.exists():
                    continue
                try:
                    ckpt = torch.load(ckpt_p, map_location=self.device, weights_only=False)
                    state_dict = ckpt.get("model_state_dict", ckpt) if isinstance(ckpt, dict) else ckpt

                    in_channels = dict(graph_dims or NODE_INPUT_DIMS)
                    if isinstance(ckpt, dict) and isinstance(ckpt.get("in_channels_dict"), dict):
                        in_channels.update(ckpt["in_channels_dict"])
                    elif isinstance(state_dict, dict):
                        for nt in list(in_channels.keys()):
                            w_key = f"projection.{nt}.weight"
                            if w_key in state_dict and hasattr(state_dict[w_key], "shape"):
                                in_channels[nt] = int(state_dict[w_key].shape[1])

                    m = AuraJKNRGCN(
                        edge_types=self.hetero_data.edge_types,
                        in_channels_dict=in_channels,
                        hidden_channels=HIDDEN_CHANNELS,
                    ).to(self.device)
                    m.load_state_dict(state_dict)
                    m.eval()

                    with torch.no_grad():
                        logits = m(self.hetero_data.x_dict, self.hetero_data.edge_index_dict)
                        probs = torch.sigmoid(logits).cpu().numpy()

                    loaded_model = m
                    print(f"[RGCNModelEngine] Loaded and verified R-GCN checkpoint from {ckpt_p}")
                    break
                except Exception as inner_e:
                    last_exc = inner_e
                    continue

            if loaded_model is None or probs is None:
                raise RuntimeError(f"Could not load compatible R-GCN checkpoint: {last_exc}")

            self.model = loaded_model

            if not registry.claims_df.empty:
                for idx, cid in enumerate(registry.claims_df["claim_id"]):
                    if idx < len(probs):
                        self.cached_predictions[str(cid)] = float(probs[idx])

            self.is_loaded = True
            self.load_error = None
            print(
                f"[RGCNModelEngine] PyG R-GCN Model active with "
                f"{len(self.cached_predictions):,} genuine graph claim predictions."
            )
            return

        except Exception as exc:
            self.is_loaded = False
            self.load_error = str(exc)
            self.cached_predictions = {}
            print(
                f"[RGCNModelEngine] ZERO MOCK POLICY: PyTorch graph inference unavailable: {exc}. "
                "No synthetic fallback probabilities or fake random scores will be generated."
            )

    def predict_claim_probability(self, claim_id: str) -> Optional[float]:
        if claim_id in self.cached_predictions:
            return self.cached_predictions[claim_id]
        return None


# ==============================================================================
# Helper: Attach Generative AI Executive Audit Brief
# ==============================================================================
async def _attach_audit_brief(
    payload: ClaimPredictionRequest,
    fraud_prob: float,
    risk_level: str,
    pre_payment_gate: str,
    spatio_metrics: SpatiotemporalMetrics,
    xai_explanation: XAIExplanation,
    client: Optional[Any] = None,
) -> None:
    """Populates xai_explanation.audit_brief using multi-tier LLM (Groq -> NVIDIA NIM -> Local Rule Engine)."""
    claim_data = {
        "claim_id": payload.claim_id,
        "patient_id": payload.patient_id,
        "doctor_id": payload.doctor_id,
        "facility_id": payload.facility_id,
        "icd10_code": payload.icd10_code,
        "service_date": payload.service_date,
        "service_time": payload.service_time,
        "ina_cbgs_tariff": payload.ina_cbgs_tariff,
        "length_of_stay": payload.length_of_stay,
    }
    try:
        brief = await generate_audit_brief(
            claim_data=claim_data,
            fraud_prob=fraud_prob,
            risk_level=risk_level,
            pre_payment_gate=pre_payment_gate,
            spatio_metrics=spatio_metrics.model_dump(),
            evidence_reasons=xai_explanation.evidence_reasons,
            client=client,
        )
        xai_explanation.audit_brief = AuditBrief(
            audit_narrative=brief.audit_narrative,
            llm_provider_used=brief.llm_provider_used,
            is_fallback=brief.is_fallback,
        )
    except Exception:
        try:
            narrative = _build_local_fallback_brief(
                claim_data=claim_data,
                fraud_prob=fraud_prob,
                risk_level=risk_level,
                pre_payment_gate=pre_payment_gate,
                spatio_metrics=spatio_metrics.model_dump(),
                evidence_reasons=xai_explanation.evidence_reasons,
            )
            xai_explanation.audit_brief = AuditBrief(
                audit_narrative=narrative,
                llm_provider_used="local_fallback",
                is_fallback=True,
            )
        except Exception:
            pass


def _resolve_referral_metadata(payload: ClaimPredictionRequest) -> Tuple[float, bool]:
    """Resolves referral distance to FKTP and whether it was imputed."""
    rec = registry.claim_map.get(payload.claim_id)
    if rec and "referral_distance_to_fktp" in rec and pd.notna(rec["referral_distance_to_fktp"]):
        return float(rec["referral_distance_to_fktp"]), bool(rec.get("referral_distance_missing", False))
    if payload.referral_facility_id:
        fac_rec = registry.facility_map.get(payload.referral_facility_id)
        if fac_rec and "latitude" in fac_rec:
            p_lat, p_lon = -6.2088, 106.8456
            if payload.dati2:
                try:
                    from src.data.bpjs_sample_etl import get_centroid, haversine_distance
                    p_lat, p_lon, _ = get_centroid(payload.dati2)
                    return round(haversine_distance(p_lat, p_lon, fac_rec["latitude"], fac_rec["longitude"]), 2), False
                except Exception:
                    pass
            return round(calculate_haversine_distance(p_lat, p_lon, float(fac_rec["latitude"]), float(fac_rec["longitude"])), 2), False
    return 12.5, True


# ==============================================================================
# Global Application Lifecycle & Singletons
# ==============================================================================
registry = DatasetRegistry(DATA_DIR)
spatio_analyzer = SpatiotemporalRiskAnalyzer(registry)
xai_service = XAIEvidenceService(registry)
model_engine = RGCNModelEngine(MODEL_CHECKPOINT_PATH, GRAPH_DATA_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes models, HTTP client pool, and datasets on startup."""
    print("=================================================================")
    print("      Starting AURA-JKN Phase 3 Decision & Inference API         ")
    print("=================================================================")
    if httpx is not None:
        app.state.http_client = httpx.AsyncClient(timeout=LLM_TIMEOUT)
    else:
        app.state.http_client = None

    registry.load_data()
    model_engine.initialize(registry)
    yield
    if hasattr(app.state, "http_client") and app.state.http_client is not None and not app.state.http_client.is_closed:
        await app.state.http_client.aclose()
    print("[Shutdown] Cleaning up AURA-JKN resources...")


# ==============================================================================
# FastAPI App Setup
# ==============================================================================
app = FastAPI(
    title="AURA-JKN Decision Service API",
    description=(
        "Production-grade End-to-End API Service for BPJS Kesehatan Fraud Detection. "
        "Integrates Relational Graph Convolutional Network (R-GCN), Spatiotemporal Risk "
        "Analysis (Module 3), Explainable AI Subgraph Generation (Module 4), and "
        "Generative AI Audit Copilot (Module 5)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Endpoints
# ==============================================================================
@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["System & Monitoring"],
    summary="Health and Readiness Check",
)
def get_health_status() -> HealthCheckResponse:
    """Verifies operational readiness, loaded graph volume, and model state."""
    return HealthCheckResponse(
        status="healthy" if model_engine.is_loaded else "degraded",
        service="AURA-JKN Phase 3 Inference API",
        version="1.0.0",
        device=model_engine.device,
        model_loaded=model_engine.is_loaded,
        graph_loaded=len(model_engine.cached_predictions) > 0,
        num_claims_in_registry=len(registry.claims_df),
        num_facilities_in_registry=len(registry.facilities_df),
        num_doctors_in_registry=len(registry.doctors_df),
    )


@app.post(
    "/api/v1/predict-claim",
    response_model=ClaimPredictionResponse,
    status_code=status.HTTP_200_OK,
    tags=["Claim Risk Assessment"],
    summary="Predict Claim Fraud Risk with Spatiotemporal, XAI Evidence & Generative Audit Brief",
)
async def predict_claim(payload: ClaimPredictionRequest) -> ClaimPredictionResponse:
    """
    Zero Mock Data Phase 3 Automated Verification Pipeline:
    1. Verifies model & graph readiness. If model is offline, raises 503 ANALYSIS_UNAVAILABLE.
    2. Evaluates Spatiotemporal constraints from genuine registry records.
    3. Executes R-GCN Graph inference. If claim is not indexed in HeteroData graph,
       returns NOT_ANALYZED honestly without fabricating probability or risk score.
    4. Categorizes Pre-Payment Gate action for analyzed claims.
    5. Generates NetworkX Explainability (XAI) Subgraph & Generative AI Audit Brief.
    """
    if not model_engine.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "ANALYSIS_UNAVAILABLE",
                "message": f"Engine inferensi model AI tidak aktif atau artefak model tidak tersedia: {model_engine.load_error}. Sesuai Zero Mock Data Policy, sistem menolak pembuatan skor tiruan.",
            },
        )

    http_cli = getattr(app.state, "http_client", None)
    ref_dist, ref_missing = _resolve_referral_metadata(payload)

    # 1. Spatiotemporal Risk Analysis (Computed from genuine records)
    spatio_metrics, spatio_notes, conflict_record = spatio_analyzer.analyze(
        claim_id=payload.claim_id,
        doctor_id=payload.doctor_id,
        facility_id=payload.facility_id,
        patient_id=payload.patient_id,
        service_date=payload.service_date,
    )

    # 2. Model R-GCN Inference
    fraud_prob = model_engine.predict_claim_probability(claim_id=payload.claim_id)

    # 3. Handle Claim Not in Evaluated Graph (Zero Mock Policy: Do NOT fabricate score)
    if fraud_prob is None:
        xai_explanation = xai_service.generate_explanation(
            claim_id=payload.claim_id,
            patient_id=payload.patient_id,
            doctor_id=payload.doctor_id,
            facility_id=payload.facility_id,
            icd10_code=payload.icd10_code,
            fraud_proba=0.0,
            spatio_metrics=spatio_metrics,
            spatio_notes=spatio_notes,
            conflicting_record=conflict_record,
        )
        xai_explanation.primary_fraud_trigger = (
            "Spatiotemporal Evaluated / GNN Unanalyzed"
            if (spatio_metrics.spatial_conflict_detected or spatio_metrics.doctor_daily_volume > 45)
            else "Not Analyzed by Graph Model"
        )
        xai_explanation.evidence_reasons.append(
            "Klaim ini belum dikonstruksi ke dalam topologi subgraf PyTorch Geometric heterogen. Status: NOT_ANALYZED (skor probabilitas fraud tidak direkayasa)."
        )
        await _attach_audit_brief(
            payload=payload,
            fraud_prob=0.0,
            risk_level="UNASSESSED",
            pre_payment_gate="PENDING_ASSESSMENT",
            spatio_metrics=spatio_metrics,
            xai_explanation=xai_explanation,
            client=http_cli,
        )
        registry.register_claim({
            "claim_id": payload.claim_id,
            "patient_id": payload.patient_id,
            "doctor_id": payload.doctor_id,
            "facility_id": payload.facility_id,
            "icd10_code": payload.icd10_code,
            "service_date": payload.service_date,
            "service_time": payload.service_time,
            "service_date_str": str(payload.service_date),
            "service_time_str": str(payload.service_time),
            "ina_cbgs_tariff": payload.ina_cbgs_tariff,
            "length_of_stay": payload.length_of_stay,
            "fraud_probability": None,
            "risk_level": "UNASSESSED",
            "pre_payment_gate": "PENDING_ASSESSMENT",
        })

        return ClaimPredictionResponse(
            claim_id=payload.claim_id,
            analysis_status="NOT_ANALYZED",
            fraud_probability=None,
            risk_level="UNASSESSED",
            pre_payment_gate="PENDING_ASSESSMENT",
            applied_threshold=GATE_HIGH_RISK_THRESHOLD,
            warning_threshold=GATE_WARNING_THRESHOLD,
            referral_distance_to_fktp=ref_dist,
            referral_distance_missing=ref_missing,
            spatiotemporal_metrics=spatio_metrics,
            xai_explanation=xai_explanation,
        )

    # 4. Decision Gate Determination for Analyzed Claims
    if fraud_prob >= GATE_HIGH_RISK_THRESHOLD:
        pre_payment_gate = "REJECT_FOR_HUMAN_REVIEW"
        risk_level = "HIGH"
    elif fraud_prob >= GATE_WARNING_THRESHOLD:
        pre_payment_gate = "FLAGGED_WARNING"
        risk_level = "MEDIUM"
    else:
        pre_payment_gate = "AUTO_APPROVE"
        risk_level = "LOW"

    # 5. XAI & Evidence Subgraph Generation Grounded in Real Inference
    xai_explanation = xai_service.generate_explanation(
        claim_id=payload.claim_id,
        patient_id=payload.patient_id,
        doctor_id=payload.doctor_id,
        facility_id=payload.facility_id,
        icd10_code=payload.icd10_code,
        fraud_proba=fraud_prob,
        spatio_metrics=spatio_metrics,
        spatio_notes=spatio_notes,
        conflicting_record=conflict_record,
    )
    await _attach_audit_brief(
        payload=payload,
        fraud_prob=fraud_prob,
        risk_level=risk_level,
        pre_payment_gate=pre_payment_gate,
        spatio_metrics=spatio_metrics,
        xai_explanation=xai_explanation,
        client=http_cli,
    )
    registry.register_claim({
        "claim_id": payload.claim_id,
        "patient_id": payload.patient_id,
        "doctor_id": payload.doctor_id,
        "facility_id": payload.facility_id,
        "icd10_code": payload.icd10_code,
        "service_date": payload.service_date,
        "service_time": payload.service_time,
        "service_date_str": str(payload.service_date),
        "service_time_str": str(payload.service_time),
        "ina_cbgs_tariff": payload.ina_cbgs_tariff,
        "length_of_stay": payload.length_of_stay,
        "fraud_probability": round(fraud_prob, 3),
        "risk_level": risk_level,
        "pre_payment_gate": pre_payment_gate,
    })

    return ClaimPredictionResponse(
        claim_id=payload.claim_id,
        analysis_status="ANALYSIS_SUCCESS",
        fraud_probability=round(fraud_prob, 3),
        risk_level=risk_level,
        pre_payment_gate=pre_payment_gate,
        applied_threshold=GATE_HIGH_RISK_THRESHOLD,
        warning_threshold=GATE_WARNING_THRESHOLD,
        referral_distance_to_fktp=ref_dist,
        referral_distance_missing=ref_missing,
        spatiotemporal_metrics=spatio_metrics,
        xai_explanation=xai_explanation,
    )


@app.get(
    "/api/v1/claims/{claim_id}",
    response_model=ClaimPredictionResponse,
    tags=["Claim Risk Assessment"],
    summary="Query and Audit an Existing Claim by ID",
)
async def get_claim_by_id(
    claim_id: str = FastApiPath(..., description="Target Claim ID to audit", examples=["CLM00010650"])
) -> ClaimPredictionResponse:
    """Looks up stored claim attributes from the registry and routes through the Phase 3 pipeline."""
    record = registry.claim_map.get(claim_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim '{claim_id}' not found in registry. Use POST /api/v1/predict-claim for ad-hoc claims.",
        )

    request_payload = ClaimPredictionRequest(
        claim_id=claim_id,
        patient_id=str(record["patient_id"]),
        doctor_id=str(record["doctor_id"]),
        facility_id=str(record["facility_id"]),
        icd10_code=str(record["icd10_code"]),
        service_date=str(record["service_date_str"]),
        service_time=str(record["service_time_str"]),
        ina_cbgs_tariff=float(record["ina_cbgs_tariff"]),
        length_of_stay=int(record["length_of_stay"]),
        fktp_referral_id=str(record.get("fktp_referral_id", "")) if pd.notna(record.get("fktp_referral_id")) else None,
        referral_facility_id=str(record.get("referral_facility_id", "")) if pd.notna(record.get("referral_facility_id")) else None,
        dati2=int(record["dati2"]) if pd.notna(record.get("dati2")) else None,
    )

    return await predict_claim(request_payload)


@app.post(
    "/api/v1/claims/{claim_id}/chat",
    response_model=ClaimChatResponse,
    status_code=status.HTTP_200_OK,
    tags=["Audit Copilot Interactive Chat"],
    summary="Interactive AI Audit Copilot Chat for Specific Claim",
)
async def chat_claim_copilot(
    claim_id: str = FastApiPath(..., description="Target Claim ID to chat about", examples=["CLM00010650"]),
    payload: ClaimChatRequest = ...,
) -> ClaimChatResponse:
    """
    Interactive AI Audit Copilot Chat:
    - Context Isolation: Injects complete transaction data, spatiotemporal metrics, R-GCN probability, and XAI evidence.
    - Sliding Window: Preserves the last 5 conversation messages.
    - Multi-tier LLM fallback: GroqCloud -> NVIDIA NIM -> Local Factual Rule Engine.
    """
    record = registry.claim_map.get(claim_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim '{claim_id}' not found in registry.",
        )

    spatio_metrics, spatio_notes, conflict_record = spatio_analyzer.analyze(
        claim_id=claim_id,
        doctor_id=str(record["doctor_id"]),
        facility_id=str(record["facility_id"]),
        patient_id=str(record["patient_id"]),
        service_date=str(record["service_date_str"]),
    )

    fraud_prob = model_engine.predict_claim_probability(claim_id=claim_id) or 0.0
    if fraud_prob >= GATE_HIGH_RISK_THRESHOLD or spatio_metrics.spatial_conflict_detected:
        pre_payment_gate = "REJECT_FOR_HUMAN_REVIEW"
        risk_level = "HIGH"
    elif fraud_prob >= GATE_WARNING_THRESHOLD:
        pre_payment_gate = "FLAGGED_WARNING"
        risk_level = "MEDIUM"
    else:
        pre_payment_gate = "AUTO_APPROVE"
        risk_level = "LOW"

    xai_explanation = xai_service.generate_explanation(
        claim_id=claim_id,
        patient_id=str(record["patient_id"]),
        doctor_id=str(record["doctor_id"]),
        facility_id=str(record["facility_id"]),
        icd10_code=str(record["icd10_code"]),
        fraud_proba=fraud_prob,
        spatio_metrics=spatio_metrics,
        spatio_notes=spatio_notes,
        conflicting_record=conflict_record,
    )

    claim_context = {
        "claim_id": claim_id,
        "patient_id": str(record["patient_id"]),
        "doctor_id": str(record["doctor_id"]),
        "facility_id": str(record["facility_id"]),
        "icd10_code": str(record["icd10_code"]),
        "service_date": str(record["service_date_str"]),
        "service_time": str(record["service_time_str"]),
        "ina_cbgs_tariff": float(record["ina_cbgs_tariff"]),
        "length_of_stay": int(record["length_of_stay"]),
        "fraud_probability": round(fraud_prob, 3),
        "risk_level": risk_level,
        "pre_payment_gate": pre_payment_gate,
        "spatiotemporal_metrics": spatio_metrics.model_dump(),
        "primary_fraud_trigger": xai_explanation.primary_fraud_trigger,
        "evidence_reasons": xai_explanation.evidence_reasons,
    }

    http_cli = getattr(app.state, "http_client", None)
    history_dicts = [m.model_dump() for m in payload.chat_history] if payload.chat_history else []

    t0 = time_module.perf_counter()
    chat_res = await chat_with_copilot(
        claim_context=claim_context,
        user_message=payload.user_message,
        chat_history=history_dicts,
        client=http_cli,
    )
    latency_ms = (time_module.perf_counter() - t0) * 1000.0
    audit_logger.info(
        f"[Copilot Telemetry] claim_id={claim_id} provider={chat_res.provider_used} "
        f"is_fallback={chat_res.is_fallback} latency_ms={latency_ms:.1f}"
    )

    return ClaimChatResponse(
        claim_id=chat_res.claim_id,
        reply=chat_res.reply,
        provider_used=chat_res.provider_used,
        is_fallback=chat_res.is_fallback,
    )


@app.get("/", tags=["System & Monitoring"])
def root_info() -> Dict[str, Any]:
    """Provides service description and quick documentation links."""
    return {
        "title": "AURA-JKN Phase 3 REST API",
        "description": "Healthcare Fraud Detection Engine using R-GCN, Spatiotemporal Analysis, XAI, and Generative AI Copilot",
        "documentation": "/docs",
        "health_check": "/health",
        "predict_endpoint": "/api/v1/predict-claim",
        "copilot_chat_endpoint": "/api/v1/claims/{claim_id}/chat",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    print(f"\n[Starting Server] Listening on http://127.0.0.1:{port}")
    print(f"[Documentation] Swagger docs available at http://127.0.0.1:{port}/docs\n")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

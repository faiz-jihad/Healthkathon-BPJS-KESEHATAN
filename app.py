"""
AURA-JKN Phase 3: End-to-End FastAPI Inference & Decision Service
==================================================================
Combines:
  - Phase 2: PyTorch Geometric Relational GCN (R-GCN) Model
  - Module 3: Spatiotemporal Risk Analysis (Spatial conflict & doctor volume anomaly)
  - Module 4: Explainable AI (XAI) & NetworkX Evidence Subgraph Generation
"""

import math
import os
import sys
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

# ==============================================================================
# Configuration & Paths
# ==============================================================================
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

GRAPH_DATA_PATH = BASE_DIR / "aura_jkn_hetero_graph.pt"
MODEL_CHECKPOINT_PATH = BASE_DIR / "aura_jkn_rgcn_model.pt"

FACILITIES_PARQUET = DATA_DIR / "facilities.parquet"
DOCTORS_PARQUET = DATA_DIR / "doctors.parquet"
PATIENTS_PARQUET = DATA_DIR / "patients.parquet"
CLAIMS_PARQUET = DATA_DIR / "claims.parquet"

# Thresholds for decision gate
GATE_HIGH_RISK_THRESHOLD = 0.70
GATE_WARNING_THRESHOLD = 0.40

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


class XAIExplanation(BaseModel):
    """Explainable AI package from Module 4."""

    primary_fraud_trigger: str = Field(..., description="Dominant detected fraud pattern")
    evidence_reasons: List[str] = Field(..., description="Explicit text-based explanatory rationales")
    subgraph_evidence: SubgraphEvidence = Field(..., description="Relational neighborhood subgraph")


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
    spatiotemporal_metrics: Optional[SpatiotemporalMetrics] = None
    xai_explanation: Optional[XAIExplanation] = None


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
    """Loads and indexes synthetic entity parquet stores for real-time querying."""

    def __init__(self, data_dir: Path):
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
        """
        Runs spatiotemporal audit for a claim encounter.

        Returns:
            Tuple of:
            - SpatiotemporalMetrics
            - List of explanatory textual observations
            - Conflicting entity metadata if spatial anomaly exists
        """
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

        # Include current request if it's a new or simulated transaction
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
        if current_fac:
            for past_claim in daily_claims:
                if str(past_claim.get("claim_id")) == str(claim_id):
                    continue
                other_fac_id = str(past_claim.get("facility_id"))
                if other_fac_id != facility_id:
                    other_fac = self.registry.facility_map.get(other_fac_id)
                    if other_fac:
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
        """
        Builds graph topology and clinical/operational explanatory narrative.
        """
        evidence_reasons = list(spatio_notes)

        # Check Referral and Facility Class Alignment
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

        # Calibrate for low-risk approved claims
        if fraud_proba < GATE_WARNING_THRESHOLD:
            primary_trigger = "Normal / Low Risk"
            if not evidence_reasons:
                evidence_reasons.append(
                    "Parameter transaksi konsisten dengan profil wajar dan lolos verifikasi pra-pembayaran."
                )
        else:
            # Determine Primary Fraud Trigger Label for elevated risk
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

        # Add Core Entities as Nodes
        g.add_node(
            claim_id,
            type="claim",
            label=f"Klaim {claim_id}",
        )
        g.add_node(
            doctor_id,
            type="doctor",
            label=f"Dr. {doctor_id} ({doc_specialty})",
        )
        g.add_node(
            facility_id,
            type="facility",
            label=f"{facility_id} ({fac_class})",
        )
        g.add_node(
            patient_id,
            type="patient",
            label=f"Pasien {patient_id[:10]}...",
        )
        g.add_node(
            icd10_code,
            type="diagnosis",
            label=f"ICD-10: {icd10_code}",
        )

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


# ==============================================================================
# Service 4: R-GCN Graph Model Engine (Phase 2 Integration)
# ==============================================================================
class RGCNModelEngine:
    """
    Integrates the Phase 2 PyTorch Geometric Relational GCN checkpoint.
    Precomputes or runs real-time inference on heterogeneous graph states.
    """

    def __init__(self, checkpoint_path: Path, graph_path: Path):
        self.checkpoint_path = checkpoint_path
        self.graph_path = graph_path
        self.device = "cpu"
        self.is_loaded = False
        self.load_error: Optional[str] = None
        self.model: Optional[Any] = None
        self.hetero_data: Optional[Any] = None

        # Genuine indexed prediction map evaluated directly from PyG R-GCN
        self.cached_predictions: Dict[str, float] = {}

    def initialize(self, registry: DatasetRegistry) -> None:
        """Loads weights and executes R-GCN inference across the heterogeneous graph."""
        print("\n[RGCNModelEngine] Initializing Model Engine...")

        try:
            import torch
            import torch.nn as nn
            import torch.nn.functional as F

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[RGCNModelEngine] PyTorch runtime detected on device: {self.device}")

            if not self.graph_path.exists():
                raise FileNotFoundError(f"Hetero graph data file not found at {self.graph_path}")
            if not self.checkpoint_path.exists():
                raise FileNotFoundError(f"Model checkpoint file not found at {self.checkpoint_path}")

            print(f"[RGCNModelEngine] Loading graph from {self.graph_path}...")
            self.hetero_data = torch.load(self.graph_path, weights_only=False, map_location=self.device)

            print(f"[RGCNModelEngine] Loading model weights from {self.checkpoint_path}...")
            from train_rgcn import AuraJKNRGCN

            model = AuraJKNRGCN(
                edge_types=self.hetero_data.edge_types,
                in_channels_dict=NODE_INPUT_DIMS,
                hidden_channels=HIDDEN_CHANNELS,
            ).to(self.device)

            ckpt = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
            state_dict = ckpt.get("model_state_dict", ckpt)
            model.load_state_dict(state_dict)
            model.eval()
            self.model = model

            # Compute genuine inference across all graph claim nodes
            with torch.no_grad():
                logits = model(self.hetero_data.x_dict, self.hetero_data.edge_index_dict)
                probs = torch.sigmoid(logits).cpu().numpy()

            # Align predictions with authoritative claim_ids in registry
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
        """
        Retrieves graph inference probability for an existing graph claim.
        Returns None if claim is not present in the evaluated HeteroData graph topology.
        Zero Mock Policy: Never generates arbitrary heuristic synthetic probabilities.
        """
        if claim_id in self.cached_predictions:
            return self.cached_predictions[claim_id]
        return None


# ==============================================================================
# Global Application Lifecycle & Singletons
# ==============================================================================
registry = DatasetRegistry(DATA_DIR)
spatio_analyzer = SpatiotemporalRiskAnalyzer(registry)
xai_service = XAIEvidenceService(registry)
model_engine = RGCNModelEngine(MODEL_CHECKPOINT_PATH, GRAPH_DATA_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes models and datasets on startup."""
    print("=================================================================")
    print("      Starting AURA-JKN Phase 3 Decision & Inference API         ")
    print("=================================================================")
    registry.load_data()
    model_engine.initialize(registry)
    yield
    print("[Shutdown] Cleaning up AURA-JKN resources...")


# ==============================================================================
# FastAPI App Setup
# ==============================================================================
app = FastAPI(
    title="AURA-JKN Decision Service API",
    description=(
        "Production-grade End-to-End API Service for BPJS Kesehatan Fraud Detection. "
        "Integrates Relational Graph Convolutional Network (R-GCN), Spatiotemporal Risk "
        "Analysis (Module 3), and Explainable AI Subgraph Generation (Module 4)."
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
    summary="Predict Claim Fraud Risk with Spatiotemporal & XAI Evidence",
)
def predict_claim(payload: ClaimPredictionRequest) -> ClaimPredictionResponse:
    """
    Zero Mock Data Phase 3 Automated Verification Pipeline:
    1. Verifies model & graph readiness. If model is offline, raises 503 ANALYSIS_UNAVAILABLE.
    2. Evaluates Spatiotemporal constraints from genuine registry records.
    3. Executes R-GCN Graph inference. If claim is not indexed in HeteroData graph,
       returns NOT_ANALYZED honestly without fabricating probability or risk score.
    4. Categorizes Pre-Payment Gate action for analyzed claims:
       - >= 0.70: REJECT_FOR_HUMAN_REVIEW (Screening recommendation, not legal adjudication)
       - 0.40 - 0.69: FLAGGED_WARNING
       - < 0.40: AUTO_APPROVE
    5. Generates NetworkX Explainability (XAI) Subgraph grounded strictly in real entities.
    """
    if not model_engine.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "ANALYSIS_UNAVAILABLE",
                "message": f"Engine inferensi model AI tidak aktif atau artefak model tidak tersedia: {model_engine.load_error}. Sesuai Zero Mock Data Policy, sistem menolak pembuatan skor tiruan.",
            },
        )

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

        return ClaimPredictionResponse(
            claim_id=payload.claim_id,
            analysis_status="NOT_ANALYZED",
            fraud_probability=None,
            risk_level="UNASSESSED",
            pre_payment_gate="PENDING_ASSESSMENT",
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

    return ClaimPredictionResponse(
        claim_id=payload.claim_id,
        analysis_status="ANALYSIS_SUCCESS",
        fraud_probability=round(fraud_prob, 3),
        risk_level=risk_level,
        pre_payment_gate=pre_payment_gate,
        spatiotemporal_metrics=spatio_metrics,
        xai_explanation=xai_explanation,
    )


@app.get(
    "/api/v1/claims/{claim_id}",
    response_model=ClaimPredictionResponse,
    tags=["Claim Risk Assessment"],
    summary="Query and Audit an Existing Claim by ID",
)
def get_claim_by_id(
    claim_id: str = FastApiPath(..., description="Target Claim ID to audit", examples=["CLM00010650"])
) -> ClaimPredictionResponse:
    """
    Convenience endpoint for analytical dashboards.
    Looks up stored claim attributes from the registry and routes through the Phase 3 pipeline.
    """
    record = registry.claim_map.get(claim_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Claim '{claim_id}' not found in registry. Use POST /api/v1/predict-claim for ad-hoc claims.",
        )

    # Map stored record into prediction request
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
    )

    return predict_claim(request_payload)


@app.get("/", tags=["System & Monitoring"])
def root_info() -> Dict[str, Any]:
    """Provides service description and quick documentation links."""
    return {
        "title": "AURA-JKN Phase 3 REST API",
        "description": "Healthcare Fraud Detection Engine using R-GCN, Spatiotemporal Analysis, and XAI",
        "documentation": "/docs",
        "health_check": "/health",
        "predict_endpoint": "/api/v1/predict-claim",
    }


# ==============================================================================
# Direct Execution Entry Point
# ==============================================================================
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    print(f"\n[Starting Server] Listening on http://127.0.0.1:{port}")
    print(f"[Documentation] Swagger docs available at http://127.0.0.1:{port}/docs\n")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)

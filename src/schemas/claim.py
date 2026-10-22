"""
Pydantic Schemas for Claim Ingestion, Predictions, and Responses
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


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
    fraud_probability: float = Field(..., description="Calibrated fraud score from 0.0 to 1.0")
    risk_level: str = Field(..., description="Risk categorization: HIGH, MEDIUM, LOW")
    pre_payment_gate: str = Field(
        ...,
        description="Automated gate action: REJECT_FOR_HUMAN_REVIEW, FLAGGED_WARNING, or AUTO_APPROVE",
    )
    spatiotemporal_metrics: SpatiotemporalMetrics
    xai_explanation: XAIExplanation


class HealthCheckResponse(BaseModel):
    """API Health and diagnostic readiness status."""

    status: str
    service: str
    version: str
    device: str
    model_loaded: bool
    graph_loaded: bool
    database_connected: bool = Field(False, description="Whether PostgreSQL connection is active")
    num_claims_in_registry: int
    num_facilities_in_registry: int
    num_doctors_in_registry: int

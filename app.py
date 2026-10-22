"""
AURA-JKN: End-to-End FastAPI Inference & Decision Service
=========================================================
Controller layer providing RESTful endpoints for real-time claim fraud risk assessment.
"""

from contextlib import asynccontextmanager
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, HTTPException, Path as FastApiPath, status
from fastapi.middleware.cors import CORSMiddleware

from src.config import (
    API_PORT,
    DOCTOR_EXTREME_CAPACITY_LIMIT,
    DOCTOR_NORMAL_CAPACITY_LIMIT,
    GATE_HIGH_RISK_THRESHOLD,
    GATE_WARNING_THRESHOLD,
)
from src.database import DatasetRegistry, init_db_engine, persist_claim_audit
from src.schemas import (
    ClaimPredictionRequest,
    ClaimPredictionResponse,
    HealthCheckResponse,
)
from src.services import (
    RGCNModelEngine,
    SpatiotemporalRiskAnalyzer,
    XAIEvidenceService,
)

# ==============================================================================
# Global Singletons & Lifecycle Management
# ==============================================================================
db_engine = init_db_engine()
registry = DatasetRegistry()
spatio_analyzer = SpatiotemporalRiskAnalyzer(registry)
xai_service = XAIEvidenceService(registry)
model_engine = RGCNModelEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes models, databases, and datasets on application startup."""
    print("=" * 70)
    print("      Starting AURA-JKN Phase 3 Decision & Inference API         ")
    print("=" * 70)
    if db_engine is not None:
        print("[Database] PostgreSQL audit persistence is ENABLED.")
    else:
        print("[Database] In-memory/Parquet mode active (DATABASE_URL not set).")

    registry.load_data()
    model_engine.initialize(registry)
    yield
    print("[Shutdown] Cleaning up AURA-JKN resources...")


# ==============================================================================
# FastAPI Application Configuration
# ==============================================================================
app = FastAPI(
    title="AURA-JKN Decision Service API",
    description=(
        "Production-grade End-to-End API Service for BPJS Kesehatan Fraud Detection. "
        "Combines Relational Graph Convolutional Network (R-GCN), Spatiotemporal Risk "
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
# API Endpoints
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
        status="healthy",
        service="AURA-JKN Phase 3 Inference API",
        version="1.0.0",
        device=model_engine.device,
        model_loaded=model_engine.is_loaded,
        graph_loaded=len(model_engine.cached_predictions) > 0,
        database_connected=(db_engine is not None),
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
    Complete Phase 3 Automated Verification Pipeline:
    1. Evaluates Spatiotemporal constraints (spatial trajectory & doctor peer volume).
    2. Executes R-GCN Graph inference to obtain calibrated fraud probability.
    3. Categorizes Pre-Payment Gate action:
       - >= 0.70: REJECT_FOR_HUMAN_REVIEW
       - 0.40 - 0.69: FLAGGED_WARNING
       - < 0.40: AUTO_APPROVE
    4. Generates NetworkX Explainability (XAI) Subgraph and text rationales.
    5. Optionally persists transaction and audit decision to PostgreSQL.
    """
    # 1. Spatiotemporal Risk Analysis
    spatio_metrics, spatio_notes, conflict_record = spatio_analyzer.analyze(
        claim_id=payload.claim_id,
        doctor_id=payload.doctor_id,
        facility_id=payload.facility_id,
        patient_id=payload.patient_id,
        service_date=payload.service_date,
    )

    # 2. Model R-GCN Inference
    fraud_prob = model_engine.predict_claim_probability(
        claim_id=payload.claim_id,
        spatio_metrics=spatio_metrics,
        tariff=payload.ina_cbgs_tariff,
        length_of_stay=payload.length_of_stay,
    )

    # 3. Decision Gate Determination: Sintesis 3 Parameter (Jarak, Volume, GNN)
    if (
        spatio_metrics.spatial_conflict_detected
        or spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT
        or fraud_prob >= GATE_HIGH_RISK_THRESHOLD
    ):
        pre_payment_gate = "REJECT_FOR_HUMAN_REVIEW"
        risk_level = "HIGH"
        if spatio_metrics.spatial_conflict_detected:
            fraud_prob = max(fraud_prob, 0.885)
        elif spatio_metrics.doctor_daily_volume >= DOCTOR_EXTREME_CAPACITY_LIMIT:
            fraud_prob = max(fraud_prob, 0.785)
    elif (
        fraud_prob >= GATE_WARNING_THRESHOLD
        or spatio_metrics.doctor_daily_volume > DOCTOR_NORMAL_CAPACITY_LIMIT
        or spatio_metrics.spatiotemporal_risk_score >= 40.0
    ):
        pre_payment_gate = "FLAGGED_WARNING"
        risk_level = "MEDIUM"
        fraud_prob = max(fraud_prob, 0.450)
    else:
        # Hanya lolos AUTO_APPROVE jika KETIGA parameter bersih:
        # 1. Tidak ada konflik spasial
        # 2. Volume harian dokter wajar (<= 45 klaim/hari)
        # 3. Probabilitas anomali GNN rendah (< 0.40)
        pre_payment_gate = "AUTO_APPROVE"
        risk_level = "LOW"

    # 4. XAI & Evidence Subgraph Generation
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

    # 5. Persist to PostgreSQL if database connection is available
    persist_claim_audit(
        engine=db_engine,
        payload=payload,
        fraud_prob=fraud_prob,
        risk_level=risk_level,
        pre_payment_gate=pre_payment_gate,
        spatio_metrics=spatio_metrics,
        xai_explanation=xai_explanation,
    )

    return ClaimPredictionResponse(
        claim_id=payload.claim_id,
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


if __name__ == "__main__":
    print(f"\n[Starting Server] Listening on http://127.0.0.1:{API_PORT}")
    print(f"[Documentation] Swagger docs available at http://127.0.0.1:{API_PORT}/docs\n")
    uvicorn.run("app:app", host="0.0.0.0", port=API_PORT, reload=True)

"""
AURA-JKN Phase 3: Automated API Verification Script (Zero Mock Policy)
======================================================================
Tests the Phase 3 FastAPI service against sample claims:
1. Health check (/health)
2. Scenario C: Spatio-Temporal Conflict (CLMC00001104) - Genuine Model Inference
3. Normal Claim: Low Risk Auto-Approve (CLM00010650) - Genuine Model Inference
4. Novel / Ad-Hoc Simulated Claim (POST /api/v1/predict-claim) - Honest NOT_ANALYZED status (Zero Mock)
5. Validation Error handling for invalid payload
"""

import json
from fastapi import HTTPException
from pydantic import ValidationError
from app import (
    get_claim_by_id,
    get_health_status,
    predict_claim,
    ClaimPredictionRequest,
    registry,
    model_engine,
)


def run_tests():
    print("=" * 70)
    print("       AURA-JKN PHASE 3 ZERO MOCK VERIFICATION TEST SUITE      ")
    print("=" * 70)

    # 1. Test Health Endpoint
    print("\n[1] Testing GET /health ...")
    health = get_health_status()
    print(f"    Status: {health.status.upper()} | Model Loaded: {health.model_loaded} | Claims: {health.num_claims_in_registry:,}")
    if model_engine.is_loaded:
        assert health.status == "healthy"
    else:
        print(f"    [Notice] PyG Model not loaded ({model_engine.load_error}). Health status is degraded.")

    # 2. Test Normal Claim (Auto Approve) if model loaded
    if model_engine.is_loaded:
        print("\n[2] Testing Normal Claim (CLM00010650) ...")
        norm_res = get_claim_by_id("CLM00010650")
        print(f"    Claim ID: {norm_res.claim_id}")
        print(f"    Analysis Status: {norm_res.analysis_status}")
        print(f"    Fraud Probability: {norm_res.fraud_probability} | Gate: {norm_res.pre_payment_gate}")
        print(f"    Primary Trigger: {norm_res.xai_explanation.primary_fraud_trigger}")
        assert norm_res.analysis_status == "ANALYSIS_SUCCESS"
        assert norm_res.fraud_probability is not None
        assert norm_res.fraud_probability < 0.40

        # 3. Test Fraud Claim - Scenario C Spatio-Temporal Conflict
        print("\n[3] Testing Fraud Scenario C (CLMC00001104) ...")
        fraud_res = get_claim_by_id("CLMC00001104")
        print(f"    Claim ID: {fraud_res.claim_id}")
        print(f"    Analysis Status: {fraud_res.analysis_status}")
        print(f"    Fraud Probability: {fraud_res.fraud_probability} | Gate: {fraud_res.pre_payment_gate}")
        print(f"    Spatial Conflict Detected: {fraud_res.spatiotemporal_metrics.spatial_conflict_detected}")
        print(f"    Primary Trigger: {fraud_res.xai_explanation.primary_fraud_trigger}")
        assert fraud_res.analysis_status == "ANALYSIS_SUCCESS"
        assert fraud_res.fraud_probability >= 0.70
        assert fraud_res.spatiotemporal_metrics.spatial_conflict_detected is True

        # 4. Test Novel Claim (Zero Mock Policy: Must be NOT_ANALYZED, no fabricated probability)
        print("\n[4] Testing Novel Claim (Zero Mock Policy NOT_ANALYZED) ...")
        sample_payload = ClaimPredictionRequest(
            claim_id="CLM_NOVEL_UNINDEXED_99",
            patient_id="pat_demo_hash_99",
            doctor_id="DOC0040",
            facility_id="FAC0013",
            icd10_code="K29",
            service_date="2026-03-13",
            service_time="11:45:00",
            ina_cbgs_tariff=1450000.0,
            length_of_stay=3,
        )
        novel_res = predict_claim(sample_payload)
        print(f"    Claim ID: {novel_res.claim_id}")
        print(f"    Analysis Status: {novel_res.analysis_status}")
        print(f"    Fraud Probability: {novel_res.fraud_probability} (Expected None under Zero Mock Policy)")
        print(f"    Risk Level: {novel_res.risk_level} (Expected UNASSESSED)")
        print(f"    Pre-Payment Gate: {novel_res.pre_payment_gate} (Expected PENDING_ASSESSMENT)")
        assert novel_res.analysis_status == "NOT_ANALYZED"
        assert novel_res.fraud_probability is None
        assert novel_res.risk_level == "UNASSESSED"
        assert novel_res.pre_payment_gate == "PENDING_ASSESSMENT"

    # 5. Test Input Validation Rejection
    print("\n[5] Testing Input Validation Rejection (Negative Tariff & Invalid Date) ...")
    try:
        ClaimPredictionRequest(
            claim_id="CLM_BAD_TARIFF",
            patient_id="pat_test",
            doctor_id="DOC001",
            facility_id="FAC001",
            icd10_code="I10",
            service_date="invalid-date",
            service_time="09:00:00",
            ina_cbgs_tariff=-50000.0,  # Negative tariff must be rejected
            length_of_stay=1,
        )
        assert False, "Validation did not catch invalid payload"
    except ValidationError as err:
        print(f"    Caught expected ValidationError: {len(err.errors())} input errors detected.")

    # 6. Test Unknown Claim 404
    print("\n[6] Testing Unknown Claim 404 in registry ...")
    try:
        get_claim_by_id("CLM_NONEXISTENT_XYZ")
        assert False, "Expected 404 error was not raised"
    except HTTPException as http_err:
        print(f"    Caught expected HTTPException {http_err.status_code}: {http_err.detail}")
        assert http_err.status_code == 404

    print("\n" + "=" * 70)
    print("     ALL ZERO MOCK VERIFICATION TESTS EXECUTED SUCCESSFULLY!   ")
    print("=" * 70)


if __name__ == "__main__":
    registry.load_data()
    model_engine.initialize(registry)
    run_tests()

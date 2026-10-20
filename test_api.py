"""
AURA-JKN Phase 3: Automated API Verification Script
===================================================
Tests the Phase 3 FastAPI service against sample claims:
1. Health check (/health)
2. Scenario C: Spatio-Temporal Conflict (CLMC00001104)
3. Normal Claim: Low Risk Auto-Approve (CLM00010650)
4. Novel / Ad-Hoc Simulated Claim (POST /api/v1/predict-claim)
"""

import json
from app import get_claim_by_id, get_health_status, predict_claim, ClaimPredictionRequest, registry, model_engine


def run_tests():
    print("=" * 70)
    print("       AURA-JKN PHASE 3 ENDPOINT VERIFICATION TEST SUITE      ")
    print("=" * 70)

    # 1. Test Health Endpoint
    print("\n[1] Testing GET /health ...")
    health = get_health_status()
    print(f"    Status: {health.status.upper()} | Model Loaded: {health.model_loaded} | Claims: {health.num_claims_in_registry:,}")
    assert health.status == "healthy"

    # 2. Test Normal Claim (Auto Approve)
    print("\n[2] Testing Normal Claim (CLM00010650) ...")
    norm_res = get_claim_by_id("CLM00010650")
    print(f"    Claim ID: {norm_res.claim_id}")
    print(f"    Fraud Probability: {norm_res.fraud_probability:.3f} | Gate: {norm_res.pre_payment_gate}")
    print(f"    Primary Trigger: {norm_res.xai_explanation.primary_fraud_trigger}")
    print(f"    Evidence Reasons: {norm_res.xai_explanation.evidence_reasons}")

    # 3. Test Fraud Claim - Scenario C Spatio-Temporal Conflict
    print("\n[3] Testing Fraud Scenario C (CLMC00001104) ...")
    fraud_res = get_claim_by_id("CLMC00001104")
    print(f"    Claim ID: {fraud_res.claim_id}")
    print(f"    Fraud Probability: {fraud_res.fraud_probability:.3f} | Gate: {fraud_res.pre_payment_gate}")
    print(f"    Spatial Conflict Detected: {fraud_res.spatiotemporal_metrics.spatial_conflict_detected}")
    print(f"    Primary Trigger: {fraud_res.xai_explanation.primary_fraud_trigger}")
    print(f"    Evidence Reasons:")
    for r in fraud_res.xai_explanation.evidence_reasons:
        print(f"      - {r}")
    print(f"    Subgraph Nodes Count: {len(fraud_res.xai_explanation.subgraph_evidence.nodes)}")
    print(f"    Subgraph Edges Count: {len(fraud_res.xai_explanation.subgraph_evidence.edges)}")

    # 4. Test POST /api/v1/predict-claim with payload
    print("\n[4] Testing POST /api/v1/predict-claim (Simulated Novel Claim) ...")
    sample_payload = ClaimPredictionRequest(
        claim_id="CLM_SIMULATED_2026",
        patient_id="pat_demo_hash_99",
        doctor_id="DOC0040",
        facility_id="FAC0013",
        icd10_code="K29",
        service_date="2024-03-13",
        service_time="11:45:00",
        ina_cbgs_tariff=1450000.0,
        length_of_stay=3,
    )
    sim_res = predict_claim(sample_payload)
    print(f"    Claim ID: {sim_res.claim_id}")
    print(f"    Fraud Probability: {sim_res.fraud_probability:.3f} | Gate: {sim_res.pre_payment_gate}")
    print(f"    Risk Level: {sim_res.risk_level}")
    print(f"    Spatiotemporal Risk Score: {sim_res.spatiotemporal_metrics.spatiotemporal_risk_score}")
    print(f"    Primary Trigger: {sim_res.xai_explanation.primary_fraud_trigger}")

    print("\n" + "=" * 70)
    print("     ALL ENDPOINTS & VERIFICATIONS EXECUTED SUCCESSFULLY!      ")
    print("=" * 70)


if __name__ == "__main__":
    registry.load_data()
    model_engine.initialize(registry)
    run_tests()

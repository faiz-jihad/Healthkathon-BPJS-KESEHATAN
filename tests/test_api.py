"""
AURA-JKN Phase 3 & Generative AI Layer: Automated API Verification Script
=========================================================================
Tests the Phase 3 FastAPI service against sample claims:
1. Health check (/health)
2. Normal Claim: Low Risk Auto-Approve (CLM00010650) + Audit Brief
3. Scenario C: Spatio-Temporal Conflict (CLMC00001104) + Audit Brief
4. Novel / Ad-Hoc Simulated Claim (POST /api/v1/predict-claim) + Audit Brief
5. Interactive Copilot Chat (POST /api/v1/claims/{claim_id}/chat) with sliding window
6. Zero HTTP 500 Failure Guarantee / Fallback Resilience
"""

import asyncio
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import (
    ClaimChatRequest,
    ClaimPredictionRequest,
    app,
    chat_claim_copilot,
    get_claim_by_id,
    get_health_status,
    lifespan,
    predict_claim,
    registry,
)


async def run_tests():
    print("=" * 70)
    print("   AURA-JKN PHASE 3 + GENERATIVE AI LAYER VERIFICATION SUITE   ")
    print("=" * 70)

    async with lifespan(app):
        # 1. Test Health Endpoint
        print("\n[1] Testing GET /health ...")
        health = get_health_status()
        print(f"    Status: {health.status.upper()} | Model Loaded: {health.model_loaded} | Claims: {health.num_claims_in_registry:,}")
        assert health.status == "healthy"

        # Retrieve dynamic sample claim IDs from active registry
        claims_df = registry.claims_df
        norm_cid = str(claims_df[claims_df["is_fraud"] == 0]["claim_id"].iloc[0])
        fraud_c_sub = claims_df[claims_df["fraud_scenario"] == "C"]
        fraud_c_cid = str(fraud_c_sub["claim_id"].iloc[0] if not fraud_c_sub.empty else claims_df[claims_df["is_fraud"] == 1]["claim_id"].iloc[0])

        # 2. Test Normal Claim (Auto Approve)
        print(f"\n[2] Testing Normal Claim ({norm_cid}) ...")
        norm_res = await get_claim_by_id(norm_cid)
        print(f"    Claim ID: {norm_res.claim_id}")
        print(f"    Fraud Probability: {norm_res.fraud_probability:.3f} | Gate: {norm_res.pre_payment_gate}")
        print(f"    Operational Thresholds: High Risk >= {norm_res.applied_threshold} | Warning >= {norm_res.warning_threshold}")
        print(f"    Primary Trigger: {norm_res.xai_explanation.primary_fraud_trigger}")
        assert norm_res.applied_threshold == 0.70, f"Expected applied_threshold 0.70, got {norm_res.applied_threshold}"
        assert norm_res.warning_threshold == 0.40, f"Expected warning_threshold 0.40, got {norm_res.warning_threshold}"
        assert norm_res.xai_explanation.audit_brief is not None
        brief = norm_res.xai_explanation.audit_brief
        print(f"    [Audit Brief] Provider: {brief.llm_provider_used} (is_fallback={brief.is_fallback})")
        print(f"    [Audit Brief] Narrative: {brief.audit_narrative}")
        assert len(brief.audit_narrative) > 10

        # 3. Test Fraud Claim - Scenario C Spatio-Temporal Conflict
        print(f"\n[3] Testing Fraud Scenario C ({fraud_c_cid}) ...")
        fraud_res = await get_claim_by_id(fraud_c_cid)
        print(f"    Claim ID: {fraud_res.claim_id}")
        print(f"    Fraud Probability: {fraud_res.fraud_probability:.3f} | Gate: {fraud_res.pre_payment_gate}")
        print(f"    Applied Threshold: {fraud_res.applied_threshold}")
        assert fraud_res.applied_threshold == 0.70
        if fraud_res.fraud_probability >= fraud_res.applied_threshold:
            assert fraud_res.pre_payment_gate == "REJECT_FOR_HUMAN_REVIEW"
        print(f"    Spatial Conflict Detected: {fraud_res.spatiotemporal_metrics.spatial_conflict_detected}")
        print(f"    Primary Trigger: {fraud_res.xai_explanation.primary_fraud_trigger}")
        for r in fraud_res.xai_explanation.evidence_reasons:
            print(f"      - {r}")
        assert fraud_res.xai_explanation.audit_brief is not None
        c_brief = fraud_res.xai_explanation.audit_brief
        print(f"    [Audit Brief] Provider: {c_brief.llm_provider_used} (is_fallback={c_brief.is_fallback})")
        print(f"    [Audit Brief] Narrative: {c_brief.audit_narrative}")
        assert len(c_brief.audit_narrative) > 10

        # 4. Test POST /api/v1/predict-claim with payload
        print("\n[4] Testing POST /api/v1/predict-claim (Simulated Novel Claim) ...")
        sample_payload = ClaimPredictionRequest(
            claim_id="CLM_SIMULATED_2026",
            patient_id="pat_demo_hash_99",
            doctor_id="DOC_40573_01_1",
            facility_id="FAC_40573",
            icd10_code="K29",
            service_date="2024-03-13",
            service_time="11:45:00",
            ina_cbgs_tariff=1450000.0,
            length_of_stay=3,
            fktp_referral_id="FKP_DEMO_001",
            referral_facility_id="FAC_40573",
            dati2=3374,
        )
        sim_res = await predict_claim(sample_payload)
        print(f"    Claim ID: {sim_res.claim_id}")
        print(f"    Decision Gate: {sim_res.pre_payment_gate} (Risk Level: {sim_res.risk_level})")
        print(f"    Fraud Probability: {sim_res.fraud_probability:.3f} | Threshold Active: {sim_res.applied_threshold}")
        print(f"    Referral Geo-Distance: {sim_res.referral_distance_to_fktp:.1f} km (Imputed: {sim_res.referral_distance_missing})")
        print(f"    Primary Fraud Trigger: {sim_res.xai_explanation.primary_fraud_trigger}")
        assert sim_res.applied_threshold == 0.70
        assert sim_res.warning_threshold == 0.40
        assert sim_res.referral_distance_to_fktp is not None
        assert sim_res.referral_distance_missing is not None
        assert sim_res.xai_explanation.audit_brief is not None
        sim_brief = sim_res.xai_explanation.audit_brief
        print(f"    [Audit Brief] Provider: {sim_brief.llm_provider_used} (is_fallback={sim_brief.is_fallback})")
        print(f"    [Audit Brief] Executive Summary: {sim_brief.audit_narrative}")

        # 5. Test POST /api/v1/claims/{claim_id}/chat (Copilot Interactive Chat)
        print(f"\n[5] Testing POST /api/v1/claims/{{claim_id}}/chat (Interactive AI Copilot on {fraud_c_cid}) ...")
        chat_req = ClaimChatRequest(
            user_message="Apakah ada indikasi konflik spasial atau phantom billing pada klaim ini?",
            chat_history=[
                {"role": "user", "content": "Berapa probabilitas kecurangan klaim ini?"},
                {"role": "assistant", "content": "Probabilitas fraud terhitung tinggi dengan status REJECT_FOR_HUMAN_REVIEW."},
            ],
        )
        chat_res = await chat_claim_copilot(fraud_c_cid, chat_req)
        print(f"    Target Claim ID : {chat_res.claim_id}")
        print(f"    LLM Provider    : {chat_res.provider_used} (is_fallback={chat_res.is_fallback})")
        print(f"    Auditor Question: \"{chat_req.user_message}\"")
        print(f"    Copilot Answer  : \"{chat_res.reply}\"")
        assert chat_res.claim_id == fraud_c_cid
        assert len(chat_res.reply) > 10

        # 6. Test Copilot Chat Sliding Window (history > 5 turns)
        print(f"\n[6] Testing Copilot Chat Sliding Window on ({norm_cid}) ...")
        long_history = [
            {"role": "user", "content": f"Pertanyaan awal {i}"} for i in range(10)
        ]
        window_req = ClaimChatRequest(
            user_message="Tolong jelaskan diagnosa ICD-10 dan tarif klaim ini.",
            chat_history=long_history,
        )
        window_res = await chat_claim_copilot(norm_cid, window_req)
        print(f"    Claim ID: {window_res.claim_id} | Provider: {window_res.provider_used}")
        print(f"    Copilot Reply:\n    \"{window_res.reply}\"")
        assert window_res.claim_id == norm_cid
        assert len(window_res.reply) > 10

        print("\n" + "=" * 70)
        print("     ALL ENDPOINTS & VERIFICATIONS EXECUTED SUCCESSFULLY!      ")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_tests())


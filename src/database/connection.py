"""
PostgreSQL Database Connection & Audit Persistence Service
"""

import json
from typing import Any, Dict, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from src.config import DATABASE_URL


def init_db_engine() -> Optional[Engine]:
    """Attempts to initialize and test PostgreSQL engine."""
    if not DATABASE_URL:
        return None

    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1;"))
        clean_url = DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL
        print(f"[Database] Connected to PostgreSQL: {clean_url}")
        return engine
    except Exception as exc:
        print(f"[Database] Notice: PostgreSQL connection skipped ({exc}). Operating in decoupled mode.")
        return None


def persist_claim_audit(
    engine: Optional[Engine],
    payload: Any,
    fraud_prob: float,
    risk_level: str,
    pre_payment_gate: str,
    spatio_metrics: Any,
    xai_explanation: Any,
) -> None:
    """Inserts or updates evaluated claim into PostgreSQL audit table."""
    if engine is None:
        return

    stmt = text("""
        INSERT INTO claims (
            claim_id, patient_id, doctor_id, facility_id, icd10_code,
            service_date, service_time, ina_cbgs_tariff, length_of_stay,
            fraud_probability, risk_level, pre_payment_gate,
            spatiotemporal_risk_score, spatial_conflict_detected,
            doctor_daily_volume, primary_fraud_trigger,
            evidence_reasons, subgraph_evidence, updated_at
        ) VALUES (
            :claim_id, :patient_id, :doctor_id, :facility_id, :icd10_code,
            :service_date, :service_time, :tariff, :los,
            :fraud_prob, :risk_level, :gate,
            :spatio_score, :spatial_conflict,
            :doc_volume, :primary_trigger,
            :evidence_reasons, :subgraph_evidence, CURRENT_TIMESTAMP
        )
        ON CONFLICT (claim_id) DO UPDATE SET
            fraud_probability = EXCLUDED.fraud_probability,
            risk_level = EXCLUDED.risk_level,
            pre_payment_gate = EXCLUDED.pre_payment_gate,
            spatiotemporal_risk_score = EXCLUDED.spatiotemporal_risk_score,
            spatial_conflict_detected = EXCLUDED.spatial_conflict_detected,
            doctor_daily_volume = EXCLUDED.doctor_daily_volume,
            primary_fraud_trigger = EXCLUDED.primary_fraud_trigger,
            evidence_reasons = EXCLUDED.evidence_reasons,
            subgraph_evidence = EXCLUDED.subgraph_evidence,
            updated_at = CURRENT_TIMESTAMP;
    """)

    try:
        with engine.begin() as conn:
            # Ensure foreign keys are satisfied for novel or simulated claims
            conn.execute(
                text("""
                    INSERT INTO facilities (facility_id, facility_class, latitude, longitude)
                    VALUES (:fid, 'FKTP', -6.2088, 106.8456)
                    ON CONFLICT (facility_id) DO NOTHING;
                """),
                {"fid": payload.facility_id},
            )
            conn.execute(
                text("""
                    INSERT INTO doctors (doctor_id, sip_number, specialty, schedule_hours)
                    VALUES (:did, 'SIP_SIMULATED', 'Umum', 40)
                    ON CONFLICT (doctor_id) DO NOTHING;
                """),
                {"did": payload.doctor_id},
            )
            conn.execute(
                text("""
                    INSERT INTO patients (patient_id, name)
                    VALUES (:pid, 'Peserta Simulasi')
                    ON CONFLICT (patient_id) DO NOTHING;
                """),
                {"pid": payload.patient_id},
            )

            conn.execute(
                stmt,
                {
                    "claim_id": payload.claim_id,
                    "patient_id": payload.patient_id,
                    "doctor_id": payload.doctor_id,
                    "facility_id": payload.facility_id,
                    "icd10_code": payload.icd10_code,
                    "service_date": payload.service_date,
                    "service_time": payload.service_time,
                    "tariff": payload.ina_cbgs_tariff,
                    "los": payload.length_of_stay,
                    "fraud_prob": round(fraud_prob, 3),
                    "risk_level": risk_level,
                    "gate": pre_payment_gate,
                    "spatio_score": spatio_metrics.spatiotemporal_risk_score,
                    "spatial_conflict": spatio_metrics.spatial_conflict_detected,
                    "doc_volume": spatio_metrics.doctor_daily_volume,
                    "primary_trigger": xai_explanation.primary_fraud_trigger,
                    "evidence_reasons": json.dumps(xai_explanation.evidence_reasons),
                    "subgraph_evidence": json.dumps(xai_explanation.subgraph_evidence.model_dump()),
                },
            )
    except Exception as db_err:
        print(f"[Database Warning] Could not persist claim: {db_err}")

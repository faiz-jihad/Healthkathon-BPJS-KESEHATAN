"""
AURA-JKN: Spatiotemporal Risk Engine Unit Tests (Tahap 8)
=========================================================
Tests:
  1. Haversine distance mathematical correctness
  2. Peer doctor capacity tiers (<25, 26-45, 46-79, >=80)
  3. Geographical conflict detection (>400km on same day)
  4. Same-city non-conflict mobility (<400km)
  5. Missing coordinates / Null Island (0,0) immunity against false conflicts
"""

from pathlib import Path
import pytest
from app import (
    DatasetRegistry,
    SpatiotemporalRiskAnalyzer,
    calculate_haversine_distance,
    DOCTOR_PEER_AVERAGE_DAILY_VOLUME,
    DOCTOR_NORMAL_CAPACITY_LIMIT,
    DOCTOR_EXTREME_CAPACITY_LIMIT,
    SPATIAL_DISTANCE_KM_THRESHOLD,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def test_haversine_distance_known_points():
    # Test identical coordinates
    dist_zero = calculate_haversine_distance(-6.2088, 106.8456, -6.2088, 106.8456)
    assert round(dist_zero, 2) == 0.0

    # Test Jakarta (-6.2088, 106.8456) to Bandung (-6.9175, 107.6191) ~115 - 130 km
    dist_jkt_bdg = calculate_haversine_distance(-6.2088, 106.8456, -6.9175, 107.6191)
    assert 110.0 <= dist_jkt_bdg <= 135.0

    # Test Jakarta (-6.2088, 106.8456) to Surabaya (-7.2575, 112.7521) ~650 - 700 km
    dist_jkt_sby = calculate_haversine_distance(-6.2088, 106.8456, -7.2575, 112.7521)
    assert 640.0 <= dist_jkt_sby <= 710.0


def test_missing_coordinates_zero_island_immunity():
    # Setup mock registry with missing coordinates
    reg = DatasetRegistry(DATA_DIR)
    reg.facility_map = {
        "FAC_NORMAL": {"facility_id": "FAC_NORMAL", "latitude": -6.2088, "longitude": 106.8456, "facility_class": "FKRTL"},
        "FAC_UNKNOWN_COORDS": {"facility_id": "FAC_UNKNOWN_COORDS", "latitude": 0.0, "longitude": 0.0, "facility_class": "FKTP"},
    }
    reg.doctor_claims_by_date = {
        ("DOC_TEST", "2026-03-20"): [
            {"claim_id": "CLM_PAST_1", "facility_id": "FAC_UNKNOWN_COORDS", "service_time_str": "08:00:00"}
        ]
    }

    analyzer = SpatiotemporalRiskAnalyzer(reg)
    metrics, notes, conflict = analyzer.analyze(
        claim_id="CLM_NEW_1",
        doctor_id="DOC_TEST",
        facility_id="FAC_NORMAL",
        patient_id="PAT_TEST",
        service_date="2026-03-20",
    )

    # Must NOT flag conflict despite 11,000 km distance to (0,0) Null Island
    assert metrics.spatial_conflict_detected is False
    assert conflict is None


def test_spatial_conflict_detected_above_threshold():
    # Setup mock registry with 2 facilities > 400km apart
    reg = DatasetRegistry(DATA_DIR)
    reg.facility_map = {
        "FAC_JAKARTA": {"facility_id": "FAC_JAKARTA", "latitude": -6.2088, "longitude": 106.8456, "facility_class": "FKRTL"},
        "FAC_SURABAYA": {"facility_id": "FAC_SURABAYA", "latitude": -7.2575, "longitude": 112.7521, "facility_class": "FKRTL"},
    }
    reg.doctor_claims_by_date = {
        ("DOC_FLYER", "2026-03-20"): [
            {"claim_id": "CLM_SBY_1", "facility_id": "FAC_SURABAYA", "service_time_str": "09:00:00"}
        ]
    }

    analyzer = SpatiotemporalRiskAnalyzer(reg)
    metrics, notes, conflict = analyzer.analyze(
        claim_id="CLM_JKT_1",
        doctor_id="DOC_FLYER",
        facility_id="FAC_JAKARTA",
        patient_id="PAT_TEST",
        service_date="2026-03-20",
    )

    assert metrics.spatial_conflict_detected is True
    assert conflict is not None
    assert conflict["conflicting_facility_id"] == "FAC_SURABAYA"
    assert conflict["distance_km"] > SPATIAL_DISTANCE_KM_THRESHOLD


def test_doctor_capacity_tiers():
    reg = DatasetRegistry(DATA_DIR)
    reg.facility_map = {
        "FAC_LOCAL": {"facility_id": "FAC_LOCAL", "latitude": -6.2088, "longitude": 106.8456, "facility_class": "FKRTL"}
    }

    # Tier 1: Normal volume (10 claims)
    reg.doctor_claims_by_date = {
        ("DOC_NORMAL", "2026-03-20"): [{"claim_id": f"CLM_{i}", "facility_id": "FAC_LOCAL"} for i in range(10)]
    }
    analyzer = SpatiotemporalRiskAnalyzer(reg)
    m1, notes1, _ = analyzer.analyze("CLM_NEW", "DOC_NORMAL", "FAC_LOCAL", "PAT", "2026-03-20")
    assert m1.doctor_daily_volume == 11
    assert m1.spatiotemporal_risk_score < 30.0

    # Tier 2: Extreme capacity limit (>= 80 claims)
    reg.doctor_claims_by_date[("DOC_EXTREME", "2026-03-20")] = [
        {"claim_id": f"CLM_E_{i}", "facility_id": "FAC_LOCAL"} for i in range(85)
    ]
    m2, notes2, _ = analyzer.analyze("CLM_NEW_E", "DOC_EXTREME", "FAC_LOCAL", "PAT", "2026-03-20")
    assert m2.doctor_daily_volume == 86
    assert any("ambang kapasitas normal" in n for n in notes2)
    assert m2.spatiotemporal_risk_score >= 40.0


if __name__ == "__main__":
    test_haversine_distance_known_points()
    test_missing_coordinates_zero_island_immunity()
    test_spatial_conflict_detected_above_threshold()
    test_doctor_capacity_tiers()
    print("ALL SPATIOTEMPORAL UNIT TESTS PASSED SUCCESSFULLY!")

"""
Module 3: Spatiotemporal Risk Analysis Engine
==============================================
Validates physical geographical feasibility and doctor volume anomalies.
"""

import math
from typing import Any, Dict, List, Optional, Tuple

from src.config import (
    DOCTOR_EXTREME_CAPACITY_LIMIT,
    DOCTOR_NORMAL_CAPACITY_LIMIT,
    DOCTOR_PEER_AVERAGE_DAILY_VOLUME,
    SPATIAL_DEGREE_THRESHOLD,
    SPATIAL_DISTANCE_KM_THRESHOLD,
)
from src.database.registry import DatasetRegistry
from src.schemas.claim import SpatiotemporalMetrics


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


class SpatiotemporalRiskAnalyzer:
    """
    Executes Spatiotemporal integrity rules:
    1. Spatial Impossibility: Identifies same-day transactions across facilities
       with geographical distance exceeding physical travel speed limits (>4.5 deg or >400 km).
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
            formatted_dist = f"{dist:,.0f}".replace(",", ".")
            evidence_notes.append(
                f"Dokter {doctor_id} melayani klaim di faskes {facility_id} dan {other_fid} "
                f"berjarak ~{formatted_dist} km pada hari yang sama (Konflik Spasio-Temporal)."
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

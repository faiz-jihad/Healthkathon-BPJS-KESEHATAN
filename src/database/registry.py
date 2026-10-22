"""
In-Memory & Parquet Entity Dataset Registry
"""

from pathlib import Path
from typing import Any, Dict, List, Tuple
import pandas as pd

from src.config import DATA_DIR, FACILITIES_PARQUET, DOCTORS_PARQUET, PATIENTS_PARQUET, CLAIMS_PARQUET


class DatasetRegistry:
    """Loads and indexes synthetic entity parquet stores for real-time querying."""

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
        if not FACILITIES_PARQUET.exists():
            print(f"[DatasetRegistry] Parquet files not found in {self.data_dir}. Initializing empty.")
            return

        print("[DatasetRegistry] Loading columnar tables from parquet...")
        self.facilities_df = pd.read_parquet(FACILITIES_PARQUET)
        self.doctors_df = pd.read_parquet(DOCTORS_PARQUET)
        self.patients_df = pd.read_parquet(PATIENTS_PARQUET)
        self.claims_df = pd.read_parquet(CLAIMS_PARQUET)

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

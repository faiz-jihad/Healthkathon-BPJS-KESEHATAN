"""
AURA-JKN: Automated Synthetic Data Generator & Heterogeneous Graph Builder
==========================================================================
Scales synthetic BPJS Kesehatan dataset and constructs PyTorch Geometric HeteroData.

Usage:
  python generate_data.py --scale 5          # Scale to ~100k claims
  python generate_data.py --claims 50000     # Scale to specific claim count
  python generate_data.py --help
"""

import argparse
import datetime
import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
try:
    import torch
    from torch_geometric.data import HeteroData
    import torch_geometric.transforms as T
    TORCH_AVAILABLE = True
except (ImportError, OSError):
    torch = None
    HeteroData = None
    T = None
    TORCH_AVAILABLE = False

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "scripts" else CURRENT_DIR
DATA_DIR = ROOT_DIR / "data"
MODELS_DIR = ROOT_DIR / "models"
RANDOM_SEED = 42

ICD10_LIST = ["I25.1", "E11", "I10", "K29", "J45", "N18", "M54", "A09", "B20", "R07"]
ICD9_LIST = ["88.56", "39.95", "401", "250", "493", "585", "724", "009", "042", "786"]
SPECIALTIES = ["Umum", "Pediatri", "Kardio", "Ortho", "Kulit"]


def parse_args():
    parser = argparse.ArgumentParser(description="AURA-JKN Synthetic Data & Graph Generator")
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="Scale multiplier relative to baseline (1.0 = ~20k claims, 5.0 = ~100k claims)",
    )
    parser.add_argument(
        "--claims",
        type=int,
        default=None,
        help="Directly specify target total claims (overrides --scale if set)",
    )
    return parser.parse_args()


def random_service_datetime(start_year=2024, end_year=2025):
    start = datetime.datetime(start_year, 1, 1, 8, 0, 0)
    end = datetime.datetime(end_year, 1, 1, 21, 0, 0)
    delta_sec = int((end - start).total_seconds())
    random_sec = np.random.randint(0, delta_sec)
    return start + datetime.timedelta(seconds=random_sec)


def generate_pipeline(scale: float, target_claims: int = None):
    np.random.seed(RANDOM_SEED)
    if TORCH_AVAILABLE and torch is not None:
        torch.manual_seed(RANDOM_SEED)

    if target_claims is not None:
        n_claims = target_claims
        scale = n_claims / 20000.0
    else:
        n_claims = int(20000 * scale)

    n_facilities = max(30, int(30 * np.sqrt(scale)))
    n_doctors = max(150, int(150 * np.sqrt(scale)))
    n_patients = max(5000, int(5000 * np.sqrt(scale)))

    n_normal = int(n_claims * 0.8)
    n_fraud_each = int((n_claims * 0.2) / 3)

    print("=" * 70)
    print("       AURA-JKN SYNTHETIC DATASET GENERATION PIPELINE")
    print("=" * 70)
    print(f"Scale Factor     : {scale:.2f}x")
    print(f"Target Total     : {n_normal + (n_fraud_each * 3):,} claims")
    print(f"  - Legitimate   : {n_normal:,} (80%)")
    print(f"  - Fraud Skenario A, B, C: {n_fraud_each:,} each (Total 20%)")
    print(f"Entities Count   : {n_facilities:,} Facilities, {n_doctors:,} Doctors, {n_patients:,} Patients")
    print("-" * 70)

    # 1. Facilities
    print("[1/5] Generating Healthcare Facilities (Faskes)...")
    facility_ids = [f"FAC{i:04d}" for i in range(n_facilities)]
    facility_classes = np.random.choice(["FKTP", "FKRTL"], size=n_facilities, p=[0.7, 0.3])
    latitudes = np.random.uniform(-6.0, 6.0, size=n_facilities)
    longitudes = np.random.uniform(95.0, 141.0, size=n_facilities)

    facilities_df = pd.DataFrame({
        "facility_id": facility_ids,
        "facility_class": facility_classes,
        "latitude": latitudes,
        "longitude": longitudes,
    })

    # 2. Doctors
    print("[2/5] Generating Doctor Directory...")
    doctor_ids = [f"DOC{i:04d}" for i in range(n_doctors)]
    sip_numbers = [f"SIP{np.random.randint(1000000, 9999999)}" for _ in range(n_doctors)]
    specialties = np.random.choice(SPECIALTIES, size=n_doctors)
    home_facility_ids = np.random.choice(facility_ids, size=n_doctors)
    schedule_hours = np.random.randint(20, 51, size=n_doctors)

    doctors_df = pd.DataFrame({
        "doctor_id": doctor_ids,
        "sip_number": sip_numbers,
        "specialty": specialties,
        "home_facility_id": home_facility_ids,
        "schedule_hours": schedule_hours,
    })

    # 3. Patients
    print("[3/5] Generating Pseudonymized Patients (Salted SHA-256)...")
    nik_base = np.random.randint(10**15, 10**16 - 1, size=n_patients, dtype=np.int64).astype(str)
    name_prefixes = ["Budi", "Ani", "Citra", "Dedi", "Eka", "Fani", "Gita", "Hadi", "Rian", "Siti"]
    name_suffixes = ["Santoso", "Wijaya", "Putri", "Nur", "Setiawan", "Lestari", "Kusuma", "Dewi", "Pratama"]
    names = [f"{np.random.choice(name_prefixes)} {np.random.choice(name_suffixes)}" for _ in range(n_patients)]
    salt = b"AURA-JKN-SALT-2026"

    def hash_patient(nik: str, name: str) -> str:
        return hashlib.sha256(salt + f"{nik}|{name}".encode("utf-8")).hexdigest()

    patient_ids = [hash_patient(nik, name) for nik, name in zip(nik_base, names)]
    home_regions = np.random.choice([f"PROV{i:02d}" for i in range(1, 35)], size=n_patients)

    patients_df = pd.DataFrame({
        "patient_id": patient_ids,
        "nik": nik_base,
        "name": names,
        "home_region": home_regions,
        "referral_history_id": ["" for _ in range(n_patients)],
    })

    # 4. Claims (Normal + Scenarios A, B, C)
    print("[4/5] Simulating Legitimate & Fraudulent Claims...")
    # Normal
    service_dt_norm = [random_service_datetime() for _ in range(n_normal)]
    claims_norm = pd.DataFrame({
        "claim_id": [f"CLM{i:08d}" for i in range(n_normal)],
        "patient_id": np.random.choice(patients_df["patient_id"], size=n_normal),
        "doctor_id": np.random.choice(doctors_df["doctor_id"], size=n_normal),
        "facility_id": np.random.choice(facility_ids, size=n_normal),
        "icd10_code": np.random.choice(ICD10_LIST, size=n_normal),
        "icd9_code": np.random.choice(ICD9_LIST, size=n_normal),
        "service_date": [dt.date() for dt in service_dt_norm],
        "service_time": [dt.time() for dt in service_dt_norm],
        "ina_cbgs_tariff": np.random.uniform(50000, 1500000, size=n_normal).round(0),
        "length_of_stay": np.random.randint(0, 15, size=n_normal),
        "is_fraud": np.zeros(n_normal, dtype=int),
        "fraud_scenario": [None] * n_normal,
    })

    # Scenario A: Fake Patient Cluster
    cluster_region = np.random.choice(patients_df["home_region"].unique())
    cluster_patients = patients_df[patients_df["home_region"] == cluster_region]
    if len(cluster_patients) < 50:
        cluster_patients = patients_df.sample(n=min(len(patients_df), 50), random_state=RANDOM_SEED)
    cluster_doctor = np.random.choice(doctors_df["doctor_id"])
    cluster_facility = np.random.choice(facility_ids)
    service_dt_A = [random_service_datetime() for _ in range(n_fraud_each)]

    claims_A = pd.DataFrame({
        "claim_id": [f"CLMA{i:08d}" for i in range(n_fraud_each)],
        "patient_id": np.random.choice(cluster_patients["patient_id"], size=n_fraud_each),
        "doctor_id": np.full(n_fraud_each, cluster_doctor),
        "facility_id": np.full(n_fraud_each, cluster_facility),
        "icd10_code": np.random.choice(ICD10_LIST, size=n_fraud_each),
        "icd9_code": np.random.choice(ICD9_LIST, size=n_fraud_each),
        "service_date": [dt.date() for dt in service_dt_A],
        "service_time": [dt.time() for dt in service_dt_A],
        "ina_cbgs_tariff": np.random.uniform(50000, 1500000, size=n_fraud_each).round(0),
        "length_of_stay": np.random.randint(0, 15, size=n_fraud_each),
        "is_fraud": np.ones(n_fraud_each, dtype=int),
        "fraud_scenario": ["A"] * n_fraud_each,
    })

    # Scenario B: Extreme Doctor Volume
    fraud_doc_B = np.random.choice(doctors_df["doctor_id"])
    service_dt_B = [random_service_datetime() for _ in range(n_fraud_each)]

    claims_B = pd.DataFrame({
        "claim_id": [f"CLMB{i:08d}" for i in range(n_fraud_each)],
        "patient_id": np.random.choice(patients_df["patient_id"], size=n_fraud_each),
        "doctor_id": np.full(n_fraud_each, fraud_doc_B),
        "facility_id": np.random.choice(facility_ids, size=n_fraud_each),
        "icd10_code": np.random.choice(ICD10_LIST, size=n_fraud_each),
        "icd9_code": np.random.choice(ICD9_LIST, size=n_fraud_each),
        "service_date": [dt.date() for dt in service_dt_B],
        "service_time": [dt.time() for dt in service_dt_B],
        "ina_cbgs_tariff": np.random.uniform(50000, 1500000, size=n_fraud_each).round(0),
        "length_of_stay": np.random.randint(0, 15, size=n_fraud_each),
        "is_fraud": np.ones(n_fraud_each, dtype=int),
        "fraud_scenario": ["B"] * n_fraud_each,
    })

    # Scenario C: Spatio-Temporal Conflict
    fraud_doc_C = np.random.choice(doctors_df["doctor_id"])
    facility_coords = facilities_df.set_index("facility_id")[["latitude", "longitude"]]
    facility_id_C1 = np.random.choice(facility_ids)
    candidates_C2 = [fid for fid in facility_ids if fid != facility_id_C1]
    np.random.shuffle(candidates_C2)

    facility_id_C2 = candidates_C2[0]
    for cand in candidates_C2:
        lat_diff = abs(facility_coords.loc[facility_id_C1, "latitude"] - facility_coords.loc[cand, "latitude"])
        lon_diff = abs(facility_coords.loc[facility_id_C1, "longitude"] - facility_coords.loc[cand, "longitude"])
        if lat_diff >= 5.0 or lon_diff >= 5.0:
            facility_id_C2 = cand
            break

    facility_id_C = np.where(np.arange(n_fraud_each) % 2 == 0, facility_id_C1, facility_id_C2)
    base_dt_C = [random_service_datetime() for _ in range(n_fraud_each // 2)]
    service_dt_C = [dt for pair_dt in base_dt_C for dt in (pair_dt, pair_dt)]
    if len(service_dt_C) < n_fraud_each:
        service_dt_C.append(random_service_datetime())

    claims_C = pd.DataFrame({
        "claim_id": [f"CLMC{i:08d}" for i in range(n_fraud_each)],
        "patient_id": np.random.choice(patients_df["patient_id"], size=n_fraud_each),
        "doctor_id": np.full(n_fraud_each, fraud_doc_C),
        "facility_id": facility_id_C,
        "icd10_code": np.random.choice(ICD10_LIST, size=n_fraud_each),
        "icd9_code": np.random.choice(ICD9_LIST, size=n_fraud_each),
        "service_date": [dt.date() for dt in service_dt_C],
        "service_time": [dt.time() for dt in service_dt_C],
        "ina_cbgs_tariff": np.random.uniform(50000, 1500000, size=n_fraud_each).round(0),
        "length_of_stay": np.random.randint(0, 15, size=n_fraud_each),
        "is_fraud": np.ones(n_fraud_each, dtype=int),
        "fraud_scenario": ["C"] * n_fraud_each,
    })

    claims_df = pd.concat([claims_norm, claims_A, claims_B, claims_C], ignore_index=True)
    claims_df = claims_df.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

    # Export to Parquet
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    claims_export_df = claims_df.copy()
    claims_export_df["service_date"] = claims_export_df["service_date"].astype(str)
    claims_export_df["service_time"] = claims_export_df["service_time"].astype(str)

    facilities_df.to_parquet(DATA_DIR / "facilities.parquet", index=False)
    doctors_df.to_parquet(DATA_DIR / "doctors.parquet", index=False)
    patients_df.to_parquet(DATA_DIR / "patients.parquet", index=False)
    claims_export_df.to_parquet(DATA_DIR / "claims.parquet", index=False)
    print("  -> Exported Parquet tables to data/")

    # 5. Construct PyG HeteroData Graph
    if not TORCH_AVAILABLE or HeteroData is None:
        print("[5/5] Notice: PyTorch Geometric runtime is not available on this environment.")
        print("      Parquet tables generated successfully in data/. HeteroData graph build skipped.")
        return

    print("[5/5] Building PyG HeteroData Graph...")
    hetero_data = HeteroData()

    patient_ids_unique = patients_df["patient_id"].unique()
    doctor_ids_unique = doctors_df["doctor_id"].unique()
    facility_ids_unique = facilities_df["facility_id"].unique()
    claim_ids_unique = claims_df["claim_id"].unique()
    diagnosis_ids_unique = sorted(list(set(claims_df["icd10_code"].unique())))

    patient_to_idx = {pid: i for i, pid in enumerate(patient_ids_unique)}
    doctor_to_idx = {did: i for i, did in enumerate(doctor_ids_unique)}
    facility_to_idx = {fid: i for i, fid in enumerate(facility_ids_unique)}
    claim_to_idx = {cid: i for i, cid in enumerate(claim_ids_unique)}
    diagnosis_to_idx = {did: i for i, did in enumerate(diagnosis_ids_unique)}

    # Stratified Train/Val/Test Split
    y_labels = claims_df["is_fraud"].to_numpy()
    claim_indices = np.arange(len(y_labels))
    train_idx, temp_idx = train_test_split(claim_indices, test_size=0.30, random_state=RANDOM_SEED, stratify=y_labels)
    val_idx, test_idx = train_test_split(temp_idx, test_size=0.50, random_state=RANDOM_SEED, stratify=y_labels[temp_idx])

    train_mask = torch.zeros(len(y_labels), dtype=torch.bool)
    val_mask = torch.zeros(len(y_labels), dtype=torch.bool)
    test_mask = torch.zeros(len(y_labels), dtype=torch.bool)
    train_mask[train_idx] = True
    val_mask[val_idx] = True
    test_mask[test_idx] = True

    # Node Features
    pat_region_enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    pat_region_features = pat_region_enc.fit_transform(patients_df[["home_region"]])
    hetero_data["patient"].x = torch.tensor(pat_region_features, dtype=torch.float)
    hetero_data["patient"].node_id = torch.arange(len(patient_ids_unique), dtype=torch.long)

    doc_scalar = StandardScaler()
    doc_hours_scaled = doc_scalar.fit_transform(doctors_df[["schedule_hours"]])
    doc_spec_enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    doc_spec_features = doc_spec_enc.fit_transform(doctors_df[["specialty"]])
    hetero_data["doctor"].x = torch.tensor(np.hstack([doc_hours_scaled, doc_spec_features]), dtype=torch.float)
    hetero_data["doctor"].node_id = torch.arange(len(doctor_ids_unique), dtype=torch.long)

    fac_scaler = StandardScaler()
    fac_geo_scaled = fac_scaler.fit_transform(facilities_df[["latitude", "longitude"]])
    fac_class_enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    fac_class_features = fac_class_enc.fit_transform(facilities_df[["facility_class"]])
    hetero_data["facility"].x = torch.tensor(np.hstack([fac_geo_scaled, fac_class_features]), dtype=torch.float)
    hetero_data["facility"].node_id = torch.arange(len(facility_ids_unique), dtype=torch.long)

    claims_df_processed = claims_df.copy()
    claims_df_processed["service_hour"] = claims_df_processed["service_time"].apply(
        lambda t: t.hour if hasattr(t, "hour") else int(str(t).split(":")[0])
    )

    clm_scaler = StandardScaler()
    clm_scaler.fit(claims_df_processed.loc[train_idx, ["ina_cbgs_tariff", "length_of_stay", "service_hour"]])
    clm_num_scaled = clm_scaler.transform(claims_df_processed[["ina_cbgs_tariff", "length_of_stay", "service_hour"]])

    clm_icd10_enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    clm_icd10_enc.fit(claims_df_processed.loc[train_idx, ["icd10_code"]])
    clm_icd10_features = clm_icd10_enc.transform(claims_df_processed[["icd10_code"]])

    clm_icd9_enc = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
    clm_icd9_enc.fit(claims_df_processed.loc[train_idx, ["icd9_code"]])
    clm_icd9_features = clm_icd9_enc.transform(claims_df_processed[["icd9_code"]])

    clm_features = np.hstack([clm_num_scaled, clm_icd10_features, clm_icd9_features])
    hetero_data["claim"].x = torch.tensor(clm_features, dtype=torch.float)
    hetero_data["claim"].node_id = torch.arange(len(claim_ids_unique), dtype=torch.long)

    diag_features = np.eye(len(diagnosis_ids_unique))
    hetero_data["diagnosis"].x = torch.tensor(diag_features, dtype=torch.float)
    hetero_data["diagnosis"].node_id = torch.arange(len(diagnosis_ids_unique), dtype=torch.long)

    # Edges
    regions = sorted(patients_df["home_region"].unique())
    region_to_fac = {reg: facility_ids_unique[i % len(facility_ids_unique)] for i, reg in enumerate(regions)}
    patient_reg_fac_idx = patients_df["home_region"].map(region_to_fac).fillna(facility_ids_unique[0])
    hetero_data["patient", "registered_at", "facility"].edge_index = torch.tensor([
        [patient_to_idx[p] for p in patients_df["patient_id"]],
        [facility_to_idx[f] for f in patient_reg_fac_idx],
    ], dtype=torch.long)

    hetero_data["patient", "examined_by", "doctor"].edge_index = torch.tensor([
        claims_df["patient_id"].map(patient_to_idx).to_numpy(),
        claims_df["doctor_id"].map(doctor_to_idx).to_numpy(),
    ], dtype=torch.long)

    hetero_data["doctor", "authorized", "claim"].edge_index = torch.tensor([
        claims_df["doctor_id"].map(doctor_to_idx).to_numpy(),
        claims_df["claim_id"].map(claim_to_idx).to_numpy(),
    ], dtype=torch.long)

    hetero_data["claim", "has_diagnosis", "diagnosis"].edge_index = torch.tensor([
        claims_df["claim_id"].map(claim_to_idx).to_numpy(),
        claims_df["icd10_code"].map(diagnosis_to_idx).to_numpy(),
    ], dtype=torch.long)

    src_pat_ref = []
    dst_pat_ref = []
    for _, row in claims_df.iterrows():
        src_pat_ref.append(patient_to_idx[row["patient_id"]])
        dst_pat_ref.append(facility_to_idx[row["facility_id"]])

    patients_with_claims = set(claims_df["patient_id"].unique())
    for _, row in patients_df.iterrows():
        p_id = row["patient_id"]
        if p_id not in patients_with_claims:
            src_pat_ref.append(patient_to_idx[p_id])
            fallback_facility = region_to_fac.get(row["home_region"], facility_ids_unique[0])
            dst_pat_ref.append(facility_to_idx[fallback_facility])

    hetero_data["patient", "referred_to", "facility"].edge_index = torch.tensor(
        [src_pat_ref, dst_pat_ref], dtype=torch.long
    )

    hetero_data["claim"].y = torch.tensor(y_labels, dtype=torch.long)
    hetero_data["claim"].fraud_scenario = claims_df["fraud_scenario"].fillna("").to_numpy()
    hetero_data["claim"].train_mask = train_mask
    hetero_data["claim"].val_mask = val_mask
    hetero_data["claim"].test_mask = test_mask

    # Undirected Transform
    undirected_transform = T.ToUndirected()
    final_hetero_data = undirected_transform(hetero_data)

    output_path = (MODELS_DIR / "aura_jkn_hetero_graph.pt") if MODELS_DIR.exists() else (ROOT_DIR / "aura_jkn_hetero_graph.pt")
    torch.save(final_hetero_data, output_path)
    if MODELS_DIR.exists():
        torch.save(final_hetero_data, ROOT_DIR / "aura_jkn_hetero_graph.pt")
    print(f"  -> Successfully saved transformed graph to '{output_path}'")
    print("=" * 70)
    print(f"[Done] Dataset and Graph generation complete!")
    print(f"  - Total Claim Nodes : {final_hetero_data['claim'].num_nodes:,}")
    print(f"  - Total Relations   : {len(final_hetero_data.edge_types)}")
    print("=" * 70)


if __name__ == "__main__":
    args = parse_args()
    generate_pipeline(scale=args.scale, target_claims=args.claims)

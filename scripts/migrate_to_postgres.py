"""
AURA-JKN: Parquet to PostgreSQL Migration Script
================================================
Transfers synthetic dataset from Parquet files into PostgreSQL database.

Requirements:
  pip install psycopg2-binary sqlalchemy

Usage:
  python migrate_to_postgres.py
  python migrate_to_postgres.py --db-url "postgresql+psycopg2://username:password@localhost:5432/aura_jkn"
"""

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Resolve project root whether run from root or from scripts/
CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "scripts" else CURRENT_DIR

# Load environment variables from project root .env
load_dotenv(ROOT_DIR / ".env")

DATA_DIR = ROOT_DIR / "data"
SCHEMA_SQL = (CURRENT_DIR / "schema.sql") if (CURRENT_DIR / "schema.sql").exists() else (ROOT_DIR / "schema.sql")


def resolve_database_url() -> str:
    """Resolves database URL from DATABASE_URL or individual DB_* variables."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.environ.get("DB_USER", "postgres")
    password = os.environ.get("DB_PASSWORD", "postgres")
    host = os.environ.get("DB_HOST", "localhost")
    port = os.environ.get("DB_PORT", "5432")
    db_name = os.environ.get("DB_NAME", "aura_jkn")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{db_name}"


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate AURA-JKN Parquet files to PostgreSQL")
    parser.add_argument(
        "--db-url",
        type=str,
        default=None,
        help="PostgreSQL Connection URL (defaults to .env configuration)",
    )
    parser.add_argument(
        "--drop",
        action="store_true",
        help="Drop and recreate existing tables before importing",
    )
    args = parser.parse_args()
    if not args.db_url:
        args.db_url = resolve_database_url()
    return args


def run_migration(db_url: str, drop_tables: bool = False):
    print("=" * 70)
    print("       AURA-JKN: PARQUET TO POSTGRESQL MIGRATION PIPELINE")
    print("=" * 70)
    print(f"Target Database URL: {db_url.split('@')[-1] if '@' in db_url else db_url}")
    print("-" * 70)

    # 1. Connect to Database Engine
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1;"))
        print("[Database] Connection established successfully.")
    except Exception as exc:
        print(f"\n[Error] Unable to connect to PostgreSQL: {exc}")
        print("\nTroubleshooting tips:")
        print("  1. Ensure PostgreSQL service is active on your machine.")
        print("  2. Ensure the database 'aura_jkn' has been created (e.g. CREATE DATABASE aura_jkn;).")
        print("  3. Ensure the driver is installed: pip install psycopg2-binary")
        print("  4. Provide the correct credentials via --db-url parameter.")
        sys.exit(1)

    # 2. Execute DDL Schema
    with engine.begin() as conn:
        if drop_tables:
            print("[Database] Dropping existing tables (--drop was specified)...")
            conn.execute(text("DROP TABLE IF EXISTS claims, patients, doctors, facilities CASCADE;"))

        if SCHEMA_SQL.exists():
            print("[Database] Applying DDL schema from schema.sql...")
            with open(SCHEMA_SQL, "r", encoding="utf-8") as f:
                ddl = f.read()
            # Split DDL into individual statements
            statements = [stmt.strip() for stmt in ddl.split(";") if stmt.strip()]
            for stmt in statements:
                conn.execute(text(stmt))
            print("  -> Schema DDL executed successfully.")
        else:
            print("[Warning] schema.sql not found. Relying on Pandas automatic schema creation.")

    # Helper for batch insertion with live progress tracking
    def insert_with_progress(df: pd.DataFrame, table_name: str, chunk_size: int = 5000):
        total = len(df)
        t0 = time.time()
        for i in range(0, total, chunk_size):
            chunk = df.iloc[i : i + chunk_size]
            chunk.to_sql(table_name, engine, if_exists="append", index=False)
            done = min(total, i + len(chunk))
            pct = (done / total) * 100
            elapsed = time.time() - t0
            speed = done / max(0.001, elapsed)
            eta = (total - done) / max(0.001, speed)
            print(
                f"\r  -> [{table_name}] {done:,}/{total:,} ({pct:5.1f}%) | "
                f"Speed: {speed:,.0f} rows/s | ETA: {int(eta//60):02d}m{int(eta%60):02d}s",
                end="",
                flush=True,
            )
        print()

    # 3. Load and Insert Facilities
    fac_path = DATA_DIR / "facilities.parquet"
    if fac_path.exists():
        print(f"[Import] Loading {fac_path.name}...")
        fac_df = pd.read_parquet(fac_path)
        insert_with_progress(fac_df, "facilities", chunk_size=2000)
        print(f"  -> Imported {len(fac_df):,} facilities into 'facilities' table.")

    # 4. Load and Insert Doctors
    doc_path = DATA_DIR / "doctors.parquet"
    if doc_path.exists():
        print(f"[Import] Loading {doc_path.name}...")
        doc_df = pd.read_parquet(doc_path)
        insert_with_progress(doc_df, "doctors", chunk_size=2000)
        print(f"  -> Imported {len(doc_df):,} doctors into 'doctors' table.")

    # 5. Load and Insert Patients
    pat_path = DATA_DIR / "patients.parquet"
    if pat_path.exists():
        print(f"[Import] Loading {pat_path.name}...")
        pat_df = pd.read_parquet(pat_path)
        insert_with_progress(pat_df, "patients", chunk_size=5000)
        print(f"  -> Imported {len(pat_df):,} patients into 'patients' table.")

    # 6. Load and Insert Claims
    clm_path = DATA_DIR / "claims.parquet"
    if clm_path.exists():
        print(f"[Import] Loading {clm_path.name}...")
        clm_df = pd.read_parquet(clm_path)
        clm_df["service_date"] = pd.to_datetime(clm_df["service_date"]).dt.date
        clm_df["service_time"] = pd.to_datetime(clm_df["service_time"].astype(str), format="%H:%M:%S", errors="coerce").dt.time
        insert_with_progress(clm_df, "claims", chunk_size=5000)
        print(f"  -> Imported {len(clm_df):,} claims into 'claims' table.")

    # 7. Verification Summary
    print("-" * 70)
    print("[Verification] Table Record Counts in PostgreSQL:")
    with engine.connect() as conn:
        for tbl in ["facilities", "doctors", "patients", "claims"]:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {tbl};")).scalar()
            print(f"  - Table '{tbl}': {count:,} rows")

    print("=" * 70)
    print("Migration completed successfully! PostgreSQL is ready for AURA-JKN.")
    print("=" * 70)


if __name__ == "__main__":
    args = parse_args()
    run_migration(db_url=args.db_url, drop_tables=args.drop)

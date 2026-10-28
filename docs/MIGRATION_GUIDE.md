# AURA-JKN: Panduan Lengkap Migrasi & Arsitektur Database PostgreSQL
**Dokumentasi Teknis Migrasi Data Kolumnar Parquet ke Sistem Relasional PostgreSQL Skala Nasional (1.000.000 Klaim)**  
*Healthkathon BPJS Kesehatan — Proyek AURA-JKN*

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791.svg)](https://www.postgresql.org/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue.svg)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-red.svg)](https://www.sqlalchemy.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📌 Daftar Isi
1. [Ringkasan Arsitektur Data](#1-ringkasan-arsitektur-data)
2. [Spesifikasi Skema Relasional (DDL & ERD)](#2-spesifikasi-skema-relasional-ddl--erd)
3. [Alur Pipeline Migrasi (`scripts/migrate_to_postgres.py`)](#3-alur-pipeline-migrasi)
4. [Prasyarat & Konfigurasi Lingkungan (`.env`)](#4-prasyarat--konfigurasi-lingkungan)
5. [Panduan Eksekusi Langkah demi Langkah](#5-panduan-eksekusi-langkah-demi-langkah)
6. [Mekanisme Audit Persistence Otomatis](#6-mekanisme-audit-persistence-otomatis)
7. [Indeks Performa & Optimasi Query](#7-indeks-performa--optimasi-query)
8. [Troubleshooting & Solusi Error Umum](#8-troubleshooting--solusi-error-umum)

---

## 1. Ringkasan Arsitektur Data

AURA-JKN menggunakan pendekatan **Dual-Storage Architecture (Hybrid Data Layer)** untuk menyeimbangkan kebutuhan komputasi analitik Machine Learning (graf heterogen skala 1.000.000 data) dan kebutuhan kepatuhan audit transaksi asuransi kesehatan:

```mermaid
flowchart LR
    subgraph Storage_Layer ["Hybrid Data Layer"]
        P["ETL Data Sampel BPJS<br/>src/data/bpjs_sample_etl.py"] -->|Ekspor Kolumnar| PQ[("Parquet Store<br/>data/*.parquet")]
        PQ -->|Bulk Load Saat Startup| REG["In-Memory Registry<br/>src/database/registry.py"]
        PQ -->|Migration Pipeline<br/>scripts/migrate_to_postgres.py| PG[("PostgreSQL Database<br/>aura_jkn")]
    end

    subgraph Service_Layer ["Real-Time Pre-Payment Decision"]
        REG -->|Microsecond Lookups| API["FastAPI Engine<br/>app.py"]
        API -->|Auto UPSERT Keputusan Audit| PG
    end
```

* **Parquet (`data/*.parquet`)**: Berperan sebagai *Feature Store* terkompresi lokal. Digunakan untuk inisialisasi instan *in-memory cache* saat startup API dan bahan baku pembentukan graf heterogen PyTorch Geometric.
* **PostgreSQL (`aura_jkn`)**: Berperan sebagai *System of Record* (OLTP) relasional terpercaya yang menjamin integritas referensial (foreign keys), riwayat audit keputusan *pre-payment gate*, dan persistensi bukti Explainable AI (XAI).

---

## 2. Spesifikasi Skema Relasional (DDL & ERD)

Skema database didefinisikan secara resmi pada file [`scripts/schema.sql`](file:///d:/Documents/AURA-JKN/scripts/schema.sql).

### Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    FACILITIES ||--o{ DOCTORS : "home_facility"
    FACILITIES ||--o{ CLAIMS : "served_at"
    DOCTORS ||--o{ CLAIMS : "authorized_by"
    PATIENTS ||--o{ CLAIMS : "submitted_for"

    FACILITIES {
        varchar facility_id PK
        varchar facility_class "FKTP atau FKRTL"
        float latitude
        float longitude
        varchar region_name "Provinsi / Wilayah"
        int dati2 "Kode Kab/Kota"
        timestamptz created_at
    }

    DOCTORS {
        varchar doctor_id PK
        varchar sip_number "Nomor Surat Izin Praktik"
        varchar specialty "Spesialisasi Medis"
        varchar home_facility_id FK
        int schedule_hours "Jam praktik per minggu"
        timestamptz created_at
    }

    PATIENTS {
        varchar patient_id PK "Salted Hash Pseudonim"
        varchar nik "Pseudonim NIK"
        varchar name "Nama Tersamar"
        varchar home_region "Provinsi Domisili"
        varchar referral_history_id
        timestamptz created_at
    }

    CLAIMS {
        varchar claim_id PK
        varchar patient_id FK
        varchar doctor_id FK
        varchar facility_id FK
        text icd10_code "Diagnosa Primer"
        text icd9_code "Tindakan Medis"
        date service_date
        time service_time
        numeric ina_cbgs_tariff "Besaran Tarif INA-CBG"
        int length_of_stay "Lama Rawat Inap (hari)"
        varchar fktp_referral_id "Nomor Rujukan FKTP"
        varchar referral_facility_id "ID Faskes Perujuk"
        int dati2 "Kode Dati2"
        float referral_distance_to_fktp "Jarak Rujukan (km)"
        boolean referral_distance_missing "Flag Imputasi Jarak"
        int is_fraud "Ground Truth (0/1)"
        varchar fraud_scenario "A / B / C / NULL"
        float fraud_probability "Probabilitas GNN (0.0 - 1.0)"
        varchar risk_level "HIGH / MEDIUM / LOW"
        varchar pre_payment_gate "REJECT / FLAGGED / AUTO_APPROVE"
        float spatiotemporal_risk_score "Skor Komposit 0-100"
        boolean spatial_conflict_detected
        int doctor_daily_volume
        varchar primary_fraud_trigger
        jsonb evidence_reasons "Array Narasi Bukti"
        jsonb subgraph_evidence "Visualisasi NetworkX"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 3. Alur Pipeline Migrasi

Script [`scripts/migrate_to_postgres.py`](file:///d:/Documents/AURA-JKN/scripts/migrate_to_postgres.py) mengeksekusi proses ETL terotomatisasi yang dirancang tahan terhadap memori terbatas pada dataset 1.000.000 klaim:

1. **Koneksi Engine**: Membentuk *connection pool* SQLAlchemy menggunakan driver `psycopg2-binary`.
2. **Eksekusi DDL**: Membaca file `scripts/schema.sql`, memecah perintah SQL, dan membuat tabel beserta indeksnya (`CREATE TABLE IF NOT EXISTS`).
3. **Impor Fasilitas Kesehatan (`facilities`)**: Membaca `data/facilities.parquet` (27.621 faskes) dan menyisipkan baris dalam chunk 2.000 baris dengan pelacakan kecepatan live (*rows/s*).
4. **Impor Dokter (`doctors`)**: Membaca `data/doctors.parquet` (78.627 dokter) dan menyisipkan baris dokter dengan referensi `home_facility_id`.
5. **Impor Pasien (`patients`)**: Membaca `data/patients.parquet` (252.176 pasien) dan menyisipkan data pasien dalam chunk 5.000 data.
6. **Impor & Normalisasi Klaim (`claims`)**: 
   - Membaca `data/claims.parquet` (1.000.000 klaim).
   - Mengonversi format tanggal string ke tipe SQL `DATE` (`YYYY-MM-DD`).
   - Mengonversi format waktu string ke tipe SQL `TIME` (`HH:MM:SS`).
   - Menyisipkan data klaim secara bertahap dalam chunk 5.000 data dengan estimasi sisa waktu (*Dynamic ETA*).
7. **Verifikasi Integritas**: Menjalankan query `COUNT(*)` pada keempat tabel dan menampilkan laporan rekapitulasi data.

---

## 4. Prasyarat & Konfigurasi Lingkungan

### A. Dependensi Driver Python & Database
Pastikan pustaka database dan dependensi proyek telah terpasang:
```bash
pip install psycopg2-binary sqlalchemy python-dotenv pandas pyarrow
# atau cukup jalankan:
pip install -r requirements.txt
```

### B. Konfigurasi File `.env`
Sesuaikan parameter koneksi database di file [`.env`](file:///d:/Documents/AURA-JKN/.env):
```ini
# ==============================================================================
# PostgreSQL Database Configuration
# ==============================================================================
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aura_jkn

# Atau Connection String Lengkap:
# DATABASE_URL=postgresql+psycopg2://postgres:your_password@localhost:5432/aura_jkn

# Server Configuration
PORT=8000
ENVIRONMENT=development
```

---

## 5. Panduan Eksekusi Langkah demi Langkah

### Langkah 1: Buat Database di PostgreSQL
Pastikan service PostgreSQL telah berjalan, lalu buat basis data:
```sql
CREATE DATABASE aura_jkn;
```

### Langkah 2: Eksekusi Migrasi Data
Jalankan migrasi standar dari root direktori proyek:
```powershell
python scripts/migrate_to_postgres.py
```

#### Menjalankan Reset Bersih (`--drop`)
Jika Anda ingin menghapus seluruh tabel yang sudah ada sebelumnya dan mengimpor ulang data dari awal secara bersih:
```powershell
python scripts/migrate_to_postgres.py --drop
```

#### Output Sukses yang Diharapkan (Skala Nasional 1.000.000 Data):
```text
======================================================================
       AURA-JKN: PARQUET TO POSTGRESQL MIGRATION PIPELINE
======================================================================
Target Database URL: localhost:5432/aura_jkn
----------------------------------------------------------------------
[Database] Connection established successfully.
[Database] Dropping existing tables (--drop was specified)...
[Database] Applying DDL schema from schema.sql...
  -> Schema DDL executed successfully.
[Import] Loading facilities.parquet...
  -> [facilities] 27,621/27,621 (100.0%) | Speed: 14,250 rows/s | ETA: 00m00s
  -> Imported 27,621 facilities into 'facilities' table.
[Import] Loading doctors.parquet...
  -> [doctors] 78,627/78,627 (100.0%) | Speed: 16,840 rows/s | ETA: 00m00s
  -> Imported 78,627 doctors into 'doctors' table.
[Import] Loading patients.parquet...
  -> [patients] 252,176/252,176 (100.0%) | Speed: 18,910 rows/s | ETA: 00m00s
  -> Imported 252,176 patients into 'patients' table.
[Import] Loading claims.parquet...
  -> [claims] 1,000,000/1,000,000 (100.0%) | Speed: 19,450 rows/s | ETA: 00m00s
  -> Imported 1,000,000 claims into 'claims' table.
----------------------------------------------------------------------
[Verification] Table Record Counts in PostgreSQL:
  - Table 'facilities': 27,621 rows
  - Table 'doctors': 78,627 rows
  - Table 'patients': 252,176 rows
  - Table 'claims': 1,000,000 rows
======================================================================
Migration completed successfully! PostgreSQL is ready for AURA-JKN.
======================================================================
```

---

## 6. Mekanisme Audit Persistence Otomatis

AURA-JKN tidak hanya membaca database, tetapi juga **menyimpan hasil keputusan audit secara live** melalui modul [`src/database/connection.py`](file:///d:/Documents/AURA-JKN/src/database/connection.py).

Setiap kali endpoint `POST /api/v1/predict-claim` atau `GET /api/v1/claims/{claim_id}` dipanggil:
1. Sistem mengeksekusi evaluasi 4 pilar analitik (Jarak Spasial, Beban Dokter, R-GCN Anomaly Score, dan Generative AI Audit Brief).
2. Fungsi `persist_claim_audit()` menjalankan query `UPSERT`:
   ```sql
   INSERT INTO claims (
       claim_id, patient_id, doctor_id, facility_id, icd10_code,
       service_date, service_time, ina_cbgs_tariff, length_of_stay,
       fktp_referral_id, referral_facility_id, dati2,
       referral_distance_to_fktp, referral_distance_missing,
       fraud_probability, risk_level, pre_payment_gate,
       spatiotemporal_risk_score, spatial_conflict_detected,
       doctor_daily_volume, primary_fraud_trigger,
       evidence_reasons, subgraph_evidence, updated_at
   ) VALUES (...)
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
   ```
3. **Foreign Key Protection untuk Klaim Simulasi Baru**:
   Jika klaim yang diuji merupakan klaim baru dengan entitas stub, sistem secara otomatis memastikan entitas terdaftar dengan `ON CONFLICT DO NOTHING` sebelum menyisipkan klaim, menjamin ketiadaan error *Foreign Key Constraint Violation*.

---

## 7. Indeks Performa & Optimasi Query

Untuk mempercepat query analitik dan deteksi bentrok spasiotemporal pada tabel `claims` berukuran 1.000.000 baris, skema mengimplementasikan indeks komposit B-Tree:

| Nama Indeks | Kolom yang Diindeks | Tujuan Optimasi |
| :--- | :--- | :--- |
| `idx_claims_doctor_date` | `(doctor_id, service_date)` | Mempercepat pencarian seluruh faskes yang dikunjungi dokter pada tanggal tertentu (*Impossible travel detection*). |
| `idx_claims_patient_date` | `(patient_id, service_date)` | Mempercepat deteksi kartu BPJS pasien yang dipakai di faskes berbeda pada hari yang sama. |
| `idx_claims_facility` | `(facility_id)` | Agregasi dan benchmarking performa faskes di tingkat kab/kota dan provinsi. |
| `idx_claims_gate` | `(pre_payment_gate)` | Memfilter antrean klaim yang dibekukan (`REJECT_FOR_HUMAN_REVIEW`) untuk verifikator. |
| `idx_claims_risk` | `(risk_level)` | Penyortiran dashboard analitik verifikator medis BPJS Kesehatan. |

---

## 8. Troubleshooting & Solusi Error Umum

### A. `FATAL: password authentication failed for user "postgres"`
* **Penyebab**: Password pada variabel `DB_PASSWORD` atau `DATABASE_URL` di file `.env` berbeda dengan password user `postgres` di instalasi PostgreSQL lokal Anda.
* **Solusi**: Buka file `.env`, pastikan password sinkron dengan kredensial PostgreSQL lokal Anda.

### B. `psql : The term 'psql' is not recognized`
* **Penyebab**: Direktori `bin` PostgreSQL belum didaftarkan ke System Environment Variables `PATH` Windows.
* **Solusi**: Tambahkan path PostgreSQL ke PATH (biasanya di `C:\Program Files\PostgreSQL\<versi>\bin`), atau gunakan pgAdmin GUI untuk membuat database `aura_jkn`.

### C. `psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint`
* **Penyebab**: Anda menjalankan `migrate_to_postgres.py` tanpa parameter `--drop` saat tabel sudah berisi klaim dengan ID yang sama.
* **Solusi**: Jalankan dengan parameter reset bersih: `python scripts/migrate_to_postgres.py --drop`.

> [!TIP]
> **Pencegahan Kehabisan Memori (Out-Of-Memory)**:
> Script `migrate_to_postgres.py` telah dilengkapi chunked batch insertion (`chunk_size=5000`), sehingga migrasi 1.000.000 klaim hanya mengonsumsi memori RAM < 500 MB.

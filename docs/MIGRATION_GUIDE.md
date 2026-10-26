# AURA-JKN: Panduan Lengkap Migrasi & Arsitektur Database PostgreSQL
**Dokumentasi Teknis Migrasi Data Kolumnar Parquet ke Sistem Relasional PostgreSQL**  
*Healthkathon BPJS Kesehatan — Proyek AURA-JKN*

---

## 📌 Daftar Isi
1. [Ringkasan Arsitektur Data](#1-ringkasan-arsitektur-data)
2. [Spesifikasi Skema Relasional (DDL)](#2-spesifikasi-skema-relasional-ddl)
3. [Alur Pipeline Migrasi (`scripts/migrate_to_postgres.py`)](#3-alur-pipeline-migrasi)
4. [Prasyarat & Konfigurasi Lingkungan (`.env`)](#4-prasyarat--konfigurasi-lingkungan)
5. [Panduan Eksekusi Langkah demi Langkah](#5-panduan-eksekusi-langkah-demi-langkah)
6. [Mekanisme Audit Persistence Otomatis](#6-mekanisme-audit-persistence-otomatis)
7. [Indeks Performa & Optimasi Query](#7-indeks-performa--optimasi-query)
8. [Troubleshooting & Solusi Error Umum](#8-troubleshooting--solusi-error-umum)

---

## 1. Ringkasan Arsitektur Data

AURA-JKN menggunakan pendekatan **Dual-Storage Architecture (Hybrid Data Layer)** untuk menyeimbangkan kebutuhan komputasi performa tinggi Machine Learning dan kebutuhan kepatuhan audit transaksi perbankan/asuransi kesehatan:

```mermaid
flowchart LR
    subgraph Storage_Layer [Hybrid Data Layer]
        P[Data Generator<br/>scripts/generate_data.py] -->|Ekspor| PQ[(Parquet Files<br/>data/*.parquet)]
        PQ -->|Bulk Load| REG[In-Memory Registry<br/>src/database/registry.py]
        PQ -->|Migration Pipeline<br/>scripts/migrate_to_postgres.py| PG[(PostgreSQL Database<br/>aura_jkn)]
    end

    subgraph Service_Layer [Real-Time Inference]
        REG -->|Microsecond Lookups| API[FastAPI Engine<br/>app.py]
        API -->|Auto Upsert Decisions| PG
    end
```

* **Parquet (`data/*.parquet`)**: Berperan sebagai *Feature Store* terkompresi lokal. Digunakan untuk inisialisasi cepat *in-memory cache* saat startup API dan bahan baku pembentukan graf heterogen PyTorch Geometric.
* **PostgreSQL (`aura_jkn`)**: Berperan sebagai *System of Record* (OLTP) relasional terpercaya yang menyimpan integritas relasi foreign-key, riwayat audit pra-pembayaran klaim, dan bukti kausalitas XAI.

---

## 2. Spesifikasi Skema Relasional (DDL)

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
        varchar facility_class "FKTP / FKRTL"
        float latitude
        float longitude
        timestamptz created_at
    }

    DOCTORS {
        varchar doctor_id PK
        varchar sip_number "Nomor Surat Izin Praktik"
        varchar specialty "Umum, Kardio, Ortho, dll"
        varchar home_facility_id FK
        int schedule_hours "Jam praktik/minggu"
        timestamptz created_at
    }

    PATIENTS {
        varchar patient_id PK "Salted SHA-256 Hash"
        varchar nik "Pseudonim NIK"
        varchar name "Nama Tersamar"
        varchar home_region "Provinsi/Wilayah"
        varchar referral_history_id
        timestamptz created_at
    }

    CLAIMS {
        varchar claim_id PK
        varchar patient_id FK
        varchar doctor_id FK
        varchar facility_id FK
        varchar icd10_code "Diagnosa Primer"
        varchar icd9_code "Tindakan Medis"
        date service_date
        time service_time
        numeric ina_cbgs_tariff "Besaran Tarif INA-CBG"
        int length_of_stay "Lama Rawat (hari)"
        int is_fraud "Ground truth (0/1)"
        varchar fraud_scenario "A / B / C / NULL"
        float fraud_probability "Hasil Inferensi GNN (0.0 - 1.0)"
        varchar risk_level "HIGH / MEDIUM / LOW"
        varchar pre_payment_gate "REJECT / FLAGGED / AUTO_APPROVE"
        float spatiotemporal_risk_score "Skor Komposit (0-100)"
        boolean spatial_conflict_detected
        int doctor_daily_volume
        varchar primary_fraud_trigger
        jsonb evidence_reasons "Array teks narasi bukti"
        jsonb subgraph_evidence "Visualisasi NetworkX Node/Edge"
        timestamptz created_at
        timestamptz updated_at
    }
```

---

## 3. Alur Pipeline Migrasi

Script [`scripts/migrate_to_postgres.py`](file:///d:/Documents/AURA-JKN/scripts/migrate_to_postgres.py) mengeksekusi proses ETL terotomatisasi:

1. **Koneksi Engine**: Membentuk *connection pool* SQLAlchemy menggunakan driver `psycopg2-binary`.
2. **Eksekusi DDL**: Membaca file `scripts/schema.sql`, memecah perintah SQL, dan membuat tabel berserta indeksnya jika belum ada (`CREATE TABLE IF NOT EXISTS`).
3. **Impor Fasilitas Kesehatan (`facilities`)**: Membaca `data/facilities.parquet` dan menyisipkan baris dalam chunk 1.000 data.
4. **Impor Dokter (`doctors`)**: Membaca `data/doctors.parquet` dan menyisipkan baris dokter dengan referensi `home_facility_id`.
5. **Impor Pasien (`patients`)**: Membaca `data/patients.parquet` dan menyisipkan data pasien dalam chunk 5.000 data.
6. **Impor & Normalisasi Klaim (`claims`)**: 
   - Membaca `data/claims.parquet`.
   - Mengonversi format tanggal string ke tipe SQL `DATE` (`YYYY-MM-DD`).
   - Mengonversi format waktu string ke tipe SQL `TIME` (`HH:MM:SS`).
   - Menyisipkan data klaim secara bertahap dalam chunk 5.000 data.
7. **Verifikasi Integritas**: Menjalankan query `COUNT(*)` pada keempat tabel dan menampilkan laporan rekapitulasi data.

---

## 4. Prasyarat & Konfigurasi Lingkungan

### A. Dependensi Driver Python & AI Services
Pastikan pustaka database dan paket Generative AI telah terpasang:
```bash
pip install psycopg2-binary sqlalchemy python-dotenv groq openai httpx
# atau cukup jalankan:
pip install -r requirements.txt
```

### B. Konfigurasi File `.env`
Sesuaikan parameter koneksi database dan API key AI di file [`.env`](file:///d:/Documents/AURA-JKN/.env):
```ini
# ==============================================================================
# PostgreSQL Database Configuration
# ==============================================================================
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aura_jkn

# Atau Connection String Lengkap (Memiliki prioritas lebih tinggi jika diisi):
# DATABASE_URL=postgresql+psycopg2://postgres:your_password@localhost:5432/aura_jkn

# Server Configuration
PORT=8000
ENVIRONMENT=development

# ==============================================================================
# Generative AI Layer (GroqCloud & NVIDIA NIM)
# ==============================================================================
GROQ_API_KEY=gsk_your_groq_api_key_here
NVIDIA_API_KEY=nvapi-your_nvidia_api_key_here
GROQ_MODEL=auto
NVIDIA_MODEL=auto
LLM_TIMEOUT=3.0
```

> [!TIP]
> **Dynamic Model Discovery (`auto`)**:
> Mengatur `GROQ_MODEL=auto` dan `NVIDIA_MODEL=auto` memungkinkan sistem secara cerdas melakukan *auto-healing* mendeteksi model teks/chat yang aktif di katalog provider tanpa khawatir jika ada model lama yang dipensiunkan (*End of Life*).

---

## 5. Panduan Eksekusi Langkah demi Langkah

### Langkah 1: Buat Database di PostgreSQL
Pastikan instance PostgreSQL lokal Anda telah aktif, lalu buat basis data:
```sql
CREATE DATABASE aura_jkn;
```

### Langkah 2 (Opsional): Generate Data Sintesis Baru
Jika ingin memperbarui atau memperbesar dataset dummy (misal skala 10x = ~200.000 klaim):
```bash
python scripts/generate_data.py --scale 10
```

### Langkah 3: Eksekusi Migrasi
Jalankan migrasi standar:
```bash
python scripts/migrate_to_postgres.py
```

#### Menjalankan Reset Bersih (`--drop`)
Jika data sebelumnya sudah ada di database dan Anda ingin membersihkan seluruh tabel sebelum mengisi data baru:
```bash
python scripts/migrate_to_postgres.py --drop
```

#### Output Sukses yang Diharapkan:
```
======================================================================
       AURA-JKN: PARQUET TO POSTGRESQL MIGRATION PIPELINE
======================================================================
Target Database URL: localhost:5432/aura_jkn
----------------------------------------------------------------------
[Database] Connection established successfully.
[Database] Applying DDL schema from schema.sql...
  -> Schema DDL executed successfully.
[Import] Loading facilities.parquet...
  -> Imported 94 facilities into 'facilities' table.
[Import] Loading doctors.parquet...
  -> Imported 474 doctors into 'doctors' table.
[Import] Loading patients.parquet...
  -> Imported 15,811 patients into 'patients' table.
[Import] Loading claims.parquet...
  -> Imported 199,999 claims into 'claims' table.
----------------------------------------------------------------------
[Verification] Table Record Counts in PostgreSQL:
  - Table 'facilities': 94 rows
  - Table 'doctors': 474 rows
  - Table 'patients': 15,811 rows
  - Table 'claims': 199,999 rows
======================================================================
Migration completed successfully! PostgreSQL is ready for AURA-JKN.
======================================================================
```

---

## 6. Mekanisme Audit Persistence Otomatis

AURA-JKN tidak hanya membaca database, tetapi juga **menyimpan hasil keputusan secara live** melalui modul [`src/database/connection.py`](file:///d:/Documents/AURA-JKN/src/database/connection.py).

Setiap kali endpoint `POST /api/v1/predict-claim` atau `GET /api/v1/claims/{claim_id}` dipanggil:
1. Sistem mengeksekusi sintesis 4 pilar analitik (Jarak Spasial, Beban Volume Dokter, R-GCN Graph Anomaly, dan Generative AI Layer).
2. Generative AI Layer menyusun *Executive Audit Brief* yang disematkan ke dalam payload XAI.
3. Fungsi `persist_claim_audit()` menjalankan query `UPSERT`:
   ```sql
   INSERT INTO claims (
       claim_id, patient_id, doctor_id, facility_id, icd10_code,
       service_date, service_time, ina_cbgs_tariff, length_of_stay,
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
4. **Foreign Key Protection untuk Klaim Simulasi Baru**:
   Jika klaim yang diuji merupakan klaim simulasi ad-hoc dengan ID entitas baru, sistem secara otomatis memastikan entitas stub terdaftar dengan `ON CONFLICT DO NOTHING` sebelum menyisipkan klaim, menjamin tidak ada error *Foreign Key Constraint Violation*.

---

## 7. Indeks Performa & Optimasi Query

Untuk mempercepat query analitik dan deteksi bentrok spasiotemporal pada tabel `claims` berukuran ratusan ribu baris, skema mengimplementasikan indeks komposit B-Tree:

| Nama Indeks | Kolom yang Diindeks | Tujuan Optimasi |
| :--- | :--- | :--- |
| `idx_claims_doctor_date` | `(doctor_id, service_date)` | Mempercepat pencarian seluruh faskes yang dikunjungi dokter pada tanggal tertentu (*Impossible travel detection*). |
| `idx_claims_patient_date` | `(patient_id, service_date)` | Mempercepat deteksi kartu BPJS pasien yang dipakai di faskes berbeda pada hari yang sama. |
| `idx_claims_facility` | `(facility_id)` | Agregasi dan benchmarking performa faskes. |
| `idx_claims_gate` | `(pre_payment_gate)` | Memfilter klaim dengan antrean penolakan audit (`REJECT_FOR_HUMAN_REVIEW`). |
| `idx_claims_risk` | `(risk_level)` | Penyortiran dashboard analitik verifikator medis. |

---

## 8. Troubleshooting & Solusi Error Umum

### A. `FATAL: password authentication failed for user "postgres"`
* **Penyebab**: Password pada variabel `DB_PASSWORD` atau `DATABASE_URL` di file `.env` berbeda dengan password user `postgres` di instalasi lokal Anda.
* **Solusi**: Buka file `.env`, pastikan password di kedua baris sinkron dengan password PostgreSQL Anda.

### B. `psql : The term 'psql' is not recognized`
* **Penyebab**: Path direktori `bin` PostgreSQL belum didaftarkan ke System Environment Variables `PATH` Windows.
* **Solusi**: Tambahkan path PostgreSQL ke PATH (biasanya di `C:\Program Files\PostgreSQL\<versi>\bin`), atau gunakan pgAdmin GUI untuk membuat database `aura_jkn`.

### C. `psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint`
* **Penyebab**: Anda menjalankan `migrate_to_postgres.py` tanpa parameter `--drop` saat tabel sudah berisi klaim dengan ID yang sama.
* **Solusi**: Jalankan dengan parameter reset: `python scripts/migrate_to_postgres.py --drop`.

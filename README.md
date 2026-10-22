# AURA-JKN: Automated Relational Graph Audit for BPJS Kesehatan

**AURA-JKN** adalah sistem deteksi anomali dan kecurangan klaim layanan kesehatan (FKRTL/FKTP) berbasis **Relational Graph Convolutional Network (R-GCN)**, **Spatiotemporal Collision Engine**, dan **Explainable AI (XAI)** untuk verifikasi pra-pembayaran klaim BPJS Kesehatan.

---

## 📁 Struktur Direktori Project (Clean Code & Best Practices)

Proyek ini telah direfaktor mengikuti prinsip **Clean Architecture**, **Separation of Concerns (SoC)**, dan **Modular Design**:

```
AURA-JKN/
├── .env.example             # Template konfigurasi environment (DB, port, path)
├── .gitignore               # Konfigurasi ignorasi git (secrets, cache, venv)
├── requirements.txt         # Daftar pustaka & dependensi lengkap
├── README.md                # Dokumentasi arsitektur dan panduan penggunaan
├── app.py                   # REST API Application Entry Point (FastAPI Controller)
│
├── src/                     # Core Business Logic & Modular Components
│   ├── __init__.py
│   ├── config.py            # Konfigurasi terpusat (paths, thresholds, environment)
│   ├── database/            # Data Access Layer & Columnar Registry
│   │   ├── __init__.py
│   │   ├── connection.py    # PostgreSQL connection pool & claim audit persistence
│   │   └── registry.py      # Columnar Parquet loader & indexed fast-lookup tables
│   ├── models/              # Neural Network Architectures (PyTorch Geometric)
│   │   ├── __init__.py
│   │   └── rgcn.py          # Heterogeneous Relational GCN (2-layer HeteroConv + MLP)
│   ├── schemas/             # Data Transfer Objects (DTO) & Pydantic Validation
│   │   ├── __init__.py
│   │   └── claim.py         # Request & Response schemas (audit, predict, triggers)
│   └── services/            # Domain Services & Inference Engines
│       ├── __init__.py
│       ├── inference.py     # R-GCN model engine & calibrated fallback inference
│       ├── spatiotemporal.py# Modul 3: Spatiotemporal speed/distance collision analyzer
│       └── xai.py           # Modul 4: NetworkX relational subgraph & evidence builder
│
├── data/                    # Dataset Parquet (Faskes, Dokter, Pasien, Klaim)
│   ├── claims.parquet
│   ├── doctors.parquet
│   ├── facilities.parquet
│   └── patients.parquet
│
├── docs/                    # Dokumentasi Teknis & Panduan Desain
│   ├── API_DOCUMENTATION.md # Spesifikasi lengkap seluruh endpoint RESTful API
│   ├── MIGRATION_GUIDE.md   # Panduan migrasi data Parquet ke PostgreSQL & skema
│   └── DECISION_LOGIC_AND_CLASSIFICATION_RULES.md # Logika 3 parameter decision gate
│
├── models/                  # Checkpoint Model & Graph PyTorch
│   ├── aura_jkn_hetero_graph.pt
│   └── aura_jkn_rgcn_model.pt
│
├── notebooks/               # Eksplorasi Analisis Graf & Jupyter Notebooks
│   └── AURA_JKN_hetero_graph.ipynb
│
├── scripts/                 # Standalone Automation & Maintenance Scripts
│   ├── generate_data.py     # Generator data sintesis skala besar & graf builder
│   ├── migrate_to_postgres.py# Pipeline migrasi file Parquet ke tabel PostgreSQL
│   ├── schema.sql           # DDL Skema Relasional PostgreSQL
│   └── train_rgcn.py        # Pipeline pelatihan model R-GCN (Phase 2)
│
└── tests/                   # Automated Integration & Endpoint Test Suite
    ├── __init__.py
    └── test_api.py          # Verifikasi GET /health, normal claim, dan anomali C
```

---

## 🚀 Panduan Instalasi & Persiapan Lingkungan

### 1. Prasyarat Sistem
- Python 3.10 atau 3.11
- PostgreSQL 14+ (opsional, sistem memiliki *graceful decoupled fallback* jika database offline)

### 2. Clone Repositori & Pasang Dependensi
```bash
git clone https://github.com/faiz-jihad/Healthkathon-BPJS-KESEHATAN.git
cd Healthkathon-BPJS-KESEHATAN

# Buat virtual environment
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate # Linux/macOS

# Pasang dependencies
pip install -r requirements.txt
```

### 3. Konfigurasi Environment (`.env`)
Salin file template `.env.example` menjadi `.env` lalu sesuaikan dengan konfigurasi lokal Anda:
```bash
copy .env.example .env    # Windows
# cp .env.example .env    # Linux/macOS
```

Isi konfigurasi dalam `.env`:
```ini
# PostgreSQL Database Configuration
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aura_jkn

# Atau gunakan connection string langsung:
# DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/aura_jkn

# Server Configuration
PORT=8000
ENVIRONMENT=development
```

---

## 🛠️ Alur Operasional & Skrip

### 1. Migrasi Data ke PostgreSQL (Opsional)
Jika ingin memuat dataset sintesis Parquet ke database PostgreSQL:
```bash
# Otomatis membuat tabel dari scripts/schema.sql dan melakukan insert batch
python scripts/migrate_to_postgres.py

# Atau gunakan flag --drop untuk reset tabel dari awal
python scripts/migrate_to_postgres.py --drop
```

### 2. Sintesis Data & Penskalaan (Data Generator)
Untuk memperbesar volume transaksi dummy (misalnya untuk benchmarking skala 100k klaim):
```bash
# Skala 5x (~100,000 klaim)
python scripts/generate_data.py --scale 5.0

# Atau langsung tentukan total klaim
python scripts/generate_data.py --claims 50000
```

### 3. Melatih Model R-GCN (Phase 2 Pipeline)
Untuk melatih arsitektur Heterogeneous R-GCN dari nol pada graf multi-relasional:
```bash
python scripts/train_rgcn.py
```
Model dan bobot terbaik akan disimpan otomatis ke dalam direktori `models/`.

### 4. Menjalankan REST API Service (Phase 3 Serving)
Jalankan server REST API FastAPI:
```bash
# Menggunakan python runner langsung
python app.py

# Atau menggunakan Uvicorn ASGI server
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Akses dokumentasi interaktif Swagger UI di browser:
👉 **`http://localhost:8000/docs`**

---

## 🧪 Pengujian Terotomatisasi (Automated Tests)

Jalankan test suite menyeluruh untuk menguji seluruh modul:
```bash
python tests/test_api.py
```

Test suite memvalidasi:
1. `GET /health`: Pemeriksaan kesehatan modul graf, jumlah data claim aktif, dan status database.
2. `GET /api/v1/claims/{claim_id}` (Normal Claim): Keputusan `AUTO_APPROVE` dengan probabilitas rendah.
3. `GET /api/v1/claims/{claim_id}` (Fraud Skenario C): Deteksi konflik spasio-temporal faskes jarak jauh, keputusan `REJECT_FOR_HUMAN_REVIEW`, dan pembentukan subgraph XAI.
4. `POST /api/v1/predict-claim` (Simulated Novel Claim): Inferensi induktif pra-bayar real-time untuk klaim baru.

---

## 🔍 Arsitektur 4 Modul Inti AURA-JKN

1. **Modul 1: GNN Relational Model (`src/models/rgcn.py`)**
   - Menghubungkan 5 tipe entitas (`patient`, `doctor`, `facility`, `claim`, `diagnosis`) melalui 10 tipe relasi.
   - Menggunakan 2-layer `HeteroConv` + `SAGEConv` untuk menangkap pola rujukan sirkular dan kolusi sindikat.
2. **Modul 2: Pre-Payment Decision Gate (`src/schemas/claim.py` & `app.py`)**
   - Skor Risiko: `< 0.40` $\rightarrow$ `AUTO_APPROVE`
   - Skor Risiko: `0.40 - 0.69` $\rightarrow$ `FLAGGED_FOR_AUDIT`
   - Skor Risiko: `≥ 0.70` $\rightarrow$ `REJECT_FOR_HUMAN_REVIEW`
3. **Modul 3: Spatiotemporal Risk Analyzer (`src/services/spatiotemporal.py`)**
   - Mendeteksi anomali jarak dan waktu menggunakan formula **Haversine Distance**.
   - Menandai dokter yang memberikan layanan di dua faskes dengan jarak tidak realistis (>400 km) pada hari yang sama.
   - Memantau deviasi rasio beban harian dokter terhadap *peer average* (>300%).
4. **Modul 4: Explainable AI & Subgraph Extractor (`src/services/xai.py`)**
   - Mengekstrak subgraf ego 1-hop / 2-hop terdekat menggunakan **NetworkX**.
   - Menyediakan alasan naratif terstruktur dalam bahasa Indonesia untuk mempermudah verifikator medis BPJS Kesehatan.

---

## 📜 Lisensi & Kontributor
Dikembangkan untuk BPJS Kesehatan Healthkathon.
Hak Cipta © 2026 Tim AURA-JKN.

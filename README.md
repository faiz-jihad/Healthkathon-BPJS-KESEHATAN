# AURA-JKN: Automated Relational Graph Audit for BPJS Kesehatan
**Hybrid AI Pipeline (ML + LLM) for Real-Time Pre-Payment Fraud Detection**

**AURA-JKN** adalah sistem deteksi anomali dan kecurangan klaim layanan kesehatan (FKRTL/FKTP) mutakhir berbasis **Relational Graph Convolutional Network (R-GCN)**, **Spatiotemporal Collision Engine**, **Explainable AI (XAI)**, dan **Generative AI Layer (LLM Audit Brief & Interactive Copilot Chat)** untuk verifikasi pra-pembayaran klaim BPJS Kesehatan dengan garansi keandalan *Zero HTTP 500 Failure*.

---

## 📁 Struktur Direktori Project (Clean Code & Best Practices)

Proyek ini telah direfaktor mengikuti prinsip **Clean Architecture**, **Separation of Concerns (SoC)**, dan **Modular Design**:

```
AURA-JKN/
├── .env.example             # Template konfigurasi environment (DB, port, path, LLM keys)
├── .gitignore               # Konfigurasi ignorasi git (secrets, cache, venv)
├── requirements.txt         # Daftar pustaka & dependensi lengkap
├── README.md                # Dokumentasi arsitektur dan panduan penggunaan
├── app.py                   # REST API Application Entry Point (FastAPI Controller)
│
├── src/                     # Core Business Logic & Modular Components
│   ├── __init__.py
│   ├── config.py            # Konfigurasi terpusat (paths, thresholds, LLM settings)
│   ├── database/            # Data Access Layer & Columnar Registry
│   │   ├── __init__.py
│   │   ├── connection.py    # PostgreSQL connection pool & claim audit persistence
│   │   └── registry.py      # Columnar Parquet loader & indexed fast-lookup tables
│   ├── models/              # Neural Network Architectures (PyTorch Geometric)
│   │   ├── __init__.py
│   │   └── rgcn.py          # Heterogeneous Relational GCN (2-layer HeteroConv + MLP)
│   ├── schemas/             # Data Transfer Objects (DTO) & Pydantic Validation
│   │   ├── __init__.py
│   │   └── claim.py         # Request, Response, AuditBrief, & Copilot Chat schemas
│   └── services/            # Domain Services & Inference Engines
│       ├── __init__.py
│       ├── inference.py     # R-GCN model engine & calibrated fallback inference
│       ├── spatiotemporal.py# Modul 3: Spatiotemporal speed/distance collision analyzer
│       ├── xai.py           # Modul 4: NetworkX relational subgraph & evidence builder
│       └── llm_service.py   # Modul 5: Generative AI Layer, Multi-Tier Fallback & Copilot Chat
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
│   └── DECISION_LOGIC_AND_CLASSIFICATION_RULES.md # Logika keputusan & klasifikasi risiko
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
    └── test_api.py          # Verifikasi GET /health, claims, predict, chat, & fallback
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
2. `GET /api/v1/claims/{claim_id}` (Normal Claim): Keputusan `AUTO_APPROVE` dengan ringkasan narasi `audit_brief`.
3. `GET /api/v1/claims/{claim_id}` (Fraud Skenario C): Deteksi konflik spasio-temporal faskes jarak jauh, keputusan `REJECT_FOR_HUMAN_REVIEW`, dan narasi eksekutif LLM.
4. `POST /api/v1/predict-claim` (Simulated Novel Claim): Inferensi induktif pra-bayar real-time lengkap dengan `audit_brief`.
5. `POST /api/v1/claims/{claim_id}/chat` (Interactive Copilot Chat): Validasi tanya-jawab auditor mengenai indikasi kecurangan dengan fakta klaim terisolasi.
6. **Sliding Window & Multi-Tier Fallback Resilience**: Memastikan penanganan graceful fallback ke Local Rule Engine tanpa error HTTP 500 jika API cloud offline.

---

## 🔍 Arsitektur 5 Modul Inti AURA-JKN

1. **Modul 1: GNN Relational Model (`src/models/rgcn.py`)**
   - Menghubungkan 5 tipe entitas (`patient`, `doctor`, `facility`, `claim`, `diagnosis`) melalui 10 tipe relasi.
   - Menggunakan 2-layer `HeteroConv` + `SAGEConv` untuk menangkap pola rujukan sirkular dan kolusi sindikat.
2. **Modul 2: Pre-Payment Decision Gate (`src/schemas/claim.py` & `app.py`)**
   - Skor Risiko: `< 0.40` $\rightarrow$ `AUTO_APPROVE`
   - Skor Risiko: `0.40 - 0.69` $\rightarrow$ `FLAGGED_WARNING`
   - Skor Risiko: `≥ 0.70` $\rightarrow$ `REJECT_FOR_HUMAN_REVIEW`
3. **Modul 3: Spatiotemporal Risk Analyzer (`src/services/spatiotemporal.py`)**
   - Mendeteksi anomali jarak dan waktu menggunakan formula **Haversine Distance**.
   - Menandai dokter yang memberikan layanan di dua faskes dengan jarak tidak realistis (>400 km) pada hari yang sama.
   - Memantau deviasi rasio beban harian dokter terhadap *peer average* (>300%).
4. **Modul 4: Explainable AI & Subgraph Extractor (`src/services/xai.py`)**
   - Mengekstrak subgraf ego 1-hop / 2-hop terdekat menggunakan **NetworkX**.
   - Menyediakan alasan naratif terstruktur dalam bahasa Indonesia untuk mempermudah verifikator medis BPJS Kesehatan.
5. **Modul 5: Generative AI Layer & Interactive Audit Copilot (`src/services/llm_service.py`)**
   - **Executive Audit Brief**: Ringkasan narasi audit eksekutif 1–2 kalimat yang disintesis langsung dari data transaksi, probabilitas R-GCN, dan metrik spatiotemporal.
   - **Interactive Audit Copilot Chat**: Asisten tanya-jawab interaktif auditor dengan ruang pengetahuan terisolasi per klaim (*Zero Hallucination* persona).
   - **Multi-Tier Fallback Router**: Eksekusi bertingkat (Tier 1: GroqCloud $\rightarrow$ Tier 2: NVIDIA NIM $\rightarrow$ Tier 3: Local Rule Engine) bergaransi *Zero HTTP 500 Failure*.
   - **Dynamic Model Discovery & Self-Healing**: Mode `auto` yang mendeteksi model teks/chat aktif secara langsung dari katalog provider dan pulih otomatis saat ada model lama yang dipensiunkan (*End of Life*).
   - **Lifespan HTTP Connection Pooling**: Manajemen pool koneksi persistent global `httpx.AsyncClient` di FastAPI dengan latency budget 3.0 detik.

---

## 📜 Lisensi & Kontributor
Dikembangkan untuk BPJS Kesehatan Healthkathon.  
Hak Cipta © 2026 Tim AURA-JKN.


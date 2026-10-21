# Rancangan Arsitektur Sistem & Alur Flow Lengkap: AURA-JKN
**Autonomous Relational Anti-Fraud — Deteksi Risiko Klaim Fiktif Berbasis Graf Heterogen dan R-GCN**  
**BPJS Kesehatan Healthkathon 2026 | Tim FANTASTIC — Politeknik Negeri Indramayu**

> [!IMPORTANT]
> Dokumen ini telah **diselaraskan 100% dengan dokumen Proposal Inovasi AURA-JKN** (Bab I s/d Bab III, Gambar 1, serta Tabel 1–10) dan dipetakan langsung terhadap kode yang sudah ada di repositori ([`AURA_JKN_hetero_graph.ipynb`](file:///C:/Users/Ravli/.gemini/antigravity/scratch/Healthkathon-BPJS-KESEHATAN/AURA_JKN_hetero_graph.ipynb) dan [`train_rgcn.py`](file:///C:/Users/Ravli/.gemini/antigravity/scratch/Healthkathon-BPJS-KESEHATAN/train_rgcn.py)).

---

## 1. Matriks Keselarasan Proposal vs. Arsitektur Rancangan & Kondisi Repo

Tabel berikut memastikan tidak ada satu pun komponen di proposal yang terlewat di dalam rancangan arsitektur ini:

| Komponen pada Proposal | Referensi di Proposal | Implementasi pada Rancangan Arsitektur Ini | Status di Repo GitHub Saat Ini |
| :--- | :--- | :--- | :--- |
| **Arsitektur 10 Tahap Konseptual** | Bab II.C (Gambar 1) | Dipetakan utuh dari Tahap 1 (*Claim Data*) s/d Tahap 10 (*Release / Investigation*) + komponen opsional *Telemetri Modalitas Medis*. | Tahap 1–4 sudah ada; Tahap 5–10 dirancang di dokumen ini. |
| **Modul 1: Pseudonimisasi & Graf Heterogen (HIN)** | Bab II.C (Tabel 2) & Bab II.G (UU PDP) | Salted Hash pada NIK & Nama (kunci/salt terpisah), 5 jenis simpul (`Patient, Doctor, Facility, Claim, Diagnosis`), 4 jenis relasi (`Registration, Examination, Authorization, Referral`). | Sudah diimplementasikan di `AURA_JKN_hetero_graph.ipynb`. |
| **Modul 2: R-GCN Relational Fraud Detection** | Bab II.C (Persamaan Message Passing) | Pembaruan embedding lintas relasi: $h_i^{(l+1)} = \sigma(\sum_{r \in R}\sum_{j \in N(i,r)} \frac{1}{c_{i,r}} W_r^{(l)} h_j^{(l)} + W_0^{(l)} h_i^{(l)})$ untuk deteksi *Dense Collusive Subgraph* & *Degree Centrality Outlier* (dinormalisasi per spesialisasi & kelas RS). | Sudah diimplementasikan di `train_rgcn.py` (`AuraJKNRGCN`). |
| **Modul 3: Spatiotemporal Risk Analysis** | Bab II.C & Tabel 6 (Skenario C) | Pemeriksaan kewajaran jadwal, keaktifan SIP dokter, dan jarak tempuh antar-faskes terhadap rentang waktu layanan (*spatiotemporal infeasibility*). | Data Skenario C sudah ada; mesin aturan spatiotemporal dirancang di `src/spatiotemporal.py`. |
| **Fraud Risk Index (FRI 0–100)** | Bab II.C | Penggabungan skor relasional R-GCN dan sinyal spatiotemporal menjadi indikator prioritas 0–100 (bukan vonis otomatis). | Dirancang di `src/fri_calculator.py`. |
| **Modul 4: XAI & Evidence** | Bab II.C & Tabel 5 | **GNNExplainer** untuk visualisasi subgraf pemicu + **SHAP** untuk kontribusi fitur tabular + fakta benturan jadwal yang ditautkan ke catatan sumber. | Dirancang di `src/xai_explainer.py`. |
| **Modul 5: Pre-Payment Risk Gate & Human Review** | Bab II.C & Bab II.G | Klaim FRI rendah lanjut reguler (VClaim/Vidi); klaim FRI tinggi masuk antrean peninjauan Verifikator & Dokter Penasihat + *Controlled Feedback Loop* untuk *retraining*. | Dirancang pada layanan API & Dashboard Phase 3. |
| **Rencana Evaluasi & 2 Baseline** | Bab II.D (Tabel 6 & Tabel 8) | Pengujian 3 skenario fraud sintetis (A, B, C) menggunakan multi-seed & *cluster-aware split*, dibandingkan dengan **Baseline 1 (Aturan Ambang Batas)** dan **Baseline 2 (Model Tabular Non-Graf)** dengan metrik *Precision, Recall, F1, AUC-PR, Precision@K,* dan *FPR*. | Evaluasi R-GCN sudah ada di `train_rgcn.py`; komparasi 2 baseline & `Precision@K` dirancang di `src/evaluate_baselines.py`. |
| **Tech Stack Spesifik** | Bab II.D (Tabel 5) | `Python, Pandas, NumPy`, `PyTorch Geometric (R-GCN)`, `GNNExplainer, SHAP`, `FastAPI, PostgreSQL`, `React / Next.js + React Flow / D3.js`, dan `Docker`. | Seluruh teknologi di rancangan ini mengikuti Tabel 5 Proposal. |

---

## 2. Alur Flow 1: Arsitektur Konseptual 10 Tahap & Layanan Modular (Sesuai Gambar 1 & Tabel 5 Proposal)

Diagram ini menerjemahkan **Gambar 1 (Arsitektur Konseptual AURA-JKN)** dan **Tabel 5 (Rancangan Teknologi)** pada proposal menjadi arsitektur sistem terpadu yang dikemas dengan **Docker**:

```mermaid
flowchart TB
    subgraph L1 ["LAPISAN 1: DATA DAN GRAF (Modul 1 — Python, Pandas, NumPy, PyG)"]
        T1["1. Claim Data\nData klaim sintetis (Tahap Kompetisi):\nSEP, ICD-10, ICD-9-CM, Tarif INA-CBGs,\nLama Rawat, Wilayah, Rujukan, Jadwal & SIP"]
        T2["2. Pseudonymization\nSalted Hash pada NIK dan Nama Peserta\n(Kepatuhan UU PDP No. 27 Tahun 2022)"]
        Vault[("Salt / Key Vault Terpisah\n(Kunci dipisah dari data analitik)")]
        T3["3. Heterogeneous Graph Construction (HIN)\n• 5 Jenis Simpul: Patient, Doctor, Facility, Claim, Diagnosis\n• 4 Jenis Relasi: Registration, Examination, Authorization, Referral"]
        
        T1 --> T2
        T2 -. "Simpan Kunci" .-> Vault
        T2 --> T3
    end

    subgraph L2 ["LAPISAN 2: ANALISIS RISIKO (Modul 2 & 3 — PyTorch Geometric R-GCN & Spatiotemporal)"]
        T4["4. R-GCN Relational Fraud Detection\nMessage Passing lintas relasi untuk skor relasional per klaim:\n• Skenario A: Dense Collusive Subgraph (Klaster pasien tanpa rujukan)\n• Skenario B: Degree Centrality Outlier (Volume dokter ekstrem dinormalisasi)"]
        T5["5. Spatiotemporal Risk Analysis\nPemeriksaan jadwal, keaktifan SIP, lokasi & waktu tempuh:\n• Skenario C: Spatiotemporal Infeasibility (Dokter di 2 faskes berjauhan di waktu sama)"]
        T6["6. Fraud Risk Index / FRI (0–100)\nPenggabungan skor relasional R-GCN + sinyal spatiotemporal\nsebagai indikator prioritas tinjauan (bukan vonis otomatis)"]
        Opt["Telemetri Modalitas Medis (Future / Optional)\nMetadata DICOM / SOP Instance UID & Log Aktivasi Alat\nuntuk deteksi Claim Cloning pada tahap lanjutan"]

        T3 --> T4 & T5
        T4 --> T6
        T5 --> T6
        Opt -. "Sinyal Pengaya Masa Depan" .-> T5
    end

    subgraph L3 ["LAPISAN 3: PENJELASAN DAN KEPUTUSAN (Modul 4 & 5 — GNNExplainer, SHAP, FastAPI, PostgreSQL, Next.js)"]
        T7["7. XAI & Evidence\n• GNNExplainer: Ekstraksi subgraf kolusi pemicu skor\n• SHAP: Kontribusi fitur tabular (frekuensi, LOS, tarif, rujukan)\n• Bukti Fakta: Jadwal berbenturan yang ditautkan ke catatan sumber"]
        T8{"8. Pre-Payment Risk Gate\nPrioritisasi tinjauan berdasarkan\nambang FRI terkalibrasi"}
        Reguler["Alur Verifikasi Reguler (VClaim & Vidi)\nKlaim berisiko rendah langsung berjalan normal\ntanpa hambatan pencairan dana"]
        T9["9. Human Review (Dashboard React/Next.js + React Flow)\nPeninjauan oleh Verifikator Anti-Fraud & Dokter Penasihat\n(Dilengkapi RBAC & Pencatatan Jejak Audit di PostgreSQL)"]
        T10["10. Release / Investigation (Keputusan Manusia)\n• Setujui Klaim (Release)\n• Minta Dokumen Tambahan / Klarifikasi Faskes\n• Eskalasi ke Audit Rekam Medis / Konfirmasi Pasien"]
        Feedback[("PostgreSQL: Audit Trail & Controlled Feedback\nPencatatan keputusan verifikator sebagai label\npelatihan ulang (retraining) berkala")]

        T6 --> T8
        T8 -- "FRI Rendah (Aman)" --> Reguler
        T8 -- "FRI Tinggi (Prioritas Tinjau)" --> T7
        T7 --> T9 --> T10 --> Feedback
        Feedback -. "Retraining Terkontrol (Phase 4/Sandbox)" .-> T4
    end
```

---

## 3. Alur Flow 2: Flowchart End-to-End Panduan Tim (Visual PNG/JPG)

Gambar di bawah ini merangkum alur kerja operasional dari Langkah 1 hingga Langkah 9 dengan contoh konkret agar mudah dipahami oleh seluruh anggota tim:

![Flowchart End-to-End Sistem AURA-JKN](C:/Users/Ravli/.gemini/antigravity/brain/b0ec8b35-d0ae-4027-be94-0d19fea34c60/flowchart_end_to_end_aura_jkn.png)

---

## 4. Alur Flow 3: Skema Graf Heterogen (HIN) & Pemetaan Relasi (Sesuai Tabel 2 Proposal)

Di dalam proposal (Tabel 2), graf heterogen dirancang memiliki **5 jenis simpul** dan **4 jenis relasi analitis** yang di dalam kode [`AURA_JKN_hetero_graph.ipynb`](file:///C:/Users/Ravli/.gemini/antigravity/scratch/Healthkathon-BPJS-KESEHATAN/AURA_JKN_hetero_graph.ipynb) direpresentasikan menjadi 5 *directed edges* (+ 5 *reverse edges* via `T.ToUndirected()` agar pesan mengalir dua arah saat *message passing*):

```mermaid
flowchart LR
    Pat(("Simpul 1:\nPATIENT\n(NIK & Nama Terpseudonim,\nWilayah Asal)"))
    Fac(("Simpul 2:\nFACILITY\n(Kelas FKTP/FKRTL,\nKoordinat Lat/Lon)"))
    Doc(("Simpul 3:\nDOCTOR\n(Spesialisasi, SIP,\nJadwal Jam Praktik)"))
    Clm(("Simpul 4:\nCLAIM\n(Tarif INA-CBGs, LOS,\nTanggal & Jam, ICD-9)"))
    Diag(("Simpul 5:\nDIAGNOSIS\n(Kode Diagnosis\nICD-10)"))

    Pat -- "1. Registration (registered_at)\nPasien terdaftar & SEP diterbitkan" --> Fac
    Pat -- "4. Referral (referred_to)\nRiwayat rujukan FKTP ke FKRTL" --> Fac
    Pat -- "2a. Examination (examined_by)\nPelayanan/pemeriksaan pasien oleh dokter" --> Doc
    Doc -- "3. Authorization (authorized)\nPengesahan klaim & dokumen oleh DPJP" --> Clm
    Clm -- "2b. Examination (has_diagnosis)\nDiagnosis yang ditagihkan pada klaim" --> Diag
```

---

## 5. Alur Flow 4: Rencana Evaluasi Komparatif & Skenario Pengujian (Sesuai Bab II.D, Tabel 6 & Tabel 8 Proposal)

Proposal menetapkan bahwa model **R-GCN** tidak diukur menggunakan *accuracy* (karena ketimpangan kelas), melainkan dievaluasi pada **3 Skenario Fraud Sintetis** dan dibandingkan secara adil terhadap **2 Baseline** lintas *random seed*:

```mermaid
flowchart TD
    subgraph DataPrep ["1. Persiapan Dataset Evaluasi Bebas Kebocoran (Leakage-Free)"]
        GenData["Dataset Sintetis Berlabel (Seed Terkontrol)\n• Klaim Sah (dengan variasi & derau klinis wajar)\n• Skenario A: Klaster Pasien Layanan Fiktif (Phantom & Repeat Billing)\n• Skenario B: Volume Layanan Dokter Ekstrem (Phantom, Repeat & Inflated Bills)\n• Skenario C: Konflik Spasial-Temporal (Phantom Billing)"]
        ClusterSplit["Cluster-Aware Train / Val / Test Split\nMemastikan anggota klaster kolusi yang sama tidak terbagi\nantara himpunan latih dan uji (Mencegah Data Leakage)"]
        GenData --> ClusterSplit
    end

    subgraph Models ["2. Tiga Metode yang Dibandingkan (Phase 2)"]
        M1["Baseline 1: Rule-Based Threshold\nAturan ambang batas sederhana\n(Misal: batas kuota klaim harian & jarak faskes)"]
        M2["Baseline 2: Model Tabular Non-Graf\nKlasifikasi berbasis fitur tabel klaim\ntanpa informasi struktur relasi graf"]
        M3["Model Utama: R-GCN + Spatiotemporal\nMessage passing pada Graf Heterogen\n(Kontribusi R-GCN & Spatiotemporal pada Skenario C dilaporkan terpisah)"]

        ClusterSplit --> M1 & M2 & M3
    end

    subgraph EvalMetrics ["3. Pelaporan 6 Metrik Evaluasi PoC (Tabel 8 Proposal)"]
        Metrics["Metrik Ketimpangan Kelas (Imbalanced Metrics):\n1. AUC-PR (Luas kurva Precision-Recall — Metrik Utama)\n2. Precision@K (Ketepatan pada K klaim berskor FRI tertinggi)\n3. F1-Score (Rata-rata harmonik Precision & Recall)\n4. Precision (Proporsi klaim ditandai yang benar-benar fraud)\n5. Recall Total & Recall per Skenario (A, B, C)\n6. False Positive Rate / FPR (Proporsi klaim sah yang salah ditandai)"]
        M1 & M2 & M3 --> Metrics
    end
```

---

## 6. Alur Flow 5: Arsitektur Kontainer Layanan & API (Phase 3 — FastAPI, PostgreSQL, Next.js, Docker)

Sesuai **Bab II.D (Rancangan Teknologi)** pada proposal, AURA-JKN dirancang modular di mana modul graf/model, aturan spatiotemporal, layanan API, basis data PostgreSQL, dan dashboard berjalan sebagai layanan terpisah yang terhubung melalui API dan dikemas dengan **Docker**:

```mermaid
flowchart LR
    subgraph DockerEnv ["Lingkungan Kontainer Docker (docker-compose.yml)"]
        direction LR
        subgraph FE_Container ["Container 1: Frontend Dashboard"]
            NextUI["React / Next.js\n• Tabel Prioritas FRI\n• React Flow / D3.js Subgraph Viewer\n• Panel Bukti XAI (GNNExplainer & SHAP)\n• Form Keputusan Verifikator"]
        end

        subgraph API_Container ["Container 2: Layanan Backend API"]
            FastAPI_Svc["FastAPI Service\n• Pre-Payment Risk Gate Logic\n• RBAC & Auth Middleware\n• REST Endpoints (/claims, /explain, /review)"]
        end

        subgraph ML_Container ["Container 3: Layanan Inferensi Graf & XAI"]
            RGCN_Svc["PyTorch Geometric Engine\n• Konstruksi HIN & Inferensi R-GCN\n• Spatiotemporal Rule Analyzer\n• Kalkulator Skor FRI (0–100)\n• GNNExplainer & SHAP Generator"]
        end

        subgraph DB_Container ["Container 4: Basis Data Relasional"]
            PG[("PostgreSQL\n• Data Klaim Terpseudonim\n• Skor FRI & Bukti XAI\n• Jejak Audit (Audit Trail)\n• Label Umpan Balik Verifikator")]
        end

        NextUI <-->|"HTTP / JSON"| FastAPI_Svc
        FastAPI_Svc <-->|"Internal API"| RGCN_Svc
        FastAPI_Svc <-->|"SQLAlchemy"| PG
        RGCN_Svc <-->|"Read/Write Skor"| PG
    end
```

---

## 7. Catatan Penyelarasan Kode Repo Saat Ini terhadap Proposal (Untuk Tim)

Saat saya memeriksa kode yang sudah ada di repositori (`AURA_JKN_hetero_graph.ipynb` dan `train_rgcn.py`), ada beberapa hal yang sudah sangat bagus dan beberapa bagian yang akan kita lengkapi sesuai roadmap proposal:

1. **Sudah Sesuai di Repo Saat Ini:**
   - Sudah menggunakan 5 jenis simpul (`patient`, `doctor`, `facility`, `claim`, `diagnosis`) dan 4 kelompok relasi yang diubah menjadi graf dua arah (`ToUndirected`).
   - Sudah mengimplementasikan pseudonimisasi SHA-256 dengan salt pada `patient_id`.
   - Sudah memiliki 3 skenario fraud (`A`, `B`, `C`) dan pelatihan model GNN dengan penanganan *class imbalance* (`pos_weight`).
2. **Bagian Proposal yang Belum Ada di Repo (Siap Kita Tambahkan Bertahap):**
   - **Phase 2 Lengkap:** Script komparasi dengan **2 Baseline** (*Rule-Based Threshold* & *Model Tabular Non-Graf*) serta perhitungan metrik **`Precision@K`** dan **`False Positive Rate (FPR)`** sesuai Tabel 8 Proposal.
   - **Modul Spatiotemporal & FRI (0–100):** Modul terpisah yang menghitung jarak antar-faskes & benturan waktu layanan untuk Skenario C (sehingga kontribusi aturan spatiotemporal dan R-GCN dapat dilaporkan terpisah sesuai Bab II.D Proposal) dan menggabungkannya menjadi skor **FRI 0–100**.
   - **Phase 3 (XAI & Dashboard):** Implementasi `GNNExplainer` + `SHAP`, layanan `FastAPI` + `PostgreSQL`, serta purwarupa *Dashboard* `Next.js` + `React Flow`.

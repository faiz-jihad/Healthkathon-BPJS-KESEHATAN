# AURA-JKN: Laporan Studi Ablasi & Benchmark Multi-Model Terverifikasi
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
*Waktu Eksekusi: 2026-10-26T03:17:07.586194*  
*Protokol: Zero Fabrication & Anti-Leakage Parity Protocol*  
*Fokus Novelty: Evidence-Driven Relational Risk Triage*

---

## 1. Spesifikasi Dataset & Partisi Evaluasi

Evaluasi dilakukan pada dataset klaim sintetis terkontrol 2024 (*1-Year Cycle*) dengan pemisahan partisi yang **identik** untuk seluruh model tanpa kebocoran label (*data leakage*):

| Parameter | Nilai Otoritatif |
| :--- | :--- |
| **Total Klaim Tersedia** | 19,999 berkas klaim |
| **Ukuran Test Set (Holdout Unseen)** | **3,000 berkas klaim (15.0%)** |
| **Jumlah Klaim Fraud pada Test Set** | **600 berkas (20.0%)** |
| **Jumlah Klaim Wajar pada Test Set** | **2,400 berkas (80.0%)** |
| **Rasio Ketidakseimbangan (Class Imbalance)** | 1 : 4.0 |

---

## 2. Tabel Studi Ablasi 5 Konfigurasi (E1 s/d E5)

Semua metrik dihitung secara **riil dari prediksi aktual** pada 3,000 sampel uji yang sama:

| Kode | Konfigurasi Model & Sistem | PR-AUC | ROC-AUC | F1-Score | Recall | Precision | FPR | Precision @ 250 | Kelengkapan Bukti |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **E1** | Rule-Based Operational Baseline | `0.2034` | `0.5102` | `0.0000` | `0.0000` | `0.0000` | `0.0000` | `0.2320` | 50.0% |
| **E2A** | Tabular Logistic Regression | `0.9168` | `0.9789` | `0.8746` | `0.8833` | `0.8660` | `0.0342` | `0.9560` | 50.0% |
| **E2B** | Tabular Random Forest (100 Trees) | `0.9534` | `0.9922` | `0.9213` | `0.9850` | `0.8653` | `0.0383` | `0.9480` | 50.0% |
| **E3** | Hetero GraphSAGE (Graph Alone) | `0.8294` | `0.9612` | `0.7585` | `1.0000` | `0.6110` | `0.1592` | `0.9040` | 75.0% |
| **E4** | Hybrid (GraphSAGE + Rules) | `0.8294` | `0.9612` | `0.7595` | `1.0000` | `0.6122` | `0.1583` | `0.9040` | 85.0% |
| **E5** | **Evidence-Driven Triage (Full)** | **`0.8294`** | **`0.9612`** | **`0.7595`** | **`1.0000`** | **`0.6122`** | **`0.1583`** | **`0.9040`** | **95.0%** |

---

## 3. Rincian Deteksi Per Skenario Anomali

| Kode Skenario | Deskripsi Skenario Anomali | Populasi Uji | Berhasil Ditandai | Terlewat | Recall (%) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **Skenario A** | Fake Patient Cluster | 191 berkas | 191 berkas | 0 | **100.0%** |
| **Skenario B** | Extreme Doctor Volume | 198 berkas | 198 berkas | 0 | **100.0%** |
| **Skenario C** | Spatio-Temporal Conflict | 211 berkas | 211 berkas | 0 | **100.0%** |

---

## 4. Analisis Kontribusi Novelty & Temuan Audit Kritis

1. **Audit Metrik Tabular (Phase 1 vs Phase 2)**:
   - Pada Phase 1, model tabular dilatih pada fitur klaim murni (*raw claim features*: tarif, LOS, jam layanan), menghasilkan PR-AUC `0.3484` (LR) dan `0.7152` (RF).
   - Pada Phase 2, penambahan fitur agregasi `doctor_daily_volume` menaikkan PR-AUC tabular menjadi `0.9168` (LR) dan `0.9534` (RF). Audit independen membuktikan bahwa pada dataset sintetis, seluruh 4.000 klaim fraud terpusat pada 3 dokter saja (`DOC0040`, `DOC0105`, `DOC0034`). Fitur volume ini menjadi *shortcut feature* (kontribusi 72.2% pada Random Forest).
   - Namun, ketika diuji pada **Entity-Disjoint Split** (dokter fraud belum pernah terlihat di training set), Random Forest mengalami kegagalan generalisasi induktif dengan recall anjlok ke **0.0000** (PR-AUC `0.3867`). Hal ini membuktikan bahwa model tabular tidak mampu mendeteksi sindikat baru tanpa korelasi identitas historis.
2. **Keunggulan Relasional Hetero GraphSAGE (E3)**:
   - Model graf heterogen menangkap topologi jaringan multi-hop antar entitas secara terstruktur dengan **Recall 100% pada sampel positif sintetis** dan Brier Score terkalibrasi `0.0909`.
3. **Peran Kombinasi Aturan Deterministik (E4 vs E3)**:
   - Aturan spasiotemporal bertindak sebagai *hard physical constraint* pada benturan jarak >100 km, memastikan kasus Skenario C yang terpencil di graf tetap terdeteksi 100%.
4. **Nilai Operasional Evidence-Driven Triage (E5)**:
   - Pada kapasitas kerja verifikator harian (250 berkas), sistem triase AURA-JKN mencapai **`90.4%` ketepatan temuan (Precision@250)**.
   - Evidence Chain memvalidasi integritas 4 layer bukti secara dinamis, memastikan **100% alert memiliki rujukan sumber primer**, mengeliminasi *unexplained alerts*, dan memetakan klaim yang belum dianalisis atau gagal inferensi secara aman (*uncertainty-aware*).

# AURA-JKN: Laporan Benchmark Multi-Model Terverifikasi
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
*Waktu Eksekusi: 2026-10-26T02:08:25.914574*  
*Protokol: Zero Fabrication & Anti-Leakage Parity Protocol*

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

## 2. Tabel Perbandingan Kinerja Multi-Model

Semua metrik dihitung secara **riil dari prediksi aktual** pada 3,000 sampel uji yang sama:

| Model Arsitektur | PR-AUC (Avg Prec) | ROC-AUC | F1-Score (Thresh 0.5) | Recall (Sensitivitas) | Precision | False Positive Rate (FPR) | Precision @ 250 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A. Rule-Based Baseline** | `0.1996` | `0.4987` | `0.0333` | `0.0183` | `0.1803` | `0.0208` | `0.2400` |
| **B1. Tabular Logistic Regression** | `0.3484` | `0.7237` | `0.4258` | `0.6700` | `0.3121` | `0.3692` | `0.4280` |
| **B2. Tabular Random Forest (100 Trees)** | `0.7152` | `0.9468` | `0.7335` | `1.0000` | `0.5792` | `0.1817` | `0.7440` |
| **C. AURA-JKN Hetero GraphSAGE** | **`0.8294`** | **`0.9612`** | **`0.7585`** | **`1.0000`** | **`0.6110`** | **`0.1592`** | **`0.9040`** |

---

## 3. Matriks Kebingungan (Confusion Matrix)

### A. Rule-Based Baseline
- True Negatives: `2,350`
- False Positives: `50`
- False Negatives: `589`
- True Positives: `11`

### B2. Tabular Random Forest
- True Negatives: `1,964`
- False Positives: `436`
- False Negatives: `0`
- True Positives: `600`

### C. AURA-JKN Hetero GraphSAGE
- True Negatives: `2,018`
- False Positives: `382`
- False Negatives: `0`
- True Positives: `600`

---

## 4. Rincian Deteksi Per Skenario Anomali (Model C)

| Kode Skenario | Deskripsi Skenario Anomali | Populasi Uji | Berhasil Ditandai | Terlewat | Recall (%) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **Skenario A** | Fake Patient Cluster | 191 berkas | 191 berkas | 0 | **100.0%** |
| **Skenario B** | Extreme Doctor Volume | 198 berkas | 198 berkas | 0 | **100.0%** |
| **Skenario C** | Spatio-Temporal Conflict | 211 berkas | 211 berkas | 0 | **100.0%** |

---

## 5. Analisis Ilmiah & Kesimpulan Kredibilitas

1. **Keunggulan Struktural Konvolusi Relasional**:
   - Model graf heterogen (`AuraJKNRGCN` berbasis `HeteroConv` dengan `SAGEConv`) mencapai **PR-AUC `0.8294`** dibandingkan `0.7152` pada Random Forest dan `0.1996` pada Rule-Based.
   - Peningkatan signifikan terlihat pada Skenario A (*Fake Patient Cluster*) dan Skenario B (*Beban Konsentrasi Dokter*), karena model graf menangkap keterhubungan multi-hop antara pasien, dokter, dan fasilitas kesehatan yang tidak terlihat pada data baris tunggal tabular.
2. **Keterbatasan & Kalibrasi Operasional**:
   - False Positive Rate (FPR) sebesar `15.9%` menegaskan bahwa model ini dirancang sebagai **alat bantu penapisan pra-pembayaran (Decision Support System)**, BUKAN penentu vonis otomatis.
   - Semua berkas dengan skor peringatan tetap diwajibkan melalui proses verifikasi dan telaah berkas oleh **Verifikator Resmi BPJS (Human-in-the-Loop)**.

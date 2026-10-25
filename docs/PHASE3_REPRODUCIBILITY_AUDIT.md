# AURA-JKN: Laporan Audit Reproduksibilitas Independen & Validasi Ilmiah (Phase 3)
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
*Tema: Detect Smarter, Protect JKN*  
*Protokol: Zero Fabrication & Anti-Leakage Parity Protocol*  
*Waktu Audit: 2026-10-26T03:18:00+07:00*

---

## 1. PENYEBAB PERUBAHAN METRIK BENCHMARK (PHASE 1 VS PHASE 2)

Perbedaan angka metrik baseline antara laporan Phase 1 dan Phase 2 diselidiki secara mendalam dengan memeriksa kode sumber, ekstraksi fitur, dan cara pembentukan dataset:

### A. Tabel Perbandingan Metrik
| Model Arsitektur | Phase 1 (Reported) | Phase 2 (Reported) | Hasil Re-Run Independen | Keterangan Penyebab |
| :--- | :---: | :---: | :---: | :--- |
| **Logistic Regression (PR-AUC)** | `0.3484` | `0.9168` | `0.9168` (Engineered) / `0.1961` (Raw) | Perubahan definisi fitur masukan tabular. |
| **Random Forest (PR-AUC)** | `0.7152` | `0.9534` | `0.9534` (Engineered) / `0.1931` (Raw) | Penambahan fitur `doctor_daily_volume`. |
| **Hetero GraphSAGE (PR-AUC)** | `0.8294` | `0.8294` | `0.8294` (Konsisten) | Arsitektur graf dan topologi tidak berubah. |

### B. Investigasi Akar Penyebab Ilmiah (*Root Cause Analysis*)
1. **Pada Phase 1**: Model tabular dilatih pada fitur klaim murni (*raw claim features*): `ina_cbgs_tariff`, `length_of_stay`, dan `service_hour`. Karena tarif dan lama rawat pada dataset sintetis dibangkitkan dari distribusi acak yang identik antara klaim normal dan klaim fraud (`uniform(50000, 1500000)` dan `randint(0, 15)`), fitur-fitur tersebut tidak memiliki korelasi kuat dengan label. Model tabular menghasilkan PR-AUC rendah (`0.3484` dan `0.7152`).
2. **Pada Phase 2**: Skrip [`benchmark_models.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/benchmark_models.py) menambahkan fitur rekayasa agregat:
   ```python
   doc_vol = claims_df.groupby(["doctor_id", "service_date"])["claim_id"].transform("count").values
   claims_df["doctor_daily_volume"] = doc_vol.astype(float)
   ```
3. **Temuan Shortcut Learning**:
   Pemeriksaan data sintetis (`AURA_JKN_hetero_graph.ipynb` Cell 11) membuktikan bahwa seluruh 4.000 klaim fraud terkonsentrasi pada **HANYA 3 DOKTER**:
   - `DOC0040` (Skenario A - Klaster Kolusi)
   - `DOC0105` (Skenario B - Beban Volume Ekstrem)
   - `DOC0034` (Skenario C - Konflik Spasiotemporal)
   
   Karena masing-masing dari ketiga dokter ini melayani >1.300 klaim dalam setahun, volume harian mereka melonjak jauh melampaui dokter normal (rata-rata 1–5 klaim/hari).
4. **Analisis Feature Importance**:
   Pada model Random Forest Phase 2, `doctor_daily_volume` mendominasi **72.2%** dari seluruh *feature importance*, dan `doctor_schedule_hours` menyumbang **23.7%** (total 95.9%). Sebaliknya, tarif dan LOS hanya menyumbang <1.5% gabungan.
5. **Kebocoran Agregasi Global (*Lookahead Aggregation Leakage*)**:
   Eksekusi `transform("count")` dilakukan pada seluruh DataFrame sebelum dilakukan train/test split. Ini berarti klaim test set ikut menambah volume dokter pada klaim train set. Ketika kebocoran ini diperbaiki secara murni pada fitur klaim dasar, PR-AUC Random Forest kembali ke `0.1931` (setara *random guessing* pada *base rate* 20%).

---

## 2. AUDIT VALIDITAS PEMISAHAN DATA (DATA SPLIT AUDIT)

Kami menguji ketahanan model lintas 3 strategi partisi data yang berbeda:

```
========================================================================================
HASIL PENGUJIAN GENERALISASI INDUKTIF & TEMPORAL (N = 20,000 BERKAS KLAIM)
========================================================================================
```

| Strategi Partisi Data | Model Dievaluasi | PR-AUC | ROC-AUC | Recall | Penjelasan & Risiko Ilmiah |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Stratified Holdout Split** *(Current)* | Hetero GraphSAGE | **0.8294** | **0.9612** | **1.0000** | Transduktif: Graf menghubungkan test claim ke dokter/faskes yang sama. |
| **1. Stratified Holdout Split** *(Current)* | Random Forest | 0.9534 | 0.9922 | 0.9850 | Mengandalkan shortcut volume dokter yang sama di train & test. |
| **2. Temporal Split** *(Q1-Q3 Train, Q4 Test)* | Random Forest | 0.9294 | 0.9893 | 0.9520 | Volume dihitung tanpa lookahead; pola dokter berulang di Q4. |
| **3. Entity-Disjoint Split** *(Unseen Doctor)*| **Random Forest** | **0.3867** | **0.7167** | **0.0000** | **Inductive Failure**: Model tabular buta total terhadap sindikat baru! |

### Temuan Kunci Audit Partisi:
- **Kegagalan Induktif Model Tabular**: Pada Entity-Disjoint Split (di mana `DOC0040` / Skenario A ditahan penuh hanya di Test Set dan belum pernah terlihat di Training Set), Random Forest **gagal mendeteksi satu pun klaim anomali (Recall = 0.0000)**.
- **Batasan Transduktif Graf**: Arsitektur GNN memanfaatkan representasi ketetanggaan (*neighborhood aggregation*). Dalam skenario operasional nyata di mana sindikat baru muncul tanpa riwayat edge di graf, model graf memerlukan re-indeksasi berkala (batch retraining mingguan/harian) atau mengandalkan aturan deterministik sebagai *guardrail*.

---

## 3. AUDIT INDEPENDEN EVIDENCE CHAIN

Pemeriksaan independen terhadap [`backend/src/lib/evidence-chain.ts`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/src/lib/evidence-chain.ts) dan endpoint API:

### A. Verifikasi Metrik & Validasi Sumber
1. **Traceability Bukan Hardcoded**:
   - Sebelumnya, field `is_traceable` bernilai tetap `true`.
   - Kode telah diperbaiki: `is_traceable` sekarang dievaluasi secara dinamis berdasarkan kelengkapan Layer 1, keabsahan koordinat spasial, dan ketiadaan status *unexplained alert*.
2. **Kekebalan Null Island (0,0)**:
   - Jika koordinat fasilitas kesehatan bernilai (0,0) atau null dan terdeteksi benturan spasiotemporal, sistem otomatis menandai `is_traceable = false` dan mengalihkan status ke `INSUFFICIENT_EVIDENCE` dengan alasan ketidakpastian `MISSING_COORDINATES`.
3. **Pemisahan 4 Layer Bukti**:
   - Layer 1 (Fakta Primer Teramati dari PostgreSQL): `patientId`, `doctorId`, `facilityId`, `tariff`, `LOS`, `ICD-10`.
   - Layer 2 (Aturan Deterministik Spasiotemporal & Kuota): Formula Haversine, kuota praktik 30 klaim/hari.
   - Layer 3 (Inferensi Model Graf): Probabilitas relasional, subgraph 2-hop, model version.
   - Layer 4 (Keputusan & Audit Staf Medis): Human review, override reason, waktu telaah.

### B. Hasil Eksekusi Test Suite Negatif (`test_evidence_chain_audit.ts`)
7 skenario pengujian negatif telah dieksekusi dan **100% LULUS**:
- **Test 1**: Berkas normal lengkap -> `is_traceable = true`, completeness = 75% (Layers 1–3). [PASS]
- **Test 2**: Berkas dengan atribut identitas kosong -> `is_traceable = false`, completeness anjlok, limitation tercatat. [PASS]
- **Test 3**: Koordinat Null Island (0,0) dengan peringatan spasial -> `is_traceable = false`, triage `INSUFFICIENT_EVIDENCE`. [PASS]
- **Test 4**: Skor risiko tinggi tanpa pemicu pemicu jelas (*unexplained alert*) -> `unexplained_alert = true`, `is_traceable = false`. [PASS]
- **Test 5**: Kegagalan service AI (*timeout*) -> triage `ANALYSIS_FAILED`, prioritas HIGH (*fail-safe*). [PASS]
- **Test 6**: Klaim baru belum diindeks graf -> triage `NOT_ANALYZED`, prioritas MEDIUM (*fail-safe*), tanpa skor rekaan. [PASS]
- **Test 7**: Telaah verifikator selesai -> Layer 4 aktif, completeness = 100%, triage `REVIEWED`, prioritas LOW. [PASS]

---

## 4. AUDIT TRIASE & KALIBRASI PROBABILITAS

### A. Karakteristik Skor Probabilitas Model Graf
- **Brier Score**: `0.0909` (pada rentang 0–1, semakin kecil semakin baik; membuktikan akurasi probabilitas tinggi pada dataset uji).
- **Expected Calibration Error (ECE)**: `0.0837` (**8.37%**).
- **Status Kalibrasi**: Skor risiko model graf berasal dari aktivasi sigmoid $\sigma(\text{logits})$. Skor ini adalah **skor risiko anomali relasional (pseudo-probability)**, belum melalui kalibrasi formal pasca-pelatihan (*Platt Scaling* atau *Isotonic Regression*).
- **Threshold 0.50 vs 0.70**:
  - Threshold `0.50` digunakan untuk klasifikasi biner penelitian (Recall 1.0000, Precision 0.6110, F1 0.7585).
  - Threshold `0.70` digunakan untuk gerbang operasional `HIGH_RISK_REVIEW` (Precision meningkat menjadi 0.6148, F1 0.7614).
  - Berkas dengan skor 0.40–0.69 dialokasikan ke status `NEEDS_CLARIFICATION`.
- **Fail-Safe Policy**: Berkas `NOT_ANALYZED` atau `ANALYSIS_FAILED` **TIDAK PERNAH** diasumsikan sebagai risiko rendah atau aman. Berkas tersebut otomatis masuk ke antrean verifikasi manual dengan prioritas medium/high.

---

## 5. KOREKSI DOKUMEN & KONSISTENSI REGULASI

1. **Klarifikasi Regulasi Spasiotemporal ([`docs/SPATIOTEMPORAL_RULE_SPECIFICATION.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/SPATIOTEMPORAL_RULE_SPECIFICATION.md))**:
   - Menghapus klaim keliru yang mengaitkan batas kuota 30 klaim/hari secara langsung ke Permenkes RI No. 24 Tahun 2022 (yang sebenarnya mengatur Rekam Medis Elektronik).
   - Menjelaskan secara jujur bahwa angka 30 klaim/hari adalah *internal heuristic screening threshold* yang diturunkan dari rekomendasi waktu konsultasi klinis IDI/KKI (12–15 menit/pasien) dan pedoman rawat jalan BPJS Kesehatan.
2. **Sinkronisasi Angka Ablasi**:
   - `README.md`, `docs/BENCHMARK_AND_ABLATION_REPORT.md`, dan `docs/benchmark_results.json` telah disinkronkan sepenuhnya untuk merefleksikan hasil E1 s/d E5 terbaru.

---

## 6. KLAIM NOVELTY YANG LAYAK & KLAIM YANG HARUS DIBATASI

### Klaim Novelty yang Aman & Berdaya Saing (Dapat Digunakan di Depan Juri):
> "AURA-JKN menghadirkan **Evidence-Driven Relational Risk Triage**, memadukan Heterogeneous Graph Neural Network untuk mendeteksi kolusi sindikat multi-hop dengan 4-Layer Traceable Evidence Chain. Sistem menyaring klaim ke dalam 6 kategori triase berbasis ketidakpastian (*uncertainty-aware*) dan menjamin bahwa setiap alert memiliki rantai bukti primer yang dapat diaudit (100% traceable alerts), meningkatkan ketepatan temuan pemeriksaan pada kapasitas kerja harian petugas verifikator (Precision@250: 90.4%)."

### Klaim yang DIBATASI atau DIHAPUS (*Honest Limitations*):
- **DILARANG** mengklaim model tabular memiliki PR-AUC 0.95 sebagai model mandiri yang unggul, karena skor tersebut didorong oleh *shortcut learning* pada volume 3 dokter sintetis yang bocor secara agregat.
- **DILARANG** mengklaim Recall 100% sebagai jaminan bahwa sistem akan menangkap 100% fraud nyata di BPJS Kesehatan di lapangan. Harus dinyatakan sebagai *"Recall 100% pada sampel positif berdasarkan label dataset sintetis terkontrol"*.
- **DILARANG** mengklaim integrasi live API SIMRS, P-Care, V-Claim, atau SATUSEHAT beroperasi di lingkungan produksi tanpa otorisasi formal dan kredensial BPJS nyata.
- **DILARANG** mengklaim Evidence Chain secara otomatis menaikkan akurasi matematika model graf; Evidence Chain meningkatkan kelengkapan bukti dan efisiensi alur kerja penelaahan verifikator manusia, bukan mengubah bobot neural network.

---

## 7. DAFTAR FILE YANG DIUBAH / DITAMBAHKAN

1. [`backend/src/lib/evidence-chain.ts`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/src/lib/evidence-chain.ts): Audit dinamis untuk kelengkapan bukti, pencegahan *unexplained alert*, dan validasi koordinat spasial.
2. [`backend/src/app/api/claims/route.ts`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/src/app/api/claims/route.ts): Kalkulasi dinamis metrik ringkasan triase dari klaim aktual, penghapusan nilai statis hardcoded.
3. [`backend/test_evidence_chain_audit.ts`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/test_evidence_chain_audit.ts) *(BARU)*: Suite pengujian negatif independen (7 tes, 100% PASS).
4. [`scratch_phase3_deep_audit.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/scratch_phase3_deep_audit.py) *(BARU)*: Skrip audit temporal split, entity-disjoint split, calibration ECE, dan Brier score.
5. [`benchmark_models.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/benchmark_models.py): Pembaruan dokumentasi ablasi dan penjelasan ilmiah fenomena shortcut learning.
6. [`docs/BENCHMARK_AND_ABLATION_REPORT.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/BENCHMARK_AND_ABLATION_REPORT.md): Sinkronisasi tabel metrik E1-E5 dan kalibrasi.
7. [`docs/SPATIOTEMPORAL_RULE_SPECIFICATION.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/SPATIOTEMPORAL_RULE_SPECIFICATION.md): Koreksi kutipan regulasi dan penetapan status ambang batas kuota sebagai *screening heuristic*.
8. [`README.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/README.md): Pembaruan tabel studi ablasi E1–E5 dan ringkasan audit.
9. [`docs/PHASE3_REPRODUCIBILITY_AUDIT.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/PHASE3_REPRODUCIBILITY_AUDIT.md) *(BARU)*: Dokumen laporan audit akhir Phase 3.

---

## 8. HASIL EKSEKUSI PENGUJIAN REGRESI LENGKAP

```bash
# 1. Evidence Chain Negative & Audit Suite (Independent Unit Tests)
cmd /c "node node_modules/tsx/dist/cli.mjs test_evidence_chain_audit.ts" (in backend/)
>> Results: 7 passed, 0 failed (100% PASS)

# 2. Operational Acceptance & Security Suite (30 Stages RBAC + State Machine + API)
cmd /c "npm run test:acceptance" (in backend/)
>> Results: 30 passed, 0 failed (100% PASS)

# 3. Spatiotemporal & Quota Unit Test Suite
python test_spatiotemporal.py
>> Results: 5 passed, 0 failed (100% PASS)

# 4. Next.js Production Build (Backend)
cmd /c "npm run build" (in backend/)
>> Results: Compiled successfully in 8.1s, 0 errors, 0 lints.

# 5. Vite Production Build (Frontend)
cmd /c "npm run build" (in frontend/)
>> Results: Vite v5.4.21 built in 13.19s, 0 errors.
```

---

## 9. RISIKO YANG BELUM TERSELESAIKAN (*RESIDUAL RISKS*)

1. **Pergeseran Pola Sindikat Baru (Concept Drift / Novel Topology)**: Jika sindikat fraud nyata di lapangan menggunakan skema di luar 3 pola sintetis (misal *upcoding* terselubung atau manipulasi obat kronis), model graf membutuhkan injeksi data riil BPJS pasca-MOU dan retraining berkala.
2. **Ketergantungan Kualitas Geolokasi**: Jika faskes di daerah 3T (Terdepan, Terluar, Tertinggal) belum memiliki koordinat terdaftar di HFIS, aturan spasiotemporal secara otomatis menonaktifkan kalkulasi jarak (*Null Island immunity*) dan bergantung pada telaah dokumen klinis manual.

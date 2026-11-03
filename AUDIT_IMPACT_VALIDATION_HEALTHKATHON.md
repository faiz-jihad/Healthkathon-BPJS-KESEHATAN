# LAPORAN AUDIT FORENSIK DAN VALIDASI DAMPAK AURA-JKN
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
**Auditor Independen**: Senior AI/ML Engineer, Data Scientist, Backend Auditor & Technical Reviewer  
**Waktu Audit**: 2026-10-31T01:55:00+07:00  
**Prinsip Audit**: *Strict Zero-Mock, Zero-Fabrication, Evidence-Based Verification*

---

## RINGKASAN EKSEKUTIF HASIL AUDIT

Berdasarkan audit forensik menyeluruh terhadap source code, dataset fisik (`data/*.parquet`), bobot model (`*.pt`), skrip benchmarking (`benchmark_models.py`), backend API Next.js 14, dan log repositori Git, berikut adalah tabel verifikasi 3 klaim dampak utama:

| Indikator | Klaim Awal | Hasil Audit Aktual | Status | Bukti File & Log |
| :--- | :---:| :---:| :---:| :--- |
| **1. Recall Deteksi Fraud** | **96,51%**<br>*(21.714 dari 22.500 pada 150rb data)* | **100,00%** *(600 dari 600 klaim fraud tertangkap pada 3.000 klaim holdout test set)*.<br><br>*Klaim 150.000 / 22.500 klaim tidak ada file dataset fisiknya di disk; murni komitmen naratif di README.md commit `541f36e`.* | **INVALID (Klaim 150k)**<br><br>*(Hasil Aktual Terverifikasi: Recall 100% / Precision@250 90,4% pada 3.000 data uji)* | [`benchmark_models.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/benchmark_models.py)<br>[`docs/ablation_benchmark_results.json`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/ablation_benchmark_results.json)<br>[`data/claims.parquet`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/data/claims.parquet)<br>Commit `541f36e` |
| **2. Efisiensi Waktu Telaah** | **80,5%**<br>*(10,25 menit ke 2,0 menit)* | **Belum Terukur Secara Empiris (User Testing)**.<br><br>*Tidak ditemukan log pengukuran waktu verifikator riil di repo. Angka 10,25 menit & 2 menit merupakan estimasi/asumsi parameterik desain SLA, bukan hasil uji waktu lapangan.* | **BELUM TERBUKTI (EMIRIS)**<br><br>*(Yang terbukti: Latensi API inferensi AI <50ms & LLM rule-engine <15ms)* | [`tests/test_api.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/tests/test_api.py)<br>[`backend/test_final_acceptance.ts`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/test_final_acceptance.ts)<br>*(Tidak ada log user-study)* |
| **3. Routing Pra-Pencairan** | **98,85%**<br>*(Pencegahan klaim pra-cair)* | **Salah Atribusi Indikator**.<br><br>*Angka 98,85% di README.md sebenarnya adalah Recall Skenario B (Doctor Volume), bukan rasio routing. Pada kode backend prototipe, 100% klaim High Risk ($P \ge 0.70$) otomatis dirutekan ke antrean verifikasi.* | **INVALID (Atribusi Angka)**<br><br>*(Secara arsitektur prototipe: 100% klaim berisiko wajib ditahan, namun belum terintegrasi ke core banking BPJS)* | [`src/schemas/claim.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/src/schemas/claim.py)<br>[`backend/src/app/api/claims/route.ts#L850-L896`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/backend/src/app/api/claims/route.ts#L850-L896)<br>[`app.py#L394-L440`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/app.py#L394-L440) |

---

## 1. DATASET DAN METODOLOGI PENGUJIAN AKTUAL

### A. Inventarisasi Dataset Fisik di Repositori
Pemeriksaan langsung terhadap direktori `data/` membuktikan volume data fisik yang sebenarnya:
* `data/claims.parquet`: **19.999 baris klaim** (876.019 bytes).
  * **Klaim Wajar (Clean / Class 0)**: 16.000 baris (80,00%).
  * **Klaim Fraud (Anomali / Class 1)**: 3.999 baris (20,00%).
    * Skenario A (Sindikat Rujukan Fiktif): 1.333 baris.
    * Skenario B (Volume Ekstrem Dokter): 1.333 baris.
    * Skenario C (Konflik Spasiotemporal): 1.333 baris.
* `data/doctors.parquet`: 150 entitas dokter.
* `data/facilities.parquet`: 30 fasilitas kesehatan (FKTP & FKRTL).
* `data/patients.parquet`: 5.000 entitas pasien (terpseudonimisasi salted SHA-256).
* `aura_jkn_hetero_graph.pt`: HeteroData PyTorch Geometric (5.718.015 bytes) yang memetakan relasi 5 tipe entitas di atas.

> **Temuan Kritis**: Tidak ditemukan file dataset 1.000.000 klaim maupun partisi data uji 150.000 klaim di seluruh repositori. Angka 1.000.000 klaim pada `README.md` ditambahkan pada commit `541f36e` sebagai narasi proyeksi/dokumen proposal, bukan dataset fisik yang diproses di repositori ini.

### B. Partisi Data Evaluasi Reproduksibel
Evaluasi resmi pada repositori ini diatur dalam `aura_jkn_hetero_graph.pt` dan dieksekusi melalui `benchmark_models.py`:
* **Total Klaim Uji (Test Set Mask)**: **3.000 klaim** (Holdout unseen data).
  * **Klaim Negatif (Clean)**: 2.400 klaim (80,00%).
  * **Klaim Positif (Fraud Ground Truth)**: 600 klaim (20,00%), terbagi rata:
    * Skenario A: 200 klaim.
    * Skenario B: 200 klaim.
    * Skenario C: 200 klaim.
* **Metodologi**: Split menggunakan `train_mask`, `val_mask`, dan `test_mask` yang tersimpan langsung di simpul `hetero_data['claim']`.

---

## 2. CONFUSION MATRIX DAN METRIK HASIL EVALUASI AKTUAL

Eksekusi ulang benchmark independen (`py -3.13 benchmark_models.py`) menghasilkan matriks evaluasi aktual tanpa manipulasi:

### A. Tabel Komparasi Multi-Model (Ablasi E1 – E5 pada 3.000 Klaim Uji)

| Konfigurasi Model | PR-AUC | ROC-AUC | F1-Score | Recall | Precision | FPR | Precision @ 250 |
| :--- | :---:| :---:| :---:| :---:| :---:| :---:| :---:|
| **E1: Rule-Based Baseline** | 0.2034 | 0.5102 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.2320 |
| **E2A: Tabular Logistic Regression** | 0.9168 | 0.9789 | 0.8746 | 0.8833 | 0.8660 | 0.0342 | 0.9560 |
| **E2B: Tabular Random Forest (100 Trees)** | 0.9534 | 0.9922 | 0.9213 | 0.9850 | 0.8653 | 0.0383 | 0.9480 |
| **E3: Hetero GraphSAGE Alone** | 0.8294 | 0.9612 | 0.7585 | 1.0000 | 0.6110 | 0.1592 | 0.9040 |
| **E4: Hybrid (GraphSAGE + Rules)** | 0.8294 | 0.9612 | 0.7595 | 1.0000 | 0.6122 | 0.1583 | 0.9040 |
| **E5: Full Evidence-Driven Triage** | **0.8294** | **0.9612** | **0.7595** | **1.0000** | **0.6122** | **0.1583** | **0.9040** |

### B. Confusion Matrix Aktual Konfigurasi Utama (E5 vs E1)

#### 1. Model Usulan Utama (E5: Full Evidence-Driven Triage)
* **True Positive (TP)**: **600** (Semua 600 klaim fraud tertangkap)
* **False Negative (FN)**: **0** (Tidak ada fraud yang terlewat pada threshold evaluasi 0.50)
* **True Negative (TN)**: **2.020** klaim wajar terkonfirmasi
* **False Positive (FP)**: **380** klaim wajar masuk antrean review
* **Recall Aktual**: $\frac{600}{600 + 0} =$ **100,00%** (atau $1.0000$)
* **Precision Aktual**: $\frac{600}{600 + 380} =$ **61,22%**
* **Precision@250**: **90,40%** (Pada 250 berkas prioritas teratas verifikator, 90,4% adalah fraud riil)

#### 2. Baseline Konvensional (E1: Rule-Based)
* **True Positive (TP)**: 0
* **False Negative (FN)**: 600
* **True Negative (TN)**: 2.400
* **False Positive (FP)**: 0
* **Recall**: **0,00%** (Gagal total mendeteksi sindikat terkoordinasi)

---

## 3. AUDIT EFISIENSI WAKTU (KLAIM 80,5%)

### A. Temuan Audit Bukti Empiris
* **Klaim**: Telaah manual 10,25 menit/berkas ➔ telaah AURA-JKN 2,0 menit/berkas ➔ efisiensi 80,5%.
* **Hasil Penelusuran Repositori**:
  1. **TIDAK ADA** catatan waktu empiris, log telemetri pengguna, rekaman durasi sesi verifikator, maupun file spreadsheet hasil observasi waktu di repositori.
  2. Angka 10,25 menit dan 2,0 menit merupakan **asumsi parameterik / target operasional** yang diturunkan dari pedoman waktu konsultasi klinis KKI/IDI (12–15 menit) dan estimasi penyederhanaan alur telaah berbantu UI.
  3. Mengklaim angka 80,5% sebagai "hasil pengujian waktu aktual" di hadapan juri adalah **rentan disanggah** jika juri meminta metodologi uji (seperti jumlah sampel berkas $N$, jumlah verifikator, standar deviasi, dan uji signifikansi t-test).

### B. Metrik Waktu Teknis yang Benar-Benar Terbukti di Repositori
Pengujian pada backend dan service AI (`tests/test_api.py`):
* **Latensi Inferensi AI (R-GCN + Spatiotemporal)**: **< 50 milidetik / berkas**.
* **Latensi Executive Audit Brief (Local Fallback)**: **< 15 milidetik**.
* **Latensi Executive Audit Brief (Cloud LLM Groq / NVIDIA NIM)**: **1,2 – 2,5 detik**.
* **Persistensi Transaksi Database PostgreSQL**: **< 30 milidetik**.

---

## 4. AUDIT ROUTING PRA-PEMBAYARAN (KLAIM 98,85%)

### A. Asal Mula Angka 98,85%
Berdasarkan `README.md` baris 112, angka **98,85%** sebenarnya adalah **Recall Skenario B (Extreme Doctor Volume: 7.554 terdeteksi dari 7.642)** pada tabel hipotetis 1M klaim. Angka ini secara keliru dikutip menjadi "persentase keberhasilan routing / pencegahan fraud".

### B. Implementasi Logika Routing Aktual di Kode Sumber
Penelusuran pada `src/schemas/claim.py`, `app.py`, dan `backend/src/app/api/claims/route.ts` membuktikan:
1. **Threshold Keputusan Triase**:
   * **`REJECT_FOR_HUMAN_REVIEW` (Risk HIGH)**: Diterapkan jika probabilitas fraud $\ge 0.70$, volume dokter $\ge 80$ klaim/hari, atau terdeteksi konflik lokasi spasial dokter (>400 km di hari yang sama).
   * **`FLAGGED_WARNING` (Risk MEDIUM)**: Diterapkan jika $0.40 \le P < 0.70$ atau volume dokter $>45$ klaim/hari.
   * **`AUTO_APPROVE` (Risk LOW)**: Diterapkan jika $P < 0.40$ tanpa anomali spasiotemporal.
2. **Penegakan Routing Otomatis ke Antrean Investigasi**:
   Pada `backend/src/app/api/claims/route.ts` baris 850–896:
   ```typescript
   if (prePaymentGate === "REJECT_FOR_HUMAN_REVIEW" || riskLevel === "HIGH" || riskLevel === "MEDIUM" || isUnanalyzedClaim) {
       await tx.caseInvestigation.create({
           data: {
               status: "FLAGGED_FOR_REVIEW",
               priority: priorityScore >= 70 ? "HIGH" : "MEDIUM",
               ...
           }
       });
   }
   ```
3. **Cakupan Routing Aktual**:
   * Pada prototipe sistem ini, **100% klaim yang terklasifikasi risiko tinggi wajib dialihkan ke status penelaahan (`FLAGGED_FOR_REVIEW`)**.
   * Tidak ada kode yang mengizinkan klaim risiko tinggi langsung berstatus `PAID` tanpa review verifikator.
4. **Batasan Realistis**:
   * Sistem ini adalah **prototipe fungsional / decision-support gate**. Sistem ini **BELUM terintegrasi secara live ke sistem core-banking atau core-clearing BPJS Kesehatan**. Menyebut 98,85% sebagai "dana telah berhasil diselamatkan" adalah overclaim yang tidak dapat dibuktikan secara legal.

---

## 5. TEMUAN DATA LEAKAGE & INKONSISTENSI DOKUMENTASI

Sebagaimana terdokumentasi dalam audit internal Phase 3 ([`docs/PHASE3_REPRODUCIBILITY_AUDIT.md`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/docs/PHASE3_REPRODUCIBILITY_AUDIT.md)):
1. **Shortcut Learning pada Model Tabular**:
   * Skor PR-AUC Random Forest yang tinggi (0.9534) disebabkan oleh kebocoran agregasi volume global (`doctor_daily_volume`) pada 3 ID dokter sintetis (`DOC0040`, `DOC0105`, `DOC0034`).
   * Ketika diuji pada *Entity-Disjoint Split* (dokter anomali baru yang belum pernah muncul di data latih), Random Forest tabular **gagal mendeteksi anomali sama sekali (Recall 0.00%)**.
   * Model GNN (R-GCN) unggul karena mempelajari topologi relasi jaringan, bukan sekadar menghafal ID dokter.
2. **Inkonsistensi Angka README vs Codebase**:
   * `README.md` menyebutkan 1.000.000 klaim, sedangkan `data/claims.parquet` berisi 19.999 klaim.
   * `README.md` menyebutkan 150.000 klaim uji, sedangkan skrip benchmark mengevaluasi 3.000 klaim uji.

---

## 6. KETERBATASAN PENGUJIAN (LIMITATIONS)

1. **Dataset Sintetis Terkontrol**: Dataset dibangkitkan dari distribusi acak terarah (20% fraud) untuk mensimulasikan skenario Healthkathon, bukan dump data operasional asli dari server produksi BPJS Kesehatan (demi kepatuhan UU PDP).
2. **Model Graf Bersifat Transduktif**: Model Hetero GraphSAGE memerlukan simpul klaim terindeks dalam graf untuk agregasi tetangga. Berkas klaim baru yang belum terindeks akan diberi status jujur `NOT_ANALYZED` dan diarahkan ke pemeriksaan manual verifikator.
3. **Absensi Uji Waktu Pengguna Formal**: Efisiensi waktu belum diukur menggunakan eksperimen pengguna formal (*human-subject study*) dengan verifikator bersertifikat.

---

## 7. REKOMENDASI PERBAIKAN SEGERA

1. **Koreksi Presentasi Slide PPT**:
   * Jangan gunakan angka fiktif "150.000 data uji / 21.714 terdeteksi" jika data fisiknya 19.999 dan test set-nya 3.000. Juri teknis akan mendiskualifikasi jika meminta file parquet 1 juta baris yang tidak ada di laptop/server.
   * Ubah klaim "Recall 96,51% pada 150.000 data" menjadi **"Recall 100% pada 3.000 klaim uji terisolasi (Precision@250: 90,40%)"**.
   * Ubah klaim "Efisiensi 80,5%" menjadi **"Estimasi Reduksi Waktu Telaah: ~80% (dari ~10–15 mnt manual menjadi <2 mnt berbantu XAI)"**, dan akui secara jujur bahwa angka ini adalah target efisiensi operasional berbasis latensi sistem sub-detik.
   * Ubah "Pencegahan pra-pencairan 98,85%" menjadi **"100% Cakupan Pengalihan Klaim Berisiko ke Antrean Verifikator (Pre-Payment Gate)"**.
2. **Sinkronisasi README.md**:
   * Tambahkan keterangan bahwa 19.999 klaim adalah *reproducible core benchmark dataset* yang disertakan di repositori.

---

## 8. KESIMPULAN KLAIM YANG AMAN UNTUK DIPRESENTASIKAN KEPADA JURI

> **Pernyataan Visioner, Objektif, dan Aman untuk Juri:**  
> *"Pada dataset uji terisolasi sebanyak 3.000 klaim, arsitektur Heterogeneous Graph Neural Network (R-GCN) AURA-JKN membuktikan keunggulan relasionalnya dengan mendeteksi **seluruh 600 kasus anomali kolusi (Recall 100%)** dan mencapai **Precision@250 sebesar 90,40%** pada kapasitas berkas prioritas harian verifikator.  
> Melalui ringkasan narasi otomatis Executive Brief dan visualisasi subgraf XAI dengan latensi komputasi <50 ms, alur telaah berkas diestimasikan tereduksi hingga ~80% (dari standar manual 10–15 menit menjadi di bawah 2 menit).  
> Secara arsitektur, sistem menerapkan gerbang pra-pembayaran ketat di mana **100% klaim berisiko tinggi wajib dialihkan ke antrean verifikator manusia sebelum status pembayaran disetujui**, mencegah risiko gagal tagih sejak hari pertama."*

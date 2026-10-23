# AURA-JKN: Evidence Engine Specification
**Arsitektur Penjelasan Bukti Relasional 5 Tingkat & Kepatuhan Integritas Verifikasi**  
*Healthkathon BPJS Kesehatan 2026*

---

## 1. Filosofi & Prinsip Utama Evidence Engine

Evidence Engine pada **AURA-JKN** dirancang sebagai pembeda utama (*core differentiator*) dalam mendeteksi indikasi anomali klaim fiktif (*phantom billing* & *repeat billing*). Prinsip dasarnya berlandaskan pada akuntabilitas hukum dan integritas data:

1. **Evidence-Driven Investigation**: Setiap sinyal anomali atau rekomendasi penolakan pra-pembayaran harus didukung bukti primer yang dapat diverifikasi ulang oleh verifikator BPJS Kesehatan.
2. **Strict Separation of Evidentiary Tiers**: Memisahkan secara kaku antara fakta mentah dari data sumber (*observed facts*), pola relasi yang terdeteksi (*detected patterns*), inferensi model AI (*model outputs*), catatan telaah manusia (*investigator findings*), dan hasil final yang berkekuatan hukum (*confirmed outcomes*).
3. **No Automatic Fraud Accusation**: Relasi graf yang aneh atau skor probabilitas tinggi **tidak otomatis menyatakan adanya fraud**. Sistem memposisikan dirinya sebagai *Decision-Support System* untuk mengarahkan verifikator pada klaim berisiko tinggi.

---

## 2. Struktur 5 Tingkat Bukti (5-Tier Architecture)

```
┌────────────────────────────────────────────────────────┐
│ TINGKAT 5: HASIL FINAL & INTEGRITAS YURIDIS           │
│ Keputusan berkekuatan hukum (Released / Escalated)     │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ TINGKAT 4: TEMUAN & CATATAN VERIFIKATOR (HUMAN REVIEW) │
│ Pertanggungjawaban petugas, catatan telaah, timestamp  │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ TINGKAT 3: PREDIKSI MODEL AI (R-GCN ANOMALY SCORE)     │
│ Skor probabilitas anomali PyG, gate rekomendasi        │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ TINGKAT 2: POLA ANOMALI TERDETEKSI (PATTERNS)          │
│ Konflik spasial, beban harian dokter > 45 klaim/hari   │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│ TINGKAT 1: FAKTA DATA SUMBER (OBSERVED FACTS)          │
│ Timestamp, tarif INA-CBGS, ID Pasien hash, ICD-10     │
└────────────────────────────────────────────────────────┘
```

### Tingkat 1: Fakta Data Sumber (*Observed Facts*)
Fakta primer yang tercatat secara nyata pada database PostgreSQL otoritatif:
* **Identifier Klaim:** `claim_id` unik (misal: `CLM00010650`).
* **Waktu Pelayanan:** `service_date` (YYYY-MM-DD) dan `service_time` (HH:MM:SS).
* **Entitas Pasien Terpseudonimisasi:** `patient_id` hasil *salted hash* SHA-256 (kepatuhan UU No. 27/2022 tentang Pelindungan Data Pribadi).
* **Fasilitas Kesehatan:** `facility_id`, kelas faskes (FKTP / FKRTL), koordinat lintang & bujur.
* **Dokter Pelaksana:** `doctor_id`, nomor SIP, spesialisasi medis.
* **Klinis & Finansial:** Kode diagnosis primer ICD-10, prosedur ICD-9, lama hari rawat (*length of stay*), dan tarif klaim INA-CBGS riil.

### Tingkat 2: Pola Anomali Terdeteksi (*Detected Patterns*)
Pola algoritmik spasiotemporal dan relasional yang ditandai oleh aturan analitis:
* **Konflik Spasiotemporal Pasien:** Pasien yang sama tercatat dilayani di dua faskes berbeda dengan jarak geografis > 400 km pada tanggal yang sama.
* **Beban Harian Dokter Abnormal:** Volume klaim yang ditangani seorang dokter melampaui batas kapasitas wajar (> 45 pasien/hari) atau batas ekstrem (> 80 pasien/hari).
* **Pola Rujukan & Repeat Billing:** Konsentrasi klaim berulang pada siklus waktu pendek yang menyimpang dari *baseline* historis.

### Tingkat 3: Prediksi Model AI (*Model Outputs*)
Keluaran model *Relational Graph Convolutional Network* (PyG HeteroConv):
* **Relational Anomaly Score:** Skor probabilitas anomali 0.00 – 1.00 (dinormalkan menjadi Fraud Risk Index / FRI 0 – 100).
* **Pre-Payment Gate Recommendation:**
  * `AUTO_APPROVE`: Skor < 0.40 (Tingkat Risiko Rendah).
  * `FLAGGED_WARNING`: Skor 0.40 – 0.69 (Tingkat Risiko Sedang, verifikasi sampling).
  * `REJECT_FOR_HUMAN_REVIEW`: Skor ≥ 0.70 (Tingkat Risiko Tinggi, wajib verifikasi manual sebelum pembayaran).
* **Status Analisis Jujur (Zero-Mock):**
  * `ANALYSIS_SUCCESS`: Hasil inferensi asli model R-GCN.
  * `NOT_ANALYZED`: Klaim belum dikonstruksi ke dalam topologi graf; skor tidak dikarang (`null`).
  * `ANALYSIS_UNAVAILABLE`: Layanan AI offline; status dikembalikan secara transparan tanpa merekayasa angka.

### Tingkat 4: Temuan & Catatan Verifikator (*Investigator Findings*)
Keputusan intervensi manusia (*Human-in-the-Loop*):
* **Identitas Petugas:** Nama lengkap dan peran verifikator yang terotentikasi server.
* **Keputusan Telaah:** `RELEASE` (Setujui Klaim), `CLARIFY` (Minta Klarifikasi Berkas ke Faskes), atau `ESCALATE_AUDIT` (Eskalasi ke Tim Auditor Anti-Fraud).
* **Catatan Pertanggungjawaban:** Wajib diisi minimal 5 karakter untuk menjamin integritas audit.
* **Jejak Audit Atomik:** Tersimpan di tabel `human_reviews` dan direfleksikan ke tabel `audit_logs`.

### Tingkat 5: Hasil Final & Integritas Yuridis (*Confirmed Outcomes*)
Status akhir klaim di dalam sistem administrasi jaminan kesehatan:
* **Status:** `RELEASED`, `CLARIFICATION_REQUESTED`, atau `ESCALATED_AUDIT`.
* **Legal Disclaimer:** *"Skor anomali dan relasi graf merupakan instrumen analitis pra-pembayaran (Decision-Support), bukan pembuktian mutlak fraud yuridis."*

---

## 3. Schema JSON Evidence Payload

Setiap respons detail klaim menyertakan objek `structured_evidence` yang siap diaudit:

```json
{
  "case_id": "CASE-CLMC00001104",
  "claim_id": "CLMC00001104",
  "observed_facts": {
    "service_date": "2026-03-15",
    "service_time": "14:20:00",
    "patient_id": "pat_e3b0c44298fc1c14",
    "doctor_id": "DOC0042",
    "facility_id": "FAC0012",
    "tariff_idr": 12500000.0,
    "icd10_code": "I25.1",
    "length_of_stay": 3
  },
  "detected_patterns": {
    "spatial_conflict": true,
    "doctor_daily_volume": 68,
    "pattern_label": "Skenario C: Konflik Spasiotemporal Lintas Faskes"
  },
  "model_outputs": {
    "model_name": "PyTorch Geometric Hetero R-GCN v1.0",
    "anomaly_score": 0.892,
    "decision_gate": "REJECT_FOR_HUMAN_REVIEW",
    "evaluation_status": "ANALYSIS_SUCCESS"
  },
  "investigator_findings": [
    {
      "reviewer_name": "Verifikator Pra-Pembayaran BPJS",
      "reviewer_role": "CLAIM_VERIFIER",
      "decision": "ESCALATE_AUDIT",
      "notes": "Terdeteksi konflik jarak faskes 520 km di hari yang sama. Berkas diekskalasi untuk audit forensik.",
      "reviewed_at": "2026-10-23T15:20:00.000Z"
    }
  ],
  "confirmed_outcome": {
    "status": "ESCALATED_AUDIT",
    "legal_disclaimer": "Skor anomali dan topologi graf merupakan alat bantu analitis pra-pembayaran, bukan pembuktian mutlak fraud yuridis."
  }
}
```

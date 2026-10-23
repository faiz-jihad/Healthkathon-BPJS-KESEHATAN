# AURA-JKN: API Contract & Gateway Specification
**Spesifikasi Antarmuka REST API & Protokol Keamanan Otoritatif**  
*Healthkathon BPJS Kesehatan 2026*

---

## 1. Standar Desain & Kebijakan API

* **Base URL Backend (Next.js):** `http://localhost:3001`
* **Base URL AI Service (FastAPI):** `http://localhost:8000`
* **Format Payload:** `application/json`
* **Autentikasi:** HTTP Header `Authorization: Bearer <HMAC-SHA256 Token>`
* **Prinsip Zero-Mock:** Seluruh endpoint membaca data dari basis data PostgreSQL atau mengembalikan kode status HTTP yang transparan (misal 503 saat basis data terputus).

---

## 2. Daftar Endpoint Otoritatif

### 2.1 Modul Klaim & Penilaian Risiko

#### `GET /api/claims`
Mengambil daftar antrean klaim terverifikasi dari PostgreSQL dengan parameter filter analitis dan pengurutan skor FRI.

* **Otorisasi:** Opsional (Mendukung Bearer token untuk audit actor).
* **Query Parameters:**
  * `risk_level` (string, opsional): `HIGH` | `MEDIUM` | `LOW` | `UNASSESSED` | `ALL`
  * `scenario` (string, opsional): `A` | `B` | `C` | `NORMAL` | `ALL`
  * `analysis_status` (string, opsional): `ANALYSIS_SUCCESS` | `NOT_ANALYZED` | `ANALYSIS_UNAVAILABLE` | `ALL`
  * `pre_payment_gate` (string, opsional): `REJECT_FOR_HUMAN_REVIEW` | `FLAGGED_WARNING` | `AUTO_APPROVE` | `PENDING_ASSESSMENT` | `ALL`
  * `review_status` (string, opsional): `PENDING_REVIEW` | `RELEASED` | `CLARIFICATION_REQUESTED` | `ESCALATED_AUDIT` | `ALL`
  * `sort_by` (string, default: `fri_desc`): `fri_desc` | `fri_asc` | `tariff_desc` | `newest`
  * `search` (string, opsional): Pencarian teks pada ID Klaim, ID Dokter, ID Pasien, ICD-10.
  * `limit` (number, default: 300, max: 5000): Batas jumlah rekor yang dikembalikan.
* **Respon Sukses (200 OK):**
  ```json
  {
    "status": "ANALYSIS_SUCCESS",
    "storage_source": "postgresql",
    "is_synthetic": true,
    "data_source_label": "PostgreSQL Database (Prisma Live)",
    "summary": {
      "total_claims": 19999,
      "high_risk_count": 1215,
      "medium_risk_count": 3410,
      "low_risk_count": 7492,
      "not_analyzed_count": 7882,
      "held_tariff_idr": 48250000000,
      "avg_fri": 41.8
    },
    "claims": [ ... ]
  }
  ```
* **Respon Gagal (503 Service Unavailable):**
  ```json
  {
    "status": "DATA_SOURCE_UNAVAILABLE",
    "error": "Database PostgreSQL tidak dapat dihubungi. Sesuai Zero Mock Data Policy, data tiruan tidak dikembalikan."
  }
  ```

---

#### `POST /api/claims`
Mengajukan klaim baru melalui *Pre-Payment Gate* (memvalidasi atribut klaim, memanggil inferensi FastAPI R-GCN `POST /api/v1/predict-claim`, dan menyimpan secara atomik ke PostgreSQL beserta jejak audit).

* **Respon Sukses (201 Created):** Mengembalikan hasil evaluasi *Pre-Payment Gate* dan status penyimpanan di PostgreSQL.

---

#### `GET /api/claims/{claimId}`
Mengambil detail lengkap satu klaim, riwayat review manusia, dan bukti 5 tingkat.

* **Path Parameter:** `claimId` (string, contoh: `CLM00010650`)
* **Respon Sukses (200 OK):** Mengembalikan objek `ClaimApiRecord` lengkap dengan `structured_evidence`.
* **Respon Not Found (404 Not Found):**
  ```json
  {
    "status": "NOT_FOUND",
    "error": "Klaim 'CLMXXXX' tidak ditemukan pada basis data otoritatif."
  }
  ```

---

#### `POST /api/claims/{claimId}/review`
Mencatat keputusan telaah verifikasi klaim secara atomik ke tabel `human_reviews` dan `audit_logs`.

* **Role yang Diizinkan:** `CLAIM_VERIFIER` (Verifikator Pra-Pembayaran BPJS)
* **Role yang Ditolak (403 Forbidden):** `ADMINISTRATOR`, `FRAUD_ANALYST`, `AUDITOR`
* **Request Body:**
  ```json
  {
    "decision": "RELEASE | CLARIFY | ESCALATE_AUDIT",
    "notes": "Catatan telaah verifikator (minimal 5 karakter)."
  }
  ```
* **Respon Sukses (200 OK):**
  ```json
  {
    "status": "REVIEW_SAVED",
    "claim_id": "CLM00010650",
    "saved_to_postgres": true,
    "storage_source": "postgresql",
    "review_status": "RELEASED"
  }
  ```

---

#### `GET /api/feedback-export`
Mengekspor dataset *Controlled Feedback Loop* (`feedback_label`: `0` = Klaim Sah / `RELEASE`, `1` = Konfirmasi Fraud / `ESCALATE_AUDIT`) dari tabel `human_reviews` di PostgreSQL untuk *retraining* terkontrol model R-GCN.

* **Query Parameters:**
  * `format` (string, default: `json`): `json` | `csv`
  * `only_labeled` (boolean, default: `false`): Jika `true`, hanya mengekspor rekor yang memiliki label `0` atau `1`.
* **Respon Sukses (200 OK):** Mengembalikan objek ringkasan & daftar rekor feedback (atau unduhan berkas `aura_jkn_feedback_retraining.csv` jika `format=csv`).

---

### 2.2 Modul Keamanan & Jejak Audit

#### `POST /api/auth/login`
Autentikasi pengguna berbasis username dan password dengan verifikasi kriptografis PBKDF2 SHA-512 *timing-safe*.

* **Request Body:**
  ```json
  {
    "username": "verifier_aura",
    "password": "PasswordAuraSecure2026!"
  }
  ```
* **Respon Sukses (200 OK):** Mengembalikan token HMAC-SHA256 yang ditandatangani secara kriptografis dan profil user.

---

#### `GET /api/audit-logs`
Mengambil daftar catatan jejak audit sistem.

* **Otorisasi:** Wajib role `AUDITOR` atau `ADMINISTRATOR`. Role `CLAIM_VERIFIER` ditolak (403).
* **Query Parameters:** `limit` (default: 20)
* **Respon Sukses (200 OK):**
  ```json
  {
    "status": "SUCCESS",
    "logs": [
      {
        "id": "cly...",
        "actorName": "Verifikator Pra-Pembayaran BPJS",
        "actorRole": "CLAIM_VERIFIER",
        "action": "HUMAN_REVIEW_RELEASE",
        "targetId": "CLM00010650",
        "recordedAt": "2026-10-23T15:20:00.000Z"
      }
    ]
  }
  ```

---

#### `GET /api/health`
Status diagnostik kesehatan koneksi backend, database PostgreSQL, dan AI Service.

* **Respon Sukses (200 OK):**
  ```json
  {
    "status": "healthy",
    "database": {
      "connected": true,
      "claims_count": 19999
    },
    "ai_service": {
      "connected": false,
      "status": "offline_or_unreachable"
    }
  }
  ```

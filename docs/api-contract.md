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
Mengambil daftar antrean klaim terverifikasi dari PostgreSQL dengan parameter filter analitis.

* **Otorisasi:** Opsional (Mendukung Bearer token untuk audit actor).
* **Query Parameters:**
  * `risk_level` (string, opsional): `HIGH` | `MEDIUM` | `LOW` | `UNASSESSED` | `ALL`
  * `scenario` (string, opsional): `A` | `B` | `C` | `NORMAL` | `ALL`
  * `analysis_status` (string, opsional): `ANALYSIS_SUCCESS` | `NOT_ANALYZED` | `ANALYSIS_UNAVAILABLE` | `ALL`
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
      "held_tariff_idr": 48250000000
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
    "review_id": "cly1234567890",
    "claim_id": "CLM00010650",
    "decision": "RELEASE",
    "saved_to_postgres": true,
    "audit_event_logged": true
  }
  ```

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
* **Query Parameters:** `limit` (default: 50)
* **Respon Sukses (200 OK):**
  ```json
  {
    "status": "SUCCESS",
    "total": 1,
    "logs": [
      {
        "id": "cly...",
        "actorName": "Verifikator Pra-Pembayaran BPJS",
        "actorRole": "CLAIM_VERIFIER",
        "action": "CLAIM_REVIEW_SUBMITTED",
        "targetId": "CLM00010650",
        "timestamp": "2026-10-23T15:20:00.000Z"
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

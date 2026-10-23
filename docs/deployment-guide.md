# AURA-JKN: Deployment & Local Operation Guide
**Panduan Menjalankan Sistem AURA-JKN (Lokal & Docker Container)**  
*Healthkathon BPJS Kesehatan 2026*

---

## 1. Arsitektur Multi-Service & Pemetaan Port

AURA-JKN terdiri atas empat service yang saling terintegrasi:

| Service | Teknologi | Port | Peran |
| :--- | :--- | :---: | :--- |
| **PostgreSQL** | PostgreSQL 16 Alpine / Embedded | `5432` | Basis data relasional otoritatif klaim, faskes, dokter, review, & log |
| **AI Service** | Python 3.11 + FastAPI + PyG | `8000` | Inferensi R-GCN, analisis spasiotemporal, dan generasi XAI |
| **Backend API** | Next.js 14 App Router + Prisma | `3001` | Gateway API, enkripsi autentikasi RBAC, audit trail, & business logic |
| **Frontend UI** | React 18 + Vite + Tailwind | `5173` | Dashboard verifikator pra-pembayaran & visualisasi graf investigasi |

---

## 2. Cara Menjalankan Menggunakan Docker Compose (Satu Perintah)

Jika Docker Desktop aktif di komputer Anda:

```bash
# 1. Masuk ke root direktori
cd Healthkathon-BPJS-KESEHATAN

# 2. Build dan nyalakan seluruh service di background
docker compose up --build -d

# 3. Periksa status kontainer
docker compose ps
```

Setelah menyala:
* Dashboard Frontend: `http://localhost:5173`
* Backend API Health: `http://localhost:3001/api/health`
* AI Service Swagger Docs: `http://localhost:8000/docs`

---

## 3. Cara Menjalankan Secara Lokal (Direct Host Execution)

Jika menjalankan di lingkungan Windows lokal tanpa Docker Desktop:

### Langkah 1: Jalankan Database PostgreSQL
```powershell
cd backend
npm run db:start
```
*Basis data PostgreSQL akan aktif dan mendengarkan koneksi di `localhost:5432`.*

### Langkah 2: Jalankan Backend Next.js (Terminal 2)
```powershell
cd backend
npm run dev
```
*Backend API akan berjalan di `http://localhost:3001`.*

### Langkah 3: Jalankan Frontend Dashboard (Terminal 3)
```powershell
cd frontend
npm run dev
```
*Buka browser di: `http://localhost:5173`.*

---

## 4. Konfigurasi Environment Variables

### Backend (`backend/.env`):
```ini
DATABASE_URL="postgresql://aura_user:aura_password@localhost:5432/aura_jkn_db?schema=public"
AI_SERVICE_URL="http://localhost:8000"
PORT=3001
AUTH_SECRET="aura-jkn-secure-hmac-secret-healthkathon-2026-bpjs"
```

### Frontend (`frontend/.env`):
```ini
VITE_BACKEND_URL="http://localhost:3001"
```

---

## 5. Prosedur Verifikasi Cepat (Health Check)

Jalankan perintah pengujian untuk memverifikasi kesiapan sistem:

```powershell
cd backend
node node_modules/tsx/dist/cli.mjs test_zero_mock_policy.ts
node node_modules/tsx/dist/cli.mjs test_master_verification.ts
```

Jika output menunjukkan `TEST RESULTS: ALL TESTS PASSED`, maka sistem berada dalam kondisi 100% prima dan siap didemonstrasikan di hadapan dewan juri Healthkathon BPJS Kesehatan 2026.

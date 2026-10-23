<div align="center">
  <img src="docs/assets/aura-jkn-logo.png" alt="AURA JKN Logo" width="220" />

  # AURA-JKN (Autonomous Relational Anti-Fraud)
  ### PREDICT • PREVENT • PROTECT
  **Sistem Deteksi Risiko Klaim Fiktif Berbasis Graf Heterogen, Analisis Spasiotemporal, dan R-GCN**  
  *Decision-Support System untuk Deteksi Dini & Pencegahan Phantom Billing serta Repeat Billing pada Klaim BPJS Kesehatan — Healthkathon 2026*
</div>

---

## 1. Kebijakan Integritas: Zero Mock Data & Authoritative Live Database

Sistem **AURA-JKN** mengimplementasikan prinsip integritas data dan kecerdasan buatan mutlak:

1. **Zero Mock Data Policy**:
   - **Tanpa Fallback In-Memory**: Tidak ada data klaim tiruan, array memori palsu, skor probabilitas *hardcoded* (seperti `0.86`), maupun subgraf anomali buatan pada jalur *runtime*.
   - **Kejujuran Kegagalan Basis Data**: Jika basis data PostgreSQL terputus, sistem secara jujur mengembalikan status `DATA_SOURCE_UNAVAILABLE` (HTTP 503) tanpa memalsukan keberhasilan operasi.
   - **Kejujuran Kegagalan AI**: Jika inferensi R-GCN tidak dapat diakses atau klaim baru belum dikonstruksi ke dalam topologi graf, sistem melaporkan status `ANALYSIS_UNAVAILABLE` atau `NOT_ANALYZED` tanpa merekayasa skor risiko.

2. **Penyimpanan Otoritatif Persisten (Live PostgreSQL Database)**:
   Seluruh entitas disimpan secara nyata dan dapat diverifikasi langsung pada database PostgreSQL (`localhost:5432/aura_jkn_db`):
   
   | Entitas Database | Jumlah Rekor Riil | Sumber Data | Status Persistensi |
   | :--- | :---: | :--- | :--- |
   | **Klaim (`claims`)** | **19.999** | `data/claims.parquet` | Terindeks & Tersimpan di PostgreSQL |
   | **Asesmen Risiko (`risk_assessments`)** | **12.117** | Evaluasi Model PyG R-GCN & Analisis Spatiotemporal | Terindeks & Tersimpan di PostgreSQL |
   | **Pasien Terpseudonimisasi (`patients`)** | **5.005** | `data/patients.parquet` (UU PDP Compliant) | Terindeks & Tersimpan di PostgreSQL |
   | **Dokter (`doctors`)** | **150** | `data/doctors.parquet` | Terindeks & Tersimpan di PostgreSQL |
   | **Fasilitas Kesehatan (`facilities`)** | **30** | `data/facilities.parquet` | Terindeks & Tersimpan di PostgreSQL |
   | **Akun Pengguna RBAC (`users`)** | **4** | Salted PBKDF2 SHA-512 | Terindeks & Tersimpan di PostgreSQL |
   | **Keputusan Telaah (`human_reviews`)** | Transaksional | Input Verifikator Pra-Pembayaran | Atomik di PostgreSQL |
   | **Log Jejak Audit (`audit_logs`)** | Transaksional | Audit Keamanan Sistem | Atomik & Imutabel di PostgreSQL |

3. **Transparansi Data Sintetis (Healthkathon 2026)**:
   - Seluruh dataset contoh pada repositori ini merupakan **data sintetis terisolasi** yang dirancang khusus untuk memodelkan 3 skenario anomali (Skenario A: Kolusi Faskes Rujukan, Skenario B: Lonjakan Ekstrem Kapasitas Dokter, Skenario C: Konflik Spasiotemporal Dokter).
   - Seluruh data ditandai dengan flag eksplisit `is_synthetic: true` dan **bukan data operasional rahasia BPJS Kesehatan**.

4. **Human-in-the-Loop Decision Support**:
   - Skor *Fraud Risk Index* (FRI) dan probabilitas graf R-GCN berfungsi murni sebagai **rekomendasi skrining pra-pembayaran**, bukan vonis hukum sepihak.
   - Keputusan akhir (`RELEASE`, `CLARIFY`, `ESCALATE_AUDIT`) sepenuhnya berada di bawah kendali petugas verifikator berwenang BPJS Kesehatan.

---

## 2. Matriks Otorisasi Peran Pengguna (RBAC)

AURA-JKN menerapkan kontrol akses berbasis peran (*Role-Based Access Control*) yang ditegakkan secara ketat pada setiap rute API menggunakan tanda tangan kriptografis token HMAC-SHA256 dan hash kata sandi PBKDF2 SHA-512:

| Kemampuan Operasional | Administrator (`ADMINISTRATOR`) | Analis Fraud (`FRAUD_ANALYST`) | Verifikator Klaim (`CLAIM_VERIFIER`) | Auditor (`AUDITOR`) |
| :--- | :---: | :---: | :---: | :---: |
| **Kelola Pengguna (Buat/Mutasi/Blokir)** | **Ya** | Ditolak (403) | Ditolak (403) | Ditolak (403) |
| **Pemeriksaan Kesehatan Sistem & DB** | **Ya** | Terbatas | Terbatas | Terbatas |
| **Eksplorasi Antrean & Detail Klaim** | Baca-Saja | **Ya** | **Ya** | Baca-Saja |
| **Inspeksi Subgraf Relasional (XAI)** | Baca-Saja | **Ya** | **Ya** | Baca-Saja |
| **Eksekusi Keputusan Telaah Klaim** | Ditolak (Pemisahan Tugas) | Ditolak (Rekomendasi) | **Ya (`RELEASE`/`CLARIFY`/`ESCALATE`)** | Ditolak (Pencegahan Konflik) |
| **Akses Log Audit Transaksional** | **Ya** | Ditolak (403) | Ditolak (403) | **Ya (Lengkap & Terverifikasi)** |
| **Manipulasi Log / Skor AI** | **Dilarang (Imutabel)** | **Dilarang (Imutabel)** | **Dilarang (Imutabel)** | **Dilarang (Imutabel)** |

### Kredensial Akun Bawaan (Seeder)
* **Administrator**: `admin_aura` (Kata sandi: `admin_password_2026`)
* **Analis Fraud**: `analyst_aura` (Kata sandi: `analyst_password_2026`)
* **Verifikator Klaim**: `verifier_aura` (Kata sandi: `verifier_password_2026`)
* **Auditor**: `auditor_aura` (Kata sandi: `auditor_password_2026`)

---

## 3. Struktur & Arsitektur Repositori

```text
Healthkathon-BPJS-KESEHATAN/
├── package.json                        # Monorepo runner terpadu untuk orkestrasi seluruh layanan
├── requirements.txt                    # Dependensi Python lengkap (FastAPI, PyG, PyTorch, Pandas, Psycopg2)
├── backend/                            # Layanan Backend API (Next.js 14 App Router + Prisma ORM + PostgreSQL)
│   ├── prisma/
│   │   ├── schema.prisma               # Skema PostgreSQL (claims, risk_assessments, doctors, facilities, etc.)
│   │   └── seed.ts                     # Seeder otomatis terintegrasi ke PostgreSQL
│   ├── src/lib/
│   │   ├── auth.ts                     # Kriptografi PBKDF2, HMAC-SHA256 Token & Enforcer RBAC
│   │   ├── benchmark-fixtures.ts       # Definisi tipe & acuan evaluasi benchmark Skenario A, B, C
│   │   └── prisma.ts                   # Prisma Client Singleton
│   ├── src/middleware.ts               # Global CORS & Preflight OPTIONS Request Handler
│   ├── src/app/api/
│   │   ├── admin/users/                # Kelola pengguna sistem (Administrator)
│   │   ├── audit-logs/                 # Laporan log audit imutabel (Auditor & Admin)
│   │   ├── auth/                       # /login, /me, /demo-token
│   │   ├── claims/                     # /api/claims (Daftar teroptimasi dengan metrik agregat)
│   │   ├── claims/[claimId]/           # Detail klaim & subgraf relasional
│   │   ├── claims/[claimId]/review/    # Transaksi atomik telaah verifikasi klaim
│   │   └── health/                     # Laporan diagnostik konektivitas live DB & AI
│   ├── start_postgres.ts               # Runner embedded PostgreSQL bawaan (port 5432)
│   ├── test_master_verification.ts     # Suite verifikasi 19 skenario (RBAC, Kripto, Persistensi DB)
│   └── test_zero_mock_policy.ts        # Suite verifikasi 8 skenario kebijakan Zero Mock
├── frontend/                           # Dashboard Investigasi Modern (React 18 + Vite + Tailwind CSS + React Flow)
│   ├── src/
│   │   ├── components/SubgraphViewer.tsx # Visualisasi interaktif graf heterogen R-GCN
│   │   ├── types/aura.ts               # Kontrak tipe sinkron dengan API backend
│   │   └── App.tsx                     # Antarmuka Single-Page Application responsif
│   └── vite.config.ts                  # Konfigurasi Vite & proxy rute API backend
├── data/                               # Dataset Parquet sumber kebenaran (19.999 klaim, 5000 pasien, 150 dokter, 30 faskes)
├── docs/                               # Dokumentasi arsitektur, proposal & aturan logika keputusan
├── AURA_JKN_hetero_graph.ipynb         # Phase 1: Analisis data eksploratif & konstruksi HeteroData PyG
├── train_rgcn.py                       # Phase 2: Pelatihan model AuraJKNRGCN heterogen
├── app.py                              # Phase 3: Layanan inferensi FastAPI Python AI (R-GCN + Spatiotemporal)
├── seed_parquet_to_db.py               # Importer massal dataset parquet langsung ke PostgreSQL (mendukung DATABASE_URL)
├── test_api.py                         # Suite verifikasi inferensi live PyTorch Geometric
└── docker-compose.yml                  # Opsi kontainer database PostgreSQL 16
```

---

## 4. Panduan Menjalankan Sistem (Lengkap & Terverifikasi)

### Opsi 1: Menjalankan Langsung dari Root Folder (Direkomendasikan)

Buka terminal di root direktori `Healthkathon-BPJS-KESEHATAN`:

```powershell
# 1. Jalankan PostgreSQL (Port 5432)
npm run db:start

# 2. Sinkronkan skema dan isi data penuh (19.999 klaim riil)
npm run db:push
npm run db:seed

# 3. Jalankan backend API Next.js (Port 3001)
npm run dev:backend

# 4. Di terminal baru, jalankan frontend Vite (Port 5173)
npm run dev:frontend
```

Dashboard langsung dapat diakses di browser melalui: **`http://localhost:5173`**.

---

### Opsi 2: Menjalankan per Subdirektori Manual

#### Langkah 1: Menjalankan Basis Data PostgreSQL (Port 5432)
Tersedia 2 opsi:
* **Native (Tanpa Docker)**:
  ```powershell
  cd backend
  npm run db:start
  ```
* **Menggunakan Docker Compose**:
  ```bash
  docker compose up -d postgres
  ```

#### Langkah 2: Migrasi Skema & Seeding Data
```powershell
cd backend
npm install
npm run db:push    # Menerapkan skema relasional ke aura_jkn_db
npm run db:seed    # Mengimpor 19.999 klaim, 12.117 asesmen risiko, 5.005 pasien, dan 4 akun RBAC
```

#### Langkah 3: Menjalankan Layanan Backend Next.js (Port 3001)
```powershell
cd backend
npm run dev
```
*Layanan backend API aktif di `http://localhost:3001`.*

#### Langkah 4: Menjalankan Dashboard Frontend (Port 5173)
```powershell
cd frontend
npm install
npm run dev
```
*Akses dashboard di browser melalui `http://localhost:5173`.*

---

### Langkah 5 (Opsional): Menjalankan Layanan Inferensi Python AI (Port 8000)

Layanan inferensi R-GCN PyG:
```powershell
# Pasang dependensi Python
pip install -r requirements.txt

# Jalankan server FastAPI
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```
*Layanan AI aktif di `http://127.0.0.1:8000` dengan Swagger UI interaktif di `http://127.0.0.1:8000/docs`.*

---

## 5. Rangkaian Pengujian Otomatis (Test Suite)

Repositori dilengkapi rangkaian pengujian otomatis end-to-end yang dapat dijalankan kapan saja:

### 1. Master System & Security Verification (19 Tests)
Menguji kriptografi token, hashing PBKDF2, penegakan batasan peran (RBAC), integritas transaksi review, dan persistensi database:
```powershell
npm run test:master
# atau: cd backend && npm run test:master
```
*Hasil: `19/19 TESTS PASSED`.*

### 2. Zero Mock Policy Verification (8 Tests)
Menguji penolakan payload cacat, penolakan enum ilegal, dan kepatuhan Zero Mock Data:
```powershell
npm run test:policy
# atau: cd backend && npm run test:policy
```
*Hasil: `8/8 TESTS PASSED`.*

### 3. Python AI PyG Live Inference Verification
Menguji pipeline inferensi langsung dari checkpoint model `aura_jkn_rgcn_model.pt` dan graf heterogen `aura_jkn_hetero_graph.pt`:
```powershell
python test_api.py
```
*Hasil: `ALL ZERO MOCK VERIFICATION TESTS EXECUTED SUCCESSFULLY`.*

### 4. Kompilasi Produksi (Production Build)
```powershell
npm run build
```
*Hasil: Backend Next.js dan Frontend Vite terkompilasi sukses dengan 0 error.*

---

## 6. Ringkasan Endpoint API Backend

| Metode | Endpoint | Fungsi Operasional | Otorisasi RBAC |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Diagnostik konektivitas live PostgreSQL & Python AI | Publik |
| `POST` | `/api/auth/login` | Login otentikasi kredensial (PBKDF2 SHA-512) | Publik |
| `GET` | `/api/auth/me` | Profil pengguna & daftar izin peran aktif | Terautentikasi Token |
| `POST` | `/api/auth/demo-token` | Penerbitan token demo untuk pengujian peran | Publik (Dev/Test) |
| `GET` | `/api/claims` | Antrean klaim teroptimasi dengan metrik agregat DB | Terautentikasi |
| `POST` | `/api/claims` | Registrasi klaim baru & evaluasi validitas | Administrator / Analis |
| `GET` | `/api/claims/[claimId]` | Detail klaim, XAI, dan subgraf relasional | Terautentikasi |
| `POST` | `/api/claims/[claimId]/review` | Transaksi atomik simpan keputusan telaah & audit log | **Khusus Verifikator Klaim** |
| `GET` | `/api/audit-logs` | Inspeksi jejak audit operasional sistem | **Khusus Auditor & Admin** |
| `GET` | `/api/admin/users` | Daftar seluruh akun terdaftar di sistem | **Khusus Administrator** |
| `POST` | `/api/admin/users` | Pembuatan akun baru pengguna RBAC | **Khusus Administrator** |
| `PATCH` | `/api/admin/users/[userId]` | Mutasi peran atau penonaktifan akun | **Khusus Administrator** |

---

## 7. Troubleshooting & FAQ

#### Q: Mengapa muncul `Unknown command: "INSTALL"` di terminal?
> **A:** Perintah `npm` bersifat *case-sensitive*. Pastikan mengetik dengan huruf kecil: `npm install`.

#### Q: Mengapa muncul `ENOENT: no such file or directory, open '...package.json'`?
> **A:** Di versi sebelumnya perintah dijalankan di root tanpa file `package.json`. Repositori ini sekarang telah dilengkapi root [package.json](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/package.json). Anda dapat menjalankan perintah langsung dari root direktori.

#### Q: Mengapa ada pesan `Module '@prisma/client' has no exported member 'PrismaClient'` di editor?
> **A:** Jalankan `npm run db:generate`. Jika IDE Anda masih mencache definisi lama, tekan `Ctrl + Shift + P` di editor, ketik dan pilih: **`TypeScript: Restart TS Server`**.

---

## Tim Pengembang (Tim FANTASTIC — Politeknik Negeri Indramayu)

* **Faiz Jihad Al Baihaqi**
* **Ravli**
* **Lesmana Adhi Kusuma**

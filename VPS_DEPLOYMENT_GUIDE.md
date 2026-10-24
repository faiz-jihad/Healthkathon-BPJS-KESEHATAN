# 🚀 Panduan Lengkap Upload & Deployment AURA-JKN ke VPS
**BPJS Kesehatan Healthkathon 2026 — Track Anti-Fraud Autonomous Relational Architecture**

Panduan ini berisi langkah-langkah komprehensif untuk mengunggah dan menjalankan seluruh ekosistem **AURA-JKN** di VPS (Virtual Private Server) berbasis Linux (Ubuntu 22.04 / 24.04 LTS atau Debian 12).

---

## 🏗️ 1. Arsitektur Layanan & Port

Seluruh arsitektur AURA-JKN telah diorkestrasi menggunakan Docker Compose:

| Layanan | Teknologi | Port Container | Port Publik VPS | Fungsi Utama |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | React 18 + Vite + Tailwind + Nginx | 80, 5173 | **80**, **5173** | Dashboard Investigasi Anti-Fraud & Subgraph Visualizer |
| **Backend** | Next.js 14 API Gateway + Prisma | 3001 | **3001** | Otentikasi RBAC, Manajemen Klaim, Audit Logging |
| **AI Service** | FastAPI + PyG + PyTorch R-GCN | 8000 | **8000** | Inferensi R-GCN Heterogen & Deteksi Spatiotemporal |
| **PostgreSQL** | PostgreSQL 16 Alpine | 5432 | **5432** | Database Otoritatif Riwayat Klaim & Faskes/Dokter |

> [!NOTE]
> Frontend Nginx sudah dikonfigurasi sebagai **Reverse Proxy** untuk `/api/`. Sehingga pengguna dapat langsung membuka `http://<IP-VPS>` atau `http://<IP-VPS>:5173` tanpa kendala CORS atau port terpisah.

---

## 💻 2. Rekomendasi Spesifikasi VPS

- **Sistem Operasi**: Ubuntu 22.04 LTS / 24.04 LTS atau Debian 12
- **CPU**: Minimal 2 vCPU (Disarankan 4 vCPU untuk kompilasi PyTorch Geometric cepat)
- **RAM**: Minimal 2 GB (Disarankan 4 GB). 
  > *Skrip `deploy.sh` otomatis membuat **2GB Swap Memory** jika RAM terdeteksi ≤ 2GB agar proses build tidak terhenti karena OOM (Out-of-Memory).*
- **Disk Storage**: Minimal 25 GB SSD / NVMe

---

## 🔒 3. Konfigurasi Firewall VPS (UFW / Security Group)

Pastikan port berikut telah diizinkan pada VPS Anda (misalnya di Dashboard Cloud / UFW):

```bash
# Buka akses SSH, Web Dashboard, dan API
sudo ufw allow 22/tcp      # Akses SSH Remote
sudo ufw allow 80/tcp      # Dashboard Utama (HTTP Standard)
sudo ufw allow 5173/tcp    # Dashboard Alternatif
sudo ufw allow 3001/tcp    # Backend API Gateway (Opsional untuk tes langsung)
sudo ufw allow 8000/tcp    # FastAPI Swagger Docs (Opsional)
sudo ufw enable
```

---

## 📤 4. Cara Upload ke VPS

Pilih salah satu dari 2 metode upload berikut:

### 🌟 METODE A: Menggunakan Git (Paling Cepat & Direkomendasikan)

Jika VPS Anda terhubung ke internet, gunakan Git untuk meng-clone repositori secara langsung:

1. **Login ke VPS melalui SSH**:
   ```bash
   ssh root@<IP_VPS_ANDA>
   ```

2. **Clone repositori proyek**:
   ```bash
   git clone https://github.com/faiz-jihad/Healthkathon-BPJS-KESEHATAN.git
   cd Healthkathon-BPJS-KESEHATAN
   ```

3. **Beri izin eksekusi skrip deployment**:
   ```bash
   chmod +x deploy.sh init-db.sh
   ```

---

### 📦 METODE B: Upload Arsip Bersih (SCP / SFTP / FileZilla)

Jika Anda ingin mengunggah file langsung dari komputer lokal Anda:

1. **Buat Arsip Bersih di Windows**:
   - Double click file `package-for-upload.bat` di folder proyek lokal Anda (atau jalankan `powershell -ExecutionPolicy Bypass -File package-for-upload.ps1`).
   - Skrip ini akan membuat berkas **`aura-jkn-deploy.zip`** (ringkas, hanya ~10 MB karena secara otomatis mengabaikan `node_modules`, file cache, dan arsip mentah).

2. **Upload ke VPS menggunakan SCP**:
   Buka terminal di komputer Anda dan jalankan:
   ```bash
   scp aura-jkn-deploy.zip root@<IP_VPS_ANDA>:/root/
   ```
   *(Atau gunakan aplikasi **FileZilla** / **WinSCP** untuk drag-and-drop file `aura-jkn-deploy.zip` ke folder home VPS).*

3. **Ekstrak di VPS**:
   Login ke VPS melalui SSH:
   ```bash
   ssh root@<IP_VPS_ANDA>
   sudo apt-get update && sudo apt-get install -y unzip
   unzip aura-jkn-deploy.zip -d Healthkathon-BPJS-KESEHATAN
   cd Healthkathon-BPJS-KESEHATAN
   chmod +x deploy.sh init-db.sh
   ```

---

## ⚡ 5. Menjalankan Deployment 1-Klik

Setelah berada di dalam direktori proyek di VPS, jalankan skrip deployment:

```bash
./deploy.sh
```

### Apa yang dilakukan oleh `./deploy.sh` secara otomatis?
1. Memeriksa dan menginstal **Docker Engine & Docker Compose** jika belum terpasang.
2. Memeriksa kapasitas RAM dan mengaktifkan **2GB Swap Memory** jika RAM VPS terbatas.
3. Menyiapkan konfigurasi file `.env`.
4. Membangun dan menjalankan 4 container microservices di latar belakang (`docker compose up -d --build`).
5. Menunggu database PostgreSQL siap menerima koneksi.
6. Menyinkronkan skema tabel database (`npx prisma db push`).
7. Menanam **4 Akun RBAC bawaan BPJS** dan klaim acuan benchmark ke database.
8. Menjalankan impor massal seluruh dataset resmi (`data/*.parquet`) ke PostgreSQL.
9. Memvalidasi status kesehatan API Gateway dan menampilkan tautan dashboard siap pakai.

---

## 🌐 6. Mengakses Dashboard & Kredensial Login

Setelah deployment selesai, buka browser di komputer Anda dan akses:

- **Dashboard Utama**: `http://<IP_VPS_ANDA>` (Port 80)
- **Dashboard Alternatif**: `http://<IP_VPS_ANDA>:5173`
- **Cek Status Kesehatan Sistem**: `http://<IP_VPS_ANDA>:3001/api/health`
- **Dokumentasi AI Engine**: `http://<IP_VPS_ANDA>:8000/docs`

### 🔑 4 Akun Demo RBAC Default BPJS Kesehatan

| Peran (Role) | Username | Password | Otoritas & Akses |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin_aura` | `admin_password_2026` | Akses penuh, audit log, manajemen user |
| **Fraud Analyst** | `analyst_aura` | `analyst_password_2026` | Investigasi grafik R-GCN, eksplanasi XAI, eskalasi audit |
| **Claim Verifier** | `verifier_aura` | `verifier_password_2026` | Verifikasi pra-bayar, filter klaim, live simulator |
| **Auditor** | `auditor_aura` | `auditor_password_2026` | Monitoring tata kelola, transparansi audit trail, evaluasi |

---

## 🛠️ 7. Perintah Pemeliharaan (Maintenance)

Berikut perintah umum yang dapat Anda gunakan di VPS:

### 1. Memeriksa Log Realtime Container
```bash
# Semua layanan
docker compose logs -f

# Hanya backend Next.js
docker compose logs -f backend

# Hanya AI service R-GCN
docker compose logs -f ai-service
```

### 2. Mengisi Ulang Database (Re-Seed Data)
Jika ingin mereset atau mengisi ulang dataset kompetisi ke database:
```bash
./init-db.sh
```

### 3. Merestart Layanan
```bash
docker compose restart
```

### 4. Menghentikan Layanan
```bash
docker compose down
```

### 5. Memperbarui Kode Terbaru (Jika Menggunakan Git)
```bash
git pull origin main
docker compose up -d --build
```

---

> [!TIP]
> Jika Anda ingin menghubungkan domain dengan SSL/HTTPS gratis (Let's Encrypt), Anda dapat memasang `certbot` pada Nginx host atau mengarahkan Cloudflare SSL ke port 80 VPS Anda.

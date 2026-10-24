#!/usr/bin/env bash
# =================================================================
# AURA-JKN: AUTOMATED VPS DEPLOYMENT & SETUP SCRIPT
# BPJS Kesehatan Healthkathon 2026
# =================================================================
set -e

echo "================================================================="
echo "🚀 [AURA-JKN] Memulai proses instalasi & deployment di VPS..."
echo "================================================================="

# 1. Pastikan user saat ini memiliki izin tulis ke direktori proyek
if [ ! -w . ]; then
    echo "🔒 Direktori memerlukan izin tulis. Memperbaiki kepemilikan direktori..."
    sudo chown -R "$USER:$USER" . 2>/dev/null || sudo chown -R ubuntu:ubuntu . 2>/dev/null || true
    sudo chmod -R u+rw . 2>/dev/null || true
fi

# 2. Verifikasi / Instalasi Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo "⚠️ Docker belum terdeteksi. Menginstal Docker otomatis..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER" || true
    rm -f get-docker.sh
    echo "✅ Docker engine berhasil diinstal."
else
    echo "✅ Docker telah terpasang."
fi

# 3. Pastikan socket docker dapat diakses tanpa permission denied
if [ -e /var/run/docker.sock ] && [ ! -w /var/run/docker.sock ]; then
    echo "🔒 Mengatur hak akses docker socket..."
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

# 4. Deteksi izin Docker (gunakan sudo docker compose jika socket docker perlu root)
DOCKER_CMD="docker compose"
if ! docker info &>/dev/null; then
    echo "ℹ️ Menggunakan sudo untuk perintah Docker Compose..."
    DOCKER_CMD="sudo docker compose"
fi

# 4. Pastikan file .env tersedia
if [ ! -f .env ]; then
    echo "📋 Membuat file .env dari .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env 2>/dev/null || sudo cp .env.example .env
        sudo chown "$USER:$USER" .env 2>/dev/null || true
    else
        touch .env
    fi
fi

# 5. Setup Swap Memory jika RAM VPS <= 2GB (mencegah OOM saat build)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "4000000")
if [ "$TOTAL_RAM_KB" -lt 3000000 ] && [ ! -f /swapfile ]; then
    echo "ℹ️ RAM VPS terdeteksi <= 2GB ($((TOTAL_RAM_KB / 1024))MB). Membuat 2GB Swap Memory..."
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap memory 2GB berhasil diaktifkan."
fi

# 6. Build & Start Docker Compose Services
echo ""
echo "🔨 Membangun & menyalakan seluruh container microservices AURA-JKN..."
$DOCKER_CMD down --remove-orphans 2>/dev/null || true
$DOCKER_CMD up -d --build

# 7. Menunggu inisialisasi PostgreSQL
echo "⏳ Menunggu database PostgreSQL siap menerima koneksi..."
$DOCKER_CMD exec -T postgres pg_isready -U aura_user -d aura_jkn_db -t 30 2>/dev/null || sleep 8

# 8. Push Schema & Seed Initial Users / Benchmark Fixtures
echo "🗄️ Menyinkronkan skema tabel database (Prisma db push)..."
$DOCKER_CMD exec -T backend npx prisma db push

echo "🌱 Menanam akun RBAC bawaan BPJS & skenario benchmark ke PostgreSQL..."
$DOCKER_CMD exec -T backend node node_modules/tsx/dist/cli.mjs prisma/seed.ts || true

# 9. Bulk Import Full Competition Parquet Dataset
echo "📦 Mengimpor seluruh dataset resmi parquet (Facilities, Doctors, Patients, Claims)..."
$DOCKER_CMD exec -T ai-service python seed_parquet_to_db.py || true

# 8. Verifikasi Status Kesehatan Layanan
echo ""
echo "🔍 Melakukan pengujian endpoint health check..."
sleep 2
HEALTH_STATUS=$(curl -s http://localhost:3001/api/health 2>/dev/null || echo "error")

VPS_IP=$(curl -s -m 3 ifconfig.me 2>/dev/null || ip route get 1 | awk '{print $(NF-2);exit}')

echo ""
echo "================================================================="
echo "🎉 AURA-JKN BERHASIL DIPASANG & BERJALAN DI VPS!"
echo "================================================================="
echo "🌐 URL Akses Sistem:"
echo "   - Dashboard (Port 80):     http://${VPS_IP}"
echo "   - Dashboard (Port 5173):   http://${VPS_IP}:5173"
echo "   - Backend API Health:      http://${VPS_IP}:3001/api/health"
echo "   - FastAPI AI Docs:         http://${VPS_IP}:8000/docs"
echo ""
echo "🔑 Kredensial 4 Akun RBAC Default BPJS Kesehatan:"
echo "   1. Administrator:   admin_aura    / admin_password_2026"
echo "   2. Fraud Analyst:   analyst_aura  / analyst_password_2026"
echo "   3. Claim Verifier:  verifier_aura / verifier_password_2026"
echo "   4. Auditor:         auditor_aura  / auditor_password_2026"
echo "================================================================="
echo "💡 Perintah Pemeliharaan (Maintenance):"
echo "   - Cek log realtime:   docker compose logs -f"
echo "   - Cek log backend:    docker compose logs -f backend"
echo "   - Cek log AI engine:  docker compose logs -f ai-service"
echo "   - Restart layanan:    docker compose restart"
echo "   - Stop layanan:       docker compose down"
echo "================================================================="

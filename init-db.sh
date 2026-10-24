#!/usr/bin/env bash
# =================================================================
# AURA-JKN: Database Migration & Seeding Runner
# =================================================================
set -e

DOCKER_CMD="docker compose"
if ! docker info &>/dev/null; then
    DOCKER_CMD="sudo docker compose"
fi

# Pastikan pustaka OpenSSL tersedia di container backend Alpine
echo "🔧 Memastikan dependensi OpenSSL aktif di container backend..."
$DOCKER_CMD exec -T -u root backend apk add --no-cache openssl libc6-compat 2>/dev/null || true

echo "🗄️ [1/3] Menjalankan Prisma DB Push (Sinkronisasi Tabel PostgreSQL)..."
$DOCKER_CMD exec -T backend npx prisma db push --accept-data-loss

# Pastikan folder src & tsconfig.json ada di container backend untuk seed script
if ! $DOCKER_CMD exec -T backend test -d /app/src; then
    echo "📋 Menyalin modul src ke container backend..."
    $DOCKER_CMD cp backend/src backend:/app/src 2>/dev/null || true
    $DOCKER_CMD cp backend/tsconfig.json backend:/app/tsconfig.json 2>/dev/null || true
fi

echo "🌱 [2/3] Menanam 5 Akun RBAC Resmi, Kasus Benchmark & Fixture ke PostgreSQL..."
$DOCKER_CMD exec -T backend node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "📦 [3/3] Mengimpor Dataset Massal Parquet Resmi BPJS Kesehatan..."
$DOCKER_CMD exec -T ai-service python seed_parquet_to_db.py

echo "✅ Inisialisasi Database AURA-JKN selesai dengan sukses!"

# =================================================================
# AURA-JKN: Packaging Script for Manual VPS Upload (PowerShell)
# BPJS Kesehatan Healthkathon 2026
# =================================================================

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot
$zipOutput = Join-Path $rootDir "aura-jkn-deploy.zip"

Write-Host "📦 Mempersiapkan berkas arsip bersih (aura-jkn-deploy.zip)..." -ForegroundColor Cyan

# Remove old zip if present
if (Test-Path $zipOutput) {
    Remove-Item $zipOutput -Force
}

# Temporary staging directory
$stageDir = Join-Path $env:TEMP "aura_jkn_stage_$(Get-Random)"
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir | Out-Null

Write-Host "📋 Menyalin file proyek penting (tanpa node_modules & arsip besar)..." -ForegroundColor Yellow

# Use robocopy to cleanly copy everything except node_modules, .git, .next, dist, zip
$excludeDirs = @("node_modules", ".git", ".next", "dist", "build", ".postgres-data", "template-extracted", "__pycache__", ".venv", "venv")
$excludeFiles = @("*.zip", "*.log", "*.tsbuildinfo", ".DS_Store", "Thumbs.db")

$robocopyArgs = @(
    $rootDir,
    $stageDir,
    "/E",
    "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles + @("/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS")

& robocopy.exe @robocopyArgs | Out-Null

Write-Host "🗜️ Mengompres direktori ke $zipOutput..." -ForegroundColor Yellow
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipOutput -CompressionLevel Optimal

Remove-Item $stageDir -Recurse -Force

$zipSizeMb = [math]::Round((Get-Item $zipOutput).Length / 1MB, 2)
Write-Host "✅ Berhasil membuat arsip: $zipOutput ($zipSizeMb MB)" -ForegroundColor Green
Write-Host "🚀 Anda siap mengunggah file ini ke VPS via SCP/SFTP/FileZilla!" -ForegroundColor Cyan

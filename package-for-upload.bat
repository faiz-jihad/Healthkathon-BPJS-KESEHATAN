@echo off
REM =================================================================
REM AURA-JKN: Packaging Script for Manual VPS Upload (Windows)
REM Creates a clean aura-jkn-deploy.zip excluding node_modules & temp
REM =================================================================

echo [AURA-JKN] Menyiapkan paket arsip bersih untuk upload ke VPS...

powershell -ExecutionPolicy Bypass -File "%~dp0package-for-upload.ps1"

pause

# AURA-JKN: Panduan & Skenario Demonstrasi Juri 3 Menit (Master Demo Script)
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
**Tema:** *Detect Smarter, Protect JKN*  
**Prinsip Utama:** *Zero Fabrication, Live Database, Human-in-the-Loop, Reproducible Benchmark*

---

## ⏱️ RINGKASAN TIMELINE DEMO (TOTAL: 3 MENIT)

| Durasi | Segmen Presentasi | Aksi & Halaman | Poin Kunci Pembuktian |
| :---: | :--- | :--- | :--- |
| **00:00 – 00:45** | **1. Autentikasi RBAC & Isolasi Peran** | Login & Profile Me | Identitas diturunkan dari sesi kriptografis token HMAC, pemisahan tugas di server (*Separation of Duties*). |
| **00:45 – 01:30** | **2. Antrean Investigasi Berbasis Risiko & Klaim Baru** | Queue Klaim & Ingestion | Prioritas berdasarkan bukti riil, penanganan klaim baru transparan (`NOT_ANALYZED`), *Zero Mock Data*. |
| **01:30 – 02:15** | **3. Evidence Graph Explorer & XAI** | Subgraph Viewer & Detail Klaim | 5 tipe simpul riil dari PostgreSQL, bukti teramati dibedakan dari inferensi model, visualisasi kolusi multi-hop. |
| **02:15 – 03:00** | **4. Human-in-the-Loop & Audit Trail Imutabel** | Form Telaah & Log Audit | Keputusan klinis wajib manusia (*Decision-Support*), transisi state machine terproteksi, pencatatan audit atomik. |

---

## 🎯 PANDUAN LANGKAH DEMI LANGKAH

### MENIT 00:00 – 00:45 | Segmen 1: Autentikasi RBAC & Pemisahan Wewenang

#### Narasi Presenter:
> *"Selamat pagi/siang Dewan Juri Healthkathon BPJS Kesehatan 2026. Kami dari Tim FANTASTIC mempersembahkan **AURA-JKN: Autonomous Relational Anti-Fraud**.  
> Berbeda dari sistem purwarupa umum yang mengandalkan mock data atau bypass frontend, AURA-JKN mengimplementasikan **Zero Fabrication Policy** dengan backend otoritatif PostgreSQL, model Graph Neural Network yang dapat direproduksi, serta kontrol keamanan berbasis peran (RBAC) ketat."*

#### Aksi di Layar:
1. Buka antarmuka login di `http://localhost:5173`.
2. Klik tombol **Pilih Akun Demo** atau login dengan akun Verifikator:
   - **Username:** `verifier_aura`
   - **Password:** `verifier_password_2026`
   - **Role:** `CLAIM_VERIFIER` (Verifikator Klaim Pra-Pembayaran)
3. Tunjukkan badge peran di pojok kanan atas: teridentifikasi sebagai `Verifikator Pra-Pembayaran Resmi`.

#### Poin Kunci yang Ditekankan ke Juri:
- Identitas pengguna di server **sepenuhnya diturunkan dari token kriptografis HMAC-SHA256**, bukan dari header palsu atau body request.
- Sistem menerapkan **Separation of Duties**: Administrator tidak dapat mengambil keputusan telaah medis klinis (HTTP 403), dan Verifikator tidak dapat mengubah konfigurasi sistem atau menghapus log audit.

---

### MENIT 00:45 – 01:30 | Segmen 2: Antrean Investigasi Berbasis Risiko & Penanganan Klaim Baru

#### Narasi Presenter:
> *"Di halaman Antrean Investigasi Klaim, sistem tidak sekadar mengurutkan tanggal pengajuan. Klaim diprioritaskan berdasarkan **tingkat paparan risiko terkalibrasi (Estimated Potential Exposure at Risk)** yang mengombinasikan sinyal relasional Graph Neural Network dan analisis aturan spasiotemporal.  
> Perhatikan transparansi ilmiah AURA-JKN terhadap **klaim baru yang belum diindeks dalam graf**."*

#### Aksi di Layar:
1. Tampilkan tabel antrean klaim terfilter:
   - Sorot kolom **Status Asesmen**, **Skor Risiko**, dan **Alasan Prioritas**.
   - Tunjukkan berkas klaim dengan status `NOT_ANALYZED` atau `COMPLETED`.
2. Jelaskan penanganan klaim baru:
   - *"Jika sebuah klaim baru masuk dan belum menjadi simpul dalam graf offline, AURA-JKN **TIDAK MENGARANG SKOR PALSU** (seperti fallback statis 0.86 atau 0.0)."*
   - Sistem secara jujur menandai status sebagai `NOT_ANALYZED`.
   - Lapisan aturan spasiotemporal mengevaluasi kuota harian dokter dan benturan lokasi.
   - Klaim secara otomatis dialirkan ke antrean `CaseInvestigation` dengan status `FLAGGED_FOR_REVIEW` dan prioritas `MEDIUM` agar diverifikasi manual secara aman (*fail-safe*).

#### Poin Kunci yang Ditekankan ke Juri:
- **Zero Mock Policy**: Tidak ada skor AI buatan. Tidak ada asumsi bahwa klaim yang belum dianalisis adalah klaim aman.
- **Fail-Safe Gate**: Klaim baru diarahkan ke verifikasi pra-pembayaran manusia.

---

### MENIT 01:30 – 02:15 | Segmen 3: Evidence Graph Explorer & Explainable AI (XAI)

#### Narasi Presenter:
> *"Kekuatan utama AURA-JKN terletak pada kemampuan mengungkap sindikat kecurangan terorganisir yang tak kasat mata bagi sistem tabular biasa.  
> Melalui Evidence Graph Explorer, verifikator dapat menelusuri subgraf bukti interaktif yang diambil langsung dari database otoritatif."*

#### Aksi di Layar:
1. Klik salah satu klaim anomali terdeteksi (misalnya Skenario A: *Fake Patient Cluster* atau Skenario C: *Spatio-Temporal Conflict*).
2. Buka tab/panel **Evidence Graph Explorer** (komponen SubgraphViewer):
   - Tunjukkan interkoneksi 5 jenis simpul: `Patient`, `Doctor`, `Facility`, `Claim`, dan `Diagnosis`.
   - Tunjukkan relasi `Examination`, `Authorization`, `Registration`, dan `Referral`.
3. Tunjukkan panel fakta teramati di sebelah graf:
   - Jarak faskes yang dihitung dengan formula Haversine valid.
   - Fakta bahwa data yang ditampilkan bersumber langsung dari tabel PostgreSQL, bukan data sintetis acak di memori browser.

#### Poin Kunci yang Ditekankan ke Juri:
- **Arsitektur Model Graf Aktual**: Menggunakan arsitektur `HeteroConv` dengan `SAGEConv` (Heterogeneous GraphSAGE) pada PyTorch Geometric yang menangkap *multi-hop topological context*.
- **Pembuktian Benchmark**: Pada pengujian 3.000 klaim unseen, model graf mencapai **Precision@250 sebesar 90.4%** dan **PR-AUC 0.8294**, jauh melampaui Rule-Based (24.0% P@250, PR-AUC 0.1996) dan Tabular Random Forest (74.4% P@250, PR-AUC 0.7152).

---

### MENIT 02:15 – 03:00 | Segmen 4: Human-in-the-Loop & Audit Trail Imutabel

#### Narasi Presenter:
> *"AURA-JKN adalah **Decision-Support System**, bukan sistem algo-terminator yang memvonis sepihak atau memblokir klaim secara otomatis. Hak pembayaran dan persetujuan klaim tetap berada 100% di tangan petugas verifikator BPJS Kesehatan.  
> Setiap keputusan manusia dicatat dalam jejak audit atomik dan imutabel."*

#### Aksi di Layar:
1. Pada form telaah klaim:
   - Pilih rekomendasi telaah: `CLARIFY` atau `ESCALATE_AUDIT` (atau `RELEASE`).
   - Masukkan catatan justifikasi klinis (wajib minimal 5 karakter, misal: *"Ditemukan indikasi benturan waktu praktik dokter antar-faskes >100 km"*).
   - Klik **Simpan Keputusan Telaah**.
   - Sistem memperbarui status klaim dan memicu transisi state machine kasus investigasi (`FLAGGED_FOR_REVIEW` ➔ `UNDER_REVIEW` ➔ `RESOLVED`).
2. Beralih ke menu **Log Jejak Audit** (atau login sebagai `auditor_aura`):
   - Tunjukkan catatan audit terbaru yang baru saja terbentuk:
     - **Aktor:** `Verifikator Pra-Pembayaran Resmi` (bukan nama dari body request, melainkan identitas tervalidasi sesi).
     - **Aksi:** `CLAIM_REVIEWED` & `CASE_TRANSITIONED`.
     - **Timestamp & Target ID:** Tercatat presisi dengan payload metadata lengkap.
3. Tunjukkan bahwa upaya transisi ilegal ditolak oleh state machine server dengan HTTP 400.

#### Poin Kunci Penutup Presentasi (Closing Statement):
> *"Dengan AURA-JKN, BPJS Kesehatan memperoleh solusi anti-fraud yang kredibel secara ilmiah, aman secara arsitektur, transparan tanpa rekayasa data, dan siap menjadi garda pelindung keberlanjutan dana JKN.  
> **AURA-JKN: Detect Smarter, Protect JKN**. Terima kasih."*

---

## 🛠️ CHECKLIST PERSIAPAN SEBELUM PRESENTASI

- [x] Database PostgreSQL aktif di port 5432 (`npm run db:start`).
- [x] Backend API aktif di port 3001 (`npm run dev:backend`).
- [x] Frontend Vite aktif di port 5173 (`npm run dev:frontend`).
- [x] Seluruh 30/30 acceptance tests terverifikasi hijau (`npm run test:acceptance`).
- [x] Seluruh unit test spasiotemporal terverifikasi hijau (`python test_spatiotemporal.py`).
- [x] Laporan benchmark multi-model tersedia di `docs/BENCHMARK_REPORT.md` dan `docs/benchmark_results.json`.
- [x] Kredensial akun verifikator (`verifier_aura` / `verifier_password_2026`) siap digunakan.

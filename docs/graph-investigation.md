# AURA-JKN: Graph Intelligence & Relational Investigation
**Investigasi Anomali Berbasis Topologi Graf Heterogen (PyTorch Geometric + React Flow)**  
*Healthkathon BPJS Kesehatan 2026*

---

## 1. Arsitektur Graf Heterogen

AURA-JKN memodelkan ekosistem klaim jaminan kesehatan nasional sebagai **Heterogeneous Information Network (HIN)**. Pendekatan ini memungkinkan deteksi pola kolusi (*phantom billing*) dan klaim berulang (*repeat billing*) yang tidak terlihat melalui analisis tabular tradisional.

### Tipe Simpul (*Node Types*)
Berdasarkan skema data otoritatif BPJS Kesehatan:
1. **`claim` (Klaim):** Entitas transaksi klaim INA-CBGS dengan fitur tarif, lama rawat, dan tanggal pelayanan.
2. **`patient` (Pasien):** Pasien terpseudonimisasi (salted SHA-256) untuk menjamin privasi sesuai UU PDP.
3. **`doctor` (Dokter / DPJP):** Dokter Penanggung Jawab Pelayanan dengan nomor SIP, spesialisasi, dan volume pasien.
4. **`facility` (Faskes):** Rumah Sakit atau Klinik (FKTP/FKRTL) beserta koordinat geografis (latitude, longitude).
5. **`diagnosis` (Diagnosis):** Kode klasifikasi penyakit ICD-10.

### Tipe Relasi (*Edge Types*)
| Relasi | Simpul Sumber | Simpul Target | Arti Bisnis |
| :--- | :--- | :--- | :--- |
| `submitted_by` | `claim` | `facility` | Fasilitas kesehatan yang mengajukan klaim pembayaran |
| `treated_by` | `claim` | `doctor` | Dokter DPJP yang menangani tindakan medis |
| `belongs_to` | `claim` | `patient` | Pasien yang menerima pelayanan kesehatan |
| `diagnosed_as` | `claim` | `diagnosis` | Diagnosis medis utama yang menjadi dasar klaim |
| `spatial_conflict` | `claim` | `claim` | Dua klaim pasien/dokter yang sama di faskes berjarak >400 km pada hari yang sama |

---

## 2. Fitur Interaktif Subgraph Viewer

Komponen [frontend/src/components/SubgraphViewer.tsx](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/frontend/src/components/SubgraphViewer.tsx) dibangun menggunakan `@xyflow/react` (React Flow) dengan kemampuan analitis tingkat lanjut:

1. **Filter Simpul Interaktif (Type Filtering):**
   - Investigator dapat mengaktifkan/menonaktifkan simpul Faskes, Dokter, Pasien, Klaim, atau Diagnosis untuk mengisolasi subgraf relevan.
2. **Detail Inspeksi Simpul (Node Inspector):**
   - Mengklik simpul mana pun akan memunculkan kartu detail di pojok kanan atas yang menampilkan Identifier lengkap, label klinis, dan jumlah relasi terhubung.
3. **Sorotan Jalur Terhubung (Connected Path Highlight):**
   - Simpul yang dipilih secara otomatis mempertebal dan menganimasikan garis relasi yang berhubungan dengannya untuk mempermudah penelusuran rantai rujukan.
4. **Indikator Garis Merah Putus-Putus (Conflict Edge):**
   - Anomali spasial ditandai dengan garis merah tebal beranimasi dan label merah tebal untuk memperjelas adanya konflik trajektori pasien/dokter.
5. **Kontrol Navigasi & Zoom:**
   - Navigasi interaktif dengan pan, zoom, fit-view, dan grid background.

---

## 3. Investigasi Pola Anomali Lapangan

### Skenario A: Fake Patient Cluster
* **Ciri Topologi:** Sekelompok pasien baru dengan ID hash berbeda tetapi terikat pada satu fasilitas kesehatan dalam periode singkat tanpa riwayat rujukan yang wajar.
* **Tindakan Verifikator:** Periksa data kepesertaan aktif dan bandingkan dengan rekam medis fisik faskes.

### Skenario B: Extreme Doctor Volume
* **Ciri Topologi:** Satu simpul dokter terhubung ke lebih dari 45 simpul klaim dalam satu hari kalender.
* **Tindakan Verifikator:** Verifikasi jadwal praktek dokter (SIP) dan log kehadiran faskes.

### Skenario C: Spatio-Temporal Conflict (Konflik Geografis)
* **Ciri Topologi:** Dua simpul klaim untuk pasien yang sama terhubung ke dua faskes dengan jarak geografis > 400 km pada tanggal kalender yang sama.
* **Tindakan Verifikator:** Tolak pembayaran untuk telaah (*REJECT_FOR_HUMAN_REVIEW*) dan lakukan klarifikasi berkas ke faskes pertama dan kedua.

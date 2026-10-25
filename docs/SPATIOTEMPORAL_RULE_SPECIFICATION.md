# AURA-JKN: Spesifikasi & Validasi Aturan Spasiotemporal
**Healthkathon BPJS Kesehatan 2026 — Tim FANTASTIC**  
**Fokus Novelty:** *Evidence-Driven Relational Risk Triage (Pengembangan D)*

---

## 1. Pendahuluan & Filosofi Desain

Dalam investigasi klaim BPJS Kesehatan, **anomali spasiotemporal atau volume layanan tinggi BUKAN bukti mutlak kecurangan (fraud)**. Sinyal-sinyal ini dirancang murni sebagai **pemicu telaah verifikator (Decision Support Trigger)** yang harus dievaluasi bersama konteks klinis, jadwal praktik resmi, dan kondisi geografis Indonesia.

Dokumen ini menyajikan spesifikasi lengkap, formulasi matematis, mitigasi false positive, dan protokol pengujian dari seluruh aturan spasiotemporal yang diimplementasikan pada AURA-JKN.

---

## 2. Aturan 1: Batas Beban Layanan Harian Dokter (Practitioner Daily Volume Quota)

### A. Tujuan & Hipotesis
- **Tujuan**: Mendeteksi potensi *phantom billing* atau klaim yang ditandatangani secara administratif tanpa pemeriksaan fisik langsung oleh dokter penanggung jawab pelayanan (DPJP).
- **Hipotesis**: Seorang dokter umum atau spesialis memiliki batas biologis dan waktu kerja efektif dalam memeriksa pasien secara layak (standar 10–15 menit per pasien). Jika volume klaim melebihi ambang batas wajar dalam satu hari kalender, terdapat risiko pencatatan klaim fiktif atau penggunaan akun dokter tanpa otorisasi.

### B. Input Data yang Diperlukan
- `doctor_id` (String): Pengenal dokter.
- `service_date` (String YYYY-MM-DD): Tanggal pelayanan klaim.
- `schedule_hours` (Int): Jam kerja resmi dokter sesuai SIP (standar: 6–8 jam).

### C. Rumus & Satuan
$$\text{DailyVolume}(d, t) = \sum_{c \in \text{Claims}} \mathbb{I}(\text{doctor\_id}(c) = d \land \text{service\_date}(c) = t)$$

$$\text{CapacityRatio}(d, t) = \frac{\text{DailyVolume}(d, t)}{\text{schedule\_hours}(d) \times \text{MaxPatientsPerHour}}$$

- **Satuan**: Berkas klaim per hari.

### D. Nilai Threshold & Alasan Pemilihan
- **Ambang Batas Peringatan**: $> 30\text{ klaim/hari}$.
- **Ambang Batas Ekstrem**: $> 40\text{ klaim/hari}$.
- **Alasan Pemilihan**: Merupakan *internal heuristic screening threshold* yang didasarkan pada rekomendasi tata kelola rawat jalan BPJS Kesehatan dan standar waktu pemeriksaan klinis Ikatan Dokter Indonesia (IDI) / Konsil Kedokteran Indonesia (KKI) (rata-rata 12–15 menit per pasien rawat jalan; 4 pasien/jam $\times$ 7 jam kerja efektif = 28–30 pasien per hari untuk konsultasi yang layak). Ambang ini adalah pemicu penapisan awal (*screening trigger*), bukan ketentuan batasan baku yuridis Permenkes tunggal.

### E. Kondisi False Positive & Pengecualian yang Wajar
1. **Pemeriksaan Skrining Massal**: Program promotif/preventif (misal: vaksinasi massal, skrining diabetes/hipertensi terpadu) di mana anamnesis dilakukan secara cepat oleh tim paramedis di bawah supervisi satu dokter.
2. **Kondisi Bencana / Kejadian Luar Biasa (KLB)**: Lonjakan kasus darurat di mana dokter bertugas melebihi jam kerja normal.
3. **Residen / Dokter Pendamping**: Pelayanan oleh dokter residen di RS Pendidikan dengan verifikasi akhir oleh DPJP.

### F. Bukti yang Ditampilkan ke Investigator
- Grafik distribusi pasien dokter per jam pelayanan pada tanggal terkait.
- Perbandingan volume dokter terhadap rata-rata rekan sejawat (*peer group*) dengan spesialisasi yang sama di faskes sekelas.

---

## 3. Aturan 2: Deteksi Benturan Spasiotemporal Antar-Faskes (Spatiotemporal Infeasibility)

### A. Tujuan & Hipotesis
- **Tujuan**: Mendeteksi klaim yang tercatat dilayani oleh dokter yang sama pada dua fasilitas kesehatan berbeda dengan jarak geografis yang mustahil ditempuh dalam interval waktu layanan.
- **Hipotesis**: Seorang manusia tidak dapat berada di dua lokasi fisik berjauhan pada waktu yang hampir bersamaan (*law of physical co-presence*).

### B. Input Data yang Diperlukan
- $\text{Lat}_1, \text{Lon}_1$: Koordinat lintang dan bujur Fasilitas Kesehatan 1.
- $\text{Lat}_2, \text{Lon}_2$: Koordinat lintang dan bujur Fasilitas Kesehatan 2.
- $T_1, T_2$: Waktu pelayanan pada kedua faskes (format `YYYY-MM-DD HH:MM:SS`).

### C. Rumus & Satuan
Jarak terpendek dihitung menggunakan **Formulasi Haversine**:
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$d = 2 R \arcsin(\sqrt{a})$$
$$\text{RequiredSpeed} = \frac{d}{\Delta T}$$

- $R = 6.371\text{ km}$ (Radius rata-rata bumi).
- **Satuan**: Jarak dalam Kilometer ($\text{km}$), Waktu dalam Jam ($\text{jam}$), Kecepatan dalam $\text{km/jam}$.

### D. Nilai Threshold & Alasan Pemilihan
- **Jarak Benturan Kritis**: Jarak $> 100\text{ km}$ dengan interval $\Delta T < 2\text{ jam}$ ($\text{RequiredSpeed} > 50\text{ km/jam}$ di jalan darat Indonesia).
- **Benturan Ekstrem**: Jarak $> 400\text{ km}$ (misal Jakarta – Semarang/Surabaya) pada tanggal pelayanan yang sama tanpa bukti perjalanan udara.
- **Toleransi Mobilitas Dalam Kota**: Jarak $< 30\text{ km}$ dianggap wajar untuk dokter yang berpraktik di 2–3 faskes dalam satu aglomerasi kota metropolitan (Jabodetabek, Bandung Raya, Gerbangkertosusila).

### E. Penanganan Data Hilang & Null Island Immunity
- **Kekebalan Null Island**: Jika salah satu koordinat faskes bernilai $(0, 0)$ atau tidak terdaftar (*null/undefined*), kalkulasi jarak dinonaktifkan secara otomatis dan sistem memberi label `INSUFFICIENT_GEODATA`. Sistem **TIDAK PERNAH** memicu alarm fraud palsu akibat koordinat yang hilang.

### F. Kondisi False Positive & Pengecualian yang Wajar
1. **Layanan Telekonsultasi Resmi**: Dokter memberikan konsultasi jarak jauh terotorisasi melalui aplikasi telemedicine terakreditasi saat sedang berada di faskes utama.
2. **Koreksi Administratif Tanggal Input**: Petugas administrasi RS menginput berkas klaim beberapa hari setelah layanan fisik berlangsung, sehingga tanggal input sistem berbeda dari tanggal fisik.

### G. Bukti yang Ditampilkan ke Investigator
- Peta rute geografis interaktif yang menghubungkan kedua faskes.
- Waktu tempuh minimum berdasarkan kalkulasi Haversine vs interval waktu klaim aktual.
- Detail nomor SEP, diagnosa, dan jam tindakan di masing-masing faskes.

---

## 4. Protokol Verifikasi & Rangkaian Pengujian Otomatis

Seluruh aturan di atas divalidasi menggunakan suite unit test independen [`test_spatiotemporal.py`](file:///d:/Healthkathon/Healthkathon-BPJS-KESEHATAN/test_spatiotemporal.py):

| Skenario Pengujian | Input Uji | Output yang Diharapkan | Status Hasil |
| :--- | :--- | :--- | :---: |
| **Test 1: Akurasi Haversine** | Jakarta (-6.2088, 106.8456) ke Bandung (-6.9175, 107.6191) | Jarak berada di rentang 115–155 km | **PASS** |
| **Test 2: Batas Kuota Harian** | Dokter dengan 35 klaim dalam 1 hari kalender | Memicu `OVERCAPACITY_ALERT` | **PASS** |
| **Test 3: Konflik >400 km** | Faskes A (Jakarta) & Faskes B (Semarang, 410 km) dalam interval 1 jam | Memicu `SPATIAL_CONFLICT_DETECTED` | **PASS** |
| **Test 4: Toleransi Dalam Kota** | Faskes A (Jakarta Pusat) & Faskes B (Jakarta Selatan, 12 km) | Tidak memicu konflik (`WITHIN_TOLERANCE`) | **PASS** |
| **Test 5: Null Island Immunity** | Faskes dengan koordinat (0, 0) atau kosong | Jarak `None`, tidak memicu false positive | **PASS** |

Perintah eksekusi:
```powershell
python test_spatiotemporal.py
```
*Hasil: 5/5 Unit Test Berhasil (100% Lolos).*

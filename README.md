# ReimFlow

ReimFlow adalah aplikasi reimbursement untuk Sinergi Karya. Frontend menggunakan HTML, CSS, JavaScript biasa, dan Supabase JS melalui CDN; aplikasi tidak memerlukan proses build atau frontend development server.

## Struktur

```text
index.html
style.css
config.js
auth.js
dashboard.js
reimbursement.js
admin.js
report.js
logo.svg
business-consulting.svg
backend/
  app.js
  sql/schema.sql
  sql/seed.sql
  sql/employee_directory_demo.sql
```

## Konfigurasi Supabase

1. Buat project Supabase PostgreSQL.
2. Buka **SQL Editor**, jalankan seluruh `backend/sql/schema.sql`.
3. Buka **Authentication → Users** dan buat akun awal `admin@arunikadigital.co.id`. Buat juga akun berikut untuk data demo jika diperlukan:
   - `andi@arunikadigital.co.id`
   - `sinta@arunikadigital.co.id`
   - `budi@arunikadigital.co.id`
   
   Password dibuat sendiri di Supabase Auth; tidak ada password contoh dalam file SQL. Untuk mengubah akun demo, sesuaikan email di `backend/sql/seed.sql`.
4. Jalankan `backend/sql/seed.sql`. File ini membuat departemen dan profil untuk akun Auth yang emailnya cocok.
5. Untuk menyertakan pengajuan demo, unggah PNG/JPG/PDF melalui Supabase Storage ke bucket privat `receipts` di path `<UUID karyawan>/seed/demo-receipt.png` untuk Andi, Sinta, dan Budi. Jalankan ulang `seed.sql`; setiap contoh pengajuan hanya dibuat bila file buktinya ada. Script aman dijalankan ulang.
6. Di **Project Settings → API**, salin Project URL dan **publishable key** (atau legacy anon key) ke `config.js`. Jangan pernah menaruh service-role/secret key di frontend.
7. `seed.sql` membuat profil untuk empat email demo. Akun login tambahan perlu dibuat melalui Supabase Auth dan dipasangkan dengan profil `profiles`.
8. Untuk menyimpan data karyawan dan riwayat simulasi tanpa akun login, buka **SQL Editor**, jalankan `backend/sql/employee_directory_demo.sql`, lalu gunakan **Master Karyawan → Tambah Karyawan**. Jalankan ulang skrip yang sama bila tabel sudah ada tetapi fitur simulasi masih menampilkan error; skrip ini aman dijalankan ulang dan memperbarui fungsi database.

Empat tabel transaksi inti adalah `departments`, `profiles`, `reimbursements`, dan `payments`. Instalasi opsi direktori karyawan menambah `employee_directory` dan `employee_demo_reimbursements` khusus admin. Pengajuan simulasi ditandai **SIMULASI**, disimpan terpisah, dan tidak dihitung sebagai pengajuan/pembayaran nyata atau masuk ke laporan. Kategori disimpan sebagai teks pada pengajuan dan daftar pilihannya diatur di `config.js`. RLS membatasi pembacaan data berdasarkan pemilik/admin; perubahan status persetujuan serta pencatatan pembayaran hanya dapat dilakukan melalui fungsi database yang memeriksa role admin. Bucket bukti bersifat privat dan dibatasi hingga 5 MB.

## Menjalankan aplikasi

### Frontend

Buka `index.html` langsung di browser atau publikasikan isi folder utama repositori dengan GitHub Pages. Koneksi internet diperlukan untuk memuat Supabase JS dan font dari CDN. Supabase URL dan publishable key harus sudah diisi. Login menggunakan akun yang telah dibuat di Supabase Auth.

Fitur pengajuan, pemeriksaan, pembayaran, laporan, dan upload menggunakan Supabase secara langsung dengan RLS.

## Alur role

- **Karyawan:** login → buat pengajuan dengan tanggal, kategori, nominal, deskripsi, dan bukti wajib → melihat riwayat/status serta alasan penolakan → mengubah nama profil. Pengajuan yang terkirim tidak dapat diedit.
- **Admin / Finance:** meninjau pengajuan nyata dan bukti → menyetujui atau menolak (alasan wajib) → mencatat tanggal, nilai penuh, dan referensi pembayaran untuk pengajuan yang disetujui → melihat daftar karyawan, departemen, laporan, dan transaksi. Data karyawan tanpa akun login dapat memiliki riwayat simulasi yang terpisah.

## Batasan data

- Master kategori memakai daftar bawaan frontend di `config.js`, bukan CRUD database, agar tidak menambah tabel kategori.
- Jurnal adalah tampilan turunan dari pembayaran: debit beban reimbursement dan kredit kas/bank, dengan jumlah seimbang. Jurnal tersebut bukan buku besar tersimpan; kebijakan akuntansi perusahaan perlu diverifikasi Finance.
- Riwayat aktivitas merangkum waktu pengajuan, review terakhir, dan pembayaran dari data transaksi. Audit trail immutable atau riwayat perubahan status berulang memerlukan tabel audit tambahan dan sengaja tidak dibuat.
- Karyawan yang ditambahkan dari Master Karyawan adalah data direktori saja, bukan akun login. Untuk login karyawan, akun tetap perlu dibuat di Supabase Auth dan dipasangkan dengan profil `profiles`.

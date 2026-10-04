# ReyCode Digital

ReyCode Digital adalah platform digital berbasis web yang dikembangkan untuk menyediakan berbagai fitur dalam satu sistem, mulai dari autentikasi pengguna, profil, marketplace, upload media, deployment project, integrasi GitHub, hingga berbagai layanan digital lainnya.

Project ini dirancang menggunakan teknologi web modern dengan arsitektur backend berbasis API dan frontend berbasis HTML, CSS, serta JavaScript.

---

## 📌 Tentang Project

ReyCode Digital merupakan project web yang dikembangkan oleh ReyCode Digital untuk membangun ekosistem digital yang dapat digunakan untuk berbagai kebutuhan.

Project ini menggunakan pendekatan modular sehingga setiap fitur dapat dikembangkan secara terpisah tanpa mengganggu sistem utama.

Beberapa bagian utama project meliputi:

- Authentication
- User Account
- User Profile
- Marketplace
- Product Management
- Shopping Cart
- Order Management
- Product Comments
- Stories
- Story Comments
- Story Viewers
- Media Upload
- GitHub Integration
- Project Deployment
- Alight Motion Tools
- Email Verification
- Password Reset
- Dashboard
- API Backend
- MongoDB Database
- Vercel Deployment

---

## ✨ Fitur Utama

### 🔐 Authentication

Sistem autentikasi pengguna mencakup:

- Register
- Login
- Logout
- Email verification
- Forgot password
- Reset password
- Session authentication
- JWT authentication
- Password hashing
- Account validation

Pengguna dapat membuat akun dan mengakses fitur yang membutuhkan autentikasi.

---

### 👤 User Profile

Setiap pengguna memiliki halaman profil yang dapat digunakan untuk mengatur informasi akun.

Fitur profile meliputi:

- Nama pengguna
- Email
- WhatsApp
- Foto profile
- Background profile
- Status verifikasi email
- Status verifikasi nomor
- Update profile
- Upload profile image
- Upload profile background

Media profile disimpan menggunakan object storage.

---

## 🛒 Marketplace

Marketplace merupakan salah satu fitur utama ReyCode Digital.

Marketplace memungkinkan pengguna untuk:

- Melihat produk
- Mencari produk
- Memfilter produk
- Melihat detail produk
- Menambahkan produk ke cart
- Membuat pesanan
- Menambahkan produk sendiri
- Mengatur stok
- Mengatur harga
- Mengatur kategori
- Menambahkan gambar produk
- Menambahkan deskripsi produk
- Mengelola produk sendiri
- Memberikan komentar pada produk

Marketplace menggunakan sistem seller dan buyer sehingga pengguna dapat menjadi pembeli maupun penjual.

---

## 📦 Product System

Setiap produk memiliki informasi:

- Nama produk
- Deskripsi
- Harga
- Stok
- Kategori
- Gambar
- Seller
- Status produk
- Waktu dibuat
- Waktu diperbarui

Status produk dapat digunakan untuk menentukan apakah produk masih tersedia atau tidak.

---

## 🖼️ Product Images

Produk dapat memiliki beberapa gambar.

Sistem mendukung upload media dengan batas ukuran yang ditentukan oleh backend.

Format gambar yang didukung:

- JPG
- JPEG
- PNG
- WEBP
- GIF

Media disimpan menggunakan Vercel Blob.

---

## 🛍️ Shopping Cart

Marketplace memiliki sistem cart untuk menyimpan produk yang ingin dibeli.

Fitur cart meliputi:

- Tambah produk
- Hapus produk
- Update quantity
- Menyimpan beberapa produk
- Menghitung total
- Checkout

Cart disimpan berdasarkan user sehingga setiap akun memiliki data cart masing-masing.

---

## 📋 Order System

Sistem order digunakan untuk menyimpan transaksi marketplace.

Data order mencakup:

- Buyer
- Seller
- Product
- Harga
- Quantity
- Subtotal
- Total
- Status order
- Waktu transaksi

Status order yang digunakan:

- Pending
- Confirmed
- Completed
- Cancelled

---

## 💬 Product Comments

Sistem chat antar pengguna tidak digunakan sebagai komunikasi utama marketplace.

Sebagai gantinya, marketplace menggunakan sistem komentar pada produk.

Pengguna dapat:

- Membuat komentar
- Membalas komentar
- Melihat komentar
- Menghapus komentar milik sendiri
- Seller dapat menghapus komentar pada produknya

Sistem komentar menggunakan konsep parent comment sehingga memungkinkan adanya reply.

---

# 📱 Stories

ReyCode Digital juga memiliki sistem Stories yang terintegrasi dengan dashboard.

Stories dirancang dengan konsep media sementara yang akan otomatis expired setelah 24 jam.

Pengguna dapat mengunggah:

- Foto
- Video

Story memiliki:

- Media
- Caption
- Owner
- Waktu dibuat
- Waktu expired
- Jumlah viewer
- Daftar viewer
- Komentar

---

## ⏱️ Story Expiration

Setiap Story memiliki waktu kedaluwarsa selama 24 jam sejak dibuat.

Setelah melewati waktu tersebut, Story tidak lagi ditampilkan sebagai Story aktif.

Sistem menggunakan field:

`expiresAt`

untuk menentukan masa aktif Story.

---

## 👀 Story Viewers

Pemilik Story dapat melihat siapa saja yang telah melihat Story.

Informasi viewer dapat mencakup:

- Nama
- Avatar
- Status verifikasi
- Waktu melihat Story

Sistem juga menyimpan waktu terakhir pengguna melihat Story.

Contoh tampilan waktu:

- Baru saja
- 5 menit lalu
- 2 jam lalu
- Kemarin 23:14

---

## 💬 Story Comments

Story memiliki sistem komentar tersendiri.

Pengguna dapat:

- Memberikan komentar
- Membalas komentar
- Melihat komentar
- Menghapus komentar sendiri
- Pemilik Story dapat menghapus komentar pada Story miliknya

Komentar Story menggunakan sistem parent-child untuk mendukung reply.

---

## 🖼️ Story Media

Story mendukung media gambar dan video.

Format gambar:

- JPG
- JPEG
- PNG
- WEBP
- GIF

Format video:

- MP4
- WEBM
- MOV

Batas ukuran media ditentukan oleh backend.

---

# 📤 Media Upload

Project menggunakan sistem upload media untuk berbagai kebutuhan.

Media digunakan untuk:

- Profile photo
- Profile background
- Product image
- Story image
- Story video

Storage menggunakan:

`@vercel/blob`

Media disimpan dengan struktur berdasarkan user.

Contoh struktur:

```text
users/
├── {userId}/
│   ├── profilePhoto/
│   ├── profileBackground/
│   ├── products/
│   └── stories/
```

---

# 🐙 GitHub Integration

ReyCode Digital memiliki integrasi GitHub untuk kebutuhan project management dan deployment.

Integrasi dapat digunakan untuk:

- Menghubungkan akun GitHub
- Mengakses repository
- Membaca repository
- Mengambil file project
- Membaca package.json
- Membaca vercel.json
- Mengidentifikasi framework project
- Menggunakan repository sebagai sumber deployment

Repository GitHub dapat digunakan sebagai source project untuk sistem deployment.

---

# 🚀 Deployment System

ReyCode Digital memiliki backend deployment yang terintegrasi dengan Vercel API.

Sistem deployment dapat digunakan untuk memproses project dari beberapa sumber.

Source yang didukung dapat mencakup:

- Upload project
- ZIP project
- GitHub repository
- GitLab repository
- Bitbucket repository

Project akan diperiksa terlebih dahulu sebelum proses deployment.

---

## 🔎 Framework Detection

Deployment system memiliki mekanisme untuk mendeteksi framework project.

Framework yang dapat dikenali berdasarkan konfigurasi dan dependency antara lain:

- Next.js
- Nuxt
- SvelteKit
- Astro
- Remix
- Angular
- TanStack Start
- SolidStart
- Gatsby
- React
- Preact
- Vite
- Vue
- Svelte
- Express
- Fastify
- Hono
- NestJS
- Koa
- Hapi
- Elysia
- H3

Deteksi framework dapat menggunakan:

- package.json
- vercel.json
- dependencies
- devDependencies
- peerDependencies
- build scripts

---

# 📁 Project Upload

Upload project memiliki beberapa validasi keamanan.

Sistem melakukan pemeriksaan terhadap:

- Ukuran file
- Jumlah file
- Ukuran total ZIP
- Path traversal
- Struktur project
- File konfigurasi
- Framework project

Path berbahaya seperti:

```text
../
```

ditolak oleh sistem untuk mencegah path traversal.

---

# 📧 Email System

Project menggunakan Nodemailer untuk kebutuhan email.

Email dapat digunakan untuk:

- Welcome email
- Email verification
- Forgot password
- Password reset
- Informasi akun

Konfigurasi email menggunakan environment variable sehingga credential tidak disimpan langsung di source code.

---

# 🔑 Security

Keamanan merupakan bagian penting dari project.

Beberapa mekanisme keamanan yang digunakan:

- JWT authentication
- Password hashing
- Environment variables
- Request validation
- File type validation
- File size validation
- Object ID validation
- Authorization check
- Upload restrictions
- Path traversal protection
- Database validation
- Token expiration
- Protected API endpoints

Credential dan secret tidak seharusnya ditulis langsung di source code.

---

# 🗄️ Database

Database menggunakan MongoDB dengan Mongoose sebagai ODM.

Beberapa model yang digunakan dalam project meliputi:

```text
User
Deployment
GitHubAccount
OtpRequest
AlightMotionHistory
ChatMessage
ChatPresence
Product
Cart
Order
ProductComment
Story
StoryView
StoryComment
```

Beberapa model dapat digunakan oleh fitur yang sedang dikembangkan atau telah diintegrasikan sebelumnya.

---

# 🧩 Database Models

## User

Digunakan untuk menyimpan informasi akun pengguna.

Data dapat mencakup:

- Name
- Email
- Password
- WhatsApp
- Avatar
- Cover
- Email verification
- Phone verification
- Verification token
- Reset token
- Reset token expiration

---

## Product

Digunakan untuk menyimpan produk marketplace.

Data:

- Seller
- Name
- Description
- Price
- Stock
- Category
- Images
- Status
- Created date
- Updated date

---

## Cart

Digunakan untuk menyimpan produk yang dipilih pengguna.

Data:

- User
- Product
- Quantity

---

## Order

Digunakan untuk menyimpan pesanan marketplace.

Data:

- Buyer
- Items
- Seller
- Product
- Price
- Quantity
- Subtotal
- Total
- Status

---

## ProductComment

Digunakan untuk sistem komentar marketplace.

Data:

- Product
- User
- Parent comment
- Text
- Created date

---

## Story

Digunakan untuk menyimpan Story.

Data:

- Owner
- Media URL
- Media pathname
- Media type
- Content type
- Caption
- Created date
- Expiration date

---

## StoryView

Digunakan untuk mencatat viewer Story.

Data:

- Story
- User
- Viewed time

Satu user dapat memiliki satu record view untuk Story tertentu.

---

## StoryComment

Digunakan untuk komentar Story.

Data:

- Story
- User
- Parent comment
- Text
- Created date

---

# 🏗️ Project Architecture

Struktur project utama:

```text
digital/
│
├── api/
│   ├── _lib/
│   │   ├── auth.js
│   │   ├── deploy.js
│   │   ├── github.js
│   │   ├── mail.js
│   │   └── mongodb.js
│   │
│   ├── auth/
│   │   ├── forgot-password.js
│   │   ├── login.js
│   │   ├── logout.js
│   │   ├── register.js
│   │   ├── reset-password.js
│   │   └── verify-email.js
│   │
│   ├── alightmotion.js
│   ├── chat.js
│   ├── deploy/
│   │   └── index.js
│   │
│   ├── github/
│   │   └── index.js
│   │
│   └── user/
│       ├── me.js
│       └── update.js
│
├── lib/
│   ├── chat/
│   │   ├── auth/
│   │   ├── group/
│   │   ├── messages/
│   │   ├── presence/
│   │   └── users/
│   │
│   ├── stories/
│   │   ├── index.js
│   │   ├── create.js
│   │   ├── view.js
│   │   ├── delete.js
│   │   └── comments.js
│   │
│   └── upload.js
│
├── models/
│   ├── User.js
│   ├── Deployment.js
│   ├── GitHubAccount.js
│   ├── OtpRequest.js
│   ├── AlightMotionHistory.js
│   ├── ChatMessage.js
│   ├── ChatPresence.js
│   ├── Product.js
│   ├── Cart.js
│   ├── Order.js
│   ├── ProductComment.js
│   ├── Story.js
│   ├── StoryView.js
│   └── StoryComment.js
│
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── forgot-password.html
│   ├── reset-password.html
│   ├── verify-email.html
│   ├── dashboard.html
│   ├── profile.html
│   ├── deploy.html
│   ├── github.html
│   ├── alightmotion.html
│   └── chatpublic.html
│
├── templates/
│   └── email/
│       └── welcome.html
│
├── package.json
├── vercel.json
└── README.md
```

---

# 🛠️ Technology Stack

## Frontend

- HTML5
- CSS3
- JavaScript
- Responsive Design
- Fetch API

## Backend

- Node.js
- Vercel Functions
- REST API
- JavaScript ES Modules

## Database

- MongoDB
- Mongoose

## Authentication

- JWT
- bcryptjs
- Token-based authentication

## Storage

- Vercel Blob

## Email

- Nodemailer

## Deployment

- Vercel API

## External Services

- GitHub API
- MongoDB
- Vercel Blob
- Vercel API
- SMTP compatible email service

---

# 📦 Dependencies

Dependency utama project:

```text
@vercel/blob
axios
bcryptjs
jose
mongoose
nodemailer
formidable
adm-zip
vercel
```

---

# ⚙️ Environment Variables

Project menggunakan environment variables untuk menyimpan konfigurasi sensitif.

Contoh:

```env
MONGODB_URI=
JWT_SECRET=

API_VERCEL=
VERCEL_TEAM_ID=

GMAIL_USER=
GMAIL_APP_PASSWORD=
MAIL_FROM_NAME=
```

Jangan memasukkan credential asli ke dalam repository.

---

# 💻 Local Development

Clone repository:

```bash
git clone https://github.com/reycode-lt/digital.git
```

Masuk ke directory:

```bash
cd digital
```

Install dependency:

```bash
npm install
```

Jalankan development server:

```bash
npm run dev
```

Project menggunakan Vercel CLI untuk local development.

---

# 🌐 Vercel Deployment

Project dapat dijalankan menggunakan Vercel.

Pastikan environment variable sudah dikonfigurasi pada project deployment.

Setelah konfigurasi selesai, project dapat di-deploy menggunakan:

```bash
vercel
```

Untuk production deployment:

```bash
vercel --prod
```

---

# 🔄 API Architecture

Backend menggunakan Vercel Functions sebagai API endpoint.

Contoh endpoint:

```text
/api/auth/login
/api/auth/register
/api/auth/logout
/api/auth/forgot-password
/api/auth/reset-password
/api/auth/verify-email
/api/user/me
/api/user/update
/api/github
/api/deploy
/api/alightmotion
/api/chat
```

Beberapa fitur menggunakan action-based API untuk mengurangi jumlah serverless function.

Contoh:

```text
/api/chat?action=stories
/api/chat?action=story
/api/chat?action=storyviewers
/api/chat?action=storycomments
```

---

# 🧭 Frontend Routes

Route utama:

```text
/
/login
/register
/forgot-password
/reset-password
/verify-email
/dashboard
/profile
/deploy
/github
/alightmotion
/chat
```

Routing halaman dilakukan melalui konfigurasi Vercel.

---

# 📱 Dashboard

Dashboard digunakan sebagai halaman utama setelah pengguna login.

Dashboard dapat menampilkan:

- Greeting pengguna
- Profile information
- Verification status
- Marketplace shortcut
- Story section
- User information
- Navigation menu
- Quick navigation melalui hamburger menu

Dashboard dirancang responsive agar dapat digunakan pada perangkat desktop maupun mobile.

---

# 🎨 UI Design

Project menggunakan konsep desain modern dengan fokus pada:

- Dark interface
- Glassmorphism
- Responsive layout
- Modern cards
- Soft borders
- Gradient accents
- Clean typography
- Mobile friendly navigation
- Smooth interactions

Tujuan desain adalah memberikan pengalaman yang modern tetapi tetap ringan dan mudah digunakan.

---

# 📱 Responsive Design

Seluruh halaman diarahkan untuk dapat digunakan pada:

- Smartphone
- Tablet
- Laptop
- Desktop

Komponen interface menyesuaikan ukuran layar sehingga fitur utama tetap mudah digunakan.

---

# 🔒 Data Privacy

Data pengguna harus diproses secara aman.

Data yang dapat disimpan oleh sistem antara lain:

- Account information
- Profile information
- Product information
- Order information
- Uploaded media
- Story information
- Comments
- Authentication tokens

Credential dan secret tidak boleh dimasukkan langsung ke source code.

---

# 🚨 Security Guidelines

Developer yang menjalankan project ini wajib memperhatikan:

1. Jangan commit `.env`.
2. Jangan membagikan JWT secret.
3. Jangan membagikan MongoDB URI.
4. Jangan membagikan API token Vercel.
5. Jangan membagikan Gmail App Password.
6. Gunakan environment variables.
7. Validasi semua input dari client.
8. Validasi semua file upload.
9. Batasi ukuran file.
10. Periksa authorization pada endpoint private.
11. Jangan mempercayai user ID dari client tanpa validasi token.
12. Gunakan HTTPS pada production.
13. Perbarui dependency secara berkala.

---

# 🧪 Development

Sebelum melakukan perubahan besar pada project, pastikan:

- API tetap berjalan.
- Authentication tetap berjalan.
- Database tetap dapat terhubung.
- Upload tetap berjalan.
- Marketplace tetap berjalan.
- Story tetap berjalan.
- Deployment tetap berjalan.
- Tidak ada secret yang masuk ke Git.
- Tidak ada endpoint yang rusak.

Perubahan pada backend harus diuji bersama frontend yang menggunakan endpoint tersebut.

---

# 🐛 Troubleshooting

## MongoDB tidak terhubung

Periksa:

```env
MONGODB_URI
```

Pastikan URI benar dan database dapat diakses oleh environment deployment.

---

## Authentication gagal

Periksa:

```env
JWT_SECRET
```

Pastikan secret pada environment sesuai dengan konfigurasi aplikasi.

---

## Upload gagal

Periksa:

- Content-Type
- Ukuran file
- Vercel Blob token
- Permission storage
- FormData field
- Backend upload validation

---

## Email tidak terkirim

Periksa:

```env
GMAIL_USER
GMAIL_APP_PASSWORD
MAIL_FROM_NAME
```

Pastikan konfigurasi email benar dan authentication SMTP tersedia.

---

## Deployment gagal

Periksa:

```env
API_VERCEL
VERCEL_TEAM_ID
```

Kemudian periksa:

- Framework project
- package.json
- vercel.json
- Build command
- Output directory
- Source files
- Upload size

---

# 🗺️ Development Roadmap

Pengembangan ReyCode Digital dapat terus diperluas dengan fitur:

- Marketplace improvements
- Advanced product search
- Product favorites
- Seller dashboard
- Order management dashboard
- Payment integration
- Story reactions
- Story analytics
- Story moderation
- Notification system
- Advanced profile customization
- GitHub project management
- Deployment history
- Deployment logs
- Project management
- Admin dashboard
- Security improvements
- Performance optimization
- Better mobile experience

Roadmap dapat berubah mengikuti kebutuhan project.

---

# 🤝 Contributing

Project ini merupakan project private milik ReyCode Digital.

Kontribusi tidak diperbolehkan tanpa izin dari pemilik project.

Jika seseorang mendapatkan izin untuk berkontribusi, perubahan sebaiknya dilakukan melalui:

1. Branch terpisah.
2. Perubahan terstruktur.
3. Testing.
4. Review.
5. Pull request.
6. Approval dari maintainer.

Jangan melakukan perubahan langsung pada production tanpa persetujuan.

---

# 📄 Project Status

Project ini masih dalam tahap pengembangan dan dapat mengalami perubahan struktur, API, database model, UI, maupun fitur.

Beberapa fitur dapat berubah atau diperbarui tanpa pemberitahuan sebelumnya.

Dokumentasi pada README ini digunakan sebagai dokumentasi umum project dan dapat diperbarui mengikuti perkembangan source code.

---

# 👨‍💻 Developer

**ReyCode Digital**

Repository:

https://github.com/reycode-lt/digital

---

# 📝 License

## Private Project

Copyright © ReyCode Digital.

All rights reserved.

Source code pada repository ini tidak boleh disalin, dijual, didistribusikan, dimodifikasi, dipublikasikan ulang, atau digunakan untuk tujuan komersial tanpa izin tertulis dari pemilik project.

Penggunaan source code, sebagian maupun seluruhnya, untuk project lain tidak diperbolehkan tanpa izin dari pemilik project.

Dilarang:

- Menyalin source code.
- Menjual source code.
- Mendistribusikan source code.
- Menggunakan source code untuk project komersial.
- Menggunakan ulang source code tanpa izin.
- Mengklaim source code sebagai milik pihak lain.
- Menghapus identitas copyright.
- Mempublikasikan ulang source code.
- Membuat produk turunan dari source code tanpa izin.

Hak cipta seluruh source code, struktur project, konfigurasi, desain, sistem, dan komponen yang dibuat khusus untuk ReyCode Digital tetap berada pada pemilik project, kecuali komponen pihak ketiga yang memiliki lisensi masing-masing.

Dependency pihak ketiga tetap mengikuti license masing-masing.

Tidak ada hak penggunaan, penyalinan, modifikasi, distribusi, atau komersialisasi yang diberikan hanya karena seseorang dapat melihat source code repository.

Untuk mendapatkan izin penggunaan atau kerja sama, hubungi pemilik project secara langsung.

---

# © Copyright

Copyright © ReyCode Digital.

All rights reserved.

ReyCode Digital

https://github.com/reycode-lt/digital

---

# 🔗 Repository

GitHub:

https://github.com/reycode-lt/digital

---

# ⭐ ReyCode Digital

Built and maintained by **ReyCode Digital**.

© ReyCode Digital — All Rights Reserved.

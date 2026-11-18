# PDKS Pro — QR Kodlu Personel Devam Kontrol Sistemi

**PDKS Pro**, işletmelerin ve kurumların personel giriş-çıkış, mola, vardiya, izin ve fazla mesai süreçlerini temassız QR kod teknolojisiyle uçtan uca yönetmesini sağlayan modern, gerçek zamanlı (SSE destekli) tam kapsamlı (Full-Stack) web platformudur.

---

## Temel Özellikler

- **Çift Modlu QR Geçiş Altyapısı:**
  - **Kiosk Turnike Terminali:** Web kamerası veya harici barkod okuyucu ile personel kimlik kartı okutma, düşük ışıkta otomatik fener (torch) desteği, 60 FPS çift motorlu QR okuma (`BarcodeDetector` + `jsQR`), tam ekran kilitleme (Kiosk Lockdown) ve hareketsizlik/gece yarısı otomatik bekleme ekranı.
  - **Sabit Duvar QR & Mobil Personel Portalı:** İşyeri girişine asılan A4 poster QR kodunu personelin kendi mobil cihazından okutarak **Giriş**, **Çıkış**, **Mola Başlangıcı** ve **Moladan Dönüş** işlemlerini akıllı durum makinesi (State Machine) ile otomatik gerçekleştirmesi.
- **Konum Doğrulama (Geofence / GPS):** Haversine formülü tabanlı yarıçap kontrolü ile şirket sınırları dışından yapılan QR okutma girişimlerinin engellenmesi.
- **Cihaz Eşleştirme & Güvenlik Denetimi:**
  - İlk girişte cihaz kimliği (Device ID, sanal MAC ve tarayıcı parmak izi) kaydı.
  - Başka bir personele ait kayıtlı cihazdan işlem yapıldığında **Şüpheli / Yetkisiz Cihaz Kullanımı** alarmı ve log kaydı.
  - Farklı bir cihazdan giriş yapıldığında ilk iş yeri girişi için **1 saatlik yönetici onay kilidi**.
- **Vardiya, İzin ve Fazla Mesai Yönetimi:**
  - Etkileşimli haftalık vardiya takvimi, vardiya saat çakışma kontrolü, birim amiri yetkilendirme ve sorumlu personel atama.
  - Mazeret, yıllık izin, rapor, uzaktan çalışma ve fazla mesai talepleri ile onay akışları.
  - Excel (`.xlsx`, `.xls`) ve CSV formatında toplu personel içe aktarma ve rapor dışa aktarma.
- **Canlı Pano & Performans Analitiği:**
  - Server-Sent Events (SSE) ile tüm bağlı cihazlarda anlık senkronizasyon.
  - Personel bazlı vardiya uyum skoru, geliş istikrarı, kesintisiz devam serisi ve mola disiplini analizleri.
- **Hiyerarşik Rol & Yetki Yönetimi + Kişisel Temalar:**
  - **Gizli Süper Yönetici (`SUPER_ADMIN`)**, **İK Yöneticisi**, **Birim Amiri**, **Bölüm Yöneticisi**, **Personel** ve **Turnike Görevlisi** rolleri için sayfa ve işlem bazlı granüler yetkilendirme.
  - İşten ayrılan personellerin geçmiş PDKS kayıtlarını koruyarak salt okunur **Eski Personel Arşivi**ne taşıma (Soft-Delete).
  - Kullanıcı hesabına özel 5 farklı açık/koyu arayüz teması ve opsiyonel Firebase Firestore bulut senkronizasyonu.

---

## Teknoloji Yığını

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, `qrcode`, `jsqr`, `xlsx`
- **Backend:** Node.js, Express, Server-Sent Events (SSE), yerel JSON tabanlı kalıcı veri deposu (`data/pdks-database.json`)
- **Bulut & Güvenlik (Opsiyonel):** Firebase Authentication & Firestore (`firestore.rules` ve `firebase-blueprint.json` ile şema/yetki doğrulaması)

---

## Proje Yapısı

```text
serdarmujdat-pdks/
├── server.ts                      # Express API, SSE canlı yayın ve Vite sunucusu
├── company-wall-qr.json           # Varsayılan sabit duvar QR ve geofence yapılandırması
├── firestore.rules                # Firestore güvenlik kuralları
├── firebase-blueprint.json        # Firestore veri şeması tanımları
├── security_spec.md               # Güvenlik kuralları ve denetim dokümantasyonu
├── .env.example                   # Ortam değişkenleri şablonu
└── src/
    ├── App.tsx                    # Ana uygulama ve yetkilendirme yönlendiricisi
    ├── firebase.ts                # Firebase Auth & Firestore entegrasyonu
    ├── components/                # Kiosk, Canlı Pano, Personel, Vardiya, Rapor ve Modallar
    ├── db/defaultData.ts          # Başlangıç verileri ve varsayılan tanımlar
    ├── services/storage.ts        # İstemci-sunucu senkronizasyon ve iş mantığı katmanı
    ├── themes/themes.ts           # Açık ve koyu arayüz tema tanımları
    ├── types/pdks.ts              # TypeScript veri modelleri
    └── utils/                     # QR üretimi/ayrıştırma, ses efektleri ve güvenlik yardımcıları
```

---

## Kurulum ve Çalıştırma

### 1. Gereksinimler
- **Node.js** 18 veya üzeri
- **npm**

### 2. Bağımlılıkların Yüklenmesi
```bash
npm install
```

### 3. Ortam Değişkenlerinin Yapılandırılması
`.env.example` dosyasını kopyalayarak `.env` dosyasını oluşturun ve kendi değerlerinizi tanımlayın:

```bash
cp .env.example .env
```

Başlıca ortam değişkenleri:
- `PORT`: Sunucu portu (varsayılan: `3000`)
- `PDKS_API_KEY` / `VITE_PDKS_API_KEY`: Sabit duvar QR güvenlik anahtarı
- `ADMIN_DEFAULT_PASSWORD` / `VITE_ADMIN_DEFAULT_PASSWORD`: Varsayılan yönetici şifresi
- `KIOSK_LOCK_PASSWORD`: Kiosk tam ekran kilit PIN şifresi
- `SUPER_ADMIN_USER` & `SUPER_ADMIN_PASS`: Gizli Süper Yönetici giriş bilgileri *(opsiyonel)*
- `VITE_FIREBASE_*`: Kurumsal logo ve tema bulut senkronizasyonu için Firebase ayarları *(opsiyonel)*

### 4. Geliştirme Ortamında Başlatma
```bash
npm run dev
```
Uygulama `http://localhost:3000` adresinde hem API sunucusu hem de Vite arayüzü ile birlikte çalışmaya başlar.

### 5. Üretim (Production) Derlemesi
```bash
npm run build
npm start
```

---

## Varsayılan Demo Hesapları

Sistem ilk kez başlatıldığında aşağıdaki örnek hesaplar otomatik olarak oluşturulur *(şifreler `.env` üzerinden veya İK panelinden değiştirilebilir)*:

| Rol | Kullanıcı Adı | Varsayılan Şifre | Erişim Kapsamı |
| :--- | :--- | :--- | :--- |
| **İK Yöneticisi** | `admin` | `123456` *(veya `.env`)* | Canlı pano, personel, kayıtlar, vardiya, raporlar, logo ve duvar QR |
| **Birim Amiri** | `birim.amiri` | `123456` | Sorumlu olduğu personellerin vardiya takvimi, kiosk ve mobil portal |
| **Personel** | `personel1` | `123456` | Mobil QR okutma, mola, izin/fazla mesai talebi ve dijital kart |
| **Turnike Görevlisi** | `guvenlik` | `123456` | Kiosk terminali ve mobil portal |

---

## Temel API Uç Noktaları

- `GET /api/health` — Sunucu sağlık ve sürüm kontrolü
- `GET /api/events` — Çoklu cihaz canlı senkronizasyon için SSE akışı
- `GET / POST /api/db/sync` — Veritabanı durum eşitleme
- `POST /api/auth/login` — Kullanıcı adı ve şifre doğrulama
- `POST /api/scan` — Kiosk ve mobil QR giriş/çıkış/mola kaydı işleme
- `GET / POST /api/employees` & `POST /api/employees/:id/archive` — Personel yönetimi ve arşivleme
- `GET / POST /api/company/wall-qr` — Sabit duvar QR ve GPS geofence ayarları
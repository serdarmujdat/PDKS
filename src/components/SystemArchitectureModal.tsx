import React, { useState } from 'react';
import {
  Database,
  Server,
  Copy,
  Check,
  X,
  Layers,
  CheckCircle2,
  BookOpen,
  Cpu,
} from 'lucide-react';

interface SystemArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemArchitectureModal: React.FC<SystemArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'db' | 'api' | 'statemachine' | 'setup'>('statemachine');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  if (!isOpen) return null;

  const sqlSchemaCode = `-- ==========================================================
-- PDKS PRO SİSTEMİ - İLİŞKİSEL VERİTABANI ŞEMASI (PostgreSQL / SQLite)
-- ==========================================================

-- 1. KULLANICILAR VE YETKİ HESAPLARI TABLOSU
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    employee_id VARCHAR(36) REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ik_yoneticisi', 'yonetici', 'personel', 'guvenlik')),
    can_check_in_out BOOLEAN DEFAULT TRUE,
    can_take_break BOOLEAN DEFAULT TRUE,
    can_request_leave BOOLEAN DEFAULT TRUE,
    can_view_own_stats BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- 2. PERSONEL DETAY VE BİLGİLERİ TABLOSU
CREATE TABLE employees (
    id VARCHAR(36) PRIMARY KEY, -- örn. EMP-1001
    tc_no VARCHAR(11) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    department VARCHAR(50) NOT NULL,
    title VARCHAR(80) NOT NULL,
    shift_id VARCHAR(36) REFERENCES shifts(id),
    current_presence VARCHAR(20) NOT NULL DEFAULT 'outside' CHECK (current_presence IN ('inside', 'outside', 'break')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'leave', 'inactive')),
    last_action_time TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. VARDİYA TANIMLARI TABLOSU
CREATE TABLE shifts (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,       -- örn. 08:30:00
    end_time TIME NOT NULL,         -- örn. 17:30:00
    tolerance_minutes INT DEFAULT 15,
    break_minutes INT DEFAULT 60,
    work_days TEXT[] DEFAULT ARRAY['Pazartesi','Salı','Çarşamba','Perşembe','Cuma']
);

-- 4. SABİT ŞİRKET DUVAR QR KODLARI VE GEOFENCE TABLOSU
CREATE TABLE company_wall_qr_tokens (
    id VARCHAR(36) PRIMARY KEY,
    token_string VARCHAR(100) UNIQUE NOT NULL, -- örn: PDKS:WALL:HQ-MAIN:2026-X8F9
    company_name VARCHAR(100) NOT NULL,
    branch_name VARCHAR(100) NOT NULL,
    installation_location VARCHAR(150),
    enable_geofence BOOLEAN DEFAULT FALSE,
    latitude DECIMAL(9, 6) DEFAULT 41.0082,
    longitude DECIMAL(9, 6) DEFAULT 28.9784,
    radius_meters INT DEFAULT 200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 5. HAREKET VE DEVAM LOGLARI (PDKS AUDIT RECORDS) TABLOSU
CREATE TABLE attendance_records (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL REFERENCES employees(id),
    date DATE NOT NULL,
    time_str TIME NOT NULL,
    server_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('check_in', 'check_out', 'break_start', 'break_end')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'normal', 'overtime')),
    late_minutes INT DEFAULT 0,
    method VARCHAR(30) NOT NULL DEFAULT 'mobile_scanner', -- mobile_scanner | kiosk_camera | manual_admin
    terminal_name VARCHAR(80) DEFAULT 'Mobil Cihaz (Sabit Duvar QR)',
    user_latitude DECIMAL(9, 6),
    user_longitude DECIMAL(9, 6),
    geofence_verified BOOLEAN DEFAULT TRUE
);

-- Hızlı sorgulama ve raporlama için indeksler
CREATE INDEX idx_records_emp_date ON attendance_records (employee_id, date);
CREATE INDEX idx_records_timestamp ON attendance_records (server_timestamp DESC);
CREATE INDEX idx_emp_presence ON employees (current_presence);`;

  const apiEndpointsCode = `// ==========================================================
// PDKS PRO REST API UÇ NOKTALARI (Node.js/Express & Python)
// ==========================================================

1. POST /api/auth/login
   - Amaç: Kullanıcı adı ve şifre ile güvenli oturum açma
   - Body: { "username": "personel1", "password": "******" }
   - Yanıt: {
       "success": true,
       "token": "jwt_token_here",
       "user": {
         "id": "ACC-1002",
         "username": "personel1",
         "role": "personel",
         "employeeId": "EMP-1001",
         "permissions": { "canCheckInOut": true, "canTakeBreak": true }
       }
     }

2. POST /api/scan-qr  (TEMEL DURUM YÖNETİMİ / STATE MACHINE)
   - Amaç: Duvardaki şirket QR kodunu okutup personelin durumunu güncelleme
   - Headers: 
       Authorization: Bearer <user_jwt_token>
       x-api-key: <GİZLİ_API_ANAHTARI>
   - Body: {
       "employeeId": "EMP-1001",
       "scannedToken": "<GİZLİ_API_ANAHTARI>",
       "scanMode": "normal", // "normal" | "break"
       "userLocation": { "latitude": 41.0082, "longitude": 28.9784 } // opsiyonel GPS
     }
   - Yanıt: {
       "success": true,
       "action": "check_in", // "check_in" | "check_out" | "break_start" | "break_end"
       "previousPresence": "outside",
       "newPresence": "inside",
       "message": "Vardiya Girişi Yapıldı. Hoş geldiniz!",
       "serverTimestamp": "2026-10-09T08:30:15.120Z",
       "record": { ... }
     }

3. GET /api/company/wall-qr
   - Amaç: Şirket duvarına asılacak güncel sabit QR verisini ve Geofence parametrelerini getirme
   - Headers: x-api-key: <GİZLİ_API_ANAHTARI>
   - Yanıt: {
       "token": "<GİZLİ_API_ANAHTARI>",
       "companyName": "Kurum / Şirket Adı",
       "branchName": "İşyeri",
       "enableGeofence": true,
       "radiusMeters": 200
     }

4. GET /api/admin/logs?date=2026-10-09&department=Yazılım
   - Amaç: Canlı geçiş kayıtlarını filtreleme ve Excel/CSV dışa aktarım verisi üretme

5. GET /api/employees/status-live
   - Amaç: Kim içeride, kim molada, kim ayrıldı anlık canlı durum tablosu`;

  const setupInstructions = `# ==========================================================
# PDKS PRO - ADIM ADIM KURULUM VE ÇALIŞTIRMA TALİMATI
# ==========================================================

1. GEREKSİNİMLER:
   - Node.js 18+ veya 20+
   - npm veya bun / yarn

2. KURULUM VE ORTAM DEĞİŞKENLERİ:
   git clone <repo_url>
   cd pdks-pro
   npm install
   cp .env.example .env
   # .env dosyası içine kendi API anahtarlarınızı ve Firebase ayarlarınızı girin.

3. GELİŞTİRME SUNUCUSUNU ÇALIŞTIRMA:
   npm run dev
   # Uygulama http://localhost:3000 adresinde anında çalışmaya başlar!

4. ÜRETİM (PRODUCTION) DERLEMESİ:
   npm run build
   npm run preview

5. İŞLETME İÇİ KURULUM ADIMLARI:
   Adım A: Yönetici paneline girin ("Şirket Duvarı QR Kodu Oluşturucu" butonuna tıklayın).
   Adım B: "Yazdır (A4 Poster)" butonuna basarak poster çıktısını alın ve işyeri giriş turnikesine asın.
   Adım C: Personel telefonundan tarayıcıyı açarak sisteme girer, kullanıcı adı/şifresiyle oturum açar.
   Adım D: "Kamerayı Aç" penceresinden duvardaki QR'ı okuttuğunda PDKS akıllı durum makinesi otomatik çalışır!`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[90vh] animate-fade-in">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">PDKS Pro - Sistem Mimarisi & Geliştirici Kılavuzu</h2>
              <p className="text-xs text-slate-300">
                Uçtan uca durum makinesi, veritabanı şemaları, REST API rotaları ve kurulum rehberi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('statemachine')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'statemachine'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-4 h-4 text-indigo-600" />
            <span>Durum Mantığı (State Machine)</span>
          </button>

          <button
            onClick={() => setActiveTab('db')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'db'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-600" />
            <span>Veritabanı Şeması (SQL DDL)</span>
          </button>

          <button
            onClick={() => setActiveTab('api')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'api'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="w-4 h-4 text-blue-600" />
            <span>Backend REST API Uç Noktaları</span>
          </button>

          <button
            onClick={() => setActiveTab('setup')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'setup'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-600" />
            <span>Kurulum ve Dağıtım Rehberi</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: State Machine Explanation */}
          {activeTab === 'statemachine' && (
            <div className="space-y-6">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                <h3 className="text-sm font-bold text-indigo-900 mb-1">
                  Şirket Sabit QR Koduna Dayalı Dinamik Durum Yönetimi (State Machine)
                </h3>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Şirket duvarına tek bir sabit QR kod asılır. Personel mobil cihazından bu kodu
                  okuttuğunda sistem personelin son durumunu ve seçtiği işlem modunu kontrol ederek 4
                  temel durumu otomatik işletir:
                </p>
              </div>

              {/* 4 Interactive State Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 transition-all shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      1. Adım: Vardiya Girişi
                    </span>
                    <span className="text-[11px] font-mono text-emerald-600 font-bold">check_in</span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold">
                    Personel Sistemde "Dışarıda" Görünüyorsa:
                  </div>
                  <p className="text-xs text-slate-600">
                    Duvardaki sabit QR kodu okuttuğunda otomatik olarak{' '}
                    <strong className="text-emerald-700 font-semibold">"Vardiya Girişi Yapıldı"</strong>{' '}
                    kaydı düşer ve personel durumu{' '}
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      İçeride (Çalışıyor)
                    </span>{' '}
                    olarak güncellenir.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-rose-300 transition-all shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      2. Adım: Vardiya Çıkışı
                    </span>
                    <span className="text-[11px] font-mono text-rose-600 font-bold">check_out</span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold">
                    Personel "İçeride (Çalışıyor)" ve Normal Tarama Yaparsa:
                  </div>
                  <p className="text-xs text-slate-600">
                    Normal modda duvardaki QR okutulduğunda mesai bitimi algılanır,{' '}
                    <strong className="text-rose-700 font-semibold">"Vardiya Çıkışı Yapıldı"</strong>{' '}
                    kaydı atılır ve durum{' '}
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[11px] font-bold">
                      Dışarıda
                    </span>{' '}
                    olur.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-all shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      3. Adım: Mola Başlangıcı
                    </span>
                    <span className="text-[11px] font-mono text-amber-600 font-bold">break_start</span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold">
                    Personel İçerideyken "Molaya Çık" Seçip QR Okutursa:
                  </div>
                  <p className="text-xs text-slate-600">
                    Ekrandaki "Molaya Ayrıl" seçeneği işaretlenip QR okutulursa mola başlama saati
                    kaydedilir ve personelin durumu{' '}
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
                      Molada
                    </span>{' '}
                    olarak değiştirilir.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-sky-300 transition-all shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      4. Adım: Mola Bitişi (Otomatik)
                    </span>
                    <span className="text-[11px] font-mono text-sky-600 font-bold">break_end</span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold">
                    Personel "Molada" İken QR Kodu Tekrar Okutursa:
                  </div>
                  <p className="text-xs text-slate-600">
                    Sistem durumu otomatik algılar. Herhangi bir ekstra butona gerek kalmadan{' '}
                    <strong className="text-sky-700 font-semibold">"Moladan Döndü"</strong> logunu
                    kaydeder ve personeli tekrar{' '}
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      İçeride (Çalışıyor)
                    </span>{' '}
                    yapar.
                  </p>
                </div>
              </div>

              {/* Security Features */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Güvenlik ve Doğrulama Mekanizmaları
                </h4>
                <ul className="text-xs text-slate-700 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Sunucu Taraflı Zaman Damgası:</strong> Kullanıcının cihazındaki saat
                      değişiklikleri logları etkilemez; sunucu veya yetkili UTC zaman damgası esas
                      alınır.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>3 Saniyelik Okuma Kilidi (Debounce):</strong> Yanlışlıkla veya kamera
                      odaklanması nedeniyle çift okuma oluşmasını engeller.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Opsiyonel Geolocation (GPS Doğrulaması):</strong> QR kodun fotoğrafının
                      çekilip şirket dışından okutulmasını engellemek için Haversine formülüyle işyeri
                      yarıçapı (örn. 200m) kontrol edilir.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: SQL Database Schema */}
          {activeTab === 'db' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">İlişkisel Veritabanı Tabloları</h3>
                  <p className="text-xs text-slate-500">
                    PostgreSQL veya SQLite uyumlu DDL tabloları ve yabancı anahtar ilişkileri.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(sqlSchemaCode, 'sql')}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {copiedSection === 'sql' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>SQL'i Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[480px]">
                <pre>{sqlSchemaCode}</pre>
              </div>
            </div>
          )}

          {/* TAB 3: REST API Endpoints */}
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">RESTful Backend Uç Noktaları</h3>
                  <p className="text-xs text-slate-500">
                    İstemci ve mobil tarayıcı ile haberleşen API rotaları ve JSON veri formatları.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(apiEndpointsCode, 'api')}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {copiedSection === 'api' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>API Dökümünü Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 text-emerald-400 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800 max-h-[480px]">
                <pre className="text-slate-300">{apiEndpointsCode}</pre>
              </div>
            </div>
          )}

          {/* TAB 4: Setup Guide */}
          {activeTab === 'setup' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Kurulum ve Çalıştırma Adımları</h3>
                  <p className="text-xs text-slate-500">
                    İşletme sunucusuna veya bulut ortamına (Node.js/Docker) dağıtım rehberi.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(setupInstructions, 'setup')}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {copiedSection === 'setup' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Talimatı Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
                <pre>{setupInstructions}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">PDKS Pro v2.4</span>
            <span>·</span>
            <span>Kurumsal Web Platformu</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};

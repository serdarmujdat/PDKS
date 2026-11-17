import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle,
  LogIn,
  QrCode,
  MapPin,
  Clock,
  Calendar,
  Smartphone,
  Building2,
} from 'lucide-react';
import { CurrentUser } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { CompanyLogoImage } from './CompanyLogoImage';

interface LandingLoginPageProps {
  onLoginSuccess: (user: CurrentUser) => void;
  companyLogo: string;
  companyName?: string;
}

export const LandingLoginPage: React.FC<LandingLoginPageProps> = ({
  onLoginSuccess,
  companyLogo,
  companyName: propCompanyName,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string>(() => propCompanyName || pdksStorage.getCompanyName());

  useEffect(() => {
    if (propCompanyName) setCompanyName(propCompanyName);
  }, [propCompanyName]);

  useEffect(() => {
    const syncName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-wall-qr-updated', syncName);
    window.addEventListener('pdks-data-synced', syncName);
    return () => {
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-wall-qr-updated', syncName);
      window.removeEventListener('pdks-data-synced', syncName);
    };
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Lütfen kullanıcı adı ve şifrenizi giriniz.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await pdksStorage.loginWithCredentialsAsync(username, password);
      setIsLoading(false);

      if (res.success && res.user) {
        setSuccessNotice(res.message);
        setTimeout(() => {
          onLoginSuccess(res.user!);
        }, 300);
      } else {
        setError(res.message);
      }
    } catch {
      setIsLoading(false);
      setError('Giriş doğrulaması sırasında bir hata oluştu.');
    }
  };

  const todayDateStr = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-indigo-600 selection:text-white">
      {/* Top Header - Sadece Kurumsal Logo ve Marka (Herkese Açık Logo Ekleme Butonu Yoktur) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand & Standard Company Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 max-w-[220px] flex items-center shrink-0">
              <CompanyLogoImage
                src={companyLogo}
                alt={companyName}
                companyName={companyName}
                className="max-h-9 max-w-[200px] w-auto h-auto object-contain"
                variant="light"
              />
            </div>
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <span className="text-xs font-bold text-slate-900 block leading-tight">
                {companyName}
              </span>
              <span className="text-[10px] text-slate-500 block leading-tight">
                Personel Devam Kontrol Sistemi
              </span>
            </div>
          </div>

          {/* Right Header: Security Status & Date */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline font-medium">Güvenli Giriş Portalı</span>
              <span className="sm:hidden font-medium">Güvenli Giriş</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-10 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Column: System Overview & Feature Cards (order-2 on mobile, order-1 on desktop) */}
          <div className="lg:col-span-7 space-y-5 order-2 lg:order-1">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{companyName} · Devam Takip ve Güvenlik Altyapısı</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                QR Kodlu Personel Devam Kontrol Sistemi
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                Temassız QR kodlu turnike geçişleri, GPS işyeri konumu geofence doğrulaması, canlı mesai ve mola takibi ile şirketinizin devam kontrolünü eksiksiz yönetin.
              </p>
            </div>

            {/* Feature highlights grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">QR Turnike & Kiosk</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Kamera veya mobil ekran üzerinden milisaniyelik dinamik kod okuma.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">İşyeri Konum Güvenliği</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Şirket koordinatları dışından QR ile giriş/çıkış yapılamaz.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Vardiya & Mola İntizamı</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Tolerans dakikaları, gecikme logları ve mola süresi analizi.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Mobil Personel Portalı</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Personeller kullanıcı adı ve şifresiyle dijital kimlik kartına erişir.
                  </p>
                </div>
              </div>
            </div>

            {/* Date and Security reassurance */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="capitalize">{todayDateStr}</span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-500" />
                <span>{companyName} PDKS v2.4</span>
              </div>
            </div>
          </div>

          {/* Right Column: Prominent Login Form Card (order-1 on mobile so it appears first, order-2 on desktop) */}
          <div className="lg:col-span-5 order-1 lg:order-2">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
              {/* Card Header with Standard Corporate Logo */}
              <div className="p-5 sm:p-6 bg-linear-to-b from-slate-50 to-white border-b border-slate-100 text-center space-y-2.5 sm:space-y-3">
                <div className="w-full h-14 max-w-[240px] mx-auto rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs flex items-center justify-center">
                  <CompanyLogoImage
                    src={companyLogo}
                    alt={companyName}
                    companyName={companyName}
                    className="max-h-11 max-w-[210px] w-auto h-auto object-contain"
                    variant="light"
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {companyName} · Giriş
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kullanıcı adı ve şifrenizle oturum açınız
                  </p>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* Success Banner */}
                {successNotice && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{successNotice}</span>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 animate-fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Username input - Talep: Örn olarak kullanici.adi olsun */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Kullanıcı Adı:
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Örn: kullanici.adi"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck="false"
                        className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Password input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Şifre:
                      </label>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                        title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>Sisteme Giriş Yap</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Security & Access Information */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
                      <Shield className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Güvenli Kurumsal Giriş</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Kullanıcı hesapları ve şifreler İnsan Kaynakları departmanı tarafından tanımlanmaktadır. Giriş şifrenizi öğrenmek veya değiştirmek için İK departmanına başvurunuz.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{companyName}</span>
            <span>·</span>
            <span>Tüm Hakları Saklıdır © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-slate-400">KVKK & Güvenlik Uyumlu</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

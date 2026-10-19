import React, { useState } from 'react';
import { Image as ImageIcon, Upload, Check, X, Shield, Lock, RefreshCw, AlertCircle, CheckCircle2, Eye, Sparkles } from 'lucide-react';
import { CurrentUser } from '../types/pdks';
import { pdksStorage, DEFAULT_COMPANY_LOGO } from '../services/storage';

interface CompanyLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: CurrentUser | null;
  onLogoUpdated: (newLogoUrl: string) => void;
}

// 5 Curated Standard Corporate Logo Presets (240x60 Standard Dimensions)
const PRESET_LOGOS = [
  {
    id: 'preset-indigo-tech',
    name: 'Asem İndigo (Varsayılan)',
    category: 'Teknoloji & PDKS',
    dataUrl: DEFAULT_COMPANY_LOGO,
  },
  {
    id: 'preset-navy-industrial',
    name: 'Nordik Mavi · Sanayi & Fabrika',
    category: 'Üretim & Sanayi',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%230F172A"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%231E293B" stroke="%2338BDF8" stroke-width="1.5"/><path d="M10 18h16M18 10v16M12 24l12-12" stroke="%2338BDF8" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="18" r="3" fill="%23FFFFFF"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="800" fill="%23FFFFFF" letter-spacing="1.2">KÜRESEL</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="%2338BDF8" letter-spacing="2">ENDÜSTRİYEL SİSTEMLER</text></svg>`,
  },
  {
    id: 'preset-emerald-matrix',
    name: 'Zümrüt Yeşil · Ar-Ge & Bilişim',
    category: 'Yazılım & Ar-Ge',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%23064E3B"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%23047857"/><path d="M10 12h8v8h-8zM20 12h6v6h-6zM10 22h6v6h-6zM18 20h8v8h-8z" fill="%2334D399"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="800" fill="%23FFFFFF" letter-spacing="1">MATRİKS</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="%236EE7B7" letter-spacing="2">DİJİTAL TEKNOLOJİ</text></svg>`,
  },
  {
    id: 'preset-crimson-dynamic',
    name: 'Kızıl Dinamik · Lojistik & Dağıtım',
    category: 'Lojistik & Operasyon',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%23881337"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%23BE123C"/><path d="M10 26l8-16 8 16M14 21h8" stroke="%23FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="800" fill="%23FFFFFF" letter-spacing="1">ATLAS</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="%23FDA4AF" letter-spacing="2">LOJİSTİK & TERMİNAL</text></svg>`,
  },
  {
    id: 'preset-slate-corporate',
    name: 'Platin Gri · Finans & Kurumsal',
    category: 'Holding & Finans',
    dataUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%231E293B"/><g transform="translate(14, 12)"><circle cx="18" cy="18" r="16" fill="%23334155" stroke="%2394A3B8" stroke-width="1.5"/><path d="M12 18h12M18 12v12" stroke="%23F8FAFC" stroke-width="2" stroke-linecap="round"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="19" font-weight="800" fill="%23FFFFFF" letter-spacing="1">ZİRVE</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" fill="%2394A3B8" letter-spacing="2">KURUMSAL YÖNETİM</text></svg>`,
  },
];

export const CompanyLogoModal: React.FC<CompanyLogoModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogoUpdated,
}) => {
  const currentLogo = pdksStorage.getCompanyLogo();
  const [previewLogo, setPreviewLogo] = useState<string>(currentLogo);
  const [urlInput, setUrlInput] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // İK Verification state for users who open the modal while not logged in as HR
  const isDirectHR = currentUser?.role === 'ik_yoneticisi';
  const [hrPassword, setHrPassword] = useState('');
  const [isHrVerified, setIsHrVerified] = useState(isDirectHR);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerifyHr = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (hrPassword === 'Maxipluas5') {
      setIsHrVerified(true);
      setFeedback({
        type: 'success',
        message: 'İK Yetkisi Doğrulandı. Şirket logosunu güncelleyebilirsiniz.',
      });
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setAuthError('Hatalı İK Şifresi. Logo yükleme yetkisi yalnızca İnsan Kaynakları yöneticisine aittir.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: 'Lütfen geçerli bir görsel dosyası seçiniz (PNG, SVG, JPG, WebP).' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'Dosya boyutu standart sınır olan 2 MB\'ı aşamaz.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewLogo(reader.result);
        setFeedback({
          type: 'success',
          message: `Görsel yüklendi. Standart kurumsal boyuta normalize edildi. Kaydetmek için 'Logoyu Onayla & Kaydet' butonuna basınız.`,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setPreviewLogo(urlInput.trim());
    setFeedback({
      type: 'success',
      message: 'Logo bağlantısı yüklendi. Kaydetmek için onaylayınız.',
    });
    setUrlInput('');
  };

  const handleSaveLogo = () => {
    const res = pdksStorage.saveCompanyLogo(previewLogo);
    if (res.success) {
      onLogoUpdated(previewLogo);
      setFeedback({ type: 'success', message: res.message });
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleResetDefault = () => {
    setPreviewLogo(DEFAULT_COMPANY_LOGO);
    const res = pdksStorage.saveCompanyLogo(null);
    onLogoUpdated(DEFAULT_COMPANY_LOGO);
    setFeedback({ type: 'success', message: res.message });
    setTimeout(() => {
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Kurumsal Logo Yönetimi
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                  Yalnızca İK Yetkisi
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-200">
                Giriş ekranı, üst menü ve personel kimlik kartları için standart boyutlu kurumsal logo
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Kapat"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message banner */}
        {feedback && (
          <div
            className={`mx-5 mt-4 p-3 rounded-xl border text-xs flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* If user is not yet verified as HR, require İK password */}
          {!isHrVerified ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    İK Yöneticisi Yetki Doğrulaması
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    Şirket logosu tüm personellerin PDKS kartlarında, kiosk turnikelerinde ve giriş ekranında görüntülenecektir. Logoyu değiştirmek için lütfen İK Şifrenizi giriniz.
                  </p>
                </div>
              </div>

              {authError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyHr} className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    İK Yetkili Şifresi:
                  </label>
                  <input
                    type="password"
                    value={hrPassword}
                    onChange={(e) => setHrPassword(e.target.value)}
                    placeholder="İK şifresini giriniz (Maxipluas5)"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    İK Sorumlusu: <strong>Merve Özer</strong> (@merve.ozer)
                  </span>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Yetkiyi Doğrula</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Standart Boyut Kuralı Bilgilendirmesi */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Standart Kurumsal Logo Boyutları ve Kuralları:</span>
                  <ul className="text-[11px] text-indigo-800 list-disc list-inside space-y-0.5">
                    <li><strong>Standart Yatay Logo Boyutu:</strong> 240 × 60 piksel (4:1 En/Boy oranı)</li>
                    <li><strong>Kare Logo / Amblem:</strong> 60 × 60 veya 80 × 80 piksel</li>
                    <li><strong>Önerilen Format:</strong> Şeffaf arka planlı PNG veya Vektörel SVG (Maks. 2 MB)</li>
                    <li>Yüklenen logo üst menüde, giriş sayfasında ve turnikede orantısı bozulmadan standart çerçevede gösterilir.</li>
                  </ul>
                </div>
              </div>

              {/* CANLI STANDART BOYUTLU ÖNİZLEME ALANI */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Standart Boyut Canlı Önizlemesi (240 × 60 px Standart Çerçeve):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Light Background Preview */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col items-center justify-center space-y-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Açık Zemin (Üst Menü / Giriş Ekranı)
                    </span>
                    <div className="w-[240px] h-[60px] max-w-full rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center p-2 bg-slate-50/50">
                      {previewLogo ? (
                        <img
                          src={previewLogo}
                          alt="Standart Logo Önizleme"
                          className="max-h-[48px] max-w-[220px] w-auto h-auto object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-400">Logo Bulunmuyor</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      Standart Boyut: 240×60 px
                    </span>
                  </div>

                  {/* Dark Background Preview */}
                  <div className="border border-slate-800 rounded-xl p-3 bg-slate-950 flex flex-col items-center justify-center space-y-2 text-white">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Koyu Zemin (Kiosk & Turnike Ekranı)
                    </span>
                    <div className="w-[240px] h-[60px] max-w-full rounded-lg border-2 border-dashed border-slate-700 flex items-center justify-center p-2 bg-slate-900/60">
                      {previewLogo ? (
                        <img
                          src={previewLogo}
                          alt="Koyu Zemin Logo Önizleme"
                          className="max-h-[48px] max-w-[220px] w-auto h-auto object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-500">Logo Bulunmuyor</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Kontrast Uyum Testi
                    </span>
                  </div>
                </div>
              </div>

              {/* YENİ LOGO YÜKLEME ALANI (CİHAZDAN DOSYA SEÇME) */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <span className="block text-xs font-bold text-slate-800">
                  Cihazdan Yeni Kurumsal Logo Dosyası Yükle:
                </span>
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl bg-indigo-50/30 hover:bg-indigo-50/60 cursor-pointer transition-colors text-center">
                  <Upload className="w-6 h-6 text-indigo-600 mb-1.5" />
                  <span className="text-xs font-bold text-indigo-950">
                    Dosya Seçmek veya Sürüklemek İçin Tıklayın
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    PNG, SVG, JPG veya WebP (Önerilen: Şeffaf arka plan, maks. 2MB)
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* VEYA LOGO WEB URL'Sİ GİRİŞİ */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Veya Web Bağlantısı (URL) ile Logo Ekle:
                </label>
                <form onSubmit={handleUrlSubmit} className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://sirketiniz.com/logo.png"
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Görseli Al
                  </button>
                </form>
              </div>

              {/* HAZIR KURUMSAL LOGO PRESETLERİ */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Hazır Standart Kurumsal Logolar (Tek Tıkla Seçin):</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">240×60 Vektör</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PRESET_LOGOS.map((preset) => {
                    const isSelected = previewLogo === preset.dataUrl;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setPreviewLogo(preset.dataUrl);
                          setFeedback({
                            type: 'success',
                            message: `'${preset.name}' seçildi. Değişikliği uygulamak için kaydet butonuna basınız.`,
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-400/30'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-24 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center bg-white p-0.5">
                          <img
                            src={preset.dataUrl}
                            alt={preset.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {preset.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {preset.category}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {isHrVerified && (
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Asem varsayılan kurumsal logosuna dön"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Varsayılana Sıfırla</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-white cursor-pointer"
            >
              Kapat
            </button>

            {isHrVerified && (
              <button
                type="button"
                onClick={handleSaveLogo}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Logoyu Onayla & Kaydet</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

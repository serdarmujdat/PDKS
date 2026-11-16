import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Printer,
  Copy,
  Check,
  RefreshCw,
  MapPin,
  ShieldCheck,
  Building2,
  X,
  Download,
  AlertCircle,
  Smartphone,
  Compass,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { CompanyWallQRConfig } from '../types/pdks';
import { pdksStorage, PDKS_SYSTEM_API_KEY } from '../services/storage';
import { generateQRDataURL } from '../utils/qr';

interface CompanyWallQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: import('../types/pdks').CurrentUser;
}

export const CompanyWallQRModal: React.FC<CompanyWallQRModalProps> = ({ isOpen, onClose, currentUser }) => {
  const activeUser = currentUser || pdksStorage.getActiveUser();
  const canManageWallQR = activeUser.role === 'ik_yoneticisi';

  const [config, setConfig] = useState<CompanyWallQRConfig>(() => pdksStorage.getCompanyWallQR(activeUser));
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const current = pdksStorage.getCompanyWallQR(activeUser);
    const isGeo = Boolean(current.enableGeofence);
    const tokenVal = (current.token || PDKS_SYSTEM_API_KEY).trim();
    const portable = `ASEM:WALL:${tokenVal}:GEO:${isGeo ? 1 : 0}:${current.latitude || 41.0082}:${current.longitude || 28.9784}:${current.radiusMeters || 250}`;
    const initialConfig = { ...current, qrPayload: portable };
    setConfig(initialConfig);
    generateQRDataURL(portable, { width: 360, margin: 1 }).then((url) => {
      setQrUrl(url);
    });
  }, [isOpen, activeUser]);

  const handleRotateToken = () => {
    if (window.confirm('Şirket sabit QR güvenlik tokenını yenilemek istediğinize emin misiniz? Eski duvardaki çıktılar geçersiz olacaktır.')) {
      try {
        const updated = pdksStorage.rotateCompanyWallQR(activeUser);
        const isGeo = Boolean(updated.enableGeofence);
        const tokenVal = updated.token.trim();
        const portablePayload = `ASEM:WALL:${tokenVal}:GEO:${isGeo ? 1 : 0}:${updated.latitude}:${updated.longitude}:${updated.radiusMeters}`;
        const payloadToSave: CompanyWallQRConfig = {
          ...updated,
          qrPayload: portablePayload,
        };
        const finalSaved = pdksStorage.saveCompanyWallQR(payloadToSave, activeUser);
        setConfig(finalSaved);
        generateQRDataURL(finalSaved.qrPayload, { width: 360, margin: 1 }).then((url) => {
          setQrUrl(url);
        });
        setSavedNotice('✅ Güvenlik tokenı yenilendi! Yeni duvar posterini yazdırmayı unutmayın.');
        setTimeout(() => setSavedNotice(null), 3500);
        window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: finalSaved }));
      } catch (err: any) {
        setLocationNotice(`⚠️ Token yenilenemedi: ${err?.message || 'Yetki hatası'}`);
        setTimeout(() => setLocationNotice(null), 4000);
      }
    }
  };

  const handleSaveSettings = (e?: React.FormEvent | React.MouseEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    setIsSaving(true);
    setLocationNotice(null);
    try {
      const rawLat = config.latitude !== undefined && config.latitude !== null ? Number(config.latitude) : NaN;
      const rawLon = config.longitude !== undefined && config.longitude !== null ? Number(config.longitude) : NaN;
      const rawRadius = Number(config.radiusMeters) || 250;

      const validLat = Number.isFinite(rawLat) ? Math.max(-90, Math.min(90, rawLat)) : 41.0082;
      const validLon = Number.isFinite(rawLon) ? Math.max(-180, Math.min(180, rawLon)) : 28.9784;
      const validRadius = Math.max(10, Math.min(5000, rawRadius));
      const isGeo = Boolean(config.enableGeofence);
      const tokenVal = (config.token || PDKS_SYSTEM_API_KEY).trim();

      // Embed factory center and radius directly into portable QR payload
      const portablePayload = `ASEM:WALL:${tokenVal}:GEO:${isGeo ? 1 : 0}:${validLat}:${validLon}:${validRadius}`;

      const payloadToSave: CompanyWallQRConfig = {
        ...config,
        token: tokenVal,
        qrPayload: portablePayload,
        companyName: (config.companyName || 'Asem PDKS').trim(),
        branchName: (config.branchName || 'İşyeri').trim(),
        installationLocation: (config.installationLocation || 'Ana Giriş Turnikesi').trim(),
        latitude: validLat,
        longitude: validLon,
        radiusMeters: validRadius,
        enableGeofence: isGeo,
      };

      const updated = pdksStorage.saveCompanyWallQR(payloadToSave, activeUser);
      setConfig(updated);
      generateQRDataURL(updated.qrPayload, { width: 360, margin: 1 }).then((url) => {
        setQrUrl(url);
      });
      const successText = '✅ Şirket duvar QR ve GPS İşyeri Merkezi ayarları kaydedildi ve tüm cihazlara uygulandı!';
      setSavedNotice(successText);
      setLocationNotice(successText);
      setTimeout(() => setSavedNotice(null), 5000);

      window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: updated }));
      window.dispatchEvent(new CustomEvent('pdks-notification'));
    } catch (err: any) {
      console.error('Failed to save wall QR:', err);
      const errMsg = `⚠️ Kayıt başarısız: ${err?.message || 'Bilinmeyen hata'}`;
      setLocationNotice(errMsg);
      setTimeout(() => setLocationNotice(null), 6000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(config.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('⚠️ Tarayıcınız coğrafi konum desteği sunmuyor. Koordinatları elle girebilir veya hazır konumlardan seçebilirsiniz.');
      return;
    }
    setIsGettingLocation(true);
    setLocationNotice('📡 Cihazınızın GPS konumu alınıyor, lütfen bekleyiniz...');

    const applyCoords = (latitude: number, longitude: number, accuracy?: number) => {
      const lat = Number(latitude.toFixed(6));
      const lon = Number(longitude.toFixed(6));
      const isGeo = true;
      const rad = Number(config.radiusMeters) || 250;
      const tokenVal = (config.token || PDKS_SYSTEM_API_KEY).trim();
      const portable = `ASEM:WALL:${tokenVal}:GEO:${isGeo ? 1 : 0}:${lat}:${lon}:${rad}`;

      setConfig((prev) => ({
        ...prev,
        latitude: lat,
        longitude: lon,
        enableGeofence: true,
        qrPayload: portable,
      }));
      generateQRDataURL(portable, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
      setIsGettingLocation(false);
      const accText = accuracy ? ` (±${Math.round(accuracy)}m hassasiyet)` : '';
      setLocationNotice(`✅ Cihazınızın GPS konumu alındı: Enlem ${lat}, Boylam ${lon}${accText}. Ayarları kalıcı yapmak için aşağıdaki "Ayarları Kaydet ve QR Kodu Güncelle" butonuna basınız.`);
    };

    // Try high accuracy GPS first, fallback to standard positioning
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        // Fallback retry with low accuracy (ideal for PC/laptop Wi-Fi location)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            applyCoords(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          },
          (fallbackErr) => {
            setIsGettingLocation(false);
            let msg = fallbackErr.message;
            if (fallbackErr.code === 1) {
              msg = 'Tarayıcı konum izni verilmedi. Adres çubuğundaki kilit/izin simgesinden konumu açabilir veya hazır merkezlerden birini seçebilirsiniz.';
            } else if (fallbackErr.code === 2) {
              msg = 'GPS konum sinyali temin edilemedi. Lütfen koordinatları elle giriniz veya aşağıdaki hazır merkezlerden seçiniz.';
            } else if (fallbackErr.code === 3) {
              msg = 'Konum alma zaman aşımına uğradı. Koordinatları elle girebilir veya aşağıdaki hazır merkezlerden seçebilirsiniz.';
            }
            setLocationNotice(`⚠️ ${msg}`);
            setTimeout(() => setLocationNotice(null), 8000);
          },
          { enableHighAccuracy: false, timeout: 6000 }
        );
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
    );
  };

  const handlePrint = (e?: React.MouseEvent) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    window.print();
  };

  const handleDownloadPNG = () => {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `Asem_Sirket_Sabit_QR_${config.token.slice(-6)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !canManageWallQR) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-fade-in cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar (Sticky) */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0 sticky top-0 z-20 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shrink-0">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold">Şirket Duvarı Sabit QR Kodu</h2>
              <p className="text-[11px] sm:text-xs text-slate-300">
                Personelin kamerayla okutacağı sabit şirket giriş panosu & baskı şablonu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Kapat (veya dışarıya tıklayın)"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Saved Alert */}
        {savedNotice && (
          <div className="bg-emerald-600 text-white px-4 sm:px-6 py-2.5 text-xs font-semibold flex items-center justify-between shrink-0 no-print">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              {savedNotice}
            </span>
            <button onClick={() => setSavedNotice(null)} className="text-white text-xs font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Col 1: Printable Poster View (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center">
            {/* Visual Printable Poster Box */}
            <div
              ref={posterRef}
              id="asem-wall-poster"
              className="print-area wall-poster w-full bg-white border-2 sm:border-4 border-slate-900 rounded-2xl p-4 sm:p-8 flex flex-col items-center text-center shadow-lg relative print:shadow-none print:m-0"
            >
              {/* Header Branding */}
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                  A
                </div>
                <span className="text-xl font-extrabold tracking-tight text-slate-900">ASEM</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200">
                  PDKS
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 uppercase tracking-wider mb-1">
                {config.companyName}
              </h3>
              <p className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full mb-4">
                {config.branchName}
              </p>

              {/* The Scannable High-Res QR Code */}
              <div className="p-4 bg-white border-2 border-slate-900 rounded-2xl shadow-inner my-2 print:border-2 print:border-slate-900 print:shadow-none print:p-4">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Şirket Sabit QR Kodu"
                    className="w-56 h-56 sm:w-64 sm:h-64 object-contain print:w-72 print:h-72 print:max-w-none mx-auto block"
                  />
                ) : (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-400">
                    QR Üretiliyor...
                  </div>
                )}
              </div>

              {/* Action Instructions */}
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 my-3 text-left">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Personel Nasıl Okutur?</span>
                </div>
                <ol className="text-xs text-slate-700 space-y-1 list-decimal list-inside font-medium">
                  <li>
                    Tarayıcınızdan <strong className="text-slate-900">Asem PDKS Portalı</strong>na girin
                  </li>
                  <li>Kullanıcı adı ve şifrenizle giriş yapın</li>
                  <li>
                    <strong className="text-slate-900">"Kamerayı Aç / QR Okut"</strong> penceresinden bu kodu taratın
                  </li>
                  <li>Giriş, Çıkış veya Molanız otomatik işlenecektir</li>
                </ol>
              </div>

              {/* Poster Footer Security Info */}
              <div className="w-full pt-3 border-t border-slate-200 flex flex-col gap-1.5 text-[10px] text-slate-500 font-mono">
                <div className="flex items-center justify-between">
                  <span>Pano Kodu: ASEM-DUVAR-QR</span>
                  <span>Konum: {config.installationLocation}</span>
                </div>
                {config.enableGeofence && (
                  <div className="flex items-center justify-between text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md text-[9px] font-sans border border-emerald-200">
                    <span className="font-semibold flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      GPS Doğrulaması Aktif ({config.radiusMeters}m yarıçap)
                    </span>
                    <span className="font-mono text-[9px] text-emerald-900 font-bold">
                      {Number(config.latitude || 0).toFixed(4)}, {Number(config.longitude || 0).toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Poster Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 w-full no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Yazdır (A4 Poster)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPNG}
                className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-300 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>QR PNG İndir</span>
              </button>

              {canManageWallQR && (
                <button
                  onClick={handleRotateToken}
                  className="py-2.5 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-amber-300 cursor-pointer"
                  title="Token Rotasyonu (Eski çıktıları iptal edip yeni güvenli anahtar üretir)"
                >
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Token Yenile</span>
                </button>
              )}
            </div>
          </div>

          {/* Col 2: Settings & Configuration Form (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 no-print">
            {canManageWallQR ? (
              <form noValidate onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      İşletme ve Konum Bilgileri
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Yetkili: İK / Yönetici
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Duvarda asılacak posterin kurumsal başlıkları ve güvenlik tokenı. Yalnızca İK yöneticisi tarafından düzenlenebilir.
                  </p>
                </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">İşletme Adı</label>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">İşyeri / Şube Adı</label>
                <input
                  type="text"
                  value={config.branchName}
                  onChange={(e) => setConfig({ ...config, branchName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Asıldığı Nokta</label>
                <input
                  type="text"
                  value={config.installationLocation}
                  onChange={(e) => setConfig({ ...config, installationLocation: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Benzersiz Duvar Token / API Değeri
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const apiToken = PDKS_SYSTEM_API_KEY;
                      const isGeo = Boolean(config.enableGeofence);
                      const portable = `ASEM:WALL:${apiToken}:GEO:${isGeo ? 1 : 0}:${config.latitude || 41.0082}:${config.longitude || 28.9784}:${config.radiusMeters || 250}`;
                      setConfig({ ...config, token: apiToken, qrPayload: portable });
                      generateQRDataURL(portable, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    Kullanıcı API Tokenını Yükle
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    value={config.token}
                    onChange={(e) => {
                      const val = e.target.value;
                      const isGeo = Boolean(config.enableGeofence);
                      const portable = `ASEM:WALL:${val.trim()}:GEO:${isGeo ? 1 : 0}:${config.latitude || 41.0082}:${config.longitude || 28.9784}:${config.radiusMeters || 250}`;
                      setConfig({ ...config, token: val, qrPayload: portable });
                      generateQRDataURL(portable, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
                    }}
                    className="flex-1 font-mono px-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                    title="Kopyala"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Güvenlik Anahtarı: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">•••••••••••• (Gizli)</code>
                </p>
              </div>

              {/* Geolocation & Geofence Section */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">
                      Opsiyonel Geolocation (GPS Doğrulaması)
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enableGeofence}
                      onChange={(e) => {
                        const isGeo = e.target.checked;
                        const tokenVal = (config.token || PDKS_SYSTEM_API_KEY).trim();
                        const portable = `ASEM:WALL:${tokenVal}:GEO:${isGeo ? 1 : 0}:${config.latitude || 41.0082}:${config.longitude || 28.9784}:${config.radiusMeters || 250}`;
                        const nextConfig: CompanyWallQRConfig = {
                          ...config,
                          enableGeofence: isGeo,
                          qrPayload: portable,
                        };
                        try {
                          const saved = pdksStorage.saveCompanyWallQR(nextConfig, activeUser);
                          setConfig(saved);
                          setSavedNotice(
                            isGeo
                              ? '✅ GPS Doğrulaması aktif edildi ve tüm cihazlara uygulandı.'
                              : 'ℹ️ GPS Doğrulaması kapatıldı. QR taramalarında konum izni istenmeyecektir.'
                          );
                          setTimeout(() => setSavedNotice(null), 4000);
                        } catch {
                          setConfig(nextConfig);
                        }
                        generateQRDataURL(portable, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <p className="text-[11px] text-slate-500">
                  QR kodun fotoğrafını çekip şirket dışından okutulmasını engeller. Personel belirlenen
                  yarıçap içindeyse tarama kabul edilir.
                </p>

                {config.enableGeofence && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600">İşyeri Enlem (Lat)</label>
                        <input
                          type="number"
                          step="any"
                          value={config.latitude}
                          onChange={(e) => {
                            const val = e.target.value;
                            setConfig({ ...config, latitude: val === '' ? ('' as any) : parseFloat(val) || 0 });
                          }}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600">İşyeri Boylam (Lon)</label>
                        <input
                          type="number"
                          step="any"
                          value={config.longitude}
                          onChange={(e) => {
                            const val = e.target.value;
                            setConfig({ ...config, longitude: val === '' ? ('' as any) : parseFloat(val) || 0 });
                          }}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-600">
                        İzin Verilen Yarıçap (Metre)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="any"
                          min="10"
                          max="5000"
                          value={config.radiusMeters}
                          onChange={(e) => {
                            const val = e.target.value;
                            setConfig({ ...config, radiusMeters: val === '' ? ('' as any) : parseInt(val) || 200 });
                          }}
                          className="w-24 px-2 py-1 text-xs border border-slate-200 rounded-md bg-white font-mono"
                        />
                        <span className="text-[11px] text-slate-500">metre yarıçap (İşyeri Alanı)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-slate-500 font-medium">Hızlı Sınır:</span>
                        {[
                          { label: '100m (Giriş)', val: 100 },
                          { label: '250m (Standart)', val: 250 },
                          { label: '500m (Büyük Tesis)', val: 500 },
                          { label: '1000m (OSB / Saha)', val: 1000 },
                        ].map((r) => (
                          <button
                            key={r.val}
                            type="button"
                            onClick={() => setConfig({ ...config, radiusMeters: r.val })}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                              config.radiusMeters === r.val
                                ? 'bg-indigo-600 text-white border-indigo-600 font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isGettingLocation}
                      className="w-full py-2 px-3 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-60"
                    >
                      <Compass
                        className={`w-4 h-4 text-indigo-600 ${isGettingLocation ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isGettingLocation
                          ? 'Cihaz GPS Konumu Alınıyor...'
                          : 'Cihazımın GPS Konumunu İşyeri Merkezi Yap'}
                      </span>
                    </button>

                    {locationNotice && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-lg font-medium animate-fade-in flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{locationNotice}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Ayarlar Kaydediliyor ve QR Güncelleniyor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Ayarları Kaydet ve QR Kodu Güncelle</span>
                    </>
                  )}
                </button>

                {savedNotice && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xs">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{savedNotice}</span>
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs font-semibold">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Şirket Sabit QR parametreleri ve Geofence ayarları yalnızca <strong>İK Yöneticisi</strong> tarafından düzenlenebilir ve yenilenebilir.
                </span>
              </div>

              <div className="space-y-2 text-xs text-slate-700">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">İşletme:</span>
                  <span className="font-semibold">{config.companyName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Şube / Bölüm:</span>
                  <span className="font-semibold">{config.branchName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Konum Noktası:</span>
                  <span className="font-semibold">{config.installationLocation}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Geofence (GPS):</span>
                  <span className="font-semibold">
                    {config.enableGeofence ? `Aktif (${config.radiusMeters}m yarıçap)` : 'Devre Dışı'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Bu QR kodu yazdırıp duvara asarak personellerinizin telefonlarından okutmasını sağlayabilirsiniz.
              </p>
            </div>
          )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Kurulum İpucu:</strong> Bu posteri renkli veya siyah-beyaz olarak A4 ebatında
                yazdırıp laminasyon ile kaplayarak bina giriş kapısına veya turnike yanındaki duvara
                asınız.
              </span>
            </div>
          </div>
        </div>
      </div>

        {/* Modal Sticky Bottom Action Bar (Mobile & Desktop) */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 no-print">
          <div className="text-[11px] text-slate-500 hidden sm:block">
            İpucu: Pencereyi kapatmak için dışarıdaki boş alana veya <strong>ESC</strong> tuşuna basabilirsiniz.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex-1 sm:flex-initial"
            >
              <Printer className="w-4 h-4" />
              <span>Posteri Yazdır</span>
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer flex-1 sm:flex-initial"
            >
              <X className="w-4 h-4" />
              <span>Kapat</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

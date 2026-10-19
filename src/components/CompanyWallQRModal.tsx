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
} from 'lucide-react';
import { CompanyWallQRConfig } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { generateQRDataURL } from '../utils/qr';

interface CompanyWallQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: import('../types/pdks').CurrentUser;
}

export const CompanyWallQRModal: React.FC<CompanyWallQRModalProps> = ({ isOpen, onClose, currentUser }) => {
  const [config, setConfig] = useState<CompanyWallQRConfig>(pdksStorage.getCompanyWallQR());
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const activeUser = currentUser || pdksStorage.getActiveUser();
  const canManageWallQR = activeUser.role === 'ik_yoneticisi';

  useEffect(() => {
    if (!isOpen) return;
    const current = pdksStorage.getCompanyWallQR();
    setConfig(current);
    generateQRDataURL(current.qrPayload, { width: 360, margin: 1 }).then((url) => {
      setQrUrl(url);
    });
  }, [isOpen]);

  const handleRotateToken = () => {
    if (window.confirm('Şirket sabit QR güvenlik tokenını yenilemek istediğinize emin misiniz? Eski duvardaki çıktılar geçersiz olacaktır.')) {
      const updated = pdksStorage.rotateCompanyWallQR();
      setConfig(updated);
      generateQRDataURL(updated.qrPayload, { width: 360, margin: 1 }).then((url) => {
        setQrUrl(url);
      });
      setSavedNotice('Güvenlik tokenı yenilendi! Yeni duvar posterini yazdırmayı unutmayın.');
      setTimeout(() => setSavedNotice(null), 3500);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = pdksStorage.saveCompanyWallQR(config);
    setConfig(updated);
    generateQRDataURL(updated.qrPayload, { width: 360, margin: 1 }).then((url) => {
      setQrUrl(url);
    });
    setSavedNotice('Şirket duvar QR ve Geofence ayarları başarıyla güncellendi.');
    setTimeout(() => setSavedNotice(null), 3000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(config.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationNotice('Tarayıcınız coğrafi konum desteği sunmuyor.');
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig((prev) => ({
          ...prev,
          latitude: parseFloat(pos.coords.latitude.toFixed(6)),
          longitude: parseFloat(pos.coords.longitude.toFixed(6)),
        }));
        setIsGettingLocation(false);
        setLocationNotice('Mevcut GPS koordinatlarınız fabrika merkezi olarak alındı.');
        setTimeout(() => setLocationNotice(null), 3000);
      },
      (err) => {
        setIsGettingLocation(false);
        setLocationNotice(`Konum alınamadı: ${err.message}`);
        setTimeout(() => setLocationNotice(null), 3500);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handlePrint = () => {
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

  if (!isOpen || !canManageWallQR) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-fade-in">
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between no-print">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Alert */}
        {savedNotice && (
          <div className="bg-emerald-600 text-white px-4 sm:px-6 py-2.5 text-xs font-semibold flex items-center justify-between no-print">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              {savedNotice}
            </span>
            <button onClick={() => setSavedNotice(null)} className="text-white text-xs font-bold">
              ✕
            </button>
          </div>
        )}

        <div className="p-3.5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Col 1: Printable Poster View (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center">
            {/* Visual Printable Poster Box */}
            <div
              ref={posterRef}
              id="asem-wall-poster"
              className="w-full bg-white border-2 sm:border-4 border-slate-900 rounded-2xl p-4 sm:p-8 flex flex-col items-center text-center shadow-lg relative print:border-none print:shadow-none print:p-0"
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
              <div className="p-4 bg-white border-2 border-slate-900 rounded-2xl shadow-inner my-2">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Şirket Sabit QR Kodu"
                    className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
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
              <div className="w-full pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Pano Kodu: {config.token.slice(0, 16)}...</span>
                <span>Konum: {config.installationLocation}</span>
              </div>
            </div>

            {/* Poster Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 w-full no-print">
              <button
                onClick={handlePrint}
                className="flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Yazdır (A4 Poster)</span>
              </button>

              <button
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
              <form onSubmit={handleSaveSettings} className="space-y-4">
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Şube / Fabrika Adı</label>
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
                      const apiToken = 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ';
                      setConfig({ ...config, token: apiToken, qrPayload: apiToken });
                      generateQRDataURL(apiToken, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    Kullanıcı API Tokenını Yükle
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={config.token}
                    onChange={(e) => {
                      const val = e.target.value;
                      setConfig({ ...config, token: val, qrPayload: val });
                      generateQRDataURL(val, { width: 360, margin: 1 }).then((url) => setQrUrl(url));
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
                  Aktif API Anahtarı: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ</code>
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
                      onChange={(e) => setConfig({ ...config, enableGeofence: e.target.checked })}
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
                        <label className="text-[10px] font-semibold text-slate-600">Fabrika Enlem (Lat)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={config.latitude}
                          onChange={(e) =>
                            setConfig({ ...config, latitude: parseFloat(e.target.value) || 0 })
                          }
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md bg-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600">Fabrika Boylam (Lon)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={config.longitude}
                          onChange={(e) =>
                            setConfig({ ...config, longitude: parseFloat(e.target.value) || 0 })
                          }
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
                          min="50"
                          max="2000"
                          value={config.radiusMeters}
                          onChange={(e) =>
                            setConfig({ ...config, radiusMeters: parseInt(e.target.value) || 200 })
                          }
                          className="w-24 px-2 py-1 text-xs border border-slate-200 rounded-md bg-white font-mono"
                        />
                        <span className="text-[11px] text-slate-500">metre yarıçap (Fabrika & Bahçe)</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isGettingLocation}
                      className="w-full py-1.5 px-2.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Compass
                        className={`w-3.5 h-3.5 text-indigo-600 ${isGettingLocation ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {isGettingLocation
                          ? 'Konum Alınıyor...'
                          : 'Cihazımın GPS Konumunu Fabrika Merkezi Yap'}
                      </span>
                    </button>

                    {locationNotice && (
                      <div className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded-md font-medium">
                        {locationNotice}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Ayarları Kaydet ve QR Kodu Güncelle
                </button>
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
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  X,
  ArrowRight,
  KeyRound,
  Download,
  Upload,
  DatabaseBackup,
  Loader2,
} from 'lucide-react';
import { CurrentUser } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import type { PersistentVaultSnapshot } from '../utils/persistentVault';

interface CompanySettingsPanelProps {
  currentUser: CurrentUser;
  compact?: boolean;
  onCompanyUpdated?: (newName: string) => void;
}

export const CompanySettingsPanel: React.FC<CompanySettingsPanelProps> = ({
  currentUser,
  compact = false,
  onCompanyUpdated,
}) => {
  const [currentCompanyName, setCurrentCompanyName] = useState<string>(() =>
    pdksStorage.getCompanyName()
  );
  const [newCompanyName, setNewCompanyName] = useState<string>(() =>
    pdksStorage.getCompanyName()
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Security Confirmation Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One-Click JSON Backup & Restore State
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    snapshot: PersistentVaultSnapshot;
  } | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);
  const canBackupRestore = isSuperAdmin || currentUser.role === 'ik_yoneticisi';

  useEffect(() => {
    const syncName = (e?: any) => {
      const latest =
        e?.detail && typeof e.detail === 'string'
          ? e.detail
          : pdksStorage.getCompanyName();
      setCurrentCompanyName(latest);
      setNewCompanyName((prev) => (isConfirmModalOpen ? prev : latest));
    };
    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-wall-qr-updated', syncName);
    window.addEventListener('pdks-data-synced', syncName);
    return () => {
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-wall-qr-updated', syncName);
      window.removeEventListener('pdks-data-synced', syncName);
    };
  }, [isConfirmModalOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConfirmModalOpen && !isSubmitting) {
        setIsConfirmModalOpen(false);
        setAdminPassword('');
        setModalError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isConfirmModalOpen, isSubmitting]);

  if (!isSuperAdmin && !canBackupRestore) return null;

  const handleDownloadBackup = () => {
    try {
      const snapshot = pdksStorage.exportFullBackupJson();
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const safeName = (snapshot.companyName || 'PDKS')
        .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 28);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName || 'PDKS'}_Yedek_${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({
        type: 'success',
        message: 'Tüm kurum verileri, kullanıcı hesapları, vardiyalar ve ayarlar JSON olarak indirildi.',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'Yedek dosyası oluşturulurken bir hata oluştu.',
      });
    }
  };

  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          (!parsed.companyName &&
            !Array.isArray(parsed.employees) &&
            !Array.isArray(parsed.accounts) &&
            !Array.isArray(parsed.shifts))
        ) {
          setFeedback({
            type: 'error',
            message: 'Seçilen dosya geçerli bir PDKS JSON yedek dosyası değil.',
          });
          return;
        }
        setPendingRestore({
          fileName: file.name,
          snapshot: parsed as PersistentVaultSnapshot,
        });
      } catch {
        setFeedback({
          type: 'error',
          message: 'JSON dosyası okunamadı. Lütfen geçerli bir yedek dosyası seçiniz.',
        });
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    setIsRestoringBackup(true);
    setFeedback(null);
    try {
      const res = await pdksStorage.restoreFullBackupJsonAsync(pendingRestore.snapshot);
      if (res.success) {
        const nextName = pdksStorage.getCompanyName();
        setCurrentCompanyName(nextName);
        setNewCompanyName(nextName);
        setPendingRestore(null);
        if (onCompanyUpdated) onCompanyUpdated(nextName);
        setFeedback({
          type: 'success',
          message: res.message || 'Sistem yedeği başarıyla geri yüklendi.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Yedek geri yüklenemedi.',
        });
      }
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleOpenSecurityModal = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const trimmed = newCompanyName.trim();
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Yeni şirket adı boş bırakılamaz.' });
      return;
    }
    setAdminPassword('');
    setShowPassword(false);
    setModalError(null);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!adminPassword.trim()) {
      setModalError('Hatalı yönetici şifresi, değişiklik onaylanmadı');
      return;
    }

    setIsSubmitting(true);
    const res = await pdksStorage.updateCompanyNameWithPassword(
      newCompanyName,
      adminPassword,
      undefined,
      currentUser
    );
    setIsSubmitting(false);

    if (res.success && res.companyName) {
      setCurrentCompanyName(res.companyName);
      setNewCompanyName(res.companyName);
      setAdminPassword('');
      setIsConfirmModalOpen(false);
      setFeedback({
        type: 'success',
        message: res.message || 'Şirket adı başarıyla güncellendi',
      });
      if (onCompanyUpdated) {
        onCompanyUpdated(res.companyName);
      }
      setTimeout(() => {
        setFeedback((prev) =>
          prev?.message === (res.message || 'Şirket adı başarıyla güncellendi')
            ? null
            : prev
        );
      }, 6000);
    } else {
      setModalError(
        res.message || 'Hatalı yönetici şifresi, değişiklik onaylanmadı'
      );
      setFeedback({
        type: 'error',
        message: res.message || 'Hatalı yönetici şifresi, değişiklik onaylanmadı',
      });
    }
  };

  return (
    <>
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs ${
          compact ? 'p-5 space-y-4' : 'p-4 sm:p-5 space-y-4'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  Sistem / Şirket Ayarları & Yedekleme
                </h2>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                    <Lock className="w-3 h-3" />
                    Yalnızca Süper Yönetici · Şifreli Onay
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kurum adı, kullanıcılar ve vardiya ayarları yerel kalıcı kasada ve sunucuda korunur; dilediğiniz zaman JSON yedek alıp geri yükleyebilirsiniz.
              </p>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shrink-0">
            <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
              Mevcut Şirket Adı
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {currentCompanyName}
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isSuperAdmin && (
          <form
            onSubmit={handleOpenSecurityModal}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
          >
            <div className="flex-1">
              <label
                htmlFor="company-name-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Yeni Şirket Adı
              </label>
              <input
                id="company-name-input"
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                maxLength={100}
                placeholder="Örn: Kurum / Şirket Adı"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/70 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100 font-medium"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Şirket Adını Güncelle</span>
            </button>
          </form>
        )}

        {/* Tek Tıkla Veri Yedekleme & Geri Yükleme (JSON) */}
        {canBackupRestore && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <DatabaseBackup className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Tam Sistem Yedeği (JSON İndir / Geri Yükle)
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kurum adı, kullanıcı hesapları, personeller, vardiya tanımları ve tüm kayıtları tek tıkla yedekleyin veya başka bir sürümden geri yükleyin.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Yedekle (JSON İndir)</span>
                </button>

                <input
                  ref={restoreInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleSelectRestoreFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => restoreInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Geri Yükle (JSON)</span>
                </button>
              </div>
            </div>

            {pendingRestore && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-amber-900 dark:text-amber-200 truncate">
                    Geri Yüklenecek Yedek: {pendingRestore.fileName}
                  </div>
                  <button
                    type="button"
                    disabled={isRestoringBackup}
                    onClick={() => setPendingRestore(null)}
                    className="p-0.5 text-amber-700 dark:text-amber-300 hover:opacity-75 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-amber-900 dark:text-amber-200 tabular-nums">
                  <div>
                    <span className="opacity-75">Kurum: </span>
                    <strong>{pendingRestore.snapshot.companyName || '-'}</strong>
                  </div>
                  <div>
                    <span className="opacity-75">Personel: </span>
                    <strong>{Array.isArray(pendingRestore.snapshot.employees) ? pendingRestore.snapshot.employees.length : 0}</strong>
                  </div>
                  <div>
                    <span className="opacity-75">Kullanıcı: </span>
                    <strong>{Array.isArray(pendingRestore.snapshot.accounts) ? pendingRestore.snapshot.accounts.length : 0}</strong>
                  </div>
                  <div>
                    <span className="opacity-75">Vardiya: </span>
                    <strong>{Array.isArray(pendingRestore.snapshot.shifts) ? pendingRestore.snapshot.shifts.length : 0}</strong>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isRestoringBackup}
                    onClick={() => setPendingRestore(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    disabled={isRestoringBackup}
                    onClick={() => void handleConfirmRestore()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
                  >
                    {isRestoringBackup ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <DatabaseBackup className="w-3.5 h-3.5" />
                    )}
                    <span>{isRestoringBackup ? 'Geri Yükleniyor...' : 'Onayla ve Geri Yükle'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Yönetici Şifresi Güvenlik Onay Modalı */}
      {isConfirmModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 dark:bg-slate-950/80 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            if (!isSubmitting) {
              setIsConfirmModalOpen(false);
              setAdminPassword('');
              setModalError(null);
            }
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Güvenlik Onayı · Yönetici Şifresi
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Şirket adı değişikliği için mevcut şifrenizi doğrulayın
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setAdminPassword('');
                  setModalError(null);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmUpdate} className="p-5 space-y-4">
              {/* Preview of Company Name Change */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Onaylanacak Kurum Adı Değişikliği
                </div>
                <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 line-through">
                    {currentCompanyName}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200">
                    {newCompanyName.trim()}
                  </span>
                </div>
              </div>

              {/* Logged-in Admin Verification Info */}
              <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/70">
                <span>Doğrulama Yapacak Yönetici:</span>
                <span className="font-mono font-bold text-indigo-800 dark:text-indigo-200">
                  @{currentUser.username || 'admin'}
                </span>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="confirm-admin-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Mevcut Yönetici Giriş Şifreniz:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="confirm-admin-password"
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      if (modalError) setModalError(null);
                    }}
                    placeholder="Mevcut şifrenizi giriniz"
                    autoFocus
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setAdminPassword('');
                    setModalError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Doğrulanıyor...' : 'Onayla ve Güncelle'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

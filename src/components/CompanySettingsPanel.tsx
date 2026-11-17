import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { CurrentUser } from '../types/pdks';
import { pdksStorage } from '../services/storage';

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

  const canManage = pdksStorage.canAccessSettings(currentUser);

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

  if (!canManage) return null;

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
        className={`bg-white border border-slate-200 rounded-2xl shadow-xs ${
          compact ? 'p-5 space-y-4' : 'p-4 sm:p-5 space-y-4'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Sistem / Şirket Ayarları
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  <Lock className="w-3 h-3" />
                  Şifreli Onay Korumalı
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kurum adı uygulama başlığına, üst menüye, QR panolarına ve tüm rapor çıktılarına anlık olarak yansır.
              </p>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 shrink-0">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Mevcut Şirket Adı
            </div>
            <div className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
              {currentCompanyName}
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 animate-fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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

        <form
          onSubmit={handleOpenSecurityModal}
          className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
        >
          <div className="flex-1">
            <label
              htmlFor="company-name-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
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
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-xl bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-medium"
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
      </div>

      {/* Yönetici Şifresi Güvenlik Onay Modalı */}
      {isConfirmModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            if (!isSubmitting) {
              setIsConfirmModalOpen(false);
              setAdminPassword('');
              setModalError(null);
            }
          }}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
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
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="text-[11px] font-semibold text-slate-500">
                  Onaylanacak Kurum Adı Değişikliği
                </div>
                <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900">
                  <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 line-through">
                    {currentCompanyName}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800">
                    {newCompanyName.trim()}
                  </span>
                </div>
              </div>

              {/* Logged-in Admin Verification Info */}
              <div className="text-[11px] text-slate-600 flex items-center justify-between px-3 py-2 rounded-lg bg-indigo-50/70 border border-indigo-100">
                <span>Doğrulama Yapacak Yönetici:</span>
                <span className="font-mono font-bold text-indigo-800">
                  @{currentUser.username || 'admin'}
                </span>
              </div>

              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="confirm-admin-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
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
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setAdminPassword('');
                    setModalError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
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

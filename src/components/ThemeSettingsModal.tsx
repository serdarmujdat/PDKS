import React, { useState, useEffect } from 'react';
import { Sun, Moon, Palette, Check, X, UserCheck, Cloud, RefreshCw } from 'lucide-react';
import type { CurrentUser, ThemeId } from '../types/pdks';
import { APP_THEMES, getThemeById, type ThemeDefinition } from '../themes/themes';
import { pdksStorage } from '../services/storage';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentFirebaseUser, signInWithGoogleForCloudSync } from '../firebase';

interface ThemeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUser;
  activeTheme: ThemeId;
  onThemeChanged: (themeId: ThemeId) => void;
}

export const ThemeSettingsModal: React.FC<ThemeSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeTheme,
  onThemeChanged,
}) => {
  const { setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<ThemeId>(activeTheme);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCloudLinked, setIsCloudLinked] = useState<boolean>(Boolean(getCurrentFirebaseUser()));
  const [isLinkingCloud, setIsLinkingCloud] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTheme(activeTheme);
    setFeedback(null);
    setIsCloudLinked(Boolean(getCurrentFirebaseUser()));
  }, [isOpen, activeTheme]);

  if (!isOpen) return null;

  const lightThemes = APP_THEMES.filter((t) => t.mode === 'light');
  const darkThemes = APP_THEMES.filter((t) => t.mode === 'dark');

  const handleSelectTheme = async (theme: ThemeDefinition) => {
    setSelectedTheme(theme.id);
    setFeedback(null);
    onThemeChanged(theme.id);
    const res = await setTheme(theme.id, currentUser);
    if (res.success) {
      setFeedback(
        `${theme.name} (${theme.subtitle}) hesabınıza kaydedildi${
          res.cloudSynced ? ' ve bulutla eşitlendi' : ''
        }.`
      );
    }
  };

  const handleLinkCloud = async () => {
    setIsLinkingCloud(true);
    setFeedback(null);
    try {
      await signInWithGoogleForCloudSync();
      setIsCloudLinked(Boolean(getCurrentFirebaseUser()));
      const res = await pdksStorage.saveUserTheme(selectedTheme, currentUser);
      setFeedback(
        res.cloudSynced
          ? 'Google hesabı bağlandı ve kişisel tema tercihiniz buluta kaydedildi.'
          : 'Google hesabı bağlandı.'
      );
    } catch {
      setFeedback('Google bulut bağlantısı tamamlanamadı; tema tercihiniz sunucu hesabınızda saklanmaya devam eder.');
    } finally {
      setIsLinkingCloud(false);
    }
  };

  const currentDef = getThemeById(selectedTheme);

  const renderThemeCard = (theme: ThemeDefinition) => {
    const isSelected = selectedTheme === theme.id;
    return (
      <button
        key={theme.id}
        type="button"
        onClick={() => handleSelectTheme(theme)}
        className={`group text-left rounded-xl border p-3.5 transition-all cursor-pointer flex flex-col gap-3 ${
          isSelected
            ? 'ring-2 ring-indigo-500/40 border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/50 dark:border-indigo-400'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        {/* Mini Live Color Balance Preview (60-30-10 calm layout) */}
        <div
          data-theme-keep={theme.mode}
          style={{
            backgroundColor: theme.preview.bg,
            borderColor: theme.preview.border,
          }}
          className="w-full h-24 rounded-lg border p-2.5 flex flex-col justify-between overflow-hidden"
        >
          {/* Mini top bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                style={{ backgroundColor: theme.preview.accent }}
                className="w-2.5 h-2.5 rounded-xs shrink-0"
              />
              <span
                style={{ backgroundColor: theme.preview.text, opacity: 0.72 }}
                className="h-2 w-14 rounded-xs"
              />
            </div>
            <span
              style={{
                backgroundColor: theme.preview.surfaceMuted,
                borderColor: theme.preview.border,
              }}
              className="h-3 w-8 rounded border"
            />
          </div>

          {/* Mini card inside preview */}
          <div
            style={{
              backgroundColor: theme.preview.surface,
              borderColor: theme.preview.border,
            }}
            className="rounded-md border p-2 flex items-center justify-between gap-2"
          >
            <div className="space-y-1 flex-1 min-w-0">
              <div
                style={{ backgroundColor: theme.preview.text, opacity: 0.8 }}
                className="h-2 w-20 rounded-xs"
              />
              <div
                style={{ backgroundColor: theme.preview.textMuted, opacity: 0.55 }}
                className="h-1.5 w-28 rounded-xs"
              />
            </div>
            <div
              style={{ backgroundColor: theme.preview.accent }}
              className="h-4 w-10 rounded-xs shrink-0"
            />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>{theme.name}</span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">· {theme.subtitle}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {theme.description}
            </p>
          </div>
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
              isSelected
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-600 text-transparent'
            }`}
          >
            <Check className="w-3 h-3" />
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Kişisel Görünüm ve Tema Ayarları
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {currentUser.name} (@{currentUser.username}) · Yalnızca kendi hesabınıza uygulanır
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Account Scoping Notice */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Aktif Tema: {currentDef.name} ({currentDef.mode === 'dark' ? 'Koyu Mod' : 'Açık Mod'})
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Bu ayar diğer personelleri etkilemez. Aynı bilgisayarda farklı bir hesapla giriş yapıldığında herkes kendi seçtiği temayı görür.
                </p>
              </div>
            </div>
            {!isCloudLinked && (
              <button
                type="button"
                disabled={isLinkingCloud}
                onClick={handleLinkCloud}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isLinkingCloud ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                )}
                <span>Buluta da Bağla</span>
              </button>
            )}
          </div>

          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-medium flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{feedback}</span>
            </div>
          )}

          {/* Light / Eye-Resting Daylight Themes */}
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Sun className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Açık ve Göz Dinlendiren Temalar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {lightThemes.map(renderThemeCard)}
            </div>
          </section>

          {/* Dark / Low-Glare Themes */}
          <section className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Koyu ve Düşük Parlamalı Temalar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {darkThemes.map(renderThemeCard)}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Seçtiğiniz tema anında kaydedilir ve uygulanır.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};

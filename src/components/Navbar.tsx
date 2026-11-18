import React, { useState, useEffect } from 'react';
import { QrCode, Users, Clock, ShieldCheck, CalendarCheck, Smartphone, Maximize2, BarChart3, ChevronDown, TrendingUp, Key, LogOut, Lock, LogIn, LayoutDashboard, Image as ImageIcon, Sun, Moon, Palette, ShieldAlert } from 'lucide-react';
import { AppPageKey, CurrentUser, ThemeId } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { NotificationCenter } from './NotificationCenter';
import { CompanyLogoImage } from './CompanyLogoImage';
import { APP_THEMES } from '../themes/themes';
import { useTheme } from '../contexts/ThemeContext';

export type ActiveTab = 'kiosk' | 'dashboard' | 'performance' | 'employees' | 'records' | 'shifts' | 'portal' | 'reports' | 'supervisor' | 'permissions';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onEnterFullscreenKiosk: () => void;
  currentUser: CurrentUser;
  onSwitchUser: (user: CurrentUser) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenWallQR?: () => void;
  onOpenLogoManager?: () => void;
  onOpenThemeSettings?: () => void;
  activeTheme?: ThemeId;
  companyLogo?: string;
  companyName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onEnterFullscreenKiosk,
  currentUser,
  onSwitchUser: _onSwitchUser,
  onOpenLogin,
  onLogout,
  onOpenWallQR,
  onOpenLogoManager,
  onOpenThemeSettings,
  activeTheme,
  companyLogo: propCompanyLogo,
  companyName: propCompanyName,
}) => {
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [restrictedNotice, setRestrictedNotice] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>(() => propCompanyLogo || pdksStorage.getCompanyLogo());
  const [companyName, setCompanyName] = useState<string>(() => propCompanyName || pdksStorage.getCompanyName());

  useEffect(() => {
    if (propCompanyLogo) setCompanyLogo(propCompanyLogo);
  }, [propCompanyLogo]);

  useEffect(() => {
    if (propCompanyName) setCompanyName(propCompanyName);
  }, [propCompanyName]);

  useEffect(() => {
    const syncLogo = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCompanyLogo(e.detail);
      } else {
        setCompanyLogo(pdksStorage.getCompanyLogo());
      }
    };
    const syncCompanyName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCompanyName(e.detail);
      } else {
        setCompanyName(pdksStorage.getCompanyName());
      }
    };
    const syncAll = () => {
      setCompanyLogo(pdksStorage.getCompanyLogo());
      setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-logo-updated', syncLogo);
    window.addEventListener('pdks-company-name-updated', syncCompanyName);
    window.addEventListener('pdks-wall-qr-updated', syncAll);
    window.addEventListener('pdks-data-synced', syncAll);
    return () => {
      window.removeEventListener('pdks-logo-updated', syncLogo);
      window.removeEventListener('pdks-company-name-updated', syncCompanyName);
      window.removeEventListener('pdks-wall-qr-updated', syncAll);
      window.removeEventListener('pdks-data-synced', syncAll);
    };
  }, []);

  const { mode: themeMode, themeDef: currentThemeDef, setTheme, setMode } = useTheme();
  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);
  const isFullAdmin = pdksStorage.isFullAdminAccount(currentUser);
  const canAccessPermissions = pdksStorage.canAccessPermissions(currentUser);
  const isHRManager = pdksStorage.isHRorSuperAdmin(currentUser);
  const canManageSettings = pdksStorage.canAccessSettings(currentUser);
  const isSupervisor = pdksStorage.canUserAccessShiftManagement(currentUser);

  const canAccess = (page: AppPageKey) => pdksStorage.canAccessPage(currentUser, page);
  const allowedPages = pdksStorage.getUserAllowedPages(currentUser);

  const handleQuickSelectTheme = (themeId: ThemeId) => {
    void setTheme(themeId, currentUser);
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-purple-100 text-purple-900 border-purple-300 font-bold';
      case 'ik_yoneticisi':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'birim_amiri':
        return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
      case 'yonetici':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'personel':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'guvenlik':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'Süper Yönetici (Tam Yetki)';
      case 'ik_yoneticisi':
        return 'İK Yöneticisi (Tam Yetkili)';
      case 'birim_amiri':
        return 'Birim Amiri (Vardiya Yetkilisi)';
      case 'yonetici':
        return 'Bölüm Yöneticisi';
      case 'personel':
        return 'Personel (Kısıtlı / QR)';
      case 'guvenlik':
        return 'Turnike Görevlisi (Kısıtlı)';
      default:
        return role;
    }
  };

  const handleRestrictedTabClick = (tabName: string) => {
    setRestrictedNotice(
      `Yetkisiz Erişim: '${tabName}' paneline erişim yetkiniz bulunmamaktadır.`
    );
    setTimeout(() => setRestrictedNotice(null), 5000);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Restricted Alert Toast */}
      {restrictedNotice && (
        <div className="bg-amber-500 text-slate-900 px-4 py-2.5 text-xs font-medium flex items-center justify-between border-b border-amber-600 animate-fade-in">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <Lock className="w-4 h-4 text-slate-900 shrink-0" />
            <span>{restrictedNotice}</span>
          </div>
          <button
            onClick={() => setRestrictedNotice(null)}
            className="text-slate-900 hover:text-white font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-2.5 sm:px-5">
        <div className="flex items-center justify-between gap-2 h-12 min-w-0">
          {/* Zone 1: Compact Company Logo & Single-Line Dynamic Company Name */}
          <div className="flex items-center min-w-0 shrink-0">
            <button
              onClick={() => {
                if (isSuperAdmin) {
                  setActiveTab('permissions');
                } else if (canAccess('dashboard')) {
                  setActiveTab('dashboard');
                } else if (canAccess('shifts')) {
                  setActiveTab('shifts');
                } else {
                  setActiveTab(allowedPages[0] || 'portal');
                }
              }}
              className="text-left group flex items-center gap-2 focus:outline-none cursor-pointer min-w-0"
              title={companyName}
            >
              <div className="h-7 max-w-[96px] sm:max-w-[120px] flex items-center shrink-0">
                <CompanyLogoImage
                  src={companyLogo}
                  alt={companyName}
                  companyName={companyName}
                  className="max-h-7 max-w-[96px] sm:max-w-[120px] w-auto h-auto object-contain"
                  variant={themeMode === 'dark' ? 'dark' : 'light'}
                />
              </div>
              <div className="border-l border-slate-200 dark:border-slate-700 pl-2 min-w-0 max-w-[125px] sm:max-w-[180px]">
                <span className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 block leading-none truncate">
                  {companyName}
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Single-Line Navigation Links (Overflow-safe horizontal scroll on narrow lg screens) */}
          <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none px-1">
            {canAccessPermissions && (
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'permissions'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{isSuperAdmin ? 'Yetki & Rol' : 'Kullanıcı Yetkilendirme'}</span>
              </button>
            )}

            {canAccess('dashboard') && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Clock className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'dashboard' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>Canlı Pano</span>
              </button>
            )}

            {canAccess('employees') && (
              <button
                onClick={() => setActiveTab('employees')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'employees'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Users className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'employees' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>Personel</span>
              </button>
            )}

            {canAccess('records') && (
              <button
                onClick={() => setActiveTab('records')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'records'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'records' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>Kayıtlar</span>
              </button>
            )}

            {canAccess('shifts') && (
              <button
                onClick={() => setActiveTab('shifts')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'shifts'
                    ? isSupervisor && !isHRManager
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200 border border-amber-300 dark:border-amber-400/40 font-semibold shadow-xs'
                      : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <CalendarCheck className={`w-3.5 h-3.5 shrink-0 ${isSupervisor && !isHRManager ? 'text-amber-600 dark:text-amber-300' : 'text-indigo-600 dark:text-indigo-300'}`} />
                <span>{isSupervisor && !isHRManager ? 'Vardiya Yönetimi' : 'Vardiya & İzin'}</span>
              </button>
            )}

            {canAccess('performance') && (
              <button
                onClick={() => setActiveTab('performance')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'performance'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Performans</span>
              </button>
            )}

            {canAccess('reports') && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <BarChart3 className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'reports' ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`} />
                <span>Raporlar</span>
              </button>
            )}

            {canAccess('kiosk') && (
              <button
                onClick={() => setActiveTab('kiosk')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'kiosk'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>{isHRManager ? 'Kiosk' : 'Kiosk Tarama'}</span>
              </button>
            )}

            {canAccess('portal') && (
              <button
                onClick={() => setActiveTab('portal')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'portal'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-400/40 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>{isHRManager ? 'Mobil Önizleme' : 'QR Okut & Mola'}</span>
              </button>
            )}

            {!isHRManager && allowedPages.length <= 3 && (
              <button
                onClick={() => handleRestrictedTabClick('Diğer Yönetim Panelleri')}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Diğer yönetim panelleri için yetki gereklidir"
              >
                <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                <span>Diğer Paneller</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Minimal Notification Bell & Active User Profile Dropdown */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Notification Center */}
            <NotificationCenter
              currentUser={currentUser}
              filterEmployeeId={isHRManager || canAccess('dashboard') ? undefined : currentUser.employeeId}
            />

            {!pdksStorage.isLoggedIn() && (
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                title="Kullanıcı Adı ve Şifre ile Giriş Yap"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-600" />
                <span>Giriş</span>
              </button>
            )}

            {/* Compact Account Profile Dropdown (Houses Tema, Duvar QR, Logo, Kiosk Tam Ekran, Çıkış Yap) */}
            <div className="relative">
              <button
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer"
                title={`${currentUser.name} · Profil ve Sistem Menüsü`}
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <span className="hidden sm:inline text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[110px]">
                  {currentUser.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {isRoleDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsRoleDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-[calc(100vw-20px)] max-w-xs sm:w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 z-50 p-2 overflow-hidden">
                    {/* User Profile Header */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700/80 mb-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={currentUser.avatar}
                          alt={currentUser.name}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {currentUser.name}
                          </div>
                          <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                            @{currentUser.username || 'hesap'}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {currentUser.title}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold truncate ${getRoleBadgeStyle(currentUser.role)}`}>
                          {getRoleLabel(currentUser.role)}
                          {!isSuperAdmin && isFullAdmin ? ' · Tam Yetkili' : !isSuperAdmin && canAccessPermissions ? ' · Alt Yetkili' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold text-[10px] shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktif
                        </span>
                      </div>
                    </div>

                    {/* Relocated Management & System Actions */}
                    <div className="space-y-1.5 mb-2">
                      {canManageSettings && onOpenLogoManager && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            onOpenLogoManager();
                          }}
                          className="w-full p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 text-xs font-semibold flex items-center justify-between gap-2 transition-colors border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Logoyu Değiştir</span>
                          </span>
                          <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-normal">Kurumsal</span>
                        </button>
                      )}

                      {canManageSettings && onOpenWallQR && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            onOpenWallQR();
                          }}
                          className="w-full p-2 rounded-xl bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-800 dark:text-purple-200 text-xs font-semibold flex items-center justify-between gap-2 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <QrCode className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            <span>Duvar QR Yönetimi & Yazdır</span>
                          </span>
                          <span className="text-[10px] text-purple-500 dark:text-purple-400 font-normal">Sabit QR</span>
                        </button>
                      )}

                      {canAccess('kiosk') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            setActiveTab('kiosk');
                            onEnterFullscreenKiosk();
                          }}
                          className="w-full p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-between gap-2 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <Maximize2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                            <span>Tam Ekran Kiosk Terminali</span>
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">Kiosk</span>
                        </button>
                      )}
                    </div>

                    {/* Per-Account Personal Theme Switcher (Available for ALL roles) */}
                    <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700/80 mb-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Tema Değiştir</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                          {currentThemeDef.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          aria-pressed={themeMode === 'light'}
                          onClick={() => void setMode('light', currentUser)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                            themeMode === 'light'
                              ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Sun className="w-3.5 h-3.5" />
                          <span>Açık Tema</span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={themeMode === 'dark'}
                          onClick={() => void setMode('dark', currentUser)}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                            themeMode === 'dark'
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Moon className="w-3.5 h-3.5" />
                          <span>Koyu Tema</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {APP_THEMES.map((theme) => {
                          const isSelected = currentThemeDef.id === theme.id;
                          return (
                            <button
                              key={theme.id}
                              type="button"
                              onClick={() => handleQuickSelectTheme(theme.id)}
                              title={`${theme.name} (${theme.subtitle}) — ${theme.mode === 'dark' ? 'Koyu' : 'Açık'}`}
                              className={`group flex flex-col items-center gap-1 p-1 rounded-lg border transition-all cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-600 dark:border-indigo-400 ring-1 ring-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/50'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                              }`}
                            >
                              <span
                                data-theme-keep="true"
                                className="w-full h-5 rounded-md border flex items-center justify-end pr-1"
                                style={{
                                  backgroundColor: theme.preview.bg,
                                  borderColor: theme.preview.border,
                                }}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: theme.preview.accent }}
                                />
                              </span>
                              <span className="text-[9px] font-semibold text-slate-600 dark:text-slate-300 truncate w-full text-center">
                                {theme.mode === 'dark' ? 'Koyu' : 'Açık'}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {onOpenThemeSettings && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            onOpenThemeSettings();
                          }}
                          className="w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {currentThemeDef.mode === 'dark' ? (
                            <Moon className="w-3 h-3" />
                          ) : (
                            <Sun className="w-3 h-3" />
                          )}
                          <span>Tüm Tema Seçeneklerini Aç</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Login with Different Username */}
                    <button
                      onClick={() => {
                        setIsRoleDropdownOpen(false);
                        onOpenLogin();
                      }}
                      className="w-full mb-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <Key className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      <span>Farklı Kullanıcı ile Giriş Yap</span>
                    </button>

                    {/* Prominent Sign Out */}
                    <button
                      onClick={() => {
                        setIsRoleDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full p-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-rose-200 dark:border-rose-800 cursor-pointer mb-1.5"
                    >
                      <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span>Çıkış Yap</span>
                    </button>

                    <div className="px-3 py-1 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {companyName}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Compact Mobile / Tablet Tab Strip (Single-line horizontal scroll, zero Duvar QR clutter) */}
        <div className="flex lg:hidden overflow-x-auto py-1.5 gap-1 border-t border-slate-100 dark:border-slate-800 -mx-2.5 px-2.5 scrollbar-none items-center">
          {canAccessPermissions && (
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'permissions'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-800 dark:text-purple-200 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>{isSuperAdmin ? 'Yetki & Rol' : 'Kullanıcı Yetkilendirme'}</span>
            </button>
          )}

          {canAccess('dashboard') && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutDashboard className="w-3 h-3" />
              <span>Canlı Pano</span>
            </button>
          )}

          {canAccess('employees') && (
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'employees'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Personel</span>
            </button>
          )}

          {canAccess('records') && (
            <button
              onClick={() => setActiveTab('records')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'records'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Kayıtlar</span>
            </button>
          )}

          {canAccess('shifts') && (
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'shifts'
                  ? isSupervisor && !isHRManager
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : isSupervisor && !isHRManager
                  ? 'text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-700'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <CalendarCheck className="w-3 h-3" />
              <span>{isSupervisor && !isHRManager ? 'Vardiya' : 'Vardiya & İzin'}</span>
            </button>
          )}

          {canAccess('performance') && (
            <button
              onClick={() => setActiveTab('performance')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'performance'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              <span>Performans</span>
            </button>
          )}

          {canAccess('reports') && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'reports'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>Raporlar</span>
            </button>
          )}

          {canAccess('kiosk') && (
            <button
              onClick={() => setActiveTab('kiosk')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'kiosk'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <QrCode className="w-3 h-3" />
              <span>Kiosk</span>
            </button>
          )}

          {canAccess('portal') && (
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'portal'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>{isHRManager ? 'Mobil' : 'QR Okut & Mola'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

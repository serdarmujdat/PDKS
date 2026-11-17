import React, { useState, useEffect } from 'react';
import { QrCode, Users, Clock, ShieldCheck, CalendarCheck, Smartphone, Maximize2, BarChart3, ChevronDown, Shield, TrendingUp, Key, LogOut, Lock, LogIn, LayoutDashboard, Printer, Image as ImageIcon, Sun, Moon, Palette, ShieldAlert } from 'lucide-react';
import { AppPageKey, CurrentUser, ThemeId } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { NotificationCenter } from './NotificationCenter';
import { CompanyLogoImage } from './CompanyLogoImage';
import { APP_THEMES, getThemeById } from '../themes/themes';

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
  onSwitchUser,
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

  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);
  const isHRManager = pdksStorage.isHRorSuperAdmin(currentUser);
  const canManageSettings = pdksStorage.canAccessSettings(currentUser);
  const isSupervisor = pdksStorage.canUserAccessShiftManagement(currentUser);
  const currentThemeDef = getThemeById(activeTheme || pdksStorage.getUserTheme(currentUser));

  const canAccess = (page: AppPageKey) => pdksStorage.canAccessPage(currentUser, page);
  const allowedPages = pdksStorage.getUserAllowedPages(currentUser);

  const handleQuickSelectTheme = (themeId: ThemeId) => {
    void pdksStorage.saveUserTheme(themeId, currentUser);
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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Standard Company Logo & Single Brand Wordmark */}
          <div className="flex items-center gap-3">
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
              className="text-left group flex items-center gap-2.5 focus:outline-none cursor-pointer"
            >
              <div className="h-9 max-w-[160px] flex items-center shrink-0">
                <CompanyLogoImage
                  src={companyLogo}
                  alt={companyName}
                  companyName={companyName}
                  className="max-h-8 max-w-[150px] w-auto h-auto object-contain"
                  variant="light"
                />
              </div>
              <div className="hidden sm:block border-l border-slate-200 pl-2.5 max-w-[170px]">
                <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight truncate" title={companyName}>
                  {companyName}
                </span>
                <span className="text-[10px] font-medium text-slate-500 block leading-none">
                  Personel Devam Takip
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links (Dynamic per-user permissions) */}
          <nav className="hidden lg:flex items-center gap-1">
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('permissions')}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'permissions'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Yetki & Rol Yönetimi</span>
              </button>
            )}

            {canAccess('dashboard') && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Canlı Pano</span>
              </button>
            )}

            {canAccess('employees') && (
              <button
                onClick={() => setActiveTab('employees')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'employees'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Users className="w-4 h-4 text-slate-500" />
                <span>Personel</span>
              </button>
            )}

            {canAccess('records') && (
              <button
                onClick={() => setActiveTab('records')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'records'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-slate-500" />
                <span>Kayıtlar</span>
              </button>
            )}

            {canAccess('shifts') && (
              <button
                onClick={() => setActiveTab('shifts')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'shifts'
                    ? isSupervisor && !isHRManager
                      ? 'bg-amber-50 text-amber-800 border border-amber-300 font-semibold shadow-xs'
                      : 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <CalendarCheck className={`w-4 h-4 ${isSupervisor && !isHRManager ? 'text-amber-600' : 'text-indigo-600'}`} />
                <span>{isSupervisor && !isHRManager ? 'Vardiya Yönetimi' : 'Vardiya & İzin'}</span>
                {isSupervisor && !isHRManager && (
                  <span className="text-[10px] bg-amber-200/90 text-amber-900 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                    Birim Amiri
                  </span>
                )}
              </button>
            )}

            {canAccess('performance') && (
              <button
                onClick={() => setActiveTab('performance')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'performance'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Performans</span>
              </button>
            )}

            {canAccess('reports') && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'reports'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span>Raporlar</span>
              </button>
            )}

            {canAccess('kiosk') && (
              <button
                onClick={() => setActiveTab('kiosk')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'kiosk'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>{isHRManager ? 'Kiosk' : 'Kiosk Tarama'}</span>
              </button>
            )}

            {canAccess('portal') && (
              <button
                onClick={() => setActiveTab('portal')}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'portal'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span>{isHRManager ? 'Mobil Önizleme' : 'QR Okut & Mola Portalı'}</span>
              </button>
            )}

            {!isHRManager && allowedPages.length <= 3 && (
              <button
                onClick={() => handleRestrictedTabClick('Diğer Yönetim Panelleri')}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-400 hover:text-amber-700 hover:bg-amber-50/50 rounded-lg transition-colors cursor-pointer"
                title="Diğer yönetim panelleri için yetki gereklidir"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>Diğer Paneller (Yetki Gerekli)</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Actions, Wall QR, Login Button, Notification Bell & Active Role Switcher */}
          <div className="flex items-center gap-2">
            {canManageSettings && onOpenLogoManager && (
              <button
                onClick={onOpenLogoManager}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                title="Şirket logosunu standart boyutlarda ekleyin veya değiştirin"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Logo Değiştir</span>
              </button>
            )}

            {canManageSettings && onOpenWallQR && (
              <button
                onClick={onOpenWallQR}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                title="Şirket duvarına asılacak sabit QR kodu görüntüle, düzenle ve yazdır"
              >
                <QrCode className="w-3.5 h-3.5 text-purple-600" />
                <span>Duvar QR'ı</span>
              </button>
            )}

            {/* Direct Login / Logout Button - Dynamically switches when logged in */}
            {pdksStorage.isLoggedIn() ? (
              <button
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs active:scale-95"
                title={`Oturumu Kapat (${currentUser.name})`}
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Çıkış Yap</span>
              </button>
            ) : (
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs active:scale-95"
                title="Kullanıcı Adı ve Şifre ile Giriş Yap"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-600" />
                <span>Giriş Yap</span>
              </button>
            )}


            {onOpenThemeSettings && (
              <button
                onClick={onOpenThemeSettings}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                title={`Hesap Teması: ${currentThemeDef.name} (${currentThemeDef.mode === 'dark' ? 'Koyu' : 'Açık'})`}
              >
                {currentThemeDef.mode === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span className="hidden md:inline">Tema</span>
              </button>
            )}

            {/* Notification Center */}
            <NotificationCenter
              currentUser={currentUser}
              filterEmployeeId={isHRManager || canAccess('dashboard') ? undefined : currentUser.employeeId}
            />

            {/* Role Switcher & Account Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
                title="Kullanıcı Profili ve Oturum Seçenekleri"
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                    <span>{currentUser.name}</span>
                    {currentUser.username && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        (@{currentUser.username})
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500 leading-tight">
                    {getRoleLabel(currentUser.role)}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isRoleDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsRoleDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-[calc(100vw-24px)] max-w-xs sm:w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-2 overflow-hidden">
                    {/* User Profile Header */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={currentUser.avatar}
                          alt={currentUser.name}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {currentUser.name}
                          </div>
                          <div className="text-[11px] font-mono text-indigo-600">
                            @{currentUser.username || 'hesap'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {currentUser.title}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold ${getRoleBadgeStyle(currentUser.role)}`}>
                          {getRoleLabel(currentUser.role)}
                        </span>

                        <button
                          onClick={() => {
                            setIsRoleDropdownOpen(false);
                            onLogout();
                          }}
                          className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 text-[11px]"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Çıkış Yap</span>
                        </button>
                      </div>
                    </div>

                    {canManageSettings && onOpenLogoManager && (
                      <button
                        onClick={() => {
                          setIsRoleDropdownOpen(false);
                          onOpenLogoManager();
                        }}
                        className="w-full mb-2 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-purple-200 cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                        <span>Kurumsal Logo Yönetimi</span>
                      </button>
                    )}

                    {/* User Details & Permissions Summary */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 text-[11px] space-y-2 mb-2">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Sicil / Kullanıcı:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {currentUser.employeeId || currentUser.username}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Departman:</span>
                        <span className="font-medium text-slate-800 truncate max-w-[170px]">
                          {currentUser.department}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Oturum Durumu:</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[10px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktif Oturum
                        </span>
                      </div>
                    </div>

                    {/* Per-Account Personal Theme Switcher (Available for ALL roles) */}
                    <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 mb-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Hesap Teması</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-500">
                          {currentThemeDef.name}
                        </span>
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
                                  ? 'border-indigo-600 ring-1 ring-indigo-500 bg-indigo-50/60'
                                  : 'border-slate-200 hover:border-slate-300 bg-white'
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
                              <span className="text-[9px] font-semibold text-slate-600 truncate w-full text-center">
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
                          className="w-full py-1.5 px-2 rounded-lg text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {currentThemeDef.mode === 'dark' ? (
                            <Moon className="w-3 h-3" />
                          ) : (
                            <Sun className="w-3 h-3" />
                          )}
                          <span>Tüm Tema Önizlemelerini Aç</span>
                        </button>
                      )}
                    </div>


                    {/* Quick Login with Different Username */}
                    <button
                      onClick={() => {
                        setIsRoleDropdownOpen(false);
                        onOpenLogin();
                      }}
                      className="w-full mb-2 p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-indigo-200 cursor-pointer"
                    >
                      <Key className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Farklı Kullanıcı ile Giriş Yap</span>
                    </button>

                    {/* Prominent Sign Out */}
                    <button
                      onClick={() => {
                        setIsRoleDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-rose-200 cursor-pointer mb-2"
                    >
                      <LogOut className="w-4 h-4 text-rose-600" />
                      <span>Sistemden Çıkış Yap</span>
                    </button>

                    <div className="px-3 py-1.5 border-t border-slate-100 text-center text-[10px] text-slate-400 truncate">
                      {companyName} · Güvenli Kurumsal Giriş
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Kiosk Fullscreen Action */}
            <button
              onClick={() => {
                setActiveTab('kiosk');
                onEnterFullscreenKiosk();
              }}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              title="Kiosk Terminalini Tam Ekranda Aç"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Kiosk</span>
            </button>
          </div>
        </div>

        {/* Mobile secondary tab strip */}
        <div className="flex lg:hidden overflow-x-auto py-2 gap-1.5 border-t border-slate-100 -mx-4 px-4 scrollbar-none items-center">
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('permissions')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'permissions'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Yetki & Rol Yönetimi</span>
            </button>
          )}

          {canAccess('dashboard') && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Canlı Pano</span>
            </button>
          )}

          {canAccess('employees') && (
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'employees'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Personel</span>
            </button>
          )}

          {canAccess('records') && (
            <button
              onClick={() => setActiveTab('records')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'records'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Kayıtlar</span>
            </button>
          )}

          {canAccess('shifts') && (
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'shifts'
                  ? isSupervisor && !isHRManager
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-indigo-600 text-white shadow-xs'
                  : isSupervisor && !isHRManager
                  ? 'text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>{isSupervisor && !isHRManager ? 'Vardiya (Birim Amiri)' : 'Vardiya & İzin'}</span>
            </button>
          )}

          {canAccess('performance') && (
            <button
              onClick={() => setActiveTab('performance')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'performance'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Performans</span>
            </button>
          )}

          {canAccess('reports') && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'reports'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Raporlar</span>
            </button>
          )}

          {canManageSettings && onOpenWallQR && (
            <button
              onClick={onOpenWallQR}
              className="px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              title="Şirket Duvar QR Kodunu Görüntüle / Yazdır"
            >
              <Printer className="w-3.5 h-3.5 text-purple-600" />
              <span>Duvar QR</span>
            </button>
          )}

          {canAccess('kiosk') && (
            <button
              onClick={() => setActiveTab('kiosk')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'kiosk'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{isHRManager ? 'Kiosk' : 'Kiosk Terminali'}</span>
            </button>
          )}

          {canAccess('portal') && (
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                activeTab === 'portal'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{isHRManager ? 'Mobil Önizleme' : 'QR Okut & Mola'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

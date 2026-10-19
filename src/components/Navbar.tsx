import React, { useState } from 'react';
import { QrCode, Users, Clock, ShieldCheck, CalendarCheck, Smartphone, Maximize2, BarChart3, User, ChevronDown, Shield, TrendingUp, Key, LogOut, Lock, LogIn, LayoutDashboard, Printer, Image as ImageIcon } from 'lucide-react';
import { CurrentUser } from '../types/pdks';
import { pdksStorage, DEMO_USERS } from '../services/storage';
import { NotificationCenter } from './NotificationCenter';

export type ActiveTab = 'kiosk' | 'dashboard' | 'performance' | 'employees' | 'records' | 'shifts' | 'portal' | 'reports' | 'supervisor';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onEnterFullscreenKiosk: () => void;
  currentUser: CurrentUser;
  onSwitchUser: (user: CurrentUser) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenWallQR?: () => void;
  onOpenArchitecture?: () => void;
  onOpenLogoManager?: () => void;
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
  onOpenArchitecture,
  onOpenLogoManager,
}) => {
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [restrictedNotice, setRestrictedNotice] = useState<string | null>(null);

  const isHRManager = currentUser.role === 'ik_yoneticisi';
  const isSupervisor = pdksStorage.canUserAccessShiftManagement(currentUser);
  const companyLogo = pdksStorage.getCompanyLogo();
  const accounts = pdksStorage.getUserAccounts();

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
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
      `Yetkisiz Erişim: '${tabName}' paneline yalnızca İK Yöneticisi erişebilir. Birim amirleri yalnızca sorumlu oldukları personellerin vardiya planlamasını yapabilir.`
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
                if (isHRManager) {
                  setActiveTab('dashboard');
                } else {
                  setActiveTab('portal');
                }
              }}
              className="text-left group flex items-center gap-2.5 focus:outline-none cursor-pointer"
            >
              <div className="h-9 max-w-[160px] flex items-center shrink-0">
                <img
                  src={companyLogo}
                  alt="Kurumsal Logo"
                  className="max-h-8 max-w-[150px] w-auto h-auto object-contain"
                />
              </div>
              <div className="hidden sm:block border-l border-slate-200 pl-2.5">
                <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
                  Asem PDKS
                </span>
                <span className="text-[10px] font-medium text-slate-500 block leading-none">
                  Personel Devam Takip
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links (Adaptive based on Role Restrictions) */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* If NOT ik_yoneticisi: Restricted Mode - ONLY Mobile Portal & Kiosk */}
            {!isHRManager ? (
              <>
                <button
                  onClick={() => setActiveTab('portal')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'portal'
                      ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  <span>QR Okut & Mola Portalı</span>
                </button>

                {/* Birim Amiri Vardiya & Mesai Yönetimi Tab */}
                {isSupervisor && (
                  <button
                    onClick={() => setActiveTab('shifts')}
                    className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      activeTab === 'shifts'
                        ? 'bg-amber-50 text-amber-800 border border-amber-300 shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-amber-50/50'
                    }`}
                  >
                    <CalendarCheck className="w-4 h-4 text-amber-600" />
                    <span>Vardiya Yönetimi</span>
                    <span className="text-[10px] bg-amber-200/90 text-amber-900 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Birim Amiri
                    </span>
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('kiosk')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'kiosk'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>Kiosk Tarama</span>
                </button>

                {/* Locked Indicator for Restricted Admin Areas */}
                <button
                  onClick={() => handleRestrictedTabClick('Diğer İK Yönetim Panelleri')}
                  className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-400 hover:text-amber-700 hover:bg-amber-50/50 rounded-lg transition-colors cursor-pointer"
                  title="Diğer yönetim panelleri yalnızca İK Yöneticisine açıktır"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Diğer Paneller (İK Özel)</span>
                </button>
              </>
            ) : (
              /* If ik_yoneticisi: FULL NAVIGATION to all screens */
              <>
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

                <button
                  onClick={() => setActiveTab('employees')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'employees'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4 text-slate-500" />
                  <span>Personel</span>
                </button>

                <button
                  onClick={() => setActiveTab('records')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'records'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span>Kayıtlar</span>
                </button>

                <button
                  onClick={() => setActiveTab('shifts')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'shifts'
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <CalendarCheck className="w-4 h-4 text-indigo-600" />
                  <span>Vardiya & İzin</span>
                </button>

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

                <button
                  onClick={() => setActiveTab('reports')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'reports'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                  <span>Raporlar</span>
                </button>

                <button
                  onClick={() => setActiveTab('kiosk')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'kiosk'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-indigo-600" />
                  <span>Kiosk</span>
                </button>

                <button
                  onClick={() => setActiveTab('portal')}
                  className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'portal'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-slate-500" />
                  <span>Mobil Önizleme</span>
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Actions, Wall QR, Login Button, Notification Bell & Active Role Switcher */}
          <div className="flex items-center gap-2">
            {isHRManager && onOpenLogoManager && (
              <button
                onClick={onOpenLogoManager}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
                title="Şirket logosunu standart boyutlarda ekleyin veya değiştirin (Yalnızca İK)"
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span>Logo Değiştir</span>
              </button>
            )}

            {isHRManager && onOpenWallQR && (
              <button
                onClick={onOpenWallQR}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer"
                title="Şirket duvarına asılacak sabit QR kodu görüntüle, düzenle ve yazdır (Yalnızca İK)"
              >
                <QrCode className="w-3.5 h-3.5 text-purple-600" />
                <span>Duvar QR'ı (İK)</span>
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


            {/* Notification Center */}
            <NotificationCenter />

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

                    {isHRManager && onOpenLogoManager && (
                      <button
                        onClick={() => {
                          setIsRoleDropdownOpen(false);
                          onOpenLogoManager();
                        }}
                        className="w-full mb-2 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-purple-200 cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                        <span>Kurumsal Logo Yönetimi (İK)</span>
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

                    {/* Quick Demo Role Switcher */}
                    <div className="mb-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 px-1 flex items-center justify-between">
                        <span>Hızlı Hesap Değiştir (Demo)</span>
                        <User className="w-3 h-3 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        {DEMO_USERS.map((demo) => {
                          const isCurrent = currentUser.username === demo.username;
                          return (
                            <button
                              key={demo.id}
                              onClick={() => {
                                onSwitchUser(demo);
                                setIsRoleDropdownOpen(false);
                              }}
                              className={`w-full text-left p-1.5 rounded-lg flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-indigo-100/70 text-indigo-900 font-bold'
                                  : 'hover:bg-slate-100 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={demo.avatar}
                                  alt={demo.name}
                                  className="w-5 h-5 rounded-full object-cover shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="truncate">
                                  <div className="text-[11px] font-semibold truncate leading-tight">
                                    {demo.name}
                                  </div>
                                  <div className="text-[9px] text-slate-500 font-mono truncate leading-tight">
                                    @{demo.username}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium ${
                                  demo.role === 'ik_yoneticisi'
                                    ? 'bg-purple-100 text-purple-700 font-bold'
                                    : demo.role === 'birim_amiri'
                                    ? 'bg-amber-100 text-amber-800 font-bold'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {demo.role === 'ik_yoneticisi'
                                  ? 'İK'
                                  : demo.role === 'birim_amiri'
                                  ? 'Birim Amiri'
                                  : demo.role === 'guvenlik'
                                  ? 'Güvenlik'
                                  : 'Personel'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
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

                    <div className="px-3 py-1.5 border-t border-slate-100 text-center text-[10px] text-slate-400">
                      Asem PDKS · Güvenli Kurumsal Giriş
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
          {!isHRManager ? (
            <>
              <button
                onClick={() => setActiveTab('portal')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'portal'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>QR Okut & Mola</span>
              </button>

              {isSupervisor && (
                <button
                  onClick={() => setActiveTab('shifts')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                    activeTab === 'shifts'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300'
                  }`}
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Vardiya (Birim Amiri)</span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('kiosk')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'kiosk'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Kiosk Terminali</span>
              </button>
            </>
          ) : (
            <>
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

              <button
                onClick={() => setActiveTab('shifts')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'shifts'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Vardiya & İzin</span>
              </button>

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

              {isHRManager && onOpenWallQR && (
                <button
                  onClick={onOpenWallQR}
                  className="px-2.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl whitespace-nowrap flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Şirket Duvar QR Kodunu Görüntüle / Yazdır (Yalnızca İK)"
                >
                  <Printer className="w-3.5 h-3.5 text-purple-600" />
                  <span>Duvar QR</span>
                </button>
              )}

              <button
                onClick={() => setActiveTab('kiosk')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'kiosk'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Kiosk</span>
              </button>

              <button
                onClick={() => setActiveTab('portal')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  activeTab === 'portal'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobil Önizleme</span>
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

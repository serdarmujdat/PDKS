import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { KioskTerminal } from './components/KioskTerminal';
import { DashboardOverview } from './components/DashboardOverview';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { EmployeeManagement } from './components/EmployeeManagement';
import { AttendanceLogs } from './components/AttendanceLogs';
import { AnalyticsReports } from './components/AnalyticsReports';
import { ShiftAndLeaveManagement } from './components/ShiftAndLeaveManagement';
import { EmployeeMobilePortal } from './components/EmployeeMobilePortal';
import { LandingLoginPage } from './components/LandingLoginPage';
import { CompanyLogoModal } from './components/CompanyLogoModal';
import { LoginModal } from './components/LoginModal';
import { CompanyWallQRModal } from './components/CompanyWallQRModal';
import { ThemeSettingsModal } from './components/ThemeSettingsModal';
import { RolePermissionManagement } from './components/RolePermissionManagement';
import { AppPageKey, CurrentUser } from './types/pdks';
import { pdksStorage } from './services/storage';
import { useTheme } from './contexts/ThemeContext';
import { RotateCcw, Printer, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PDKS Uygulama Hatası Yakalandı (Beyaz Ekran Engellendi):', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Beklenmeyen Durum Engellendi</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Sistem beyaz ekrana düşmeden korumaya alındı. Lütfen sayfayı yenileyiniz.
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sayfayı Yeniden Yükle</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function getDefaultTabForUser(user: CurrentUser): ActiveTab {
  if (pdksStorage.isSuperAdmin(user)) {
    return 'permissions';
  }
  const preferredOrder: AppPageKey[] = ['dashboard', 'shifts', 'portal', 'kiosk', 'employees', 'records', 'performance', 'reports'];
  for (const page of preferredOrder) {
    if (pdksStorage.canAccessPage(user, page)) {
      return page;
    }
  }
  if (pdksStorage.canAccessPermissions(user)) {
    return 'permissions';
  }
  return 'portal';
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => pdksStorage.isLoggedIn());
  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => pdksStorage.getActiveUser());
  const [companyLogo, setCompanyLogo] = useState<string>(() => pdksStorage.getCompanyLogo());
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const usr = pdksStorage.getActiveUser();
    if (pdksStorage.isSuperAdmin(usr)) return 'permissions';
    if (pdksStorage.canAccessPage(usr, 'dashboard')) return 'dashboard';
    if (usr.role === 'personel') return 'portal';
    return getDefaultTabForUser(usr);
  });
  const [isFullscreenKiosk, setIsFullscreenKiosk] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isWallQRModalOpen, setIsWallQRModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const { themeId: activeTheme, setTheme, syncThemeFromUser, resetToDefaultTheme } = useTheme();

  useEffect(() => {
    document.title = `${companyName} · Personel Devam Kontrol Sistemi (PDKS)`;
  }, [companyName]);

  // Dynamic per-user route & permission enforcement
  useEffect(() => {
    if (activeTab === 'permissions') {
      if (!pdksStorage.canAccessPermissions(currentUser)) {
        setActiveTab(getDefaultTabForUser(currentUser));
      }
      return;
    }
    if (!pdksStorage.canAccessPage(currentUser, activeTab as AppPageKey)) {
      setActiveTab(getDefaultTabForUser(currentUser));
    }
  }, [currentUser, activeTab]);

  // Listen for real-time live synchronization events across devices / tabs (Debounced)
  useEffect(() => {
    // Immediately pull the canonical corporate logo & persistent institution name from central DB
    pdksStorage.fetchCompanyLogoFromServer().then((srvLogo) => {
      if (srvLogo) setCompanyLogo(srvLogo);
    });
    pdksStorage.fetchCompanyNameFromServer().then((srvName) => {
      if (srvName) setCompanyName(srvName);
    });
    const unsubscribeCloudLogo = pdksStorage.subscribeToCloudLogo();

    // Hydrate per-user cloud themes if signed into Google Firebase Auth
    void pdksStorage.syncUserThemesFromCloud();

    let debounceTimer: any = null;
    const handleForceLogout = () => {
      setIsLoggedIn(false);
      resetToDefaultTheme();
      setRefreshKey((prev) => prev + 1);
    };

    const handleSync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setCompanyLogo(pdksStorage.getCompanyLogo());
        setCompanyName(pdksStorage.getCompanyName());
        if (pdksStorage.isLoggedIn()) {
          const refreshed = pdksStorage.refreshActiveUserFromAccounts();
          if (!refreshed) {
            handleForceLogout();
            return;
          }
          setCurrentUser(refreshed);
          syncThemeFromUser(refreshed);
        }
        setRefreshKey((prev) => prev + 1);
      }, 200);
    };

    const handleLogoUpdate = (e: any) => {
      if (e.detail && typeof e.detail === 'string') {
        setCompanyLogo(e.detail);
      }
    };

    const handleCompanyNameUpdate = (e: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCompanyName(e.detail);
      } else {
        setCompanyName(pdksStorage.getCompanyName());
      }
    };

    const handleThemeUpdate = (e: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCurrentUser((prev) => (prev.themeId === e.detail ? prev : { ...prev, themeId: e.detail }));
      }
    };

    window.addEventListener('pdks-data-synced', handleSync);
    window.addEventListener('pdks-logo-updated', handleLogoUpdate);
    window.addEventListener('pdks-company-name-updated', handleCompanyNameUpdate);
    window.addEventListener('pdks-wall-qr-updated', handleCompanyNameUpdate);
    window.addEventListener('pdks-theme-updated', handleThemeUpdate);
    window.addEventListener('pdks-force-logout', handleForceLogout);

    return () => {
      clearTimeout(debounceTimer);
      unsubscribeCloudLogo();
      window.removeEventListener('pdks-data-synced', handleSync);
      window.removeEventListener('pdks-logo-updated', handleLogoUpdate);
      window.removeEventListener('pdks-company-name-updated', handleCompanyNameUpdate);
      window.removeEventListener('pdks-wall-qr-updated', handleCompanyNameUpdate);
      window.removeEventListener('pdks-theme-updated', handleThemeUpdate);
      window.removeEventListener('pdks-force-logout', handleForceLogout);
    };
  }, [resetToDefaultTheme, syncThemeFromUser]);

  const handleScanComplete = () => {
    // Triggers dashboard state refresh
    setRefreshKey((prev) => prev + 1);
  };

  const handleSwitchUser = (user: CurrentUser) => {
    pdksStorage.setActiveUser(user);
    const updatedUser = pdksStorage.getActiveUser();
    const resolvedTheme = syncThemeFromUser(updatedUser);
    setCurrentUser({ ...updatedUser, themeId: resolvedTheme });
    setIsLoggedIn(true);
    setActiveTab(getDefaultTabForUser(updatedUser));
    setRefreshKey((prev) => prev + 1);
  };

  const handleLoginSuccess = (user: CurrentUser) => {
    const resolvedTheme = syncThemeFromUser(user);
    setCurrentUser({ ...user, themeId: resolvedTheme });
    setIsLoggedIn(true);
    setActiveTab(getDefaultTabForUser(user));
    setRefreshKey((prev) => prev + 1);
  };

  const handleLogout = () => {
    pdksStorage.logout();
    setIsLoggedIn(false);
    resetToDefaultTheme();
    setRefreshKey((prev) => prev + 1);
  };

  const handleLogoUpdated = (newLogoUrl: string) => {
    setCompanyLogo(newLogoUrl);
    setRefreshKey((prev) => prev + 1);
  };

  // TALEP: "Logo güzel olmuş fakat logo ekleme kısmı herkese açık olmasın ik yönetici sayfasında olsun"
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-600 selection:text-white transition-colors">
        <LandingLoginPage
          onLoginSuccess={handleLoginSuccess}
          companyLogo={companyLogo}
          companyName={companyName}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans text-slate-900 dark:text-slate-100 selection:bg-indigo-600 selection:text-white transition-colors">
      {/* Top Navbar with Active User Switcher, Logo Manager, Personal Theme & Notification Center */}
      {!isFullscreenKiosk && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onEnterFullscreenKiosk={() => setIsFullscreenKiosk(true)}
          currentUser={currentUser}
          onSwitchUser={handleSwitchUser}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
          onOpenWallQR={pdksStorage.canAccessSettings(currentUser) ? () => setIsWallQRModalOpen(true) : undefined}
          onOpenLogoManager={() => setIsLogoModalOpen(true)}
          onOpenThemeSettings={() => setIsThemeModalOpen(true)}
          activeTheme={activeTheme}
          companyLogo={companyLogo}
          companyName={companyName}
        />
      )}

      {/* Main Content Area Protected by ErrorBoundary */}
      <ErrorBoundary>
        <main className="flex-1 flex flex-col w-full max-w-full min-w-0" data-sync-tick={refreshKey}>
          {activeTab === 'permissions' && pdksStorage.canAccessPermissions(currentUser) && (
            <RolePermissionManagement
              currentUser={currentUser}
              onOpenLogoManager={pdksStorage.canAccessSettings(currentUser) ? () => setIsLogoModalOpen(true) : undefined}
              onOpenWallQR={pdksStorage.canAccessSettings(currentUser) ? () => setIsWallQRModalOpen(true) : undefined}
              onOpenThemeSettings={() => setIsThemeModalOpen(true)}
              onLogout={handleLogout}
            />
          )}

          {activeTab === 'kiosk' && pdksStorage.canAccessPage(currentUser, 'kiosk') && (
            <KioskTerminal
              currentUser={currentUser}
              onScanComplete={handleScanComplete}
              isFullscreen={isFullscreenKiosk}
              onToggleFullscreen={() => setIsFullscreenKiosk(!isFullscreenKiosk)}
              companyLogo={companyLogo}
            />
          )}

          {activeTab === 'dashboard' && pdksStorage.canAccessPage(currentUser, 'dashboard') && (
            <DashboardOverview
              currentUser={currentUser}
              onNavigateToKiosk={() => setActiveTab('kiosk')}
              onNavigateToEmployees={() => setActiveTab('employees')}
              onNavigateToRecords={() => setActiveTab('records')}
              onNavigateToPerformance={() => setActiveTab('performance')}
              onOpenWallQR={pdksStorage.canAccessSettings(currentUser) ? () => setIsWallQRModalOpen(true) : undefined}
              onOpenLogoManager={() => setIsLogoModalOpen(true)}
              onOpenThemeSettings={() => setIsThemeModalOpen(true)}
              onLogout={handleLogout}
              companyLogo={companyLogo}
              companyName={companyName}
            />
          )}

          {activeTab === 'performance' && pdksStorage.canAccessPage(currentUser, 'performance') && (
            <PerformanceDashboard />
          )}

          {activeTab === 'employees' && pdksStorage.canAccessPage(currentUser, 'employees') && (
            <EmployeeManagement
              currentUser={currentUser}
              onOpenWallQR={pdksStorage.canAccessSettings(currentUser) ? () => setIsWallQRModalOpen(true) : undefined}
            />
          )}

          {activeTab === 'records' && pdksStorage.canAccessPage(currentUser, 'records') && (
            <AttendanceLogs />
          )}

          {activeTab === 'reports' && pdksStorage.canAccessPage(currentUser, 'reports') && (
            <AnalyticsReports />
          )}

          {activeTab === 'shifts' && pdksStorage.canAccessPage(currentUser, 'shifts') && (
            <ShiftAndLeaveManagement currentUser={currentUser} />
          )}

          {activeTab === 'portal' && pdksStorage.canAccessPage(currentUser, 'portal') && (
            <EmployeeMobilePortal currentUser={currentUser} />
          )}
        </main>
      </ErrorBoundary>

      {/* Subtle Footer */}
      {!isFullscreenKiosk && (
        <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 px-6 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3 no-print transition-colors">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{companyName}</span>
            <span aria-hidden="true">·</span>
            <span>Personel Devam & Performans Takip Platformu</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">
              Aktif Oturum: @{currentUser.username || 'hesap'} ({currentUser.name} - {currentUser.title})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {pdksStorage.canAccessSettings(currentUser) && (
              <>
                <button
                  onClick={() => setIsLogoModalOpen(true)}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 font-semibold transition-colors text-xs cursor-pointer"
                  title="Kurumsal Logoyu Standart Boyutlarda Düzenle"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Şirket Logosu</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  onClick={() => setIsWallQRModalOpen(true)}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 flex items-center gap-1 font-semibold transition-colors text-xs cursor-pointer"
                  title="Sabit Şirket Duvarı QR'ını Oluştur ve Yazdır"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Şirket Duvarı QR'ı</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
              </>
            )}
            <button
              onClick={handleLogout}
              className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 flex items-center gap-1 font-bold transition-colors text-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hover:underline">Çıkış Yap</span>
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span>Tüm hakları saklıdır © 2026</span>
          </div>
        </footer>
      )}

      {/* Login & Credentials Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Company Logo Manager Modal (HR / Super Admin Authority) */}
      <CompanyLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentUser={currentUser}
        onLogoUpdated={handleLogoUpdated}
      />

      {/* Company Fixed Wall QR Poster Generator Modal */}
      {pdksStorage.canAccessSettings(currentUser) && (
        <CompanyWallQRModal
          isOpen={isWallQRModalOpen}
          onClose={() => setIsWallQRModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* Personal Account Theme Selector Modal (Available to Every User) */}
      <ThemeSettingsModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
        currentUser={currentUser}
        activeTheme={activeTheme}
        onThemeChanged={(newTheme) => {
          void setTheme(newTheme, currentUser);
          setCurrentUser((prev) => ({ ...prev, themeId: newTheme }));
        }}
      />
    </div>
  );
}

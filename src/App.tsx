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
import { SystemArchitectureModal } from './components/SystemArchitectureModal';
import { CurrentUser } from './types/pdks';
import { pdksStorage } from './services/storage';
import { RotateCcw, Key, Printer, Code2, Image as ImageIcon, AlertTriangle, RefreshCw } from 'lucide-react';

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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Beklenmeyen Durum Engellendi</h2>
              <p className="text-xs text-slate-500 mt-1">
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => pdksStorage.isLoggedIn());
  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => pdksStorage.getActiveUser());
  const [companyLogo, setCompanyLogo] = useState<string>(() => pdksStorage.getCompanyLogo());
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    pdksStorage.getActiveUser().role === 'personel' ? 'portal' : 'kiosk'
  );
  const [isFullscreenKiosk, setIsFullscreenKiosk] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isWallQRModalOpen, setIsWallQRModalOpen] = useState(false);
  const [isArchitectureModalOpen, setIsArchitectureModalOpen] = useState(false);

  // If active user is not ik_yoneticisi, ensure restricted access (Birim Amirleri can access shifts, portal, kiosk)
  useEffect(() => {
    if (currentUser.role !== 'ik_yoneticisi') {
      const isSupervisor = pdksStorage.canUserAccessShiftManagement(currentUser);
      const allowedTabs: ActiveTab[] = isSupervisor ? ['portal', 'kiosk', 'shifts'] : ['portal', 'kiosk'];
      if (!allowedTabs.includes(activeTab)) {
        setActiveTab(isSupervisor ? 'shifts' : 'portal');
      }
    }
  }, [currentUser, activeTab]);

  const handleScanComplete = () => {
    // Triggers dashboard state refresh
    setRefreshKey((prev) => prev + 1);
  };

  const handleSwitchUser = (user: CurrentUser) => {
    pdksStorage.setActiveUser(user);
    setCurrentUser(user);
    setIsLoggedIn(true);
    if (user.role === 'ik_yoneticisi') {
      setActiveTab('dashboard');
    } else if (pdksStorage.canUserAccessShiftManagement(user)) {
      setActiveTab('shifts');
    } else {
      setActiveTab('portal');
    }
    setRefreshKey((prev) => prev + 1);
  };

  const handleLoginSuccess = (user: CurrentUser) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    if (user.role === 'ik_yoneticisi') {
      setActiveTab('dashboard');
    } else if (pdksStorage.canUserAccessShiftManagement(user)) {
      setActiveTab('shifts');
    } else {
      setActiveTab('portal');
    }
    setRefreshKey((prev) => prev + 1);
  };

  const handleLogout = () => {
    pdksStorage.logout();
    setIsLoggedIn(false);
    setRefreshKey((prev) => prev + 1);
  };

  const handleResetData = () => {
    if (window.confirm('Tüm Asem verileri, kullanıcı hesapları ve bildirimler başlangıç durumuna sıfırlansın mı?')) {
      pdksStorage.resetToDemo();
      const defaultUser = pdksStorage.getActiveUser();
      setCurrentUser(defaultUser);
      setIsLoggedIn(true);
      setActiveTab('dashboard');
      setCompanyLogo(pdksStorage.getCompanyLogo());
      setRefreshKey((prev) => prev + 1);
    }
  };

  const handleLogoUpdated = (newLogoUrl: string) => {
    setCompanyLogo(newLogoUrl);
    setRefreshKey((prev) => prev + 1);
  };

  // TALEP: "Logo güzel olmuş fakat logo ekleme kısmı herkese açık olmasın ik yönetici sayfasında olsun"
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-600 selection:text-white">
        <LandingLoginPage
          onLoginSuccess={handleLoginSuccess}
          companyLogo={companyLogo}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar with Active User Switcher, Logo Manager and Notification Center */}
      {!isFullscreenKiosk && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onEnterFullscreenKiosk={() => setIsFullscreenKiosk(true)}
          currentUser={currentUser}
          onSwitchUser={handleSwitchUser}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          onLogout={handleLogout}
          onOpenWallQR={currentUser.role === 'ik_yoneticisi' ? () => setIsWallQRModalOpen(true) : undefined}
          onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
          onOpenLogoManager={() => setIsLogoModalOpen(true)}
        />
      )}

      {/* Main Content Area Protected by ErrorBoundary */}
      <ErrorBoundary>
        <main className="flex-1 flex flex-col">
          {activeTab === 'kiosk' && (
            <KioskTerminal
              key={refreshKey}
              currentUser={currentUser}
              onScanComplete={handleScanComplete}
              isFullscreen={isFullscreenKiosk}
              onToggleFullscreen={() => setIsFullscreenKiosk(!isFullscreenKiosk)}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardOverview
              key={refreshKey}
              currentUser={currentUser}
              onNavigateToKiosk={() => setActiveTab('kiosk')}
              onNavigateToEmployees={() => setActiveTab('employees')}
              onNavigateToRecords={() => setActiveTab('records')}
              onNavigateToPerformance={() => setActiveTab('performance')}
              onOpenWallQR={currentUser.role === 'ik_yoneticisi' ? () => setIsWallQRModalOpen(true) : undefined}
              onOpenArchitecture={() => setIsArchitectureModalOpen(true)}
              onOpenLogoManager={() => setIsLogoModalOpen(true)}
            />
          )}

          {activeTab === 'performance' && (
            <PerformanceDashboard key={refreshKey} />
          )}

          {activeTab === 'employees' && (
            <EmployeeManagement
              key={refreshKey}
              currentUser={currentUser}
              onOpenWallQR={currentUser.role === 'ik_yoneticisi' ? () => setIsWallQRModalOpen(true) : undefined}
            />
          )}

          {activeTab === 'records' && <AttendanceLogs key={refreshKey} />}

          {activeTab === 'reports' && <AnalyticsReports key={refreshKey} />}

          {activeTab === 'shifts' && (
            <ShiftAndLeaveManagement key={refreshKey} currentUser={currentUser} />
          )}

          {activeTab === 'portal' && (
            <EmployeeMobilePortal key={refreshKey} currentUser={currentUser} />
          )}
        </main>
      </ErrorBoundary>

      {/* Subtle Footer */}
      {!isFullscreenKiosk && (
        <footer className="bg-white border-t border-slate-200 py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Asem</span>
            <span aria-hidden="true">·</span>
            <span>Personel Devam & Performans Takip Platformu</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-indigo-600 font-medium">
              Aktif Oturum: @{currentUser.username || 'hesap'} ({currentUser.name} - {currentUser.title})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {currentUser.role === 'ik_yoneticisi' && (
              <>
                <button
                  onClick={() => setIsLogoModalOpen(true)}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold transition-colors text-xs cursor-pointer"
                  title="Kurumsal Logoyu Standart Boyutlarda Düzenle (İK Yetkisi)"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Şirket Logosu (İK)</span>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={() => setIsWallQRModalOpen(true)}
                  className="text-purple-600 hover:text-purple-800 flex items-center gap-1 font-semibold transition-colors text-xs cursor-pointer"
                  title="Sabit Şirket Duvarı QR'ını Oluştur ve Yazdır (İK Yetkisi)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Şirket Duvarı QR'ı (İK)</span>
                </button>
                <span className="text-slate-300">|</span>
              </>
            )}
            <button
              onClick={() => setIsArchitectureModalOpen(true)}
              className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold transition-colors text-xs cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Mimari & API</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleLogout}
              className="text-rose-600 hover:text-rose-800 flex items-center gap-1 font-bold transition-colors text-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hover:underline">Çıkış Yap</span>
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={handleResetData}
              className="text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors text-xs cursor-pointer"
              title="Başlangıç Demo Verilerine Dön"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Verileri Sıfırla</span>
            </button>
            <span className="text-slate-300">|</span>
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

      {/* Company Logo Manager Modal (HR Authority & Standard Dimensions) */}
      <CompanyLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        currentUser={currentUser}
        onLogoUpdated={handleLogoUpdated}
      />

      {/* Company Fixed Wall QR Poster Generator Modal (Strictly HR Manager) */}
      {currentUser.role === 'ik_yoneticisi' && (
        <CompanyWallQRModal
          isOpen={isWallQRModalOpen}
          onClose={() => setIsWallQRModalOpen(false)}
          currentUser={currentUser}
        />
      )}

      {/* System Architecture, SQL Schemas and API Guide Modal */}
      <SystemArchitectureModal
        isOpen={isArchitectureModalOpen}
        onClose={() => setIsArchitectureModalOpen(false)}
      />
    </div>
  );
}

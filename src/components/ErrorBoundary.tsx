import React from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Beklenmeyen bir uygulama hatası oluştu.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('PDKS Uygulama Hatası:', error, info?.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = () => {
    try {
      const preserveKeys = ['pdks_device_identity_v1'];
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !preserveKeys.includes(k)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignore storage cleanup errors
    }
    window.location.reload();
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl shadow-lg p-6 space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900">
              Ekran Yüklenirken Bir Sorun Oluştu
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Geçici bir oturum veya önbellek hatası nedeniyle görünüm durduruldu. Verileriniz sunucuda korunmaktadır.
            </p>
            {this.state.errorMessage && (
              <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-500 break-words">
                {this.state.errorMessage}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Sayfayı Yenile</span>
            </button>
            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Önbelleği Temizle & Yenile</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}

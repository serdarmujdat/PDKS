import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Check,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  X,
  Sliders,
  Volume2,
  VolumeX,
  ShieldAlert,
  Trash2,
  Filter,
  Search,
  CheckCheck,
  Send,
  Calendar,
  Sparkles,
  Info,
  CalendarCheck,
  Smartphone
} from 'lucide-react';
import { PDKSNotification, NotificationSettings, CurrentUser } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { playSuccessChime, playErrorBuzzer } from '../utils/audio';

export interface NotificationCenterProps {
  onNotificationClick?: (notif: PDKSNotification) => void;
  filterEmployeeId?: string; // If provided, shows alerts for this employee or general broadcasts
  mode?: 'dropdown' | 'modal' | 'embedded';
  isOpen?: boolean; // Controlled modal open
  onClose?: () => void;
  title?: string;
  currentUser?: CurrentUser;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onNotificationClick,
  filterEmployeeId,
  mode = 'dropdown',
  isOpen: controlledIsOpen,
  onClose,
  title,
  currentUser,
}) => {
  const effectiveUser = currentUser || pdksStorage.getActiveUser();
  const canSeeAllAlerts = pdksStorage.isHRorSuperAdmin(effectiveUser) || pdksStorage.canAccessPage(effectiveUser, 'dashboard');
  const canApproveDevice = pdksStorage.canApproveRequests(effectiveUser);
  const effectiveFilterId = filterEmployeeId || (!canSeeAllAlerts ? effectiveUser.employeeId : undefined);

  const [notifications, setNotifications] = useState<PDKSNotification[]>([]);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(pdksStorage.getNotificationSettings());

  // Category & search filters
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'shifts' | 'alerts' | 'leaves' | 'system'>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Active floating toast for real-time notification
  const [activeToast, setActiveToast] = useState<PDKSNotification | null>(null);

  const isModalOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsModalOpen = (val: boolean) => {
    if (onClose && !val) onClose();
    setInternalIsOpen(val);
  };

  const loadNotifications = () => {
    setNotifications(pdksStorage.getNotifications());
  };

  useEffect(() => {
    loadNotifications();

    // Listen for custom realtime notifications & SSE data sync
    const handleLiveEvent = (e: Event) => {
      const customEvent = e as CustomEvent<PDKSNotification>;
      if (customEvent.detail) {
        const notif = customEvent.detail;
        loadNotifications();

        const roleAllowed = !notif.targetRole || notif.targetRole === effectiveUser?.role || pdksStorage.isHRorSuperAdmin(effectiveUser) || canApproveDevice;
        // Only show toast if relevant to this view and allowed for this role
        if (roleAllowed && (!effectiveFilterId || notif.employeeId === effectiveFilterId || notif.employeeId === 'all')) {
          setActiveToast(notif);

          // Sound effect
          if (settings.soundEnabled) {
            if (notif.severity === 'critical' || notif.severity === 'warning') {
              playErrorBuzzer();
            } else {
              playSuccessChime();
            }
          }

          // Auto hide toast after 5 seconds
          setTimeout(() => {
            setActiveToast(null);
          }, 5000);
        }
      }
    };

    const handleSync = () => {
      loadNotifications();
    };

    window.addEventListener('pdks-notification', handleLiveEvent);
    window.addEventListener('pdks-data-synced', handleSync);
    return () => {
      window.removeEventListener('pdks-notification', handleLiveEvent);
      window.removeEventListener('pdks-data-synced', handleSync);
    };
  }, [settings.soundEnabled, effectiveFilterId, effectiveUser?.role, canApproveDevice]);

  // Filtered notifications
  const relevantNotifications = useMemo(() => {
    let list = notifications.filter(
      (n) => !n.targetRole || n.targetRole === effectiveUser?.role || pdksStorage.isHRorSuperAdmin(effectiveUser) || canApproveDevice
    );
    if (effectiveFilterId) {
      list = list.filter(
        (n) => n.employeeId === effectiveFilterId || n.employeeId === 'all'
      );
    }
    return list;
  }, [notifications, effectiveFilterId, effectiveUser?.role, canApproveDevice]);

  const filteredNotifications = useMemo(() => {
    return relevantNotifications.filter((n) => {
      if (onlyUnread && n.read) return false;

      if (selectedCategory === 'shifts') {
        const isShift = n.type === 'shift_reminder' || n.type === 'check_in' || n.type === 'check_out';
        if (!isShift) return false;
      } else if (selectedCategory === 'alerts') {
        const isAlert =
          n.type === 'critical_late' ||
          n.type === 'early_leave' ||
          n.type === 'absence_alert' ||
          n.type === 'overtime_alert' ||
          n.type === 'device_alert';
        if (!isAlert) return false;
      } else if (selectedCategory === 'leaves') {
        const isLeave = n.type === 'leave_status' || n.title.toLowerCase().includes('izin');
        if (!isLeave) return false;
      } else if (selectedCategory === 'system') {
        const isSystem = n.type === 'system_alert' || n.type === 'excel_import' || n.employeeId === 'all';
        if (!isSystem) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.employeeName.toLowerCase().includes(q) ||
          n.department.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [relevantNotifications, selectedCategory, onlyUnread, searchQuery]);

  const unreadCount = relevantNotifications.filter((n) => !n.read).length;

  const handleMarkAsRead = (id: string) => {
    pdksStorage.markNotificationAsRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = () => {
    pdksStorage.markAllNotificationsAsRead();
    loadNotifications();
  };

  const handleClearAll = () => {
    if (window.confirm('Tüm bildirim geçmişini silmek istediğinize emin misiniz?')) {
      pdksStorage.clearAllNotifications();
      loadNotifications();
    }
  };

  const handleDeleteSingle = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    pdksStorage.deleteNotification(id);
    loadNotifications();
  };

  const handleToggleSound = () => {
    const updated = { ...settings, soundEnabled: !settings.soundEnabled };
    setSettings(updated);
    pdksStorage.saveNotificationSettings(updated);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    pdksStorage.saveNotificationSettings(settings);
    setIsSettingsOpen(false);
  };

  const handleSendTestNotification = () => {
    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: 'Vardiya Başlangıç Hatırlatması',
      message: `${filterEmployeeId ? 'Vardiyanız' : 'Standart mesai'} 45 dakika sonra başlayacaktır. Lütfen işyeri giriş QR kodunu okutunuz.`,
      employeeId: filterEmployeeId || 'EMP-1001',
      employeeName: filterEmployeeId ? 'Personel' : 'Ahmet Yılmaz',
      department: 'Yazılım & Ar-Ge',
      severity: 'info',
    });
  };

  // Helper icon for notification item
  const renderIcon = (notif: PDKSNotification) => {
    if (notif.type === 'device_alert') {
      return (
        <div
          className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
            notif.severity === 'critical'
              ? 'bg-rose-100 text-rose-700 border-rose-200'
              : notif.severity === 'warning'
              ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-emerald-100 text-emerald-700 border-emerald-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
        </div>
      );
    }
    if (notif.severity === 'critical') {
      return (
        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
      );
    }
    if (notif.severity === 'warning') {
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4" />
        </div>
      );
    }
    if (notif.type === 'shift_reminder') {
      return (
        <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4" />
        </div>
      );
    }
    if (notif.type === 'check_in') {
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
          <ArrowDownRight className="w-4 h-4" />
        </div>
      );
    }
    if (notif.type === 'check_out') {
      return (
        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
          <ArrowUpRight className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4" />
      </div>
    );
  };

  // RENDER CONTENT (Shared by Dropdown, Modal, and Embedded modes)
  const renderNotificationBody = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Category Filter Chips & Search Bar */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Tümü ({relevantNotifications.length})
          </button>
          <button
            onClick={() => setSelectedCategory('shifts')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
              selectedCategory === 'shifts'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Vardiya & Giriş
          </button>
          <button
            onClick={() => setSelectedCategory('alerts')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
              selectedCategory === 'alerts'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Gecikme & İhlal
          </button>
          <button
            onClick={() => setSelectedCategory('leaves')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
              selectedCategory === 'leaves'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            İzinler
          </button>
          <button
            onClick={() => setSelectedCategory('system')}
            className={`px-2.5 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
              selectedCategory === 'system'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Sistem
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Bildirim ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-indigo-500 text-slate-800"
            />
          </div>
          <button
            onClick={() => setOnlyUnread(!onlyUnread)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 border transition-colors ${
              onlyUnread
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Yalnızca Okunmamış ({unreadCount})
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-[240px] max-h-[460px]">
        {filteredNotifications.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-400 text-xs space-y-2">
            <Bell className="w-8 h-8 mx-auto text-slate-300 stroke-1" />
            <p>Seçilen kriterlere uygun bildirim bulunamadı.</p>
            {unreadCount > 0 && onlyUnread && (
              <button
                onClick={() => setOnlyUnread(false)}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Tüm bildirimleri göster
              </button>
            )}
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isUnread = !notif.read;

            return (
              <div
                key={notif.id}
                onClick={() => {
                  handleMarkAsRead(notif.id);
                  if (onNotificationClick) onNotificationClick(notif);
                }}
                className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 group ${
                  isUnread ? 'bg-indigo-50/30' : ''
                }`}
              >
                {renderIcon(notif)}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">
                      {notif.title}
                    </h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                      )}
                      <button
                        onClick={(e) => handleDeleteSingle(e, notif.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-all"
                        title="Bildirimi Sil"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 leading-snug">
                    {notif.message}
                  </p>

                  {notif.metadata?.isCrossEmployeeDevice && (
                    <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] space-y-1 text-rose-950">
                      <div className="font-bold text-rose-800 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>Başka Personel Cihazı ile Giriş Uyarısı</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                        <div>
                          <span className="text-rose-700">İşlemi Yapan: </span>
                          <strong>{notif.metadata.actorEmployeeName || notif.employeeName}</strong>
                        </div>
                        <div>
                          <span className="text-rose-700">Cihaz Sahibi: </span>
                          <strong>{notif.metadata.ownerEmployeeName || '-'}</strong>
                        </div>
                        <div className="font-mono">
                          <span className="text-rose-700 font-sans">MAC / ID: </span>
                          <strong>{notif.metadata.macAddress || notif.metadata.deviceId || '-'}</strong>
                        </div>
                        <div className="font-mono">
                          <span className="text-rose-700 font-sans">Tarih & Saat: </span>
                          <strong>{notif.metadata.eventDateTime || new Date(notif.timestamp).toLocaleString('tr-TR')}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {canApproveDevice && notif.type === 'device_alert' && notif.metadata?.deviceApprovalId && (() => {
                    const matchedApproval = pdksStorage
                      .getDeviceEntryApprovals()
                      .find((d) => d.id === notif.metadata?.deviceApprovalId);
                    if (!matchedApproval) return null;
                    const isUnexpired = Date.now() < Date.parse(matchedApproval.expiresAt);
                    const isAwaiting =
                      isUnexpired &&
                      (matchedApproval.status === 'pending' ||
                        matchedApproval.status === 'check_in_requested');
                    if (isAwaiting) {
                      return (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 flex flex-wrap items-center gap-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              pdksStorage.approveDeviceEntryRequest(matchedApproval.id, {
                                bindNewDevice: false,
                                actorName: effectiveUser?.name,
                              });
                              handleMarkAsRead(notif.id);
                              loadNotifications();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Girişi Onayla</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              pdksStorage.approveDeviceEntryRequest(matchedApproval.id, {
                                bindNewDevice: true,
                                actorName: effectiveUser?.name,
                              });
                              handleMarkAsRead(notif.id);
                              loadNotifications();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold shadow-2xs cursor-pointer"
                          >
                            <Smartphone className="w-3 h-3" />
                            <span>Onayla + Cihazı Kaydet</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              pdksStorage.rejectDeviceEntryRequest(matchedApproval.id, undefined, effectiveUser?.name);
                              handleMarkAsRead(notif.id);
                              loadNotifications();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Reddet</span>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="mt-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            matchedApproval.status === 'approved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : matchedApproval.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {matchedApproval.status === 'approved'
                            ? `Onaylandı (${matchedApproval.resolvedBy || 'Yönetici'})`
                            : matchedApproval.status === 'rejected'
                            ? `Reddedildi (${matchedApproval.resolvedBy || 'Yönetici'})`
                            : '1 Saatlik Kilit Süresi Doldu'}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-medium">
                    {notif.employeeName && notif.employeeName !== 'Sistem' && (
                      <span className="text-slate-600 font-semibold">{notif.employeeName}</span>
                    )}
                    {notif.department && (
                      <>
                        <span>·</span>
                        <span>{notif.department}</span>
                      </>
                    )}
                    <span>·</span>
                    <span className="font-mono">
                      {new Date(notif.timestamp).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                      })}{' '}
                      {new Date(notif.timestamp).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Controls */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleSound}
            className={`p-1.5 rounded-lg border flex items-center gap-1 text-[11px] font-semibold transition-colors ${
              settings.soundEnabled
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
            title={settings.soundEnabled ? 'Bildirim sesini kapat' : 'Bildirim sesini aç'}
          >
            {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{settings.soundEnabled ? 'Ses Açık' : 'Sessiz'}</span>
          </button>

          <button
            onClick={handleSendTestNotification}
            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1"
          >
            Test Gönder
          </button>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] font-bold text-slate-700 hover:text-slate-900"
            >
              Tümünü Oku
            </button>
          )}
          {relevantNotifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800"
            >
              Temizle
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Real-time floating toast banner */}
      {activeToast && (
        <div className="fixed top-5 right-5 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-indigo-500/40 animate-bounce duration-500 flex items-start gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              activeToast.severity === 'critical'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : activeToast.severity === 'warning'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}
          >
            {activeToast.severity === 'critical' || activeToast.severity === 'warning' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white truncate">{activeToast.title}</h4>
              <span className="text-[10px] text-slate-400 font-mono">Şimdi</span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-snug">{activeToast.message}</p>
            {activeToast.metadata?.isCrossEmployeeDevice && (
              <div className="mt-1.5 p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-200 space-y-0.5 font-mono">
                <div>İşlem: {activeToast.metadata.actorEmployeeName || activeToast.employeeName}</div>
                <div>Cihaz Sahibi: {activeToast.metadata.ownerEmployeeName}</div>
                <div>MAC: {activeToast.metadata.macAddress || activeToast.metadata.deviceId}</div>
              </div>
            )}
            <div className="text-[10px] text-indigo-400 font-medium mt-1">
              {activeToast.employeeName || activeToast.department}
            </div>
          </div>

          <button
            onClick={() => setActiveToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MODE 1: DROPDOWN (Navbar usage) */}
      {mode === 'dropdown' && (
        <div className="relative">
          <button
            onClick={() => setInternalIsOpen(!internalIsOpen)}
            className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Bildirim Merkezi"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs font-mono">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {internalIsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setInternalIsOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-xs font-bold text-slate-900">
                      {title || 'Bildirim Merkezi'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                      title="Bildirim Ayarları"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setInternalIsOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {renderNotificationBody()}
              </div>
            </>
          )}
        </div>
      )}

      {/* MODE 2: MODAL (Mobile Portal or Dashboard modal usage) */}
      {mode === 'modal' && isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {title || 'Sistem Bildirim Merkezi'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {filterEmployeeId
                      ? 'Size özel mesai, vardiya ve onay bildirimleri'
                      : 'Şirket geneli PDKS anlık bildirim ve uyarıları'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                  title="Ayarlar"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {renderNotificationBody()}
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: EMBEDDED (Direct card in a dashboard page) */}
      {mode === 'embedded' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900">
                {title || 'Sistem İçi Bildirim Merkezi'}
              </h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  {unreadCount} Okunmamış
                </span>
              )}
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              title="Ayarlar"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
          {renderNotificationBody()}
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Bildirim ve Eşik Ayarları
                </h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-800">
                    Gecikmelerde Anlık Uyarı Gönder
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnLate}
                    onChange={(e) => setSettings({ ...settings, notifyOnLate: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Vardiya toleransını aşan gecikmelerde yönetici paneline ve personele mobil bildirim düşer.
                </p>
              </div>

              {settings.notifyOnLate && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kritik Gecikme Eşik Süresi (Dakika)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.lateThresholdMinutes}
                    onChange={(e) =>
                      setSettings({ ...settings, lateThresholdMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Bu sürenin üzerindeki gecikmeler kritik alarm olarak işaretlenir.
                  </p>
                </div>
              )}

              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-800">
                    Erken Çıkış Uyarısı
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnEarlyLeave}
                    onChange={(e) =>
                      setSettings({ ...settings, notifyOnEarlyLeave: e.target.checked })
                    }
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Vardiya bitmeden kart basan personelde uyarı verilir.
                </p>
              </div>

              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-800">
                    Fazla Mesai Eşik Uyarısı
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.notifyOnOvertime}
                    onChange={(e) =>
                      setSettings({ ...settings, notifyOnOvertime: e.target.checked })
                    }
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mesai bitiminden 45+ dakika sonra hala içeride olan personeller.
                </p>
              </div>

              <div>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-800">
                    Sesli Bildirim (Web Audio Chime)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) =>
                      setSettings({ ...settings, soundEnabled: e.target.checked })
                    }
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm cursor-pointer"
                >
                  Ayarları Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

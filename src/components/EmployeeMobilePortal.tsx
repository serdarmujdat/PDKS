import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  Clock,
  Calendar,
  Shield,
  User,
  ArrowDownRight,
  ArrowUpRight,
  Coffee,
  RefreshCw,
  Send,
  Lock,
  Plus,
  AlertCircle,
  Camera,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  MapPin,
  Sparkles,
  Info,
  Check,
  X,
  Zap,
  Upload,
  Image as ImageIcon,
  Download,
  Eye,
  Compass,
  ShieldAlert,
  Bell,
  Timer,
  ExternalLink,
  Palette,
  Sun,
  Moon,
} from 'lucide-react';
import {
  Employee,
  AttendanceRecord,
  Shift,
  CurrentUser,
  LeaveRequest,
  OvertimeRequest,
  MobileScanMode,
  MobileScanResult,
  CompanyWallQRConfig,
  ThemeId,
  DeviceEntryApproval,
} from '../types/pdks';
import { pdksStorage, getTodayString } from '../services/storage';
import { generateQRDataURL } from '../utils/qr';
import { playSuccessChime, playErrorBuzzer } from '../utils/audio';
import { NotificationCenter } from './NotificationCenter';
import { APP_THEMES, getThemeById } from '../themes/themes';

interface EmployeeMobilePortalProps {
  currentUser?: CurrentUser;
}

export const EmployeeMobilePortal: React.FC<EmployeeMobilePortalProps> = ({ currentUser }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('EMP-1001');
  const [personalQrCodeUrl, setPersonalQrCodeUrl] = useState<string>('');
  const [recentRecords, setRecentRecords] = useState<AttendanceRecord[]>([]);

  // State Machine Mode: 'normal' (Vardiya Giriş/Çıkış) or 'break' (Molaya Ayrıl)
  const [scanMode, setScanMode] = useState<MobileScanMode>('normal');

  // Camera & Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermissionHelpOpen, setIsPermissionHelpOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef<boolean>(false);

  // Success Feedback Overlay & Animation
  const [scanSuccessResult, setScanSuccessResult] = useState<MobileScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDeviceLock, setActiveDeviceLock] = useState<DeviceEntryApproval | null>(null);
  const [deviceLockNotice, setDeviceLockNotice] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Leave Modal State
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveRequest['leaveType']>('Mazeret İzni');
  const [leaveDays, setLeaveDays] = useState(1);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFeedback, setLeaveFeedback] = useState<string | null>(null);

  // Overtime Modal State
  const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);
  const [overtimeDate, setOvertimeDate] = useState(getTodayString());
  const [overtimeStartTime, setOvertimeStartTime] = useState('18:00');
  const [overtimeEndTime, setOvertimeEndTime] = useState('21:00');
  const [overtimeHours, setOvertimeHours] = useState(3);
  const [overtimeReason, setOvertimeReason] = useState('');
  const [overtimeFeedback, setOvertimeFeedback] = useState<string | null>(null);

  // Profile & Photo Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [employeeUnreadCount, setEmployeeUnreadCount] = useState(0);
  const [newPhotoData, setNewPhotoData] = useState<string | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const [directPhotoInput, setDirectPhotoInput] = useState<string>('');

  // Current Company Wall QR configuration
  const [companyQR, setCompanyQR] = useState<CompanyWallQRConfig>(pdksStorage.getCompanyWallQR());
  const [activeUserTheme, setActiveUserTheme] = useState<ThemeId>(() =>
    pdksStorage.getUserTheme(currentUser || pdksStorage.getActiveUser())
  );

  // GPS & Live Workplace Location Verification State (Strictly confidential)
  // GPS & Live Workplace Location Verification State (Strictly confidential)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'denied'>('idle');
  const [gpsErrorText, setGpsErrorText] = useState<string | null>(null);

  const isRestrictedPersonnel = pdksStorage.isRestrictedPersonnel(currentUser);
  const isHRManager = pdksStorage.isHRorSuperAdmin(currentUser);

  const geofenceEnabled = Boolean(companyQR.enableGeofence);

  // Actively fetch GPS position from device ONLY when geofence is enabled
  const refreshLocation = useCallback(() => {
    const latestQR = pdksStorage.getCompanyWallQR();
    if (!latestQR.enableGeofence) {
      setGpsStatus('idle');
      setGpsErrorText(null);
      return;
    }
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error');
      setGpsErrorText('Tarayıcınız coğrafi konum (GPS) desteği sunmuyor.');
      return;
    }
    setGpsStatus('loading');
    setGpsErrorText(null);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!pos || !pos.coords) {
            setGpsStatus('error');
            setGpsErrorText('Konum bilgisi okunamadı.');
            return;
          }
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setUserLocation(coords);
          setGpsStatus('success');
        },
        (err) => {
          setGpsStatus(err && err.code === 1 ? 'denied' : 'error');
          setGpsErrorText(
            err && err.code === 1
              ? 'Konum izni verilmedi. Güvenlik gereğince işyeri alan doğrulaması için konum izni gereklidir.'
              : `Konum bilgisi alınamadı (${err?.message || 'Hata'}). Lütfen GPS bağlantınızı kontrol ediniz.`
          );
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 10000 }
      );
    } catch (e: any) {
      setGpsStatus('error');
      setGpsErrorText(`Konum servisi başlatılamadı: ${e?.message || 'Bilinmeyen hata'}`);
    }
  }, []);

  // Sync wall QR from server and listen for live configuration updates
  useEffect(() => {
    pdksStorage.fetchCompanyWallQRFromServer().then((cfg) => {
      if (cfg) setCompanyQR(cfg);
    });

    const handleWallQREvent = (e: any) => {
      if (e?.detail) setCompanyQR(e.detail);
      else setCompanyQR(pdksStorage.getCompanyWallQR());
    };
    const handleSyncEvent = () => {
      setCompanyQR(pdksStorage.getCompanyWallQR());
      setActiveUserTheme(pdksStorage.getUserTheme(currentUser || pdksStorage.getActiveUser()));
    };
    const handleThemeEvent = (e: any) => {
      if (e?.detail) {
        setActiveUserTheme(e.detail as ThemeId);
      } else {
        setActiveUserTheme(pdksStorage.getUserTheme(currentUser || pdksStorage.getActiveUser()));
      }
    };
    window.addEventListener('pdks-wall-qr-updated', handleWallQREvent);
    window.addEventListener('pdks-data-synced', handleSyncEvent);
    window.addEventListener('pdks-theme-updated', handleThemeEvent);

    return () => {
      window.removeEventListener('pdks-wall-qr-updated', handleWallQREvent);
      window.removeEventListener('pdks-data-synced', handleSyncEvent);
      window.removeEventListener('pdks-theme-updated', handleThemeEvent);
    };
  }, [currentUser]);

  // Observe device GPS location ONLY while GPS Doğrulaması (enableGeofence) is enabled
  useEffect(() => {
    if (!geofenceEnabled) {
      setGpsStatus('idle');
      setGpsErrorText(null);
      return;
    }

    refreshLocation();

    let watchId: number | null = null;
    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const coords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            setUserLocation(coords);
            setGpsStatus('success');
          },
          () => {
            // silent ignore on periodic watch
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
        );
      } catch {
        // ignore
      }
    }
    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [geofenceEnabled, refreshLocation]);

  const loadData = () => {
    const emps = pdksStorage.getEmployees();
    setEmployees(emps);
    setCompanyQR(pdksStorage.getCompanyWallQR());

    // If personnel is logged in, restrict exclusively to their own profile
    if (isRestrictedPersonnel && currentUser?.employeeId) {
      setSelectedEmpId(currentUser.employeeId);
    } else if (emps.length > 0 && !emps.find((e) => e.id === selectedEmpId)) {
      setSelectedEmpId(emps[0].id);
    }

    const allRecords = pdksStorage.getAttendanceRecords();
    const targetId =
      isRestrictedPersonnel && currentUser?.employeeId ? currentUser.employeeId : selectedEmpId;
    setRecentRecords(allRecords.filter((r) => r.employeeId === targetId));

    // Update unread notifications count for active employee
    const activeRole = currentUser?.role || pdksStorage.getActiveUser()?.role;
    const notifs = pdksStorage.getNotifications().filter(
      (n) =>
        (!n.targetRole || n.targetRole === activeRole) &&
        (n.employeeId === targetId || n.employeeId === 'all' || !n.employeeId) &&
        !n.read
    );
    setEmployeeUnreadCount(notifs.length);

    if (targetId) {
      setActiveDeviceLock(pdksStorage.getActiveNewDeviceLock(targetId));
    } else {
      setActiveDeviceLock(null);
    }
    setNowTick(Date.now());
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);
    const handleLiveEvent = () => {
      const targetId = isRestrictedPersonnel && currentUser?.employeeId ? currentUser.employeeId : selectedEmpId;
      const activeRole = currentUser?.role || pdksStorage.getActiveUser()?.role;
      const notifs = pdksStorage.getNotifications().filter(
        (n) =>
          (!n.targetRole || n.targetRole === activeRole) &&
          (n.employeeId === targetId || n.employeeId === 'all' || !n.employeeId) &&
          !n.read
      );
      setEmployeeUnreadCount(notifs.length);
    };
    const handleSync = () => {
      loadData();
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    window.addEventListener('pdks-data-synced', handleSync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pdks-notification', handleLiveEvent);
      window.removeEventListener('pdks-data-synced', handleSync);
    };
  }, [selectedEmpId, isRestrictedPersonnel, currentUser]);

  useEffect(() => {
    if (isRestrictedPersonnel && currentUser?.employeeId) {
      setSelectedEmpId(currentUser.employeeId);
    }
    setActiveUserTheme(pdksStorage.getUserTheme(currentUser || pdksStorage.getActiveUser()));
  }, [currentUser, isRestrictedPersonnel]);

  useEffect(() => {
    loadData();
  }, [selectedEmpId]);

  const currentEmp = employees.find((e) => e.id === selectedEmpId);
  const shifts = pdksStorage.getShifts();
  const currentShift = shifts.find((s) => s.id === currentEmp?.shiftId);

  // Generate Personal QR for badge viewing
  useEffect(() => {
    if (!currentEmp) return;
    generateQRDataURL(currentEmp.qrToken, { width: 260 }).then((url) => {
      setPersonalQrCodeUrl(url);
    });
  }, [currentEmp]);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraLoading(false);
    setIsScannerOpen(false);
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // Process the scanned QR code through the State Machine
  const handleProcessScannedCode = useCallback(
    (scannedText: string) => {
      if (scanLockRef.current) return;
      if (!currentEmp) return;

      // 3-second debounce lock to prevent duplicate read
      scanLockRef.current = true;

      // Execute scan with validated coords
      const executeScanWithCoords = (locationCoords?: { latitude: number; longitude: number; accuracy?: number }) => {
        const result = pdksStorage.processMobileScanWithState({
          employeeId: currentEmp.id,
          scanMode,
          scannedToken: scannedText,
          userLocation: locationCoords || userLocation || undefined,
        });

        if (result.success) {
          playSuccessChime();
          if ('vibrate' in navigator) {
            try {
              navigator.vibrate([100, 50, 100]);
            } catch {
              // ignore
            }
          }
          setScanSuccessResult(result);
          setErrorMessage(null);
          loadData();
          stopCamera();

          // Auto-hide success modal and release lock after 3.5s
          setTimeout(() => {
            setScanSuccessResult(null);
            scanLockRef.current = false;
          }, 3500);
        } else {
          playErrorBuzzer();
          setErrorMessage(result.message);
          loadData();
          if (result.awaitingManagerApproval) {
            stopCamera();
          }
          setTimeout(() => {
            setErrorMessage(null);
            scanLockRef.current = false;
          }, 5500);
        }
      };

      const latestQRConfig = pdksStorage.getCompanyWallQR();
      if (!latestQRConfig.enableGeofence) {
        executeScanWithCoords(undefined);
        return;
      }

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const freshCoords = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            };
            setUserLocation(freshCoords);
            executeScanWithCoords(freshCoords);
          },
          () => {
            executeScanWithCoords(userLocation || undefined);
          },
          { timeout: 6000, enableHighAccuracy: true, maximumAge: 10000 }
        );
      } else {
        executeScanWithCoords(userLocation || undefined);
      }
    },
    [currentEmp, scanMode, stopCamera, userLocation]
  );

  // Attach stream to video whenever element is in DOM or stream updates
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.srcObject = streamRef.current;
      node.setAttribute('playsinline', 'true');
      node.setAttribute('autoplay', 'true');
      node.muted = true;
      node.onloadedmetadata = () => {
        node.play().catch((err) => {
          console.warn('Video play error on loadedmetadata:', err);
        });
      };
      node.play().catch((err) => {
        console.warn('Video auto play error:', err);
      });
    }
  }, []);

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
      }
      video.setAttribute('playsinline', 'true');
      video.setAttribute('autoplay', 'true');
      video.muted = true;
      video.onloadedmetadata = () => {
        video.play().catch((err) => console.warn('Video play error on metadata:', err));
      };
      video.play().catch((err) => {
        console.warn('Video play error in effect:', err);
      });
    }
  }, [isCameraActive]);

  // Start mobile camera stream with robust multi-tier fallback
  const startCamera = async () => {
    setIsCameraLoading(true);
    setCameraError(null);
    setIsPermissionHelpOpen(false);

    // Stop existing active tracks cleanly before acquiring new stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setIsCameraLoading(false);
      setCameraError('Cihazınız veya tarayıcınız doğrudan video akışını desteklemiyor. Aşağıdaki "Fotoğraf Çek / Kameradan Tara" seçeneğini kullanarak duvardaki QR kodu anında okutabilirsiniz.');
      return;
    }

    try {
      let stream: MediaStream | null = null;
      let lastErr: unknown = null;

      // Tier 1: Try ideal facingMode with preferred dimensions
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err1) {
        lastErr = err1;
        // Tier 2: Basic ideal facingMode without width/height constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: cameraFacingMode },
            },
            audio: false,
          });
        } catch (err2) {
          lastErr = err2;
          // Tier 3: Most permissive generic video: true (universal fallback)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          } catch (err3) {
            lastErr = err3;
            throw lastErr;
          }
        }
      }

      if (stream) {
        streamRef.current = stream;
        setIsCameraActive(true);
        setIsCameraLoading(false);
        setCameraError(null);
        setIsPermissionHelpOpen(false);

        // Check flashlight/torch capability
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          try {
            const capabilities = (videoTrack.getCapabilities?.() as { torch?: boolean }) || {};
            setHasTorch(Boolean(capabilities.torch));
          } catch {
            setHasTorch(false);
          }
        }

        // Attach stream to video element safely across re-renders
        const attachStreamToVideo = (retries = 4) => {
          if (videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.setAttribute('playsinline', 'true');
            videoRef.current.setAttribute('autoplay', 'true');
            videoRef.current.muted = true;
            videoRef.current.play().catch((playErr) => {
              console.debug('Autoplay note (non-fatal):', playErr);
            });
          } else if (retries > 0) {
            setTimeout(() => attachStreamToVideo(retries - 1), 80);
          }
        };
        setTimeout(() => attachStreamToVideo(4), 50);
      }
    } catch (err: unknown) {
      console.warn('Kamera açma hatası:', err);
      setIsCameraActive(false);
      setIsCameraLoading(false);
      const errorObj = err as Error;
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (
        errorObj.name === 'NotAllowedError' ||
        errorObj.name === 'PermissionDeniedError' ||
        errorObj.name === 'SecurityError'
      ) {
        if (isIframe) {
          setCameraError(
            'Geliştirme önizleme çerçevesi (iframe) kamera erişimini kısıtlamış olabilir. Doğrudan taramak için aşağıdaki "Fotoğraf Çek / Kameradan Tara" butonunu kullanabilir veya sayfayı yeni sekmede açabilirsiniz.'
          );
        } else {
          setCameraError(
            'Kamera izni verilmedi veya engellendi. Adres çubuğundaki kilit (🔒) simgesinden izin verebilir veya "Fotoğraf Çek / Kameradan Tara" seçeneğini kullanabilirsiniz.'
          );
        }
        setIsPermissionHelpOpen(true);
      } else if (errorObj.name === 'NotFoundError' || errorObj.name === 'DevicesNotFoundError') {
        setCameraError('Kullanılabilir kamera donanımı bulunamadı. Lütfen "Fotoğraf Çek / Yükle" veya "Duvardaki Kodu Doğrula" seçeneğini kullanınız.');
      } else {
        setCameraError(`Kamera başlatılamadı: ${errorObj.message || 'Lütfen kamera izninizi kontrol ediniz.'}`);
        setIsPermissionHelpOpen(true);
      }
    }
  };

  // Open scanner with specified mode
  const handleOpenScanner = (mode: MobileScanMode) => {
    setScanMode(mode);
    setIsScannerOpen(true);
    setIsCameraLoading(true);
    setCameraError(null);
    startCamera();

    // Refresh location non-blockingly without colliding with camera permission prompt
    if (companyQR.enableGeofence && !userLocation && gpsStatus !== 'loading') {
      setTimeout(() => {
        refreshLocation();
      }, 600);
    }
  };

  // QR Image file upload scanner (alternative if camera stream is blocked in iframe)
  const handleQRImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const maxDim = 1280;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, width, height, {
            inversionAttempts: 'attemptBoth',
          });
          if (code && code.data) {
            handleProcessScannedCode(code.data);
          } else {
            setErrorMessage('Fotoğrafta geçerli bir PDKS QR kodu okunamadı. Lütfen duvardaki QR kodu net şekilde çekiniz.');
          }
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Toggle Hardware Torch (Fener)
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const newTorchState = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newTorchState }],
      });
      setIsTorchOn(newTorchState);
    } catch (err) {
      console.warn('Torch açılamadı:', err);
    }
  };

  // Switch between front/back camera
  const handleToggleFacingMode = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextMode);
    if (isScannerOpen) {
      setTimeout(() => {
        startCamera();
      }, 100);
    }
  };

  // Frame processing loop with dual BarcodeDetector & jsQR
  useEffect(() => {
    if (!isCameraActive || !isScannerOpen) return;

    let animationFrameId: number;
    let barcodeDetector: any = null;

    if ('BarcodeDetector' in window) {
      try {
        barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    let isScanning = false;

    const scanFrame = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && video.readyState >= 2 && video.videoWidth > 0 && !scanLockRef.current && !isScanning) {
        isScanning = true;

        // Try fast native BarcodeDetector first
        if (barcodeDetector) {
          try {
            const detected = await barcodeDetector.detect(video);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              handleProcessScannedCode(detected[0].rawValue);
              isScanning = false;
              return;
            }
          } catch {
            // fallback to jsQR
          }
        }

        // Canvas jsQR fallback
        if (canvas) {
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.min(video.videoHeight, 480);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              handleProcessScannedCode(code.data);
              isScanning = false;
              return;
            }
          }
        }
        isScanning = false;
      }

      animationFrameId = requestAnimationFrame(scanFrame);
    };

    animationFrameId = requestAnimationFrame(scanFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isCameraActive, isScannerOpen, handleProcessScannedCode]);

  // Clean up camera on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Quick Action: Open camera with break or normal mode (Strict camera QR scan requirement)
  const handleQuickBreak = () => {
    if (currentEmp?.currentPresence === 'break') {
      handleOpenScanner('normal');
    } else {
      handleOpenScanner('break');
    }
  };

  // Submit Leave Request
  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmp) return;

    const today = new Date().toISOString().split('T')[0];
    const newLeave: LeaveRequest = {
      id: `LEAVE-${Date.now().toString().slice(-5)}`,
      employeeId: currentEmp.id,
      employeeName: currentEmp.fullName,
      department: currentEmp.department,
      leaveType,
      startDate: today,
      endDate: today,
      days: Number(leaveDays),
      reason: leaveReason || 'Personel Mobil Portalı üzerinden iletildi.',
      status: 'pending',
      appliedAt: new Date().toISOString(),
    };

    pdksStorage.saveLeaveRequest(newLeave);

    pdksStorage.addNotification({
      type: 'absence_alert',
      title: 'Yeni İzin Talebi',
      message: `${currentEmp.fullName} (${currentEmp.department}) ${leaveDays} günlük ${leaveType} talebinde bulundu.`,
      employeeId: currentEmp.id,
      employeeName: currentEmp.fullName,
      department: currentEmp.department,
      severity: 'info',
    });

    setLeaveFeedback('İzin talebiniz başarıyla iletildi.');
    setTimeout(() => {
      setLeaveFeedback(null);
      setIsLeaveModalOpen(false);
      setLeaveReason('');
    }, 2000);
  };

  // Submit Overtime Request
  const handleSubmitOvertime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmp) return;

    const newReq: OvertimeRequest = {
      id: `OT-${Date.now().toString().slice(-5)}`,
      employeeId: currentEmp.id,
      employeeName: currentEmp.fullName,
      department: currentEmp.department,
      date: overtimeDate,
      startTime: overtimeStartTime,
      endTime: overtimeEndTime,
      hours: Number(overtimeHours) || 1,
      reason: overtimeReason.trim() || 'Personel portalı üzerinden fazla mesai talebi',
      status: 'pending',
      appliedAt: new Date().toISOString(),
    };

    pdksStorage.saveOvertimeRequest(newReq);
    setOvertimeFeedback('Fazla mesai talebiniz başarıyla oluşturuldu ve İK onayına iletildi.');
    setTimeout(() => {
      setOvertimeFeedback(null);
      setIsOvertimeModalOpen(false);
      setOvertimeReason('');
    }, 2200);
  };

  // Photo Upload Handler (FileReader DataURL)
  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewPhotoData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Photo for Approval
  const handleSubmitPhotoForApproval = () => {
    if (!currentEmp || !newPhotoData) return;
    pdksStorage.requestProfilePhoto(currentEmp.id, newPhotoData);
    setPhotoFeedback('Yeni profil fotoğrafınız yüklendi. İK yöneticisinin onayından sonra aktif duruma geçecektir.');
    loadData();
    setTimeout(() => {
      setPhotoFeedback(null);
      setNewPhotoData(null);
    }, 4000);
  };

  // Cancel Pending Photo Request
  const handleCancelPendingPhoto = () => {
    if (!currentEmp) return;
    pdksStorage.rejectProfilePhoto(currentEmp.id, 'Personel tarafından talep geri çekildi');
    setPhotoFeedback('Bekleyen fotoğraf talebi iptal edildi.');
    loadData();
    setTimeout(() => setPhotoFeedback(null), 3000);
  };

  // HR Direct Approval from portal
  const handleHRApprovePhoto = () => {
    if (!currentEmp) return;
    pdksStorage.approveProfilePhoto(currentEmp.id);
    setPhotoFeedback('Profil fotoğrafı İK Yöneticisi olarak onaylandı ve aktifleştirildi.');
    loadData();
    setTimeout(() => setPhotoFeedback(null), 3000);
  };

  // HR Direct Reject from portal
  const handleHRRejectPhoto = () => {
    if (!currentEmp) return;
    pdksStorage.rejectProfilePhoto(currentEmp.id);
    setPhotoFeedback('Profil fotoğrafı talebi reddedildi.');
    loadData();
    setTimeout(() => setPhotoFeedback(null), 3000);
  };

  // HR Direct Change without approval
  const handleHRDirectSavePhoto = (photoUrl: string) => {
    if (!currentEmp || !photoUrl) return;
    pdksStorage.updateEmployeeAvatarDirect(currentEmp.id, photoUrl);
    setPhotoFeedback('Fotoğraf doğrudan güncellendi ve sisteme uygulandı.');
    loadData();
    setNewPhotoData(null);
    setDirectPhotoInput('');
    setTimeout(() => setPhotoFeedback(null), 3000);
  };

  if (!currentEmp) return null;

  const isInside = currentEmp.currentPresence === 'inside';
  const isBreak = currentEmp.currentPresence === 'break';
  const isOutside = currentEmp.currentPresence === 'outside';

  const verification = geofenceEnabled && userLocation ? pdksStorage.verifyWorkplaceLocation(userLocation) : null;
  const isWithinGeofence = !geofenceEnabled || (verification ? verification.isWithinWorkplace : false);
  const isOutsideGeofence = geofenceEnabled && verification ? !verification.isWithinWorkplace : false;

  // Calculate today's summary metrics (local date)
  const todayStr = getTodayString();
  const todayRecords = recentRecords.filter((r) => r.date === todayStr);
  const firstCheckIn = todayRecords.find((r) => r.type === 'check_in');
  const lastRecord = todayRecords[0];

  return (
    <div className="w-full max-w-md sm:max-w-xl mx-auto min-w-0 px-3 sm:px-4 py-3 sm:py-5 space-y-3.5">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* COMPACT MOBILE HEADER: Avatar + Name + Presence Status */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <div className="flex items-center justify-between gap-3">
          {/* Left: Avatar with tap cue & Name */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="relative group shrink-0 rounded-2xl focus:outline-hidden"
              title="Profil ve Fotoğrafını Yönet"
            >
              <img
                src={currentEmp.avatar}
                alt={currentEmp.fullName}
                className={`w-13 h-13 rounded-2xl object-cover border-2 shadow-xs transition-transform active:scale-95 ${
                  isInside
                    ? 'border-emerald-500'
                    : isBreak
                    ? 'border-amber-500'
                    : 'border-rose-500'
                }`}
                referrerPolicy="no-referrer"
              />
              {/* Presence indicator dot */}
              <span
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                  isInside ? 'bg-emerald-500' : isBreak ? 'bg-amber-500' : 'bg-rose-500'
                }`}
              />
              {/* Camera icon cue */}
              <span className="absolute -top-1 -left-1 w-4.5 h-4.5 rounded-full bg-slate-900/80 text-white flex items-center justify-center text-[9px] shadow-xs">
                <Camera className="w-2.5 h-2.5" />
              </span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="font-bold text-slate-900 text-base leading-tight truncate">
                  {currentEmp.fullName}
                </h2>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {currentEmp.title} · <span className="font-mono text-indigo-600 font-semibold">{currentEmp.id}</span>
              </p>
            </div>
          </div>

          {/* Right: Notification Center Bell + Presence Status Pill */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => setIsNotificationCenterOpen(true)}
              className="relative p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer shadow-xs active:scale-95"
              title="Personel Bildirim Merkezi"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {employeeUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center font-mono shadow-xs animate-pulse">
                  {employeeUnreadCount > 9 ? '9+' : employeeUnreadCount}
                </span>
              )}
            </button>

            <div className="text-right">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs border shadow-xs ${
                  isInside
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : isBreak
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-rose-50 text-rose-700 border-rose-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isInside ? 'bg-emerald-500' : isBreak ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
                <span>
                  {isInside ? 'Çalışıyor' : isBreak ? 'Molada' : 'Dışarıda'}
                </span>
              </span>
              {currentEmp.lastActionTime && (
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  Saat: {currentEmp.lastActionTime}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pending photo notification alert strip if pending */}
        {currentEmp.avatarStatus === 'pending' && currentEmp.pendingAvatar && (
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between bg-amber-50/70 -mx-4 -mb-4 px-4 py-2 rounded-b-2xl border-amber-200 cursor-pointer hover:bg-amber-100/70 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs text-amber-900 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>📸 Yeni profil fotoğrafınız <strong>İK onayı bekliyor</strong></span>
            </div>
            <span className="text-[11px] font-bold text-indigo-700">İncele →</span>
          </div>
        )}
      </div>

      {/* Admin Preview Switcher (Only when non-restricted) */}
      {!isRestrictedPersonnel && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-600">Personel Seç (Önizleme):</span>
          <select
            value={selectedEmpId}
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="px-2 py-0.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName} ({emp.department})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Scan Feedback Banner / Toast */}
      {scanSuccessResult && (
        <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-fade-in border-2 border-emerald-400">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm">{scanSuccessResult.message}</h4>
              <p className="text-[11px] text-emerald-100">
                Saat: {scanSuccessResult.serverTime} · İşlem: {scanSuccessResult.action}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-md">PDKS Onaylandı</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-600 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between animate-fade-in border-2 border-rose-400">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-white shrink-0" />
            <div>
              <h4 className="font-bold text-xs">{errorMessage}</h4>
            </div>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-white text-xs font-bold p-1">
            ✕
          </button>
        </div>
      )}

      {/* REGISTERED DEVICE & 1-HOUR NEW DEVICE MANAGER APPROVAL GATE */}
      {(() => {
        const localDevice = pdksStorage.getDeviceIdentity();
        const linkedAccount = pdksStorage.getUserAccountByEmployeeId(currentEmp.id);
        const lockActive =
          activeDeviceLock &&
          isOutside &&
          nowTick < Date.parse(activeDeviceLock.expiresAt) &&
          !pdksStorage.isHRorSuperAdmin(currentUser);
        const remainingMins = lockActive
          ? Math.max(1, Math.ceil((Date.parse(activeDeviceLock.expiresAt) - nowTick) / 60000))
          : 0;

        if (lockActive && activeDeviceLock) {
          const isRequested = activeDeviceLock.status === 'check_in_requested';
          const isRejected = activeDeviceLock.status === 'rejected';
          return (
            <div
              className={`rounded-2xl p-4 border-2 shadow-xs space-y-3 animate-fade-in ${
                isRejected
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${
                      isRejected ? 'bg-rose-600' : 'bg-amber-600'
                    }`}
                  >
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold leading-tight">
                      {isRejected
                        ? 'Yeni Cihaz Giriş Talebi Reddedildi'
                        : 'Yeni Cihazdan İlk İş Yeri Girişi Yönetici Onayında'}
                    </h3>
                    <p className="text-[11px] opacity-85 mt-0.5">
                      Farklı bir cihazdan giriş yaptığınız için <strong>1 saat</strong> boyunca ilk iş yeri girişinizi yalnızca yönetici onaylayabilir.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/80 border border-amber-300 text-amber-900">
                  {remainingMins} dk
                </span>
              </div>

              <div className="bg-white/80 rounded-xl p-2.5 border border-amber-200/80 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Kayıtlı Cihaz:</span>
                  <span className="font-mono font-semibold text-slate-800 text-right">
                    {activeDeviceLock.registeredDeviceName}
                    {activeDeviceLock.registeredMacAddress ? ` (${activeDeviceLock.registeredMacAddress})` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Aktif Cihaz:</span>
                  <span className="font-mono font-bold text-rose-700 text-right">
                    {activeDeviceLock.newDeviceName}
                    {activeDeviceLock.newMacAddress ? ` (${activeDeviceLock.newMacAddress})` : ''}
                  </span>
                </div>
              </div>

              {deviceLockNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-semibold">
                  {deviceLockNotice}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold">
                  {isRejected
                    ? 'Durum: Yönetici reddetti (yalnızca yönetici onaylarsa giriş açılır)'
                    : isRequested
                    ? 'Durum: Yönetici onayı bekleniyor...'
                    : 'Durum: İlk iş yeri girişi için yönetici onayı gerekli'}
                </span>
                {!isRejected && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = pdksStorage.requestNewDeviceCheckInApproval(currentEmp.id);
                      setDeviceLockNotice(res.message);
                      loadData();
                      setTimeout(() => setDeviceLockNotice(null), 5000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isRequested ? 'Yöneticiye Tekrar Hatırlat' : 'Yöneticiye Onay Talebi Gönder'}</span>
                  </button>
                )}
              </div>
            </div>
          );
        }

        const regMac = linkedAccount?.registeredMacAddress || currentEmp.registeredMacAddress || localDevice.macAddress;
        const regDevId = linkedAccount?.registeredDeviceId || currentEmp.registeredDeviceId || localDevice.deviceId;
        const regDevName = linkedAccount?.registeredDeviceName || currentEmp.registeredDeviceName || localDevice.deviceName;

        return (
          <div className="bg-white rounded-2xl px-3.5 py-2.5 border border-slate-200 shadow-2xs flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <Smartphone className="w-4 h-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <div className="truncate">
                  <span className="text-slate-500">Kayıtlı Cihaz: </span>
                  <span className="font-mono font-semibold text-slate-800">{regDevName}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  MAC: {regMac} · ID: {regDevId}
                </div>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
              <Check className="w-3 h-3" />
              <span>Doğrulanmış</span>
            </span>
          </div>
        );
      })()}

      {/* CANLI KONUM & İŞYERİ GEOFENCE DOĞRULAMA KARTI (GPS Doğrulaması ayarına göre dinamik) */}
      <div
        className={`rounded-2xl p-4 border transition-all shadow-xs space-y-3 ${
          !geofenceEnabled
            ? 'bg-slate-50 border-slate-200'
            : isOutsideGeofence
            ? 'bg-rose-50/70 border-rose-300'
            : isWithinGeofence
            ? 'bg-emerald-50/70 border-emerald-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                !geofenceEnabled
                  ? 'bg-slate-600 text-white'
                  : isOutsideGeofence
                  ? 'bg-rose-600 text-white shadow-xs'
                  : isWithinGeofence
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              {!geofenceEnabled ? (
                <Compass className="w-4 h-4" />
              ) : isOutsideGeofence ? (
                <ShieldAlert className="w-4 h-4" />
              ) : isWithinGeofence ? (
                <Shield className="w-4 h-4" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-slate-900 leading-tight">
                İşyeri Konum Doğrulaması (GPS)
              </h3>
              <p className="text-[11px] text-slate-500">
                {companyQR.companyName} · {companyQR.branchName}
              </p>
            </div>
          </div>

          {/* GPS Status Badge */}
          <div className="shrink-0">
            {!geofenceEnabled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>GPS Doğrulaması Kapalı</span>
              </span>
            ) : gpsStatus === 'loading' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                <span>Konum Alınıyor...</span>
              </span>
            ) : gpsStatus === 'denied' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                <X className="w-3 h-3 text-rose-600" />
                <span>Konum İzni Yok</span>
              </span>
            ) : gpsStatus === 'error' ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span>GPS Hatası</span>
              </span>
            ) : isWithinGeofence ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>İşyeri Alanında</span>
              </span>
            ) : isOutsideGeofence ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span>İşyeri Dışında</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                <span>Konum Bekleniyor</span>
              </span>
            )}
          </div>
        </div>

        {/* Live Device Location Status */}
        {geofenceEnabled ? (
          <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <span className="font-bold text-slate-800 block text-xs">İşyeri Güvenli Bölge Koruması</span>
                <span className="text-[11px] text-slate-500 block">
                  {gpsStatus === 'loading'
                    ? 'Konum servisi doğrulanıyor...'
                    : gpsStatus === 'denied'
                    ? 'Konum izni verilmedi (İzin gereklidir)'
                    : userLocation
                    ? 'GPS servisi bağlı ve aktif'
                    : 'Konum bekleniyor'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={refreshLocation}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gpsStatus === 'loading' ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        ) : (
          <div className="bg-white/90 p-3 rounded-xl border border-slate-200/80 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] text-slate-600 leading-relaxed">
              İK ayarlarında <strong>GPS Doğrulaması kapalı</strong> olduğu için konum izni gerekmez. Doğrudan kamerayla duvar QR kodunu okutabilirsiniz.
            </span>
          </div>
        )}

        {/* Verdict Banner (Only when Geofence is enabled) */}
        {geofenceEnabled && (
          isOutsideGeofence ? (
            <div className="p-3 bg-rose-600 text-white rounded-xl text-xs font-bold flex items-start gap-2 shadow-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="leading-tight">İŞYERİ SINIRLARI DIŞINDASINIZ</div>
                <p className="text-[11px] font-normal text-rose-100 mt-0.5">
                  İşyeri sınırları dışındayken taranan QR kodlar KESİNLİKLE reddedilir. Giriş ve çıkış yapabilmek için işyeri alanında olmanız gerekmektedir.
                </p>
              </div>
            </div>
          ) : isWithinGeofence ? (
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>İŞYERİ GÜVENLİ BÖLGESİ DOĞRULANDI: QR Okutabilirsiniz</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">Giriş Serbest</span>
            </div>
          ) : gpsStatus === 'denied' ? (
            <div className="p-2.5 bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Tarayıcı konum izni verilmedi. Güvenlik gereğince işyeri konumu doğrulanmadan QR okutulamaz.
              </span>
            </div>
          ) : null
        )}
      </div>

      {/* HERO PRIMARY ACTION CARD (GİRİŞ YAP / ÇIKIŞ YAP DİNAMİK GEÇİŞİ, MİNİMAL VE KOLAY ARAYÜZ) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
        {/* Geofence Status Cue above Main Button */}
        {geofenceEnabled && isOutsideGeofence && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>İşyeri sınırları dışındasınız. QR ile giriş ve çıkış KESİNLİKLE engellenmiştir.</span>
          </div>
        )}

        {geofenceEnabled && isWithinGeofence && (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>İşyeri sınırları içerisindesiniz. QR okutarak işlem yapabilirsiniz.</span>
          </div>
        )}

        {/* Dynamic Big State Button: Dışarıda iken GİRİŞ YAP, İçeride iken ÇIKIŞ YAP! */}
        {isOutside ? (
          <button
            onClick={() => handleOpenScanner('normal')}
            className={`w-full py-4 px-4 rounded-2xl text-white font-bold shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer ${
              isOutsideGeofence
                ? 'bg-rose-700 hover:bg-rose-600 active:scale-[0.98]'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98]'
            }`}
          >
            <ArrowDownRight className="w-7 h-7 shrink-0" />
            <div className="text-left sm:text-center">
              <div className="text-base sm:text-lg font-extrabold tracking-wide leading-tight">
                {isOutsideGeofence ? 'GİRİŞ YAP (ENGELLENDİ: İŞYERİ DIŞINDA)' : 'GİRİŞ YAP'}
              </div>
              <div className="text-[11px] font-normal text-emerald-100">
                {isOutsideGeofence
                  ? 'İşyeri sınırları dışındasınız · Sınır dışında QR okutulamaz'
                  : 'Vardiya Başlangıcı · Duvardaki QR Kodu Oku'}
              </div>
            </div>
          </button>
        ) : isBreak ? (
          <button
            onClick={() => handleOpenScanner('normal')}
            className={`w-full py-4 px-4 rounded-2xl text-white font-bold shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer ${
              isOutsideGeofence
                ? 'bg-rose-700 hover:bg-rose-600 active:scale-[0.98]'
                : 'bg-sky-600 hover:bg-sky-500 active:scale-[0.98]'
            }`}
          >
            <RefreshCw className="w-7 h-7 shrink-0" />
            <div className="text-left sm:text-center">
              <div className="text-base sm:text-lg font-extrabold tracking-wide leading-tight">
                {isOutsideGeofence ? 'MOLAYI BİTİR (ENGELLENDİ: İŞYERİ DIŞINDA)' : 'MOLAYI BİTİR (GİRİŞ YAP)'}
              </div>
              <div className="text-[11px] font-normal text-sky-100">
                {isOutsideGeofence
                  ? 'İşyeri sınırları dışındasınız'
                  : 'Mesaiye Devam Et · Duvardaki QR Kodu Oku'}
              </div>
            </div>
          </button>
        ) : (
          <div className="space-y-2.5">
            {/* Giriş yapınca doğrudan ÇIKIŞ YAP butonu görüntülenir */}
            <button
              onClick={() => handleOpenScanner('normal')}
              className={`w-full py-4 px-4 rounded-2xl text-white font-bold shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer ${
                isOutsideGeofence
                  ? 'bg-rose-800 hover:bg-rose-700 active:scale-[0.98]'
                  : 'bg-rose-600 hover:bg-rose-500 active:scale-[0.98]'
              }`}
            >
              <ArrowUpRight className="w-7 h-7 shrink-0" />
              <div className="text-left sm:text-center">
                <div className="text-base sm:text-lg font-extrabold tracking-wide leading-tight">
                  {isOutsideGeofence ? 'ÇIKIŞ YAP (ENGELLENDİ: İŞYERİ DIŞINDA)' : 'ÇIKIŞ YAP'}
                </div>
                <div className="text-[11px] font-normal text-rose-100">
                  {isOutsideGeofence
                    ? 'İşyeri sınırları dışındasınız'
                    : 'Mesai Bitişi · Duvardaki QR Kodu Oku'}
                </div>
              </div>
            </button>

            {/* Mola butonu */}
            <button
              onClick={() => handleOpenScanner('break')}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 active:scale-[0.98] font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Coffee className="w-4 h-4 text-amber-600" />
              <span>Çay / Yemek Molasına Ayrıl (Mola QR Oku)</span>
            </button>
          </div>
        )}

        {/* Security Notification */}
        <div className="flex items-center justify-center gap-2 py-2 px-3 text-[11px] font-semibold text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
          <Camera className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            {geofenceEnabled
              ? 'İşlemler duvardaki sabit şirket QR kodu kamerayla taranarak ve işyeri konumunda tamamlanır'
              : 'İşlemler duvardaki sabit şirket QR kodu kamerayla taranarak anında tamamlanır'}
          </span>
        </div>
      </div>

      {/* CAMERA SCANNER WINDOW (Anında Açılan Viewfinder, Çift Motorlu Barkod Okuyucu ve Yedek Seçenekler) */}
      {isScannerOpen && (
        <div className="bg-slate-950 rounded-2xl p-3.5 border-2 border-indigo-500 shadow-2xl space-y-3 animate-fade-in text-white">
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-2 font-bold">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>
                {scanMode === 'break'
                  ? '☕ Mola QR Taraması'
                  : isBreak
                  ? '🔄 Moladan Dönüş QR Taraması'
                  : isInside
                  ? '🚪 Mesai Çıkış QR Taraması'
                  : '🟢 Mesai Giriş QR Taraması'}
              </span>
            </div>
            <button
              onClick={stopCamera}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Live Geofence Status Banner in Camera Viewfinder */}
          {companyQR.enableGeofence && (
            <div>
              {isOutsideGeofence ? (
                <div className="bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between border border-amber-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-200" />
                    <span>Duvardaki Resmi PDKS QR Kodunu Okutunuz</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      refreshLocation();
                    }}
                    className="text-[10px] bg-black/30 hover:bg-black/50 px-2 py-0.5 rounded font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>GPS Yenile</span>
                  </button>
                </div>
              ) : isWithinGeofence ? (
                <div className="bg-emerald-600/90 text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center justify-between border border-emerald-400">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>İşyeri Alanı Doğrulandı · QR Okutabilirsiniz</span>
                  </div>
                  <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-mono">QR Serbest</span>
                </div>
              ) : (
                <div className="bg-amber-600/90 text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border border-amber-400">
                  <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  <span>GPS Konumu Doğrulanıyor...</span>
                </div>
              )}
            </div>
          )}

          {/* Viewport: Loading vs Error vs Live Stream */}
          {isCameraLoading ? (
            <div className="w-full aspect-4/3 bg-slate-900 rounded-xl flex flex-col items-center justify-center gap-3 border border-slate-800">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-300 font-medium">Kamera Başlatılıyor...</p>
            </div>
          ) : cameraError ? (
            <div className="p-4 bg-slate-900 rounded-xl border border-rose-800 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">Kamera Erişilemedi</h4>
                <p className="text-[11px] text-slate-300 max-w-xs mx-auto leading-relaxed">{cameraError}</p>
              </div>

              {/* Fail-safe interactive options */}
              <div className="flex flex-col gap-2 pt-1 max-w-xs mx-auto">
                {/* 1. Photo upload / native phone camera */}
                <label className="w-full px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2 transition-colors">
                  <Camera className="w-4 h-4" />
                  <span>Fotoğraf Çek / Kameradan Tara</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleQRImageUpload}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center gap-2">
                  {/* 2. Open in New Tab for Iframe permission bypass */}
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="flex-1 py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] rounded-xl cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                    title="Önizleme çerçevesi dışına çıkarak kamera iznini onaylayın"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Yeni Sekmede Aç</span>
                  </button>

                  {/* 3. Retry */}
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex-1 py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] rounded-xl cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Tekrar Dene</span>
                  </button>
                </div>

                {/* 4. Permission Help Trigger */}
                <button
                  type="button"
                  onClick={() => setIsPermissionHelpOpen(true)}
                  className="text-[11px] text-indigo-400 hover:underline pt-1 flex items-center justify-center gap-1"
                >
                  <Info className="w-3 h-3" />
                  <span>Kamera İzni Nasıl Açılır?</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full aspect-4/3 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={setVideoRef}
                className="w-full h-full object-cover"
                playsInline
                autoPlay
                muted
              />

              {/* Target square and scanning beam */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                <div className="w-44 h-44 sm:w-52 sm:h-52 border-2 border-white/80 rounded-2xl relative shadow-2xl">
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
                  <div className="absolute inset-x-2 top-0 h-0.5 bg-indigo-400 shadow-[0_0_12px_#818cf8] animate-bounce" />
                </div>
                <p className="text-white/90 text-[11px] font-medium mt-3 bg-slate-900/80 px-2.5 py-1 rounded-full backdrop-blur-xs">
                  Duvardaki sabit QR kodu karenin içine hizalayınız
                </p>
              </div>
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              {hasTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-colors cursor-pointer ${
                    isTorchOn
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                  <span>{isTorchOn ? 'Açık' : 'Fener'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleFacingMode}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                title="Kamera Değiştir"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                <span>Çevir</span>
              </button>

              <label className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer">
                <Camera className="w-3.5 h-3.5" />
                <span>Fotoğraf</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleQRImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Camera Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={stopCamera}
                className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GUIDED 5-GRID NAVIGATION BUTTONS (Çok Kolay, Resimli Arayüz) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {/* 1. Profil & Fotoğraf */}
        <button
          onClick={() => setIsProfileModalOpen(true)}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-transform active:scale-95 cursor-pointer relative"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <span className="font-bold text-xs text-slate-800">Profil & Fotoğraf</span>
          <span className="text-[10px] text-slate-400">Resim Yükle / Onay</span>
          {currentEmp.avatarStatus === 'pending' && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
          )}
        </button>

        {/* 2. Mola İşlemleri */}
        <button
          onClick={() => handleOpenScanner(isBreak ? 'normal' : 'break')}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Coffee className="w-5 h-5" />
          </div>
          <span className="font-bold text-xs text-slate-800">
            {isBreak ? 'Molayı Bitir' : 'Molaya Ayrıl'}
          </span>
          <span className="text-[10px] text-slate-400">
            QR Okut
          </span>
        </button>

        {/* 3. İzin Talebi */}
        <button
          onClick={() => setIsLeaveModalOpen(true)}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
          <span className="font-bold text-xs text-slate-800">İzin Talebi</span>
          <span className="text-[10px] text-slate-400">Mazeret / Yıllık</span>
        </button>

        {/* 4. Fazla Mesai Talebi (İK Onayına Gider) */}
        <button
          onClick={() => setIsOvertimeModalOpen(true)}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Timer className="w-5 h-5" />
          </div>
          <span className="font-bold text-xs text-slate-800">Fazla Mesai</span>
          <span className="text-[10px] text-slate-400">Onay Talebi Gönder</span>
        </button>

        {/* 5. Kimlik Kartım */}
        <button
          onClick={() => setIsBadgeModalOpen(true)}
          className="p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 shadow-xs flex flex-col items-center justify-center text-center gap-1.5 transition-transform active:scale-95 cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
          <span className="font-bold text-xs text-slate-800">Kimlik QR</span>
          <span className="text-[10px] text-slate-400">Turnike Kartı</span>
        </button>
      </div>

      {/* TODAY'S SUMMARY STRIP & VIEW LOGS */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-bold text-slate-800">
              Bugün: {firstCheckIn ? `Giriş ${firstCheckIn.timeStr}` : 'Henüz giriş yok'}
            </div>
            <div className="text-[11px] text-slate-500">
              {currentShift ? `${currentShift.name} (${currentShift.startTime}-${currentShift.endTime})` : 'Standart Mesai'}
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsHistoryModalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 text-xs transition-colors shrink-0 cursor-pointer"
        >
          Hareketler ({todayRecords.length})
        </button>
      </div>

      {/* MODAL 1: PROFİL & FOTOĞRAF YÖNETİMİ (Personel Yükler, İK Onaylar / Değiştirir) */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Profil & Fotoğraf Yönetimi</h3>
                  <p className="text-[11px] text-slate-500">{currentEmp.fullName} · {currentEmp.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setNewPhotoData(null);
                  setPhotoFeedback(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification alert */}
            {photoFeedback && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{photoFeedback}</span>
              </div>
            )}

            {/* Current Active Photo */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <img
                src={currentEmp.avatar}
                alt="Mevcut Aktif Fotoğraf"
                className="w-16 h-16 rounded-xl object-cover border-2 border-indigo-500 shadow-xs"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block">
                  Aktif Profil Fotoğrafı
                </span>
                <div className="text-xs font-bold text-slate-800">{currentEmp.fullName}</div>
                <div className="text-[11px] text-slate-500">Tüm PDKS kartlarında ve raporlarda görünen resmi fotoğrafınız.</div>
              </div>
            </div>

            {/* PERSONAL ACCOUNT THEME PICKER */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-600" />
                  <span>Kişisel Hesap Temam</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  {getThemeById(activeUserTheme).name}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Seçtiğiniz tema yalnızca sizin hesabınıza kaydedilir ve göz yormayan dengeli kontrast sunar.
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {APP_THEMES.map((theme) => {
                  const selected = activeUserTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        setActiveUserTheme(theme.id);
                        void pdksStorage.saveUserTheme(theme.id, currentUser || pdksStorage.getActiveUser());
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          data-theme-keep="true"
                          className="w-8 h-8 rounded-lg border shrink-0 flex flex-col justify-between p-1"
                          style={{
                            backgroundColor: theme.preview.bg,
                            borderColor: theme.preview.border,
                          }}
                        >
                          <span
                            className="w-full h-2 rounded-xs"
                            style={{ backgroundColor: theme.preview.surface }}
                          />
                          <span
                            className="w-3.5 h-1.5 rounded-xs"
                            style={{ backgroundColor: theme.preview.accent }}
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{theme.name}</span>
                            <span className="text-[10px] font-medium text-slate-500 flex items-center gap-0.5">
                              {theme.mode === 'dark' ? (
                                <Moon className="w-3 h-3" />
                              ) : (
                                <Sun className="w-3 h-3" />
                              )}
                              {theme.mode === 'dark' ? 'Koyu' : 'Açık'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">{theme.subtitle}</div>
                        </div>
                      </div>
                      {selected && (
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PENDING PHOTO STATUS (Eğer İK Onayı Bekleyen Fotoğraf Varsa) */}
            {currentEmp.avatarStatus === 'pending' && currentEmp.pendingAvatar && (
              <div className="p-3.5 bg-amber-50 rounded-xl border-2 border-amber-300 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>İK Onayı Bekleyen Yeni Fotoğraf</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full">
                    Onay Bekliyor
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <img
                    src={currentEmp.pendingAvatar}
                    alt="Onay Bekleyen Fotoğraf"
                    className="w-16 h-16 rounded-xl object-cover border-2 border-amber-400 shadow-md"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-xs text-amber-800">
                    Yüklediğiniz yeni fotoğraf İK Yöneticisi tarafından onaylanana kadar mevcut fotoğrafınız geçerli kalır.
                  </div>
                </div>

                {/* Cancel Request for Employee */}
                <div className="pt-1 flex items-center justify-between">
                  <button
                    onClick={handleCancelPendingPhoto}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                  >
                    Talebi İptal Et / Geri Çek
                  </button>

                  {/* If user is İK Yöneticisi reviewing: can directly approve or reject right here! */}
                  {isHRManager && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleHRRejectPhoto}
                        className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 rounded-lg border border-rose-200"
                      >
                        Reddet
                      </button>
                      <button
                        onClick={handleHRApprovePhoto}
                        className="px-3 py-1 text-xs font-bold bg-emerald-600 text-white rounded-lg shadow-xs"
                      >
                        Onayla
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* UPLOAD NEW PHOTO SECTION */}
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-bold text-slate-800">
                Yeni Profil Fotoğrafı Yükle:
              </label>

              {/* File Input for Mobile (Camera / Gallery Picker) */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoFileChange}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {/* Preview of newly chosen photo */}
              {newPhotoData && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
                  <img
                    src={newPhotoData}
                    alt="Seçilen Önizleme"
                    className="w-14 h-14 rounded-xl object-cover border-2 border-indigo-400"
                  />
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-800 block">Yeni Fotoğraf Seçildi</span>
                    <span className="text-[11px] text-slate-500 block">
                      {isHRManager
                        ? 'İK Yöneticisi olduğunuz için doğrudan kaydedebilirsiniz.'
                        : 'Gönderildiğinde İK Yöneticisi onayına iletilecektir.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Preset avatars selection */}
              <div>
                <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                  Veya Örnek Fotoğraflardan Seç:
                </span>
                <div className="flex items-center gap-2">
                  {[
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
                    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&h=256&q=80',
                    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
                    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
                    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
                  ].map((presetUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setNewPhotoData(presetUrl)}
                      className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-transform hover:scale-110 ${
                        newPhotoData === presetUrl ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200'
                      }`}
                    >
                      <img src={presetUrl} alt="Preset" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    setNewPhotoData(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Kapat
                </button>

                {newPhotoData && (
                  <>
                    {/* Personnel button: sends for HR approval */}
                    <button
                      type="button"
                      onClick={handleSubmitPhotoForApproval}
                      className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>İK Onayına Gönder</span>
                    </button>

                    {/* If İK Yöneticisi: can save directly without approval */}
                    {isHRManager && (
                      <button
                        type="button"
                        onClick={() => handleHRDirectSavePhoto(newPhotoData)}
                        className="px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm rounded-xl flex items-center gap-1 cursor-pointer"
                        title="İK yetkisi ile doğrudan kaydet"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Doğrudan Kaydet (İK)</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: KİŞİSEL DİJİTAL QR KARTIM (Kiosk & Turnike İçin) */}
      {isBadgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-indigo-600" />
                <span>PDKS Turnike Kimlik Kartım</span>
              </h3>
              <button onClick={() => setIsBadgeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl inline-block border border-slate-200 my-1">
              {personalQrCodeUrl ? (
                <img
                  src={personalQrCodeUrl}
                  alt="Personal QR"
                  className="w-44 h-44 object-contain mx-auto"
                />
              ) : (
                <div className="w-44 h-44 bg-slate-200 animate-pulse rounded-lg" />
              )}
            </div>

            <div className="text-xs space-y-1">
              <div className="font-bold text-slate-900">{currentEmp.fullName}</div>
              <div className="font-mono text-indigo-700 text-[11px]">Sicil: {currentEmp.id}</div>
              <div className="text-[10px] text-slate-400 font-mono break-all px-2">
                Token: {currentEmp.qrToken}
              </div>
            </div>

            <button
              onClick={() => setIsBadgeModalOpen(false)}
              className="w-full py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: BUGÜNKÜ HAREKETLER LİSTESİ */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Bugünkü PDKS Hareketlerim</h3>
                <p className="text-xs text-slate-500">
                  {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {todayRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Bugün için henüz herhangi bir PDKS hareketi bulunmuyor.
              </div>
            ) : (
              <div className="space-y-2">
                {todayRecords.map((rec) => {
                  const isCheckIn = rec.type === 'check_in';
                  const isCheckOut = rec.type === 'check_out';
                  const isBreakStart = rec.type === 'break_start';
                  const isBreakEnd = rec.type === 'break_end';
                  const isSecurityAlert = rec.type === 'security_alert';

                  return (
                    <div
                      key={rec.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        rec.isSuspiciousDevice || isSecurityAlert
                          ? 'bg-rose-50/70 border-rose-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono font-bold text-slate-900 text-sm shrink-0">
                          {rec.timeStr}
                        </span>
                        <div className="min-w-0">
                          {isCheckIn && (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                              <ArrowDownRight className="w-3.5 h-3.5" /> Vardiya Girişi
                            </span>
                          )}
                          {isCheckOut && (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                              <ArrowUpRight className="w-3.5 h-3.5" /> Vardiya Çıkışı
                            </span>
                          )}
                          {isBreakStart && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                              <Coffee className="w-3.5 h-3.5" /> Mola Başlangıcı
                            </span>
                          )}
                          {isBreakEnd && (
                            <span className="inline-flex items-center gap-1 font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                              <RefreshCw className="w-3.5 h-3.5" /> Moladan Dönüş
                            </span>
                          )}
                          {isSecurityAlert && (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                              <ShieldAlert className="w-3.5 h-3.5" /> Cihaz Güvenlik Kaydı
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-[11px] text-slate-500 font-medium shrink-0 ml-2">
                        {rec.terminal || 'Mobil QR'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setIsHistoryModalOpen(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: İZİN TALEBİ */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>İzin & Mazeret Talebi</span>
              </h3>
              <button
                onClick={() => setIsLeaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {leaveFeedback ? (
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-semibold text-center">
                {leaveFeedback}
              </div>
            ) : (
              <form onSubmit={handleSubmitLeave} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    İzin Türü
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveRequest['leaveType'])}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Mazeret İzni">Mazeret İzni</option>
                    <option value="Yıllık İzin">Yıllık İzin</option>
                    <option value="Hastalık / Rapor">Hastalık / Rapor</option>
                    <option value="Uzaktan Çalışma (Home Office)">
                      Uzaktan Çalışma (Home Office)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gün Sayısı</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={leaveDays}
                    onChange={(e) => setLeaveDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Açıklama / Sebep
                  </label>
                  <textarea
                    rows={2}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="İzin gerekçenizi kısaca açıklayınız..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                  >
                    Talebi İlet
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4B: FAZLA MESAİ TALEBİ */}
      {isOvertimeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-600" />
                <span>Fazla Mesai Talebi</span>
              </h3>
              <button
                onClick={() => setIsOvertimeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {overtimeFeedback ? (
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-semibold text-center">
                {overtimeFeedback}
              </div>
            ) : (
              <form onSubmit={handleSubmitOvertime} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tarih
                    </label>
                    <input
                      type="date"
                      value={overtimeDate}
                      onChange={(e) => setOvertimeDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mesai Süresi (Saat)
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max="12"
                      step="0.5"
                      value={overtimeHours}
                      onChange={(e) => setOvertimeHours(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Başlangıç Saati
                    </label>
                    <input
                      type="time"
                      value={overtimeStartTime}
                      onChange={(e) => setOvertimeStartTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bitiş Saati
                    </label>
                    <input
                      type="time"
                      value={overtimeEndTime}
                      onChange={(e) => setOvertimeEndTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gerekçe / Yapılan İş
                  </label>
                  <textarea
                    rows={2}
                    value={overtimeReason}
                    onChange={(e) => setOvertimeReason(e.target.value)}
                    placeholder="Mesai gerekçesini kısaca açıklayınız (örn. Ay sonu finansal kontroller)..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsOvertimeModalOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Talebi İlet
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 5: KAMERA İZNİ YARDIMI */}
      {isPermissionHelpOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3.5 shadow-2xl border border-slate-200 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Kamera İzni Rehberi</h4>
                  <p className="text-[10px] text-slate-500">PDKS QR Tarama Çözümleri</p>
                </div>
              </div>
              <button
                onClick={() => setIsPermissionHelpOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                title="Kapat"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick 1-Tap Alternative that NEVER needs WebRTC permission */}
            <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 space-y-2">
              <div className="font-bold text-xs flex items-center gap-1.5 text-indigo-700">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>İzin Almadan Doğrudan Tarayın:</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Kamera izni kısıtlıysa telefonun yerel kamerasını doğrudan açıp QR kodu hemen okutabilirsiniz:
              </p>
              <label className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors text-center">
                <Camera className="w-4 h-4" />
                <span>Fotoğraf Çek / Kameradan Tara</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    handleQRImageUpload(e);
                    setIsPermissionHelpOpen(false);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* Step-by-step instructions for Safari and Chrome */}
            <div className="space-y-2 pt-1 text-slate-600">
              <div className="font-semibold text-slate-800 text-[11px] uppercase tracking-wider">
                Tarayıcıda Kamera İznini Açma:
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <strong className="text-slate-900 block font-semibold">📱 iPhone / iPad (Safari):</strong>
                <p className="text-slate-600 leading-tight">
                  1. Adres çubuğunun solundaki <strong>"aA"</strong> veya <strong>"Ayarlar"</strong> simgesine dokunun.<br />
                  2. <strong>"Web Sitesi Ayarları"</strong> → <strong>Kamera</strong> seçeneğini <strong>"İzin Ver"</strong> yapın.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <strong className="text-slate-900 block font-semibold">🤖 Android (Chrome):</strong>
                <p className="text-slate-600 leading-tight">
                  1. Adres çubuğundaki <strong>Kilit (🔒)</strong> simgesine dokunun.<br />
                  2. <strong>"İzinler"</strong> veya <strong>"Site Ayarları"</strong> → <strong>Kamera</strong> iznini <strong>"İzin Ver"</strong> yapın.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => window.open(window.location.href, '_blank')}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Sayfayı Yeni Sekmede Aç (Harici Tarayıcı)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPermissionHelpOpen(false);
                  startCamera();
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Kamerayı Tekrar Dene</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: PERSONEL BİLDİRİM MERKEZİ */}
      {currentEmp && (
        <NotificationCenter
          mode="modal"
          isOpen={isNotificationCenterOpen}
          onClose={() => setIsNotificationCenterOpen(false)}
          filterEmployeeId={currentEmp.id}
          title={`${currentEmp.fullName} - Bildirim Merkezi`}
        />
      )}
    </div>
  );
};

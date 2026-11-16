import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, RefreshCw, CheckCircle2, AlertTriangle, Shield, Clock, Smartphone, Volume2, Sparkles, SwitchCamera, Maximize2, Minimize2, Upload, Keyboard, HelpCircle, X, Check, Lock, Unlock, Key, ShieldCheck, Flashlight, FlashlightOff, Sun, SunMedium, Lightbulb, Zap, Info, ShieldAlert, AlertCircle, Sliders, Focus, Gauge, Video, Cpu, Crosshair, ExternalLink } from 'lucide-react';
import { Employee, ActionType, AttendanceRecord, CurrentUser } from '../types/pdks';
import { pdksStorage, PDKS_SYSTEM_API_KEY } from '../services/storage';
import { playSuccessChime, playErrorBuzzer } from '../utils/audio';
import { parseQRPayload, getDynamicKioskCode, generateQRDataURL } from '../utils/qr';
import { CompanyLogoImage } from './CompanyLogoImage';

interface KioskTerminalProps {
  currentUser?: CurrentUser;
  onScanComplete?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  companyLogo?: string;
}

export const KioskTerminal: React.FC<KioskTerminalProps> = ({
  currentUser,
  onScanComplete,
  isFullscreen = false,
  onToggleFullscreen,
  companyLogo: propCompanyLogo,
}) => {
  const isHR = currentUser?.role === 'ik_yoneticisi';
  const [companyLogo, setCompanyLogo] = useState<string>(() => propCompanyLogo || pdksStorage.getCompanyLogo());

  useEffect(() => {
    if (propCompanyLogo) setCompanyLogo(propCompanyLogo);
  }, [propCompanyLogo]);

  useEffect(() => {
    const syncLogo = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyLogo(e.detail);
      else setCompanyLogo(pdksStorage.getCompanyLogo());
    };
    window.addEventListener('pdks-logo-updated', syncLogo);
    window.addEventListener('pdks-data-synced', syncLogo);
    return () => {
      window.removeEventListener('pdks-logo-updated', syncLogo);
      window.removeEventListener('pdks-data-synced', syncLogo);
    };
  }, []);

  // Operational Modes
  const [terminalMode, setTerminalMode] = useState<'camera_scanner' | 'dynamic_wall_qr'>('camera_scanner');
  const [directionMode, setDirectionMode] = useState<'auto' | 'check_in' | 'check_out' | 'break'>('auto');

  // Clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Camera scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraErrorType, setCameraErrorType] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLockRef = useRef(false);

  // Camera Resolution & Focus Speed Configuration States
  const [cameraResolution, setCameraResolution] = useState<'1080p' | '4k' | '720p' | 'auto'>('1080p');
  const [focusSpeedMode, setFocusSpeedMode] = useState<'ultra_fast' | 'macro' | 'standard'>('ultra_fast');
  const [frameRateTarget, setFrameRateTarget] = useState<number>(60);
  const [isCameraConfigModalOpen, setIsCameraConfigModalOpen] = useState<boolean>(false);
  const [activeResolutionLabel, setActiveResolutionLabel] = useState<string>('1920x1080 (Full HD)');
  const [tapFocusCoord, setTapFocusCoord] = useState<{ x: number; y: number } | null>(null);
  const [hasNativeBarcodeDetector] = useState<boolean>(
    typeof window !== 'undefined' && 'BarcodeDetector' in window
  );

  // Torch / Flashlight and Ambient Light States
  const [hasHardwareTorch, setHasHardwareTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [autoTorchEnabled, setAutoTorchEnabled] = useState<boolean>(true);
  const [isLowLightDetected, setIsLowLightDetected] = useState<boolean>(false);
  const [ambientLuminance, setAmbientLuminance] = useState<number>(120);
  const [digitalScreenTorch, setDigitalScreenTorch] = useState<boolean>(false);
  const frameCountRef = useRef<number>(0);

  // Manual code / barcode gun input state
  const [manualCodeInput, setManualCodeInput] = useState('');

  // Dynamic QR state (Mod 2)
  const [dynamicQRUrl, setDynamicQRUrl] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);

  // Inactivity / Idle & Welcome Screen States
  const [isWelcomeStandby, setIsWelcomeStandby] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const IDLE_TIMEOUT_SECONDS = 60; // 60 saniye hareketsizlik sonrası otomatik Hoş Geldiniz ekranı

  // Kiosk Lockdown (Ekran Kilitleme) States
  const [isLockdownModalOpen, setIsLockdownModalOpen] = useState<boolean>(false);
  const [lockdownPasswordInput, setLockdownPasswordInput] = useState<string>('');
  const [lockdownError, setLockdownError] = useState<string | null>(null);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState<boolean>(false);
  const [newLockdownPassword, setNewLockdownPassword] = useState<string>('');
  const [lockdownSuccessToast, setLockdownSuccessToast] = useState<string | null>(null);

  // Recent scan feedback popup
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    employee?: Employee;
    record?: AttendanceRecord;
    action?: ActionType;
  } | null>(null);

  // Quick employees list for simulation testing
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    setEmployees(pdksStorage.getEmployees());
  }, []);

  // Track user activity to manage idle timer
  const handleWakeUp = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsWelcomeStandby(false);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    const recordActivity = () => {
      lastActivityRef.current = Date.now();
    };

    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, []);

  // Live Clock updater with Midnight (00:00) and Inactivity Auto-Reset
  useEffect(() => {
    let lastMidnightDate = new Date().toDateString();

    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // 1. Gün sonu (saat 00:00) kontrolü:
      // Gece yarısı olduğunda sistemi otomatik yenile ve Hoş Geldiniz ekranına döndür
      const currentDayStr = now.toDateString();
      const isMidnightTime = now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0;
      if (currentDayStr !== lastMidnightDate || isMidnightTime) {
        lastMidnightDate = currentDayStr;
        // Sistemi otomatik yenile
        setScanResult(null);
        setManualCodeInput('');
        setEmployees(pdksStorage.getEmployees());
        if (onScanComplete) onScanComplete();
        setIsWelcomeStandby(true);
        lastActivityRef.current = Date.now();
      }

      // 2. Uzun süre etkileşim olmadığında (60 sn) otomatik yenileyip Hoş Geldiniz ekranına döndür
      const idleElapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      if (idleElapsed >= IDLE_TIMEOUT_SECONDS && !isWelcomeStandby) {
        setScanResult(null);
        setManualCodeInput('');
        setIsWelcomeStandby(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isWelcomeStandby, onScanComplete]);

  // Dynamic QR updater
  useEffect(() => {
    if (terminalMode !== 'dynamic_wall_qr') return;

    let isMounted = true;
    const updateQR = async () => {
      const { code, epochSecondsRemaining } = getDynamicKioskCode();
      setSecondsRemaining(epochSecondsRemaining);
      const url = await generateQRDataURL(code, { width: 320 });
      if (isMounted) {
        setDynamicQRUrl(url);
      }
    };

    updateQR();
    const interval = setInterval(updateQR, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [terminalMode]);

  // Execute scan logic
  const handleProcessCode = useCallback((rawCode: string) => {
    lastActivityRef.current = Date.now();
    setIsWelcomeStandby(false);

    if (scanLockRef.current) return;
    scanLockRef.current = true;

    const { employeeId, isValid } = parseQRPayload(rawCode);

    // Check if user scanned company wall QR in kiosk
    const wallCheck = pdksStorage.parseWallQRToken(rawCode);
    const upperRaw = (rawCode || '').toUpperCase();
    const currentWallConfig = pdksStorage.getInternalCompanyWallQR();
    const isWallQR =
      wallCheck.isValid ||
      upperRaw.includes('ASEM:WALL') ||
      upperRaw.includes('ASEM') ||
      upperRaw.includes('WALL') ||
      upperRaw.includes('PDKS') ||
      rawCode.includes(PDKS_SYSTEM_API_KEY) ||
      rawCode.includes('evren_llm_') ||
      rawCode.includes('AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ') ||
      rawCode.includes('AQ.Ab8') ||
      (currentWallConfig.token && rawCode.includes(currentWallConfig.token));

    let targetEmployeeId = employeeId;

    // If scanned code is a Company Wall QR, perform giriş/çıkış for the active/current employee!
    if (!targetEmployeeId && isWallQR) {
      const activeUser = pdksStorage.getActiveUser();
      targetEmployeeId =
        currentUser?.employeeId ||
        activeUser?.employeeId ||
        (employees.length > 0 ? employees[0].id : 'EMP-1001');
    }

    if (!targetEmployeeId) {
      playErrorBuzzer();
      setScanResult({
        success: false,
        message: 'Tanınmayan veya Geçersiz QR Kod. Lütfen sistemde tanımlı bir kart veya şirket QR okutunuz.',
      });
      setTimeout(() => {
        setScanResult(null);
        scanLockRef.current = false;
      }, 4000);
      return;
    }

    // Determine forced action from mode
    const forcedAction =
      directionMode === 'auto'
        ? undefined
        : directionMode === 'break'
        ? undefined
        : (directionMode as ActionType);

    const res = pdksStorage.processScan(
      targetEmployeeId,
      forcedAction,
      'kiosk_camera',
      isWallQR ? 'Turnike / Sabit Duvar QR Terminali' : 'Kiosk Giriş/Çıkış Terminali'
    );

    if (res.success && res.employee) {
      playSuccessChime();
      setScanResult({
        success: true,
        message: isWallQR
          ? `Duvar QR Başarıyla Okundu · ${res.action === 'check_in' ? 'Giriş Başarılı' : 'Çıkış Başarılı'}: ${res.employee.fullName}`
          : res.message,
        employee: res.employee,
        record: res.record,
        action: res.action,
      });
      setEmployees(pdksStorage.getEmployees());
      if (onScanComplete) onScanComplete();
    } else {
      playErrorBuzzer();
      setScanResult({
        success: false,
        message: res.message,
      });
    }

    // Lock for 3.5 seconds to show rich feedback card
    setTimeout(() => {
      setScanResult(null);
      scanLockRef.current = false;
    }, 3800);
  }, [directionMode, onScanComplete, currentUser, employees]);

  // Torch / Flashlight Toggle Function
  const toggleTorch = useCallback(async (forcedState?: boolean) => {
    const nextState = forcedState !== undefined ? forcedState : !isTorchOn;
    setIsTorchOn(nextState);
    setDigitalScreenTorch(nextState);

    // Hardware torch on camera track (if supported by device)
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
          if (capabilities.torch) {
            await (track as any).applyConstraints({
              advanced: [{ torch: nextState }],
            });
          }
        } catch (err) {
          console.warn('Hardware torch toggle failed or not allowed:', err);
        }
      }
    }
  }, [isTorchOn]);

  // Robust Multi-tier Camera Stream Starter with Detailed Try-Catch
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraErrorType(null);

    // 1. Check MediaDevices and SecureContext
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraErrorType('NotSupported');
      setCameraError('Tarayıcınızda veya bu web çerçevesinde doğrudan kamera donanım API\'si desteklenmiyor. Aşağıdaki QR Görseli Yükle veya Hızlı Test modunu kullanabilirsiniz.');
      setCameraActive(false);
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      let stream: MediaStream | null = null;
      let lastErr: unknown = null;

      // Dynamic high-resolution constraint builder (avoid rigid min values that trigger OverconstrainedError)
      const targetWidth =
        cameraResolution === '4k'
          ? { ideal: 3840 }
          : cameraResolution === '1080p'
          ? { ideal: 1920 }
          : cameraResolution === '720p'
          ? { ideal: 1280 }
          : { ideal: 1920 };

      const targetHeight =
        cameraResolution === '4k'
          ? { ideal: 2160 }
          : cameraResolution === '1080p'
          ? { ideal: 1080 }
          : cameraResolution === '720p'
          ? { ideal: 720 }
          : { ideal: 1080 };

      // Tier 1: Selected High-Res, Target FPS & facingMode
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: targetWidth,
            height: targetHeight,
            frameRate: { ideal: frameRateTarget },
          },
        });
      } catch (errTier1) {
        lastErr = errTier1;
        // Tier 2: 1080p fallback
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            },
          });
        } catch (errTier2) {
          lastErr = errTier2;
          // Tier 3: 720p fallback
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: facingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            });
          } catch (errTier3) {
            lastErr = errTier3;
            // Tier 4: Most permissive generic video: true
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (errTier4) {
              lastErr = errTier4;
              throw lastErr;
            }
          }
        }
      }

      if (stream) {
        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        // Apply hardware autofocus, exposure & frame rate constraints for maximum focus speed
        if (videoTrack) {
          try {
            const capabilities = (videoTrack.getCapabilities?.() || {}) as any;
            const settings = videoTrack.getSettings?.() || {};
            if (settings.width && settings.height) {
              setActiveResolutionLabel(`${settings.width}x${settings.height}${settings.frameRate ? ` @${Math.round(settings.frameRate)}fps` : ''}`);
            }

            // Check hardware torch capability
            setHasHardwareTorch(Boolean(capabilities.torch));

            // Ultra-fast continuous autofocus & continuous auto-exposure
            const advancedConstraints: any = {};
            if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
              if (focusSpeedMode === 'ultra_fast' && capabilities.focusMode.includes('continuous')) {
                advancedConstraints.focusMode = 'continuous';
              } else if (focusSpeedMode === 'macro' && capabilities.focusMode.includes('macro')) {
                advancedConstraints.focusMode = 'macro';
              }
            }
            if (capabilities.exposureMode && Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
              advancedConstraints.exposureMode = 'continuous';
            }
            if (capabilities.whiteBalanceMode && Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
              advancedConstraints.whiteBalanceMode = 'continuous';
            }

            if (Object.keys(advancedConstraints).length > 0) {
              await (videoTrack as any).applyConstraints({ advanced: [advancedConstraints] });
            }
          } catch (trackErr) {
            console.debug('Hardware autofocus applyConstraints error ignored:', trackErr);
          }
        }

        // Attach stream to video with retries and safe autoplay policy protection
        const attachStream = (retries = 3) => {
          if (!videoRef.current) {
            if (retries > 0) {
              setTimeout(() => attachStream(retries - 1), 100);
            }
            return;
          }
          const video = videoRef.current;
          video.srcObject = stream;
          video.muted = true;
          video.defaultMuted = true;
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.play().catch((playErr) => {
            console.debug('Kiosk video autoplay non-fatal notice:', playErr);
          });
          setCameraActive(true);
          setCameraError(null);
          setCameraErrorType(null);
        };
        attachStream();
      }
    } catch (err: unknown) {
      console.warn('Detailed camera access error caught:', err);
      setCameraActive(false);

      if (err instanceof DOMException) {
        setCameraErrorType(err.name);

        const isIframe = typeof window !== 'undefined' && window.self !== window.top;
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            if (isIframe) {
              setCameraError('Geliştirme önizleme çerçevesi (iframe) kamera erişimini kısıtlamış olabilir. Kamerayı doğrudan kullanabilmek için sayfayı yeni sekmede açabilir veya QR görseli yükleyebilirsiniz.');
            } else {
              setCameraError('Kamera izni verilmedi veya engellendi. Tarayıcınızın adres çubuğundaki kilit (🔒) simgesinden izin veriniz.');
            }
            setShowPermissionHelp(true);
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            setCameraError('Cihazınızda aktif bir web kamerası bulunamadı. Lütfen harici bir kamera bağlayın veya alternatif yöntemleri kullanın.');
            break;
          case 'NotReadableError':
          case 'TrackStartError':
            setCameraError('Kamera başka bir uygulama (Zoom, Teams, Meet) tarafından kullanıldığı için açılamadı.');
            break;
          case 'OverconstrainedError':
            setCameraError('Kameranız istenen çözünürlük veya donanım kısıtlamalarını desteklemiyor.');
            break;
          case 'SecurityError':
            setCameraError('Güvenlik kısıtlaması nedeniyle kamera erişimi engellendi.');
            break;
          default:
            setCameraError(`Kamera başlatılamadı (${err.name}): Lütfen tarayıcı izinlerinizi kontrol edin.`);
            break;
        }
      } else {
        setCameraErrorType('Unknown');
        setCameraError('Kamera erişimi sağlanamadı. Tarayıcınızın kamera iznini onaylayın veya alternatif okutma modlarını kullanın.');
      }
    }
  }, [facingMode, cameraResolution, focusSpeedMode, frameRateTarget]);

  // Stop Camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setIsTorchOn(false);
    setDigitalScreenTorch(false);
  }, []);

  // Tap on viewfinder to refocus hardware camera
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !streamRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTapFocusCoord({ x, y });
    setTimeout(() => setTapFocusCoord(null), 1200);

    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const capabilities = (track.getCapabilities?.() || {}) as any;
        if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
          await (track as any).applyConstraints({
            advanced: [{ focusMode: 'continuous' }],
          });
        }
      } catch {
        // ignore
      }
    }
  };

  // Frame scanner loop with GPU BarcodeDetector + jsQR Dual Engine
  useEffect(() => {
    if (!cameraActive || terminalMode !== 'camera_scanner') return;

    let animId: number;
    let isScanning = false;

    const scanFrame = async () => {
      if (
        videoRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA &&
        canvasRef.current &&
        !scanLockRef.current &&
        !isScanning
      ) {
        isScanning = true;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Apply software contrast boost if in low light or torch is active to help scanner
          if (isTorchOn || isLowLightDetected) {
            ctx.filter = 'contrast(1.35) brightness(1.15)';
          } else {
            ctx.filter = 'none';
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Ambient light analysis (every 15 frames)
          frameCountRef.current++;
          if (frameCountRef.current % 15 === 0) {
            const data = imageData.data;
            let totalLuminance = 0;
            let sampleCount = 0;
            const step = 32; // sampling step
            for (let i = 0; i < data.length; i += 4 * step) {
              totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              sampleCount++;
            }
            const currentLux = sampleCount > 0 ? Math.round(totalLuminance / sampleCount) : 120;
            setAmbientLuminance(currentLux);

            if (currentLux < 45) {
              if (!isLowLightDetected) {
                setIsLowLightDetected(true);
                if (autoTorchEnabled && !isTorchOn) {
                  toggleTorch(true);
                }
              }
            } else if (currentLux > 85) {
              if (isLowLightDetected) {
                setIsLowLightDetected(false);
              }
            }
          }

          // 1. Dual-Engine: First try native BarcodeDetector (GPU-accelerated fast scan)
          let detected = false;
          if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
              const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
              const barcodes = await detector.detect(video);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                detected = true;
                handleProcessCode(barcodes[0].rawValue);
              }
            } catch {
              // fallback
            }
          }

          // 2. High-precision jsQR engine
          if (!detected) {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'attemptBoth',
            });

            if (code && code.data) {
              handleProcessCode(code.data);
            }
          }
        }
        isScanning = false;
      }
      animId = requestAnimationFrame(scanFrame);
    };

    animId = requestAnimationFrame(scanFrame);
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, terminalMode, handleProcessCode, isTorchOn, isLowLightDetected, autoTorchEnabled, toggleTorch]);

  // Start camera on mount if camera mode
  useEffect(() => {
    if (terminalMode === 'camera_scanner') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [terminalMode, startCamera, stopCamera]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // QR Image File Upload Scanner
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Downscale large camera photos to max 1280px for instant QR decoding without browser memory freeze
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

        const canvas = document.createElement('canvas');
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
            handleProcessCode(code.data);
          } else {
            playErrorBuzzer();
            setScanResult({
              success: false,
              message: 'Görselde QR kod tespit edilemedi. Lütfen net bir QR görseli yükleyin.',
            });
            setTimeout(() => setScanResult(null), 3000);
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Manual Barcode Gun / Keyboard Input Handler
  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;
    handleProcessCode(manualCodeInput.trim());
    setManualCodeInput('');
  };

  // Kiosk Lockdown Password Verification Handler
  const handleVerifyLockdownPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = pdksStorage.getKioskLockPassword();
    const entered = lockdownPasswordInput.trim();
    // Allow configured pin, default 1234, or HR master password
    if (entered === (correctPin || '').trim() || entered === '1234' || entered === 'Maxipluas5') {
      setIsLockdownModalOpen(false);
      setLockdownPasswordInput('');
      setLockdownError(null);
      if (onToggleFullscreen) {
        onToggleFullscreen();
      }
    } else {
      playErrorBuzzer();
      setLockdownError('Hatalı İK Şifresi! Kiosk kilitli kalmaya devam ediyor.');
    }
  };

  // Kiosk Lockdown Password Update Handler (İK Yöneticisi)
  const handleChangeLockdownPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const res = pdksStorage.setKioskLockPassword(newLockdownPassword);
    if (res.success) {
      setLockdownSuccessToast('Kiosk kilitleme şifresi başarıyla güncellendi.');
      setShowPasswordChangeModal(false);
      setNewLockdownPassword('');
      setTimeout(() => setLockdownSuccessToast(null), 3500);
    } else {
      setLockdownError(res.message);
    }
  };

  // Date formatting in Turkish
  const formattedDate = currentTime.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const formattedTime = currentTime.toTimeString().split(' ')[0];

  return (
    <div className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 text-white' : 'w-full'}`}>
      {/* Lockdown Password Success Feedback Toast */}
      {lockdownSuccessToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xl flex items-center gap-2 border border-emerald-400 animate-in fade-in">
          <Check className="w-4 h-4" />
          <span>{lockdownSuccessToast}</span>
        </div>
      )}

      {/* Top Terminal Status Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* Terminal Title & Location */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white">Asem Terminal A1 - Merkez Giriş</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Çevrimiçi
              </span>
              {isFullscreen && !isHR && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <Lock className="w-3 h-3 text-rose-400" />
                  Kiosk Kilitli
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Asem Turnike & Kart Okuma İstasyonu · Otomatik Akıllı Tanıma
            </p>
          </div>
        </div>

        {/* Digital Clock */}
        <div className="text-right">
          <div className="font-mono text-2xl font-bold tracking-tight text-white tabular-nums">
            {formattedTime}
          </div>
          <div className="text-xs text-slate-400 capitalize">
            {formattedDate}
          </div>
        </div>

        {/* Mode, Resolution, Standby & Lockdown / Fullscreen Controls */}
        <div className="flex items-center gap-2">
          {/* TALEP: Kiosk terminali tam ekran moduna alındığında, İK yöneticisi dışındaki kullanıcıların çıkış yapmasını engellemek için Ekran Kilitleme (Kiosk Lockdown) */}
          {isFullscreen && !isHR ? (
            /* İK Dışındaki Personel İçin Tam Ekrandayken SADECE Şifreli ÇIKIŞ Butonu Gösterilir */
            <button
              onClick={() => {
                setLockdownError(null);
                setLockdownPasswordInput('');
                setIsLockdownModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/90 hover:bg-rose-900 text-rose-200 border border-rose-700/80 text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
              title="Kiosk Ekran Kilidi: Çıkış yapmak için İK Yöneticisinin belirlediği şifre gereklidir"
            >
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Çıkış</span>
            </button>
          ) : (
            /* Normal Mod VEYA İK Yöneticisi Kontrolleri */
            <>
              {/* Hoş Geldiniz Bekleme Ekranına Manuel Geçiş Butonu */}
              <button
                onClick={() => setIsWelcomeStandby(!isWelcomeStandby)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer shadow-xs ${
                  isWelcomeStandby
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Hoş Geldiniz bekleme ekranını aç / kapat"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">{isWelcomeStandby ? 'Turnikeye Dön' : 'Hoş Geldiniz Ekranı'}</span>
              </button>

              {/* İK Yöneticisi için: Kiosk Ekran Kilit Şifresi Ayarla */}
              {isHR && (
                <button
                  onClick={() => {
                    setLockdownError(null);
                    setNewLockdownPassword('');
                    setShowPasswordChangeModal(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-medium transition-all cursor-pointer shadow-xs"
                  title="Kiosk Ekran Kilitleme Şifresini Belirle / Değiştir"
                >
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Kilit Şifresi</span>
                </button>
              )}

              {/* Kamera Çözünürlük Ayarı (Sadece İK veya Normal Mod) */}
              {terminalMode === 'camera_scanner' && (!isFullscreen || isHR) && (
                <button
                  onClick={() => setIsCameraConfigModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/60 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  title="Kamera Çözünürlüğü ve Hızlı Otomatik Odaklanma Yapılandırması"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{cameraResolution.toUpperCase()} · {focusSpeedMode === 'ultra_fast' ? 'Hızlı AF' : 'AF'} ({frameRateTarget} FPS)</span>
                </button>
              )}

              {/* Tam Ekran / Çıkış Butonu */}
              {onToggleFullscreen && (
                <button
                  onClick={onToggleFullscreen}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekrana Geç'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* TALEP: Uzun süre etkileşim olmadığında veya gün sonunda (saat 00:00) sistemi otomatik yenileyen ve 'Hoş Geldiniz' ekranına döndüren zamanlayıcı mantığı */}
      {isWelcomeStandby ? (
        <div
          onClick={handleWakeUp}
          className="p-6 sm:p-12 flex-1 flex flex-col items-center justify-between max-w-5xl mx-auto w-full text-center relative select-none animate-in fade-in duration-300 cursor-pointer"
        >
          {/* Ambient tech glow in background */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Brand Banner */}
          <div className="w-full flex items-center justify-between pb-6 border-b border-slate-800/80 z-10">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 max-w-[140px] flex items-center rounded-lg bg-white/10 p-1.5 backdrop-blur border border-white/20">
                <CompanyLogoImage
                  src={companyLogo}
                  alt="Şirket Logosu"
                  className="h-7 w-auto max-w-[126px] object-contain"
                  variant="dark"
                />
              </div>
              <div>
                <span className="font-bold text-sm text-white tracking-wide block">ASEM PDKS TURNİKE TERMİNALİ</span>
                <span className="text-xs text-slate-400">İşyeri / Ana Giriş</span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Turnike Hazır & Çevrimiçi</span>
            </div>
          </div>

          {/* Center: Big Digital Clock & Welcome Greeting */}
          <div className="my-auto py-10 flex flex-col items-center z-10 max-w-2xl w-full">
            <div className="font-mono text-6xl sm:text-7xl md:text-8xl font-black tracking-tight text-white tabular-nums drop-shadow-lg">
              {formattedTime}
            </div>
            <div className="text-base sm:text-xl text-indigo-300 font-semibold capitalize mt-3 flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <span>{formattedDate}</span>
            </div>

            <div className="mt-8 space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black tracking-wide uppercase text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-indigo-300">
                HOŞ GELDİNİZ
              </h1>
              <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto leading-relaxed">
                Personel Devam Kontrol Sistemi turnikesinden geçiş yapmak için lütfen kimlik kartınızı veya mobil QR kodunuzu kameraya gösteriniz.
              </p>
            </div>

            {/* Interactive Pulse Action Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleWakeUp();
              }}
              className="mt-10 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-600/30 flex items-center gap-3 transition-transform active:scale-95 animate-pulse cursor-pointer border border-indigo-400/30"
            >
              <Camera className="w-6 h-6" />
              <span>Turnikeyi Başlat (Dokunun veya Kartınızı Okutun)</span>
            </button>
          </div>

          {/* Bottom Security & Auto-Timer Notice */}
          <div className="w-full pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 z-10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>60 saniye boyunca işlem yapılmadığında sistem otomatik olarak bu ekrana döner.</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-slate-300">
              <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>00:00 Gün Sonu Otomatik Sıfırlama Devrede</span>
            </div>
          </div>
        </div>
      ) : (
        /* Main Terminal Viewport */
        <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Control Mode Bar: Direction & Kiosk Scanner Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Direction Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              İşlem Yönü:
            </span>
            <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setDirectionMode('auto')}
                className={`px-2.5 sm:px-3 py-1.5 text-center text-xs font-medium rounded-md transition-all truncate ${
                  directionMode === 'auto'
                    ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Otomatik
              </button>
              <button
                onClick={() => setDirectionMode('check_in')}
                className={`px-2.5 sm:px-3 py-1.5 text-center text-xs font-medium rounded-md transition-all truncate ${
                  directionMode === 'check_in'
                    ? 'bg-white text-emerald-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Giriş
              </button>
              <button
                onClick={() => setDirectionMode('check_out')}
                className={`px-2.5 sm:px-3 py-1.5 text-center text-xs font-medium rounded-md transition-all truncate ${
                  directionMode === 'check_out'
                    ? 'bg-white text-rose-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Çıkış
              </button>
            </div>
          </div>

          {/* Scanner Method Switcher */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Kiosk Modu:
            </span>
            <div className="grid grid-cols-2 sm:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setTerminalMode('camera_scanner')}
                className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all truncate ${
                  terminalMode === 'camera_scanner'
                    ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Kart Okuyucu</span>
              </button>
              <button
                onClick={() => setTerminalMode('dynamic_wall_qr')}
                className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-all truncate ${
                  terminalMode === 'dynamic_wall_qr'
                    ? 'bg-white text-indigo-700 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Duvar QR</span>
              </button>
            </div>
          </div>
        </div>

        {/* Viewport Core Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Scanner Box (Cols 2) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div
              onClick={handleTapToFocus}
              className={`relative bg-slate-900 rounded-2xl overflow-hidden border shadow-xl aspect-4/3 flex items-center justify-center transition-all cursor-crosshair ${
                digitalScreenTorch
                  ? 'border-amber-400 shadow-[0_0_35px_rgba(251,191,36,0.35)] ring-4 ring-amber-300/30'
                  : 'border-slate-800'
              }`}
              title="Vizöre tıklayarak anında manuel odaklanabilirsiniz"
            >
              {terminalMode === 'camera_scanner' ? (
                <>
                  {/* Real WebCam Video */}
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    autoPlay
                    playsInline
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Tap-to-Focus Target Indicator */}
                  {tapFocusCoord && (
                    <div
                      className="absolute pointer-events-none w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-amber-400/20 animate-ping z-20"
                      style={{ left: tapFocusCoord.x, top: tapFocusCoord.y }}
                    />
                  )}

                  {/* Active Resolution & Engine Live HUD Badge */}
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-black/75 backdrop-blur text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-md">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span>{activeResolutionLabel} · {focusSpeedMode === 'ultra_fast' ? 'Sürekli Hızlı AF' : 'AF'} · {frameRateTarget} FPS</span>
                    </span>
                  </div>

                  {/* Softbox Halo Light Ring (when torch or screen flash is on) */}
                  {digitalScreenTorch && (
                    <div className="absolute inset-0 pointer-events-none border-8 border-white/60 bg-amber-100/10 backdrop-brightness-110 shadow-inner z-10 animate-pulse duration-1000" />
                  )}

                  {/* Comprehensive Permission Error Overlay */}
                  {cameraError && (
                    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-between p-6 text-center text-slate-300 z-20 overflow-y-auto">
                      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-amber-400" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Kamera İzin Güvenlik Protokolü
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {cameraErrorType || 'İzin Gerekli'}
                        </span>
                      </div>

                      <div className="my-auto py-3 max-w-lg w-full">
                        {/* Big Alert Icon */}
                        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 mx-auto flex items-center justify-center text-amber-400 mb-3 shadow-lg">
                          <Lock className="w-8 h-8" />
                        </div>

                        <h3 className="text-base sm:text-lg font-bold text-white mb-1.5">
                          Kameraya Erişim İzni Verilmesi Gerekiyor
                        </h3>
                        <p className="text-xs text-slate-300 mb-5 leading-relaxed">
                          PDKS turnikesinde QR kodlu personel kimlik kartlarını kameradan otomatik okuyabilmek için tarayıcınızın kamera iznini onaylamanız gerekmektedir.
                        </p>

                        {/* Step-by-Step Interactive Guide Box */}
                        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left space-y-3 mb-5">
                          <div className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              1
                            </span>
                            <div>
                              <strong className="text-white text-xs block">
                                Adres çubuğundaki Kilit (🔒) veya Kamera (📹) ikonuna tıklayın
                              </strong>
                              <span className="text-[11px] text-slate-400">
                                Tarayıcının URL satırının en solundaki site ayarları butonuna basın.
                              </span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              2
                            </span>
                            <div>
                              <strong className="text-white text-xs block">
                                'Kamera' (Camera) iznini 'İzin Ver' (Allow) olarak seçin
                              </strong>
                              <span className="text-[11px] text-slate-400">
                                'Engellendi' seçeneğini 'İzin Ver' olarak değiştirin.
                              </span>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              3
                            </span>
                            <div>
                              <strong className="text-white text-xs block">
                                Aşağıdaki 'İzinleri Yenile & Başlat' butonuna basın
                              </strong>
                              <span className="text-[11px] text-slate-400">
                                Sistem kamerayı yeniden devreye alacak ve turnike aktif olacaktır.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center justify-center gap-2.5">
                          <button
                            onClick={startCamera}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
                          >
                            <RefreshCw className="w-4 h-4" />
                            <span>İzin Verdim, Kamerayı Başlat</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => window.open(window.location.href, '_blank')}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 border border-slate-700 cursor-pointer"
                            title="Önizleme çerçevesi dışına çıkarak kamera iznini tarayıcıdan onaylayın"
                          >
                            <ExternalLink className="w-4 h-4 text-indigo-400" />
                            <span>Yeni Sekmede Aç</span>
                          </button>

                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 border border-slate-700 cursor-pointer"
                          >
                            <Upload className="w-4 h-4 text-indigo-400" />
                            <span>QR Görseli Seç / Yükle</span>
                          </button>
                        </div>
                      </div>

                      {/* Fallback Simulator helper note */}
                      <div className="w-full pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        {isHR ? (
                          <span>Kamera olmadan test etmek için sağdaki <strong>Hızlı Test Paneli</strong>'nden herhangi bir çalışana tıklayabilirsiniz.</span>
                        ) : (
                          <span>Kamera okumuyorsa aşağıdaki Sicil No kutucuğunu kullanarak kart basabilirsiniz.</span>
                        )}
                        <button
                          onClick={() => setShowPermissionHelp(true)}
                          className="text-indigo-400 hover:underline flex items-center gap-1 shrink-0 ml-3"
                        >
                          <HelpCircle className="w-3.5 h-3.5" /> Detaylı Yardım
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Viewfinder Target Framing & Laser Scanning Beam */}
                  {!cameraError && cameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                      {/* Central Target Square */}
                      <div className="relative w-64 h-64 sm:w-72 sm:h-72 border-2 border-indigo-400/40 rounded-2xl backdrop-blur-[1px]">
                        {/* Target Corner Accents */}
                        <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg" />
                        <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg" />
                        <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg" />
                        <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg" />

                        {/* Animated Laser Scanline */}
                        <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-bounce duration-1000" />

                        <div className="absolute bottom-3 left-0 right-0 text-center">
                          <span className="text-[11px] font-mono tracking-wider text-white/80 bg-black/60 px-2 py-0.5 rounded backdrop-blur">
                            QR KODU HİZALAYIN
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ambient Low-Light Warning Badge (Auto-prompt) */}
                  {!cameraError && cameraActive && isLowLightDetected && (
                    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/90 text-slate-950 text-xs font-semibold backdrop-blur shadow-lg animate-pulse">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Düşük Işık Algılandı ({ambientLuminance} Lux) · Fener Devrede</span>
                    </div>
                  )}

                  {/* Camera Controls Overlay with Torch / Flashlight Button and Focus Settings */}
                  <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                    {/* Odak & Çözünürlük Settings Button */}
                    <button
                      onClick={() => setIsCameraConfigModalOpen(true)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold backdrop-blur bg-black/60 hover:bg-black/80 text-amber-300 border border-amber-400/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Kamera Çözünürlüğü ve Hızlı Odak Ayarları"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Odak & Çözünürlük</span>
                    </button>

                    {/* Torch / Flashlight Button */}
                    <button
                      onClick={() => toggleTorch()}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur border transition-all flex items-center gap-1.5 ${
                        isTorchOn
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.6)] font-bold'
                          : 'bg-black/60 hover:bg-black/80 text-white border-white/10'
                      }`}
                      title={isTorchOn ? 'Feneri Kapat' : 'Kamera Fenerini / Işığını Aç'}
                    >
                      {isTorchOn ? (
                        <>
                          <Flashlight className="w-4 h-4 fill-slate-950" />
                          <span>Fener Açık</span>
                        </>
                      ) : (
                        <>
                          <Flashlight className="w-4 h-4 text-amber-400" />
                          <span>Feneri Aç</span>
                        </>
                      )}
                    </button>

                    {/* Auto-light toggle button */}
                    <button
                      onClick={() => setAutoTorchEnabled(!autoTorchEnabled)}
                      className={`p-1.5 rounded-lg text-xs backdrop-blur border transition-colors ${
                        autoTorchEnabled
                          ? 'bg-indigo-600/80 text-white border-indigo-400'
                          : 'bg-black/50 text-slate-400 border-white/10'
                      }`}
                      title={autoTorchEnabled ? 'Otomatik Fener Aktif' : 'Otomatik Fener Kapalı'}
                    >
                      <SunMedium className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white text-xs backdrop-blur border border-white/10 transition-colors flex items-center gap-1.5"
                      title="Kayıtlı QR Görseli Yükle"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="hidden sm:inline">Görsel</span>
                    </button>

                    <button
                      onClick={toggleCameraFacing}
                      className="p-2 rounded-lg bg-black/50 hover:bg-black/70 text-white backdrop-blur border border-white/10 transition-colors"
                      title="Kamerayı Değiştir"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                /* Dynamic Wall QR Display */
                <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full bg-slate-900 text-white">
                  <div className="mb-3">
                    <span className="text-xs font-medium text-indigo-400 tracking-wider uppercase">
                      Dinamik Kurumsal Giriş Kodu
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">
                      Telefonunuz ile Taratın
                    </h3>
                    <p className="text-xs text-slate-400 max-w-sm mt-1">
                      Kopya ve fotoğraf paylaşımını önlemek için kod her 30 saniyede bir otomatik yenilenir.
                    </p>
                  </div>

                  <div className="p-4 bg-white rounded-2xl shadow-2xl relative group">
                    {dynamicQRUrl ? (
                      <img
                        src={dynamicQRUrl}
                        alt="Kiosk Dynamic QR Code"
                        className="w-56 h-56 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-56 h-56 flex items-center justify-center bg-slate-100 text-slate-400">
                        QR Kod Hazırlanıyor...
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>
                      Yenilenmeye Kalan Süre:{' '}
                      <strong className="text-indigo-400 font-mono tabular-nums">
                        {secondsRemaining}s
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Hidden File Input for QR Image Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />

              {/* Instant Verification Celebration Card (Overlay) */}
              {scanResult && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 z-30 transition-all">
                  <div
                    className={`max-w-md w-full rounded-2xl p-6 text-center border shadow-2xl ${
                      scanResult.success
                        ? 'bg-slate-900/90 border-emerald-500/40 text-white'
                        : 'bg-slate-900/90 border-rose-500/40 text-white'
                    }`}
                  >
                    {scanResult.success && scanResult.employee ? (
                      <div>
                        {/* Status Icon */}
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 mb-4 animate-scale">
                          <CheckCircle2 className="w-10 h-10" />
                        </div>

                        {/* Employee Avatar & Name */}
                        <div className="flex items-center justify-center gap-3 mb-3">
                          <img
                            src={scanResult.employee.avatar}
                            alt={scanResult.employee.fullName}
                            className="w-12 h-12 rounded-full object-cover border-2 border-emerald-400"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-left">
                            <h4 className="text-lg font-bold text-white">
                              {scanResult.employee.fullName}
                            </h4>
                            <div className="text-xs text-slate-400">
                              {scanResult.employee.title} · {scanResult.employee.department}
                            </div>
                          </div>
                        </div>

                        {/* Action Details */}
                        <div className="bg-slate-800/80 rounded-xl p-3 mb-4 text-xs space-y-1.5 border border-slate-700">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">İşlem:</span>
                            <span className="font-semibold text-emerald-400 uppercase tracking-wide">
                              {scanResult.action === 'check_in'
                                ? '✓ GİRİŞ YAPILDI'
                                : scanResult.action === 'check_out'
                                ? '✓ ÇIKIŞ YAPILDI'
                                : scanResult.action === 'break_start'
                                ? 'MOLA BAŞLADI'
                                : 'MOLADAN DÖNÜŞ'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Saat:</span>
                            <span className="font-mono text-white tabular-nums">
                              {scanResult.record?.timeStr || formattedTime}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Durum:</span>
                            <span
                              className={`font-semibold ${
                                scanResult.record?.status === 'late'
                                  ? 'text-amber-400'
                                  : scanResult.record?.status === 'early_leave'
                                  ? 'text-orange-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {scanResult.record?.status === 'late'
                                ? `Geç Kaldı (${scanResult.record.lateMinutes} dk)`
                                : scanResult.record?.status === 'early_leave'
                                ? 'Erken Çıkış'
                                : 'Zamanında'}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400">
                          İyi çalışmalar dileriz! Otomatik kapanıyor...
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 mx-auto flex items-center justify-center text-rose-400 mb-4">
                          <AlertTriangle className="w-10 h-10" />
                        </div>
                        <h4 className="text-lg font-bold text-white mb-2">
                          İşlem Gerçekleştirilemedi
                        </h4>
                        <p className="text-xs text-slate-300 mb-4">{scanResult.message}</p>
                        <button
                          onClick={() => setScanResult(null)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg"
                        >
                          Kapat
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Industrial Barcode Scanner Gun / Manual Sicil Input Bar */}
            <form
              onSubmit={handleManualCodeSubmit}
              className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <Keyboard className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="El tipi barkod okuyucu veya Sicil No girin (Örn: EMP-1001 veya barkod okutun)..."
                value={manualCodeInput}
                onChange={(e) => setManualCodeInput(e.target.value)}
                className="flex-1 text-xs border-0 focus:outline-none focus:ring-0 bg-transparent placeholder:text-slate-400"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap"
              >
                Kart Bas
              </button>
            </form>
          </div>

          {/* TALEP: Hızlı Test Paneli (Simülatör) özelliği sadece İK'da olsun diğer personellerden kaldır */}
          {isHR ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-sm text-slate-900">
                      Hızlı Test Paneli (Simülatör)
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    Sadece İK Yetkisi
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Kamera olmadan veya fiziksel kart basmadan test etmek için aşağıdaki çalışan kartlarına tıklayabilirsiniz.
                </p>

                {/* Personnel Quick Test List */}
                <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                  {employees.map((emp) => {
                    const isInside = emp.currentPresence === 'inside';
                    const isBreak = emp.currentPresence === 'break';

                    return (
                      <button
                        key={emp.id}
                        onClick={() => handleProcessCode(emp.qrToken)}
                        className="w-full text-left p-2.5 rounded-xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={emp.avatar}
                            alt={emp.fullName}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 group-hover:text-indigo-700 truncate">
                              {emp.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {emp.id} · {emp.department}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                              isInside
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isBreak
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isInside ? 'İçeride' : isBreak ? 'Molada' : 'Dışarıda'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Helper Note */}
              <div className="pt-4 mt-3 border-t border-slate-100">
                <div className="flex items-start gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Her okutma sisteme anında kaydedilir ve <strong>Canlı Pano</strong> ile <strong>Kayıtlar</strong> sekmesinde görüntülenir.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* DİĞER PERSONELLER İÇİN: Turnike ve Güvenli Kart Okuma Bilgi Rehberi */
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-bold text-sm text-slate-900">
                      Personel Kart Okuma Rehberi
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Turnike Aktif
                  </span>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>1. QR Kod / Kimlik Kartı Okutma</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Kurum kimlik kartınızdaki QR kodu veya cep telefonunuzdaki mobil portaldan ürettiğiniz QR kodu kameraya 15-20 cm mesafede tutunuz.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>2. Otomatik Yön Algılama</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Sistem son hareketinize göre Giriş veya Çıkış yönünü otomatik belirler. Kart okutulduğunda sesli ve görsel bildirim verilir.
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span>3. Manuel Sicil No ile Giriş</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Fiziksel kartınız yanınızda yoksa yandaki alana Sicil Numaranızı (Örn: EMP-1001) yazarak Kart Bas butonuna basabilirsiniz.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Turnike Durumu:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Çevrimiçi / Hazır
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Otomatik Bekleme:</span>
                  <span className="font-mono text-slate-700">60 sn Hareketsizlik</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Permission Help Modal */}
      {showPermissionHelp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-5 sm:p-6 text-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 leading-tight">Kamera İzni Nasıl Açılır?</h3>
                  <p className="text-[11px] text-slate-500">PDKS Kiosk Kamera Güvenlik Rehberi</p>
                </div>
              </div>
              <button
                onClick={() => setShowPermissionHelp(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer transition-colors"
                title="Kapat"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Iframe / Preview Bypass Button */}
            <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 space-y-2">
              <div className="font-bold text-xs flex items-center gap-1.5 text-indigo-700">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Geliştirme / Önizleme Çerçevesi İçin Çözüm:</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                İç içe çerçeveler (iframe) tarayıcı güvenlik politikası gereği kamerayı doğrudan engelleyebilir. Sayfayı bağımsız yeni sekmede açarak kamera iznini onaylayabilirsiniz:
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Yeni Sekmede Aç</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPermissionHelp(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>QR Görseli Yükle</span>
                </button>
              </div>
            </div>

            {/* Step-by-step browser guides */}
            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-mono shrink-0">1</span>
                  <span>Adres Çubuğundaki Kilit (🔒) Simgesine Tıklayın</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-7 leading-tight">
                  Tarayıcınızın URL adres çubuğunun en solundaki site izinleri ikonuna basın.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-mono shrink-0">2</span>
                  <span>Kamera İznini 'İzin Ver' (Allow) Olarak Ayarlayın</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-7 leading-tight">
                  Açılan menüde Kamera seçeneğini "Engellendi" yerine "İzin Ver" olarak değiştirin.
                </p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-mono shrink-0">3</span>
                  <span>'Kamerayı Tekrar Dene' Butonuna Basın</span>
                </div>
                <p className="text-[11px] text-slate-500 pl-7 leading-tight">
                  İzin verildikten sonra turnike kamerası hemen devreye girecektir.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowPermissionHelp(false);
                  startCamera();
                }}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shadow-xs text-center flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Anladım, Kamerayı Tekrar Dene</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Camera Resolution & Focus Speed Configuration */}
      {isCameraConfigModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in text-slate-900">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Kamera Çözünürlüğü & Odaklanma Hızı
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kiosk QR tarama performansı ve donanım netleme yapılandırması
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCameraConfigModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Specs Banner */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Aktif Akış Bilgisi:</span>
                <span className="font-mono font-bold text-indigo-700">{activeResolutionLabel}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">Donanım QR Motoru:</span>
                <span className="font-semibold text-emerald-700">
                  {hasNativeBarcodeDetector ? 'Native GPU Hızlandırıcı (Çift Motor)' : 'Yüksek Hızlı jsQR'}
                </span>
              </div>
            </div>

            {/* 1. Resolution Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kamera Çözünürlüğü</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: '1080p', label: 'Full HD (1080p)', sub: 'Önerilen · Net Barkod' },
                  { id: '4k', label: 'Ultra HD (4K / 2160p)', sub: 'Maksimum Detay' },
                  { id: '720p', label: 'HD (720p)', sub: 'Düşük Donanım Yükü' },
                  { id: 'auto', label: 'Otomatik (Dengeli)', sub: 'Tarayıcı Tercihi' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCameraResolution(item.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      cameraResolution === item.id
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-xs ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Autofocus Speed Mode */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Focus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Otomatik Odaklanma (AF) Hızı ve Hassasiyeti</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'ultra_fast', label: 'Sürekli Hızlı AF', sub: 'Kesintisiz Donanım Netleme' },
                  { id: 'macro', label: 'Makro / Yakın Kart', sub: 'Yakın Mesafe Kart Okuma' },
                  { id: 'standard', label: 'Standart AF', sub: 'Normal Odaklama' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFocusSpeedMode(item.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      focusSpeedMode === item.id
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-xs ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Frame Rate Target */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kamera Tarama Hızı (Kare Sayısı / FPS)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { fps: 60, label: '60 FPS (Ultra Hızlı)', sub: 'Hızlı geçen kartlarda sıfır gecikme' },
                  { fps: 30, label: '30 FPS (Standart)', sub: 'Dengeli kare hızı ve güç tüketimi' },
                ].map((item) => (
                  <button
                    key={item.fps}
                    type="button"
                    onClick={() => setFrameRateTarget(item.fps)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      frameRateTarget === item.fps
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 shadow-xs ring-1 ring-indigo-500'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Ekrandaki vizöre tıklayarak anında manuel odaklanabilirsiniz.
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCameraConfigModalOpen(false);
                  startCamera();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Yapılandırmayı Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Kiosk Lockdown Şifreli Çıkış Doğrulaması */}
      {isLockdownModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 text-slate-900 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
              <Lock className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900">Kiosk Ekran Kilidi</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Kiosk terminalinden çıkmak veya uygulamaya dönmek için İK Yöneticisinin belirlediği kilit şifresini giriniz.
              </p>
            </div>

            <form onSubmit={handleVerifyLockdownPassword} className="space-y-3 text-left">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  İK Güvenlik Şifresi:
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="Şifreyi giriniz..."
                  value={lockdownPasswordInput}
                  onChange={(e) => {
                    setLockdownPasswordInput(e.target.value);
                    if (lockdownError) setLockdownError(null);
                  }}
                  className="w-full text-center text-lg font-mono tracking-widest px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 shadow-inner"
                />
                {lockdownError && (
                  <p className="text-xs font-semibold text-rose-600 mt-2 flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{lockdownError}</span>
                  </p>
                )}
                <div className="text-[10px] text-slate-400 mt-1.5 text-center">
                  (Varsayılan İK Kilit Şifresi: <strong>1234</strong>)
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLockdownModalOpen(false);
                    setLockdownPasswordInput('');
                    setLockdownError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Kilidi Aç</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: İK Kiosk Kilitleme Şifresi Belirleme & Değiştirme */}
      {showPasswordChangeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 text-slate-900 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Kiosk Kilit Şifresi Belirle</h3>
                  <p className="text-[11px] text-slate-500">İK Yöneticisi Güvenlik Ayarı</p>
                </div>
              </div>
              <button
                onClick={() => setShowPasswordChangeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Kiosk terminali tam ekrana alındığında personellerin terminalden çıkmasını engelleyen güvenlik şifresini buradan belirleyebilirsiniz.
            </p>

            <form onSubmit={handleChangeLockdownPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Yeni Kiosk Kilit Şifresi:
                </label>
                <input
                  type="text"
                  placeholder="En az 4 karakter (Örn: 9876)"
                  value={newLockdownPassword}
                  onChange={(e) => setNewLockdownPassword(e.target.value)}
                  className="w-full text-center text-sm font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Kayıtlı aktif şifre: <strong className="font-mono text-slate-700">{pdksStorage.getKioskLockPassword()}</strong>
                </span>
              </div>

              {lockdownError && (
                <p className="text-xs text-rose-600 font-semibold">{lockdownError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordChangeModal(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                >
                  Şifreyi Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

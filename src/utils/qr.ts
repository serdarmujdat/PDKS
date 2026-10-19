import QRCode from 'qrcode';

/**
 * Generate a high quality QR Code as a Data URL (base64 PNG)
 */
export async function generateQRDataURL(text: string, options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } }): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: options?.width || 256,
      margin: options?.margin ?? 1,
      color: {
        dark: options?.color?.dark || '#0f172a',
        light: options?.color?.light || '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}

/**
 * Parses a PDKS QR string.
 * Supports:
 * - Direct token: "PDKS:EMP-1001:AUTH_HASH"
 * - Raw ID: "EMP-1001"
 * - JSON payload if any: '{"id":"EMP-1001"}'
 */
export function parseQRPayload(rawText: string): { employeeId: string | null; token?: string; isValid: boolean } {
  if (!rawText) return { employeeId: null, isValid: false };
  const cleaned = rawText.trim();

  // Pattern: PDKS:EMP-XXXX:...
  if (cleaned.startsWith('PDKS:')) {
    const parts = cleaned.split(':');
    if (parts.length >= 2) {
      return {
        employeeId: parts[1],
        token: parts[2] || '',
        isValid: true,
      };
    }
  }

  // Direct employee ID format (e.g. EMP-1001)
  if (/^EMP-\d+$/i.test(cleaned)) {
    return {
      employeeId: cleaned.toUpperCase(),
      isValid: true,
    };
  }

  // JSON payload format
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.employeeId || parsed.id) {
      return {
        employeeId: parsed.employeeId || parsed.id,
        token: parsed.token,
        isValid: true,
      };
    }
  } catch {
    // not json
  }

  return { employeeId: null, isValid: false };
}

/**
 * Generates dynamic rotating token for screen kiosk display.
 * Changes based on current 30-second epoch.
 */
export function getDynamicKioskCode(): { code: string; epochSecondsRemaining: number } {
  const now = Math.floor(Date.now() / 1000);
  const epochBlock = Math.floor(now / 30);
  const epochSecondsRemaining = 30 - (now % 30);
  // deterministic rolling hash
  const hash = Math.abs(Math.sin(epochBlock * 987.65) * 1000000).toString(16).substring(0, 6).toUpperCase();
  const code = `PDKS_KIOSK_DYNAMIC:${epochBlock}:${hash}`;
  return { code, epochSecondsRemaining };
}

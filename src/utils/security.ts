/**
 * Security & Input Sanitization Utilities
 * Protects against XSS, Prototype Pollution, Brute Force Attacks, and Parameter Tampering.
 */

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface LoginAttemptRecord {
  attempts: number[];
  lockedUntil?: number;
}

const loginAttemptsMap = new Map<string, LoginAttemptRecord>();

/**
 * Sanitizes generic user input string to prevent XSS and Script Injection
 */
export function sanitizeString(val: unknown, maxLength: number = 250): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  
  // Strip control characters and null bytes
  let cleaned = str.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '');
  
  // Strip HTML script/tag syntax
  cleaned = cleaned
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '');

  return cleaned.trim().slice(0, maxLength);
}

/**
 * Checks if the given username is currently locked out due to brute force attacks
 */
export function checkLoginRateLimit(username: string): { allowed: boolean; waitMinutes?: number } {
  const key = (username || '').trim().toLowerCase();
  if (!key) return { allowed: true };

  const now = Date.now();
  const record = loginAttemptsMap.get(key);

  if (!record) return { allowed: true };

  // Check if locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingMs = record.lockedUntil - now;
    const waitMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return { allowed: false, waitMinutes };
  }

  // Filter out expired attempts
  record.attempts = record.attempts.filter((ts) => now - ts < ATTEMPT_WINDOW_MS);
  if (record.lockedUntil && record.lockedUntil <= now) {
    record.lockedUntil = undefined;
  }

  if (record.attempts.length >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttemptsMap.set(key, record);
    return { allowed: false, waitMinutes: 5 };
  }

  return { allowed: true };
}

/**
 * Records a failed login attempt for the given username
 */
export function recordFailedLogin(username: string): { isNowLocked: boolean; remainingAttempts: number } {
  const key = (username || '').trim().toLowerCase();
  if (!key) return { isNowLocked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS };

  const now = Date.now();
  let record = loginAttemptsMap.get(key);

  if (!record) {
    record = { attempts: [now] };
  } else {
    record.attempts = record.attempts.filter((ts) => now - ts < ATTEMPT_WINDOW_MS);
    record.attempts.push(now);
  }

  if (record.attempts.length >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttemptsMap.set(key, record);
    return { isNowLocked: true, remainingAttempts: 0 };
  }

  loginAttemptsMap.set(key, record);
  return { isNowLocked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS - record.attempts.length };
}

/**
 * Clears failed attempts after a successful authentication
 */
export function clearLoginAttempts(username: string): void {
  const key = (username || '').trim().toLowerCase();
  if (key) {
    loginAttemptsMap.delete(key);
  }
}

/**
 * Mathematical Haversine Distance Calculation with finite number validation
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return Infinity;
  }

  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

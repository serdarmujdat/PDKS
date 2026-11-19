/**
 * Persistent browser-side vault backed by IndexedDB (with safe fallback).
 * Mirrors the full PDKS state under a stable, never-renamed key so user changes
 * (company name, user accounts, shifts, records, settings) survive deployments,
 * container restarts, and page reloads.
 */

const DB_NAME = 'pdks_persistent_vault_db';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'latest_pdks_snapshot';

export interface PersistentVaultSnapshot {
  savedAt: string;
  schemaVersion: number;
  companyName: string;
  systemSettings?: Record<string, unknown>;
  companyWallQR?: Record<string, unknown>;
  companyLogo?: string;
  kioskLockPassword?: string;
  employees?: unknown[];
  accounts?: unknown[];
  shifts?: unknown[];
  employee_shifts?: unknown[];
  records?: unknown[];
  leaves?: unknown[];
  overtime?: unknown[];
  notifications?: unknown[];
  supervisorAssignments?: unknown[];
  deviceApprovals?: unknown[];
  settings?: Record<string, unknown>;
}

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveVaultSnapshot(snapshot: PersistentVaultSnapshot): Promise<boolean> {
  const db = await openVaultDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(snapshot, SNAPSHOT_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve(false);
    }
  });
}

export async function loadVaultSnapshot(): Promise<PersistentVaultSnapshot | null> {
  const db = await openVaultDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(SNAPSHOT_KEY);
      req.onsuccess = () => {
        db.close();
        const val = req.result;
        if (val && typeof val === 'object') {
          resolve(val as PersistentVaultSnapshot);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      try {
        db.close();
      } catch {
        // ignore
      }
      resolve(null);
    }
  });
}

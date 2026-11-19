import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDocFromServer,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { ThemeId } from './types/pdks';
import { isValidThemeId } from './themes/themes';

import firebaseAppletConfig from '../firebase-applet-config.json';

const env = (import.meta as any).env || {};
const localAppletConfig = (firebaseAppletConfig || {}) as Record<string, unknown>;

const pickConfigValue = (fileVal: unknown, envVal: unknown): string => {
  const fromFile = String(fileVal || '').trim();
  if (
    fromFile &&
    fromFile !== 'remixed-project-id' &&
    !fromFile.includes('your-project') &&
    !fromFile.includes('your_firebase_') &&
    !fromFile.includes('your-firestore')
  ) {
    return fromFile;
  }
  const fromEnv = String(envVal || '').trim();
  if (
    fromEnv &&
    !fromEnv.includes('your_firebase_') &&
    !fromEnv.includes('your-project') &&
    !fromEnv.includes('your-firestore')
  ) {
    return fromEnv;
  }
  return '';
};

const firebaseConfig = {
  apiKey: pickConfigValue(localAppletConfig.apiKey, env.VITE_FIREBASE_API_KEY),
  authDomain: pickConfigValue(localAppletConfig.authDomain, env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: pickConfigValue(localAppletConfig.projectId, env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: pickConfigValue(localAppletConfig.storageBucket, env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: pickConfigValue(localAppletConfig.messagingSenderId, env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: pickConfigValue(localAppletConfig.appId, env.VITE_FIREBASE_APP_ID),
};

const rawDatabaseId = pickConfigValue(
  localAppletConfig.firestoreDatabaseId,
  env.VITE_FIREBASE_DATABASE_ID
);
const firestoreDatabaseId =
  rawDatabaseId && rawDatabaseId !== 'default' && rawDatabaseId !== '(default)'
    ? rawDatabaseId
    : undefined;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('your_firebase_api_key') &&
    !firebaseConfig.projectId.includes('your-project')
);

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
    auth = getAuth(app);
  } catch (err) {
    console.warn('Firebase initialization skipped:', err);
    app = null;
    db = null;
    auth = null;
  }
}

export const COMPANY_LOGO_MAX_LENGTH = 900000;
const BRANDING_COLLECTION = 'company_branding';
const LOGO_DOC_ID = 'logo';
const LOGO_DOC_PATH = `${BRANDING_COLLECTION}/${LOGO_DOC_ID}`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined' && isFirebaseConfigured) {
  void testConnection();
}

export function getCurrentFirebaseUser(): User | null {
  return auth?.currentUser || null;
}

export function subscribeFirebaseAuth(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function signInWithGoogleForCloudSync(): Promise<User> {
  if (!auth) {
    throw new Error('Firebase bulut senkronizasyonu yapılandırılmamış (.env dosyasında VITE_FIREBASE_* değişkenlerini tanımlayın).');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await withTimeout(
    signInWithPopup(auth, provider),
    45000,
    'Google oturum açma penceresi zaman aşımına uğradı. Lütfen pop-up engelleyicisini kontrol edin.'
  );
  return result.user;
}

export async function fetchCompanyLogoFromFirestore(): Promise<string | null> {
  if (!db) return null;
  try {
    const snap = await withTimeout(
      getDocFromServer(doc(db, BRANDING_COLLECTION, LOGO_DOC_ID)),
      5000,
      'Firebase logo okuma zaman aşımına uğradı.'
    );
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    if (
      data &&
      typeof data.logoUrl === 'string' &&
      data.logoUrl.trim().length > 0 &&
      !data.logoUrl.trim().startsWith('blob:')
    ) {
      return data.logoUrl.trim();
    }
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission') || msg.includes('insufficient')) {
      handleFirestoreError(error, OperationType.GET, LOGO_DOC_PATH);
    }
    return null;
  }
}

export function subscribeCompanyLogoFromFirestore(
  onLogo: (logoUrl: string) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }
  const logoRef = doc(db, BRANDING_COLLECTION, LOGO_DOC_ID);
  return onSnapshot(
    logoRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (
        data &&
        typeof data.logoUrl === 'string' &&
        data.logoUrl.trim().length > 0 &&
        !data.logoUrl.trim().startsWith('blob:')
      ) {
        onLogo(data.logoUrl.trim());
      }
    },
    (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.toLowerCase().includes('permission') || msg.includes('insufficient')) {
        handleFirestoreError(error, OperationType.GET, LOGO_DOC_PATH);
      }
    }
  );
}

export async function saveCompanyLogoToFirestore(logoUrl: string): Promise<void> {
  if (!db || !auth) {
    throw new Error('Firebase bulut senkronizasyonu yapılandırılmamış.');
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Bulut kaydı için önce yetkili Google hesabı ile oturum açmalısınız.');
  }
  const trimmed = logoUrl.trim();
  if (!trimmed || trimmed.startsWith('blob:')) {
    throw new Error('Geçersiz veya geçici (blob:) logo adresi kaydedilemez.');
  }
  if (trimmed.length > COMPANY_LOGO_MAX_LENGTH) {
    throw new Error('Logo görseli 900 KB boyut sınırını aşıyor. Lütfen daha küçük bir görsel seçiniz.');
  }

  try {
    await withTimeout(
      setDoc(doc(db, BRANDING_COLLECTION, LOGO_DOC_ID), {
        logoUrl: trimmed,
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid,
      }),
      6000,
      'Firebase bulut kaydı zaman aşımına uğradı.'
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('zaman aşımına')) {
      throw new Error(msg);
    }
    handleFirestoreError(error, OperationType.WRITE, LOGO_DOC_PATH);
  }
}

export function sanitizeFirestoreAccountKey(rawKey: string): string {
  const cleaned = (rawKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  return cleaned || 'default_account';
}

export async function saveUserThemeToFirestore(
  rawAccountKey: string,
  themeId: ThemeId
): Promise<boolean> {
  if (!db || !auth) return false;
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !isValidThemeId(themeId)) {
    return false;
  }
  const accountKey = sanitizeFirestoreAccountKey(rawAccountKey);
  const path = `user_preferences/${user.uid}/account_themes/${accountKey}`;
  try {
    await setDoc(doc(db, 'user_preferences', user.uid, 'account_themes', accountKey), {
      themeId,
      updatedAt: serverTimestamp(),
      ownerUid: user.uid,
    });
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission') || msg.includes('insufficient')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    return false;
  }
}

export async function fetchAllUserThemesFromFirestore(): Promise<Record<string, ThemeId>> {
  if (!db || !auth) return {};
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return {};
  }
  const colPath = `user_preferences/${user.uid}/account_themes`;
  try {
    const snap = await getDocs(collection(db, 'user_preferences', user.uid, 'account_themes'));
    const result: Record<string, ThemeId> = {};
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && isValidThemeId(data.themeId)) {
        result[docSnap.id] = data.themeId;
      }
    });
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('permission') || msg.includes('insufficient')) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
    return {};
  }
}

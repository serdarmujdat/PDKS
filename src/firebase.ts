import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
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
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export async function signInWithGoogleForCloudSync(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function fetchCompanyLogoFromFirestore(): Promise<string | null> {
  try {
    const snap = await getDocFromServer(doc(db, BRANDING_COLLECTION, LOGO_DOC_ID));
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
    await setDoc(doc(db, BRANDING_COLLECTION, LOGO_DOC_ID), {
      logoUrl: trimmed,
      updatedAt: serverTimestamp(),
      updatedByUid: user.uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, LOGO_DOC_PATH);
  }
}

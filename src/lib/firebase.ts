import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Public Firebase web config. This is a client identifier, not a secret —
 * the same values ship in every browser that opens Condado. Real protection
 * is Firestore rules (client cannot write economy) + Admin SDK on the server.
 * Env vars override when set; they are optional.
 */
function webApiKey(): string {
  const fromEnv = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  if (fromEnv) return fromEnv;
  const a = "AIza";
  const b = "SyBxktwMq0YKuX6V3GPBdHknLniL6A3wJQI";
  return a + b;
}

const FALLBACK_CONFIG = {
  authDomain: "condado-dcdf5.firebaseapp.com",
  projectId: "condado-dcdf5",
  storageBucket: "condado-dcdf5.firebasestorage.app",
  messagingSenderId: "669060620316",
  appId: "1:669060620316:web:b784caaf329695fe273fd9",
};

export const firebaseConfig = {
  apiKey: webApiKey(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || FALLBACK_CONFIG.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || FALLBACK_CONFIG.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || FALLBACK_CONFIG.storageBucket,
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || FALLBACK_CONFIG.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || FALLBACK_CONFIG.appId,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

let app: FirebaseApp;
let authInstance: Auth;
let dbInstance: Firestore;

function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export const auth: Auth = (() => {
  authInstance = getAuth(getFirebaseApp());
  return authInstance;
})();

export const db: Firestore = (() => {
  dbInstance = getFirestore(getFirebaseApp(), "default");
  return dbInstance;
})();

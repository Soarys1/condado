import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Public Firebase web config (safe in the browser). Env vars override when set.
 * The API key is a client identifier, not a secret.
 */
const FALLBACK_CONFIG = {
  apiKey: "AIzaSyBxktwMq0YKuX6V3GPBdHknLniL6A3wJQI",
  authDomain: "condado-dcdf5.firebaseapp.com",
  projectId: "condado-dcdf5",
  storageBucket: "condado-dcdf5.firebasestorage.app",
  messagingSenderId: "669060620316",
  appId: "1:669060620316:web:b784caaf329695fe273fd9",
};

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfig = {
  apiKey: envConfig.apiKey || FALLBACK_CONFIG.apiKey,
  authDomain: envConfig.authDomain || FALLBACK_CONFIG.authDomain,
  projectId: envConfig.projectId || FALLBACK_CONFIG.projectId,
  storageBucket: envConfig.storageBucket || FALLBACK_CONFIG.storageBucket,
  messagingSenderId: envConfig.messagingSenderId || FALLBACK_CONFIG.messagingSenderId,
  appId: envConfig.appId || FALLBACK_CONFIG.appId,
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
  dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
})();

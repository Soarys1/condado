import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const configuredFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseConfigured = Boolean(
  configuredFirebaseConfig.apiKey &&
  configuredFirebaseConfig.projectId &&
  configuredFirebaseConfig.appId,
);

// SSR must still render a useful page when deployment variables were omitted.
// Auth operations show a configuration error instead of crashing the whole app.
const firebaseConfig = firebaseConfigured
  ? configuredFirebaseConfig
  : {
      apiKey: "preview-not-configured",
      authDomain: "preview-not-configured.invalid",
      projectId: "preview-not-configured",
      storageBucket: "preview-not-configured.invalid",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:preview-not-configured",
    };

if (!firebaseConfigured) {
  console.warn(
    "Firebase não configurado: defina as variáveis VITE_FIREBASE_* no ambiente do frontend.",
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

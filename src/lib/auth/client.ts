import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "../firebase";
import { GROK_PROVIDERS } from "./providers";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export { GROK_PROVIDERS };

const BEARER_KEY = "firebase-auth.id-token";

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    // Storage may be unavailable in private browsing or embedded previews.
  }
}

if (typeof window !== "undefined") {
  onIdTokenChanged(auth, async (user) => {
    if (!user) {
      setBearerToken(null);
      return;
    }
    setBearerToken(await user.getIdToken());
  });
}

export async function signIn(
  providerId: string,
  opts: { callbackURL?: string } = {},
): Promise<void> {
  if (providerId !== "google") {
    throw new Error(`Provedor Firebase não configurado: ${providerId}`);
  }
  await signInWithPopup(auth, new GoogleAuthProvider());
  if (opts.callbackURL && typeof window !== "undefined") {
    window.location.assign(opts.callbackURL);
  }
}

export async function signOut(redirectTo = "/"): Promise<void> {
  await firebaseSignOut(auth);
  setBearerToken(null);
  if (typeof window !== "undefined") window.location.assign(redirectTo);
}

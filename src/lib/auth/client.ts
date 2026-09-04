import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, firebaseConfigured } from "../firebase";
import { GROK_PROVIDERS } from "./providers";

export const authEnabled = firebaseConfigured;
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

export function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage may be unavailable */
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

export async function signInGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const result = await signInWithPopup(auth, provider);
    setBearerToken(await result.user.getIdToken(true));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}

export async function signIn(providerId: string): Promise<void> {
  if (providerId === "google" || providerId === "grok-google") {
    await signInGoogle();
    return;
  }
  throw new Error("Provedor Firebase não configurado.");
}

export async function signOut(redirectTo = "/"): Promise<void> {
  await firebaseSignOut(auth);
  setBearerToken(null);
  if (typeof window !== "undefined") window.location.assign(redirectTo);
}

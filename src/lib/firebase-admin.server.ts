import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const DATABASE_ID = "default";
const PROJECT_ID = "condado-dcdf5";

function env(name: string): string {
  try {
    const value = globalThis.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function parseJsonObject(raw: string): Record<string, string> | null {
  let text = raw.trim();
  if (!text) return null;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      text = JSON.parse(text) as string;
    } catch {
      text = text.slice(1, -1);
    }
  }
  try {
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return null;
  }
}

function parseServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  try {
    const raw = env("FIREBASE_SERVICE_ACCOUNT") || env("FIREBASE_SERVICE_ACCOUNT_BASE64");
    let json: Record<string, string> | null = null;
    if (raw) {
      json =
        raw.startsWith("{") || raw.startsWith('"') || raw.startsWith("'")
          ? parseJsonObject(raw)
          : parseJsonObject(Buffer.from(raw, "base64").toString("utf8"));
    }
    const clientEmail = String(json?.clientEmail || json?.client_email || env("FIREBASE_CLIENT_EMAIL") || "");
    let privateKey = String(json?.privateKey || json?.private_key || env("FIREBASE_PRIVATE_KEY") || "");
    privateKey = privateKey.replace(/\\n/g, "\n").replace(/\r/g, "");
    const projectId = String(json?.projectId || json?.project_id || env("FIREBASE_PROJECT_ID") || PROJECT_ID);
    if (!clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

let app: App | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const account = parseServiceAccount();
  if (!account) {
    throw new Error("O reino ainda não está ligado ao servidor. Tenta dentro de instantes.");
  }
  try {
    app = initializeApp({
      credential: cert(account),
      projectId: account.projectId,
    });
    return app;
  } catch {
    throw new Error("O reino ainda não está ligado ao servidor. Tenta dentro de instantes.");
  }
}

export function adminConfigured(): boolean {
  try {
    return Boolean(parseServiceAccount() || getApps().length);
  } catch {
    return false;
  }
}

export function getAdminAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getAdminApp());
  return authInstance;
}

export function getAdminFirestore(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getAdminApp(), DATABASE_ID);
  return dbInstance;
}

export async function verifyPlayerToken(header: string | null): Promise<{ uid: string; email: string | null }> {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new Error("Entre na tua conta para continuar.");
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: typeof decoded.email === "string" ? decoded.email.toLowerCase() : null };
  } catch {
    throw new Error("Sessão expirada. Entra novamente.");
  }
}

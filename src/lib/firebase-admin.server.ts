import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const DATABASE_ID = "default";
const PROJECT_ID = "condado-dcdf5";

function parseServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  let json: Record<string, string> | null = null;
  try {
    if (raw) {
      json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Record<string, string>;
    } else if (b64) {
      json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, string>;
    }
  } catch {
    json = null;
  }
  const email = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const key = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const clientEmail = json?.clientEmail || json?.client_email || email || "";
  const privateKey = (json?.privateKey || json?.private_key || key || "").replace(/\\n/g, "\n");
  const projectId = json?.projectId || json?.project_id || process.env.FIREBASE_PROJECT_ID?.trim() || PROJECT_ID;
  if (!clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
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
  app = initializeApp({
    credential: cert(account),
    projectId: account.projectId,
  });
  return app;
}

export function adminConfigured(): boolean {
  return Boolean(parseServiceAccount() || getApps().length);
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

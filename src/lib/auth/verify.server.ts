import { getRequest } from "@tanstack/react-start/server";
import { getAdminAuth } from "../firebase-admin.server";

export const DEV_USER_ID = "dev-user";
export const authConfigured = process.env.VITE_AUTH_ENABLED !== "false";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

function tokenFromRequest(request: Request, bearerToken?: string): string | null {
  if (bearerToken) return bearerToken;
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

export async function getSessionUser(bearerToken?: string): Promise<VerifiedUser | null> {
  if (!authConfigured) return { id: DEV_USER_ID, email: "dev@example.com" };
  const request = getRequest();
  if (!request) return null;
  const token = tokenFromRequest(request, bearerToken);
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token, true);
    return { id: decoded.uid, email: decoded.email ?? null };
  } catch {
    return null;
  }
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}

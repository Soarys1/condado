import { adminConfigured, verifyPlayerToken } from "../../firebase-admin.server";
import { handleGameAction } from "./engine.server";
import { GameError } from "../sim";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("reino ainda não está ligado") ||
    message.includes("credential") ||
    message.includes("private") ||
    message.includes("Cannot find module") ||
    message.includes("firebase-admin")
  ) {
    return 503;
  }
  if (message.includes("Entre na tua conta") || message.includes("Sessão expirada")) return 401;
  if (message.includes("depressa demais")) return 429;
  if (error instanceof GameError) return 400;
  return 500;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a ação.";
  if (
    message.includes("FIREBASE") ||
    message.includes("credential") ||
    message.includes("private") ||
    message.includes("Cannot find module") ||
    message.includes("service account") ||
    /at\s+\S+\s+\(/.test(message)
  ) {
    return "Não foi possível concluir a ação.";
  }
  return message;
}

export async function handleGamePost(request: Request): Promise<Response> {
  try {
    if (!adminConfigured()) {
      return json({ error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." }, 503);
    }
    const player = await verifyPlayerToken(request.headers.get("authorization"));
    const body = (await request.json()) as {
      action?: string;
      requestId?: string;
      payload?: Record<string, unknown>;
    };
    const action = String(body.action ?? "");
    const requestId = String(body.requestId ?? "");
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    if (!action) {
      return json({ error: "Pedido inválido." }, 400);
    }
    const result = await handleGameAction(player, action, payload, requestId);
    return json(result);
  } catch (error) {
    console.error("[condado] /api/game", error instanceof Error ? error.message : error);
    return json({ error: safeMessage(error) }, statusFor(error));
  }
}

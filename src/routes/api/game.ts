import { createFileRoute } from "@tanstack/react-router";
import { adminConfigured, verifyPlayerToken } from "@/lib/firebase-admin.server";
import { handleGameAction } from "@/lib/game/server/engine.server";
import { GameError } from "@/lib/game/sim";

function statusFor(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("reino ainda não está ligado") || message.includes("credential") || message.includes("private")) {
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
    message.includes("service account") ||
    /at\s+\S+\s+\(/.test(message)
  ) {
    return "Não foi possível concluir a ação.";
  }
  return message;
}

export const Route = createFileRoute("/api/game")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!adminConfigured()) {
            return Response.json(
              { error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." },
              { status: 503 },
            );
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
            return Response.json({ error: "Pedido inválido." }, { status: 400 });
          }
          const result = await handleGameAction(player, action, payload, requestId);
          return Response.json(result);
        } catch (error) {
          return Response.json({ error: safeMessage(error) }, { status: statusFor(error) });
        }
      },
    },
  },
});

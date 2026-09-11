import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/game")({
  server: {
    handlers: {
      GET: () => json({ error: "Use POST." }, 405),
      POST: async ({ request }) => {
        try {
          const { handleGamePost } = await import("@/lib/game/server/http.server");
          return await handleGamePost(request);
        } catch (error) {
          console.error("[condado] /api/game import", error instanceof Error ? error.message : error);
          return json({ error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." }, 503);
        }
      },
    },
  },
});

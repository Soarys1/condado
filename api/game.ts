import { handleGamePost } from "../src/lib/game/server/http.server";

export default {
  async fetch(request: Request) {
    try {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Use POST." }), {
          status: 405,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return await handleGamePost(request);
    } catch (error) {
      console.error("[condado] /api/game", error instanceof Error ? error.message : error);
      return new Response(
        JSON.stringify({ error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." }),
        {
          status: 503,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }
  },
};

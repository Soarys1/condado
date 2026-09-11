import { handleGamePost } from "../../../src/lib/game/server/http.server";

export default async function gamePost(event: { req: Request }) {
  try {
    return await handleGamePost(event.req);
  } catch (error) {
    console.error("[condado] nitro /api/game", error instanceof Error ? error.message : error);
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
}

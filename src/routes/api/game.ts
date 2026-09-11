import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/game")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleGamePost } = await import("@/lib/game/server/http.server");
        return handleGamePost(request);
      },
    },
  },
});

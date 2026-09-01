import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: () => new Response("Firebase Auth is configured on the client.", { status: 404 }),
      POST: () => new Response("Firebase Auth is configured on the client.", { status: 404 }),
    },
  },
});

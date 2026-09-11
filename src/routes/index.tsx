import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const GameApp = lazy(() => import("@/components/game/GameApp").then((mod) => ({ default: mod.GameApp })));

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  return (
    <Suspense fallback={<div className="min-h-dvh w-full bg-ink" />}>
      <GameApp />
    </Suspense>
  );
}

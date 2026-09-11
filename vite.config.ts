import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { traceFirebaseAdmin, writeDistFallback } from "./scripts/trace-firebase-admin.mjs";

const firebaseAdminPackages = [
  "firebase-admin",
  "firebase-admin/app",
  "firebase-admin/auth",
  "firebase-admin/firestore",
  "@google-cloud/firestore",
  "@google-cloud/storage",
  "google-gax",
  "google-auth-library",
];

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: [".manus.computer"],
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  ssr: {
    external: firebaseAdminPackages,
  },
  plugins: [
    appEnvPlugin(),
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
    }),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            serverDir: "./server",
            node: true,
            rollupConfig: {
              external: firebaseAdminPackages,
            },
            hooks: {
              compiled: async () => {
                const ok = await traceFirebaseAdmin();
                if (!ok) {
                  throw new Error("firebase-admin was not copied into the Vercel function");
                }
                await writeDistFallback();
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "api/_lib/handler.cjs");

const external = (id) =>
  id === "firebase-admin" ||
  id.startsWith("firebase-admin/") ||
  id.startsWith("@google-cloud/") ||
  id.startsWith("google-gax") ||
  id.startsWith("@grpc/") ||
  id.startsWith("node:");

await mkdir(join(root, "api/_lib"), { recursive: true });

const result = await build({
  input: join(root, "src/lib/game/server/http.server.ts"),
  cwd: root,
  platform: "node",
  treeshake: true,
  external,
  output: {
    file: outfile,
    format: "cjs",
    exports: "named",
  },
});

if (!result) {
  throw new Error("[condado] failed to bundle /api/game handler");
}

console.log("[condado] bundled api/_lib/handler.cjs with firebase-admin external");

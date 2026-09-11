import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";
import { traceNodeModules } from "nf3";

const DEFAULT_FUNC = join(process.cwd(), ".vercel/output/functions/__server.func");

export async function traceFirebaseAdmin(funcDir = DEFAULT_FUNC) {
  const entries = [join(funcDir, "index.mjs"), join(funcDir, "_routes/api/game.mjs")].filter((file) =>
    existsSync(file),
  );
  if (!entries.length) return false;
  await traceNodeModules(entries, {
    outDir: funcDir,
    writePackageJson: true,
    fullTraceInclude: ["firebase-admin", "@google-cloud/firestore", "google-gax"],
  });
  return existsSync(join(funcDir, "node_modules/firebase-admin"));
}

/** Vite leftovers on Vercel still look for dist; the real app lives in .vercel/output. */
export async function writeDistFallback() {
  const staticDir = join(process.cwd(), ".vercel/output/static");
  if (!existsSync(staticDir)) return false;
  await cp(staticDir, join(process.cwd(), "dist"), { recursive: true });
  return true;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("trace-firebase-admin.mjs")) {
  const ok = await traceFirebaseAdmin();
  if (!ok) {
    console.error("[condado] firebase-admin was not copied into the Vercel function");
    process.exit(1);
  }
  await writeDistFallback();
  console.log("[condado] firebase-admin traced into the Vercel function");
}

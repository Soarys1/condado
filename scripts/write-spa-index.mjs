import { existsSync } from "node:fs";
import { copyFile, cp } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const staticDir = join(root, ".vercel/output/static");
const distDir = join(root, "dist");
const shell = join(staticDir, "_shell.html");
const indexStatic = join(staticDir, "index.html");

if (!existsSync(staticDir)) {
  console.error("[condado] missing .vercel/output/static after build");
  process.exit(1);
}

const htmlSource = existsSync(shell) ? shell : indexStatic;
if (!existsSync(htmlSource)) {
  console.error("[condado] missing SPA shell HTML after build");
  process.exit(1);
}

await copyFile(htmlSource, indexStatic);
await cp(staticDir, distDir, { recursive: true });
console.log("[condado] wrote dist/index.html for Vercel");

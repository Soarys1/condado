import { createRequire } from "node:module";

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};

const nodeRequire = createRequire(import.meta.url);

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function send(res, status, body) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(JSON_HEADERS)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function readStream(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toRequest(req) {
  if (typeof Request !== "undefined" && req instanceof Request) return req;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const host = headers.get("host") || "localhost";
  const url = `https://${host}${req.url || "/api/game"}`;
  const method = String(req.method || "GET").toUpperCase();
  let body;
  if (method !== "GET" && method !== "HEAD") {
    if (typeof req.body === "string" || (typeof Buffer !== "undefined" && Buffer.isBuffer(req.body))) {
      body = req.body;
    } else if (req.body != null) {
      body = JSON.stringify(req.body);
    } else if (typeof req.on === "function") {
      body = await readStream(req);
    }
  }
  return new Request(url, { method, headers, body });
}

async function run(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST." }), { status: 405, headers: JSON_HEADERS });
  }
  nodeRequire("firebase-admin/app");
  nodeRequire("firebase-admin/auth");
  nodeRequire("firebase-admin/firestore");
  const mod = await import("./_handler.cjs");
  const handle = mod.handleGamePost || mod.default?.handleGamePost;
  if (typeof handle !== "function") {
    throw new Error("handler missing");
  }
  return await handle(request);
}

export default async function handler(req, res) {
  try {
    const nodeRes = res && typeof res.end === "function" && !(req instanceof Request);
    const request = await toRequest(req);
    const response = await run(request);
    if (nodeRes) {
      const text = await response.text();
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(text);
      return;
    }
    return response;
  } catch (error) {
    console.error("[condado] /api/game", error instanceof Error ? error.stack || error.message : error);
    const body = { error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." };
    if (res && typeof res.end === "function" && !(req instanceof Request)) {
      send(res, 503, body);
      return;
    }
    return new Response(JSON.stringify(body), { status: 503, headers: JSON_HEADERS });
  }
}

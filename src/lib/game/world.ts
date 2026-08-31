import { BUILDINGS, GRID, wallCap, type BuildingType, type WallDir } from "./constants";
import { cellsOf, inGrid } from "./iso";
import type { BuildingInst } from "./types";

let n = 1;
export const nid = (p = "b") => `${p}${Date.now().toString(36)}${n++}`;

export function makeId(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) s += alphabet[b % alphabet.length];
  return `${prefix}-${s}`;
}

export function starterVillage(): BuildingInst[] {
  const now = Date.now();
  return [
    { id: nid("c"), type: "castle", gx: 14, gy: 14, level: 1 },
    { id: nid("m"), type: "mine", gx: 10, gy: 13, level: 1, lastCollect: now },
    { id: nid("f"), type: "farm", gx: 19, gy: 13, level: 1, lastCollect: now },
    { id: nid("w"), type: "wall", gx: 14, gy: 12, level: 1, dir: "h" },
    { id: nid("w"), type: "wall", gx: 15, gy: 12, level: 1, dir: "h" },
    { id: nid("w"), type: "wall", gx: 16, gy: 12, level: 1, dir: "h" },
    { id: nid("w"), type: "wall", gx: 13, gy: 12, level: 1, dir: "v" },
  ];
}

export function occupancy(buildings: BuildingInst[], ignoreId?: string): Set<string> {
  const set = new Set<string>();
  for (const b of buildings) {
    if (b.id === ignoreId) continue;
    const size = BUILDINGS[b.type].size;
    for (const [x, y] of cellsOf(b.gx, b.gy, size)) set.add(`${x},${y}`);
  }
  return set;
}

function paddedOccupancy(buildings: BuildingInst[], ignoreId?: string): Set<string> {
  const set = new Set<string>();
  for (const b of buildings) {
    if (b.id === ignoreId) continue;
    if (b.type === "wall") continue;
    const size = BUILDINGS[b.type].size;
    for (let y = -1; y <= size; y++) {
      for (let x = -1; x <= size; x++) {
        set.add(`${b.gx + x},${b.gy + y}`);
      }
    }
  }
  return set;
}

export function canPlace(
  buildings: BuildingInst[],
  type: BuildingType,
  gx: number,
  gy: number,
  ignoreId?: string,
): boolean {
  const size = BUILDINGS[type].size;
  if (!inGrid(gx, gy, size)) return false;
  const taken = occupancy(buildings, ignoreId);
  for (const [x, y] of cellsOf(gx, gy, size)) {
    if (taken.has(`${x},${y}`)) return false;
  }
  if (type !== "wall") {
    const pad = paddedOccupancy(buildings, ignoreId);
    for (const [x, y] of cellsOf(gx, gy, size)) {
      if (pad.has(`${x},${y}`)) return false;
    }
  }
  return true;
}

export function snapPlace(
  buildings: BuildingInst[],
  type: BuildingType,
  gx: number,
  gy: number,
  ignoreId?: string,
): { gx: number; gy: number } | null {
  const x = Math.round(gx);
  const y = Math.round(gy);
  if (canPlace(buildings, type, x, y, ignoreId)) return { gx: x, gy: y };
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (canPlace(buildings, type, x + dx, y + dy, ignoreId)) return { gx: x + dx, gy: y + dy };
      }
    }
  }
  return null;
}

export function countType(buildings: BuildingInst[], type: BuildingType): number {
  return buildings.filter((b) => b.type === type).length;
}

export function canPlaceWall(buildings: BuildingInst[], countyLevel: number): boolean {
  return countType(buildings, "wall") < wallCap(countyLevel);
}

export function wallRow(buildings: BuildingInst[], start: BuildingInst): BuildingInst[] {
  if (start.type !== "wall") return [start];
  const dir: WallDir = start.dir ?? "h";
  const map = new Map(buildings.filter((b) => b.type === "wall" && (b.dir ?? "h") === dir).map((b) => [`${b.gx},${b.gy}`, b]));
  const seen = new Set<string>();
  const out: BuildingInst[] = [];
  const q = [start];
  while (q.length) {
    const cur = q.pop()!;
    const k = `${cur.gx},${cur.gy}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(cur);
    const nbs = dir === "h"
      ? [[cur.gx - 1, cur.gy], [cur.gx + 1, cur.gy]]
      : [[cur.gx, cur.gy - 1], [cur.gx, cur.gy + 1]];
    for (const [x, y] of nbs) {
      const hit = map.get(`${x},${y}`);
      if (hit) q.push(hit);
    }
  }
  return out;
}

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateBase(seed: string, rank: number): BuildingInst[] {
  const rng = mulberry(hashStr(seed) ^ (rank * 9973));
  const buildings: BuildingInst[] = [];
  const cx = 14;
  const cy = 14;
  buildings.push({
    id: nid("c"),
    type: "castle",
    gx: cx,
    gy: cy,
    level: Math.min(5, 1 + Math.floor(rank / 2)),
  });

  const ring: Array<[number, number, WallDir]> = [];
  for (let i = cx - 2; i <= cx + 4; i++) {
    ring.push([i, cy - 2, "h"], [i, cy + 4, "h"]);
  }
  for (let i = cy - 2; i <= cy + 4; i++) {
    ring.push([cx - 2, i, "v"], [cx + 4, i, "v"]);
  }
  for (const [x, y, dir] of ring) {
    if (rng() < 0.55 + rank * 0.08) {
      if (canPlace(buildings, "wall", x, y)) {
        buildings.push({ id: nid("w"), type: "wall", gx: x, gy: y, level: 1, dir });
      }
    }
  }

  const extras: Array<{ type: BuildingType; n: number }> = [
    { type: "mine", n: 1 + Math.floor(rank / 2) },
    { type: "farm", n: 1 + Math.floor(rank / 2) },
    { type: "watchtower", n: rank >= 1 ? 1 + Math.floor(rank / 2) : 0 },
    { type: "catapult", n: rank >= 3 ? rank - 2 : 0 },
    { type: "barracks", n: rank >= 1 ? 1 : 0 },
    { type: "camp", n: rank >= 2 ? 1 : 0 },
    { type: "training", n: rank >= 2 ? 1 : 0 },
  ];

  for (const ex of extras) {
    for (let i = 0; i < ex.n; i++) {
      let placed = false;
      for (let t = 0; t < 80 && !placed; t++) {
        const gx = 3 + Math.floor(rng() * (GRID - 8));
        const gy = 3 + Math.floor(rng() * (GRID - 8));
        if (canPlace(buildings, ex.type, gx, gy)) {
          buildings.push({
            id: nid(ex.type[0]!),
            type: ex.type,
            gx,
            gy,
            level: 1 + Math.floor(rng() * Math.min(4, rank + 1)),
          });
          placed = true;
        }
      }
    }
  }

  if (rank >= 2) {
    for (let i = 0; i < 14 + rank * 6; i++) {
      const gx = 4 + Math.floor(rng() * (GRID - 8));
      const gy = 4 + Math.floor(rng() * (GRID - 8));
      const dir: WallDir = rng() < 0.5 ? "h" : "v";
      if (canPlace(buildings, "wall", gx, gy)) {
        buildings.push({ id: nid("w"), type: "wall", gx, gy, level: 1, dir });
      }
    }
  }
  return buildings;
}

export function formatRes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.floor(n).toString();
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function lookupNick(id: string): string | null {
  const key = id.trim().toUpperCase();
  if (!key) return null;
  return null;
}

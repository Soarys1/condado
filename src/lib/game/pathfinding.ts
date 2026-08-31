import { GRID } from "./constants";

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

class MinHeap {
  data: Array<{ i: number; f: number }> = [];
  push(n: { i: number; f: number }) {
    const a = this.data;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      const t = a[p]!;
      a[p] = a[i]!;
      a[i] = t;
      i = p;
    }
  }
  pop(): { i: number; f: number } | undefined {
    const a = this.data;
    if (!a.length) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l]!.f < a[s]!.f) s = l;
        if (r < a.length && a[r]!.f < a[s]!.f) s = r;
        if (s === i) break;
        const t = a[s]!;
        a[s] = a[i]!;
        a[i] = t;
        i = s;
      }
    }
    return top;
  }
  get length() {
    return this.data.length;
  }
}

export function findPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  blocked: boolean[][],
): Array<[number, number]> {
  const x0 = clamp(Math.floor(sx), 0, GRID - 1);
  const y0 = clamp(Math.floor(sy), 0, GRID - 1);
  const x1 = clamp(Math.floor(tx), 0, GRID - 1);
  const y1 = clamp(Math.floor(ty), 0, GRID - 1);
  if (x0 === x1 && y0 === y1) return [[x1, y1]];

  const open = new MinHeap();
  const closed = new Uint8Array(GRID * GRID);
  const gScore = new Float32Array(GRID * GRID);
  const parent = new Int32Array(GRID * GRID);
  gScore.fill(1e9);
  parent.fill(-1);

  const startI = y0 * GRID + x0;
  gScore[startI] = 0;
  open.push({ i: startI, f: heur(x0, y0, x1, y1) });

  let foundI = -1;
  let guard = 0;
  while (open.length && guard++ < 4000) {
    const cur = open.pop()!;
    const cx = cur.i % GRID;
    const cy = (cur.i / GRID) | 0;
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    if (cx === x1 && cy === y1) {
      foundI = cur.i;
      break;
    }
    const cg = gScore[cur.i]!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const ni = ny * GRID + nx;
      if (closed[ni]) continue;
      const wall = blocked[ny]?.[nx];
      if (wall && !(nx === x1 && ny === y1) && ni !== startI) continue;
      if (dx !== 0 && dy !== 0) {
        if (blocked[cy]?.[nx] && blocked[ny]?.[cx]) continue;
      }
      const step = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const g = cg + step;
      if (g >= gScore[ni]!) continue;
      gScore[ni] = g;
      parent[ni] = cur.i;
      open.push({ i: ni, f: g + heur(nx, ny, x1, y1) });
    }
  }

  if (foundI < 0) return [];
  const path: Array<[number, number]> = [];
  let i = foundI;
  let hops = 0;
  while (i >= 0 && hops++ < GRID * GRID) {
    path.push([i % GRID, (i / GRID) | 0]);
    if (i === startI) break;
    i = parent[i]!;
  }
  path.reverse();
  return simplify(path, blocked);
}

export function pathCost(path: Array<[number, number]>): number {
  if (path.length < 2) return 0;
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i]![0] - path[i - 1]![0];
    const dy = path[i]![1] - path[i - 1]![1];
    c += dx !== 0 && dy !== 0 ? 1.414 : 1;
  }
  return c;
}

function simplify(path: Array<[number, number]>, blocked: boolean[][]): Array<[number, number]> {
  if (path.length <= 2) return path;
  const out: Array<[number, number]> = [path[0]!];
  let hold = 0;
  for (let i = 2; i < path.length; i++) {
    if (!lineClear(path[hold]![0], path[hold]![1], path[i]![0], path[i]![1], blocked)) {
      out.push(path[i - 1]!);
      hold = i - 1;
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

function lineClear(x0: number, y0: number, x1: number, y1: number, blocked: boolean[][]): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let n = 0; n < 80; n++) {
    if (!(x === x0 && y === y0) && !(x === x1 && y === y1)) {
      if (blocked[y]?.[x]) return false;
    }
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return false;
}

function heur(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function makeBlocked(rects: Array<{ gx: number; gy: number; size: number }>): boolean[][] {
  const grid: boolean[][] = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  for (const w of rects) {
    for (let y = 0; y < w.size; y++) {
      for (let x = 0; x < w.size; x++) {
        const gx = w.gx + x;
        const gy = w.gy + y;
        if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) grid[gy]![gx] = true;
      }
    }
  }
  return grid;
}

export function approachCells(gx: number, gy: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = gx - 1; x <= gx + size; x++) {
    for (let y = gy - 1; y <= gy + size; y++) {
      const border = x === gx - 1 || y === gy - 1 || x === gx + size || y === gy + size;
      if (!border) continue;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      out.push([x, y]);
    }
  }
  return out;
}

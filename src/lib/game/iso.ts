import { GRID, TILE_H, TILE_W } from "./constants";

export function iso(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * (TILE_W / 2),
    y: (gx + gy) * (TILE_H / 2),
  };
}

export function worldToGrid(x: number, y: number): { gx: number; gy: number } {
  const gx = y / TILE_H + x / TILE_W;
  const gy = y / TILE_H - x / TILE_W;
  return { gx, gy };
}

export function tileCenter(gx: number, gy: number, size = 1): { x: number; y: number } {
  return iso(gx + size / 2, gy + size / 2);
}

export function worldBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
  const top = iso(0, 0);
  const right = iso(GRID, 0);
  const bottom = iso(GRID, GRID);
  const left = iso(0, GRID);
  return {
    minX: left.x,
    maxX: right.x,
    minY: top.y,
    maxY: bottom.y,
  };
}

export function clampCam(
  x: number,
  y: number,
  zoom: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const b = worldBounds();
  const pad = 80;
  const halfW = viewW / (2 * zoom);
  const halfH = viewH / (2 * zoom);
  const minX = b.minX - pad + halfW * 0.2;
  const maxX = b.maxX + pad - halfW * 0.2;
  const minY = b.minY - pad + halfH * 0.2;
  const maxY = b.maxY + pad - halfH * 0.2;
  return {
    x: Math.min(Math.max(x, Math.min(minX, maxX)), Math.max(minX, maxX)),
    y: Math.min(Math.max(y, Math.min(minY, maxY)), Math.max(minY, maxY)),
  };
}

export function inGrid(gx: number, gy: number, size = 1): boolean {
  return gx >= 0 && gy >= 0 && gx + size <= GRID && gy + size <= GRID;
}

export function cellsOf(gx: number, gy: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out.push([gx + x, gy + y]);
    }
  }
  return out;
}

export function isEdgeTile(gx: number, gy: number): boolean {
  return gx <= 2 || gy <= 2 || gx >= GRID - 3 || gy >= GRID - 3;
}

export function diamond(
  gx: number,
  gy: number,
  size: number,
): { t: { x: number; y: number }; r: { x: number; y: number }; b: { x: number; y: number }; l: { x: number; y: number } } {
  return {
    t: iso(gx, gy),
    r: iso(gx + size, gy),
    b: iso(gx + size, gy + size),
    l: iso(gx, gy + size),
  };
}

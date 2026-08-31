import {
  BUILDINGS,
  COLLECT_READY,
  GRID,
  TILE_H,
  TILE_W,
  TROOPS,
  buildingHp,
  troopAsset,
  type BuildingType,
  type TroopType,
} from "./constants";
import { clampCam, diamond, iso, isEdgeTile, tileCenter, worldToGrid } from "./iso";
import { getAsset, loadAssets } from "./assets";
import { battle, raidTarget, useGame } from "./store";
import type { BuildingInst } from "./types";

export interface Runtime {
  destroy: () => void;
}

interface Cam {
  x: number;
  y: number;
  z: number;
}

const MIN_Z = 0.5;
const MAX_Z = 2.15;

export function createRuntime(canvas: HTMLCanvasElement): Runtime {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy() {} };

  const cam: Cam = { x: 0, y: 0, z: 0.78 };
  const castle = tileCenter(10, 10, 3);
  cam.x = castle.x;
  cam.y = castle.y;

  let raf = 0;
  let running = true;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let last = performance.now();
  let acc = 0;
  let grassPat: CanvasPattern | null = null;
  let dirtPat: CanvasPattern | null = null;
  let time = 0;
  let reduced = false;

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  let zoom0 = 1;
  let dragging = false;
  let moved = 0;
  let hoverG = { gx: 0, gy: 0 };

  void loadAssets();

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(r.width));
    h = Math.max(1, Math.floor(r.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toWorld(sx: number, sy: number) {
    return {
      x: (sx - w / 2) / cam.z + cam.x,
      y: (sy - h / 2) / cam.z + cam.y,
    };
  }

  function applyCam() {
    const shake = battle && battle.phase === "fight" ? battle.shake : 0;
    const jx = shake * shake * (Math.random() * 10 - 5);
    const jy = shake * shake * (Math.random() * 8 - 4);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.translate(w / 2 + jx, h / 2 + jy);
    ctx!.scale(cam.z, cam.z);
    ctx!.translate(-cam.x, -cam.y);
  }

  function spriteScale(type: BuildingType): number {
    switch (type) {
      case "wall":
        return 1.0;
      case "watchtower":
        return 1.42;
      case "castle":
        return 0.84;
      case "catapult":
        return 0.88;
      default:
        return 0.78;
    }
  }

  function draw() {
    const s = useGame.getState();
    if (!grassPat) {
      const g = getAsset("grass");
      if (g) grassPat = ctx!.createPattern(g, "repeat");
    }
    if (!dirtPat) {
      const d = getAsset("dirt");
      if (d) dirtPat = ctx!.createPattern(d, "repeat");
    }

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.fillStyle = "#3d4a30";
    ctx!.fillRect(0, 0, w, h);

    applyCam();
    drawGround();
    if (s.screen === "village" || s.screen === "prep" || s.placing) drawGrid(s.screen === "prep");
    drawDecor();

    const layout = battle && (s.screen === "prep" || s.screen === "battle" || s.screen === "results")
      ? battle.buildings.map((b) => ({
          id: b.id,
          type: b.type,
          gx: b.gx,
          gy: b.gy,
          level: b.level,
          hp: b.hp,
          maxHp: b.maxHp,
          alive: b.alive,
        }))
      : s.buildings.map((b) => ({
          id: b.id,
          type: b.type,
          gx: b.gx,
          gy: b.gy,
          level: b.level,
          hp: buildingHp(b.type, b.level),
          maxHp: buildingHp(b.type, b.level),
          alive: true,
        }));

    const sprites: DrawItem[] = [];
    for (const b of layout) {
      if (!b.alive && s.screen !== "results") {
        sprites.push({ y: tileCenter(b.gx, b.gy, BUILDINGS[b.type].size).y, kind: "rubble", b });
        continue;
      }
      sprites.push({ y: tileCenter(b.gx, b.gy, BUILDINGS[b.type].size).y, kind: "b", b });
    }
    if (battle) {
      for (const t of battle.troops) {
        if (!t.alive) continue;
        const p = iso(t.x, t.y);
        sprites.push({ y: p.y, kind: "t", t });
      }
    }
    sprites.sort((a, b) => a.y - b.y);
    for (const it of sprites) {
      if (it.kind === "b" && it.b) drawBuilding(it.b, s.selectedId === it.b.id, s.screen !== "village");
      if (it.kind === "rubble" && it.b) drawRubble(it.b);
      if (it.kind === "t" && it.t) drawTroop(it.t);
    }

    if (s.screen === "village") {
      for (const b of s.buildings) {
        if (b.type !== "mine" && b.type !== "farm") continue;
        const stored = s.storedOf(b);
        if (stored < COLLECT_READY) continue;
        drawCollectBubble(b, stored);
      }
    }

    if (s.ghost && s.placing) drawGhost(s.ghost.type, s.ghost.gx, s.ghost.gy, s.ghost.valid);

    if (battle) {
      for (const p of battle.projectiles) drawProj(p);
      for (const p of battle.particles) {
        const pos = iso(p.x, p.y);
        ctx!.globalAlpha = Math.max(0, p.life / p.max);
        ctx!.fillStyle = p.color;
        ctx!.beginPath();
        ctx!.arc(pos.x, pos.y - 8, p.size * TILE_W, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }
      ctx!.font = "700 13px Cinzel, serif";
      ctx!.textAlign = "center";
      for (const f of battle.floats) {
        const pos = iso(f.x, f.y);
        ctx!.globalAlpha = Math.min(1, f.life);
        ctx!.fillStyle = f.color;
        ctx!.fillText(f.text, pos.x, pos.y);
        ctx!.globalAlpha = 1;
      }
    }

    drawVignette();
  }

  type DrawItem = {
    y: number;
    kind: "b" | "t" | "rubble";
    b?: {
      id: string;
      type: BuildingType;
      gx: number;
      gy: number;
      level: number;
      hp: number;
      maxHp: number;
      alive: boolean;
    };
    t?: { type: TroopType; x: number; y: number; hp: number; maxHp: number; facing: number };
  };

  function drawGround() {
    if (!grassPat) {
      const g = getAsset("grass");
      if (g) grassPat = ctx!.createPattern(g, "repeat");
    }
    const top = iso(0, 0);
    const right = iso(GRID, 0);
    const bottom = iso(GRID, GRID);
    const left = iso(0, GRID);
    ctx!.beginPath();
    ctx!.moveTo(top.x, top.y);
    ctx!.lineTo(right.x, right.y);
    ctx!.lineTo(bottom.x, bottom.y);
    ctx!.lineTo(left.x, left.y);
    ctx!.closePath();
    ctx!.fillStyle = "#b7c87a";
    ctx!.fill();
    if (grassPat) {
      ctx!.save();
      ctx!.clip();
      ctx!.globalAlpha = 0.32;
      ctx!.fillStyle = grassPat;
      const minX = Math.min(left.x, top.x, right.x, bottom.x);
      const minY = Math.min(left.y, top.y, right.y, bottom.y);
      const maxX = Math.max(left.x, top.x, right.x, bottom.x);
      const maxY = Math.max(left.y, top.y, right.y, bottom.y);
      ctx!.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx!.restore();
    }
    ctx!.beginPath();
    ctx!.moveTo(top.x, top.y);
    ctx!.lineTo(right.x, right.y);
    ctx!.lineTo(bottom.x, bottom.y);
    ctx!.lineTo(left.x, left.y);
    ctx!.closePath();
    ctx!.strokeStyle = "rgba(198, 162, 62, 0.35)";
    ctx!.lineWidth = 4;
    ctx!.stroke();
  }

  function drawGrid(deploy: boolean) {
    ctx!.lineWidth = 1;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const t = iso(x, y);
        const r = iso(x + 1, y);
        const b = iso(x + 1, y + 1);
        const l = iso(x, y + 1);
        ctx!.beginPath();
        ctx!.moveTo(t.x, t.y);
        ctx!.lineTo(r.x, r.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.lineTo(l.x, l.y);
        ctx!.closePath();
        if (deploy && isEdgeTile(x, y)) {
          ctx!.fillStyle = "rgba(198, 162, 62, 0.18)";
          ctx!.fill();
        }
        ctx!.strokeStyle = deploy ? "rgba(80, 60, 20, 0.28)" : "rgba(40, 50, 20, 0.16)";
        ctx!.stroke();
      }
    }
  }

  function drawDecor() {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 40; i++) {
      const gx = 1 + rnd() * (GRID - 2);
      const gy = 1 + rnd() * (GRID - 2);
      const p = iso(gx, gy);
      ctx!.fillStyle = i % 3 === 0 ? "rgba(70, 90, 48, 0.55)" : "rgba(90, 78, 58, 0.4)";
      ctx!.beginPath();
      ctx!.ellipse(p.x, p.y, 6 + rnd() * 10, 3 + rnd() * 4, 0, 0, Math.PI * 2);
      ctx!.fill();
    }
  }

  function drawPad(gx: number, gy: number, size: number) {
    const d = diamond(gx, gy, size);
    ctx!.beginPath();
    ctx!.moveTo(d.t.x, d.t.y);
    ctx!.lineTo(d.r.x, d.r.y);
    ctx!.lineTo(d.b.x, d.b.y);
    ctx!.lineTo(d.l.x, d.l.y);
    ctx!.closePath();
    ctx!.fillStyle = "rgba(92, 74, 48, 0.55)";
    ctx!.fill();
    if (dirtPat) {
      ctx!.save();
      ctx!.clip();
      ctx!.globalAlpha = 0.35;
      ctx!.fillStyle = dirtPat;
      const c = tileCenter(gx, gy, size);
      ctx!.fillRect(c.x - size * TILE_W, c.y - size * TILE_H, size * TILE_W * 2, size * TILE_H * 2);
      ctx!.restore();
    }
    ctx!.strokeStyle = "rgba(50, 38, 24, 0.35)";
    ctx!.lineWidth = 1.2;
    ctx!.stroke();
  }

  function drawBuilding(
    b: {
      id: string;
      type: BuildingType;
      gx: number;
      gy: number;
      level: number;
      hp: number;
      maxHp: number;
      alive: boolean;
    },
    selected: boolean,
    showHp: boolean,
  ) {
    const def = BUILDINGS[b.type];
    const c = tileCenter(b.gx, b.gy, def.size);
    const footprint = def.size * TILE_W * spriteScale(b.type);

    ctx!.save();
    drawPad(b.gx, b.gy, def.size);

    ctx!.fillStyle = "rgba(20, 14, 8, 0.28)";
    ctx!.beginPath();
    ctx!.ellipse(c.x, c.y + TILE_H * 0.12, footprint * 0.26, footprint * 0.1, 0, 0, Math.PI * 2);
    ctx!.fill();

    if (selected) {
      const d = diamond(b.gx, b.gy, def.size);
      ctx!.beginPath();
      ctx!.moveTo(d.t.x, d.t.y);
      ctx!.lineTo(d.r.x, d.r.y);
      ctx!.lineTo(d.b.x, d.b.y);
      ctx!.lineTo(d.l.x, d.l.y);
      ctx!.closePath();
      ctx!.fillStyle = "rgba(198, 162, 62, 0.22)";
      ctx!.fill();
      ctx!.strokeStyle = "#c9a227";
      ctx!.lineWidth = 1.6;
      ctx!.stroke();
    }

    const img = getAsset(b.type);
    const plant = TILE_H * (b.type === "watchtower" ? 0.42 : 0.62);
    if (img) {
      const ratio = img.naturalHeight / img.naturalWidth;
      const dw = footprint;
      const dh = dw * ratio;
      ctx!.drawImage(img, c.x - dw / 2, c.y - dh + plant, dw, dh);
    } else {
      proceduralBuilding(b.type, c.x, c.y, def.size);
    }

    if (showHp && b.alive) {
      const bw = Math.max(18, def.size * 20);
      const ratio = Math.max(0, b.hp / b.maxHp);
      ctx!.fillStyle = "rgba(12,10,8,0.7)";
      ctx!.fillRect(c.x - bw / 2, c.y - footprint * 0.85, bw, 5);
      ctx!.fillStyle = ratio > 0.5 ? "#6b8f4a" : ratio > 0.25 ? "#c4a24a" : "#8b3a2a";
      ctx!.fillRect(c.x - bw / 2, c.y - footprint * 0.85, bw * ratio, 5);
    }

    if (b.hp / b.maxHp < 0.4 && b.alive && showHp) {
      ctx!.fillStyle = `rgba(200,80,30,${0.25 + Math.sin(time * 8) * 0.15})`;
      ctx!.beginPath();
      ctx!.arc(c.x, c.y - footprint * 0.4, 10, 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.restore();
  }

  function drawCollectBubble(b: BuildingInst, stored: number) {
    const def = BUILDINGS[b.type];
    const c = tileCenter(b.gx, b.gy, def.size);
    const pulse = 0.5 + Math.sin(time * 4 + b.gx) * 0.5;
    const y = c.y - def.size * TILE_H * 1.55 - 8;
    const bw = 54;
    const bh = 26;
    ctx!.save();
    ctx!.translate(0, -pulse * 3);
    roundRect(c.x - bw / 2, y - bh, bw, bh, 6);
    ctx!.fillStyle = "rgba(36, 30, 22, 0.94)";
    ctx!.fill();
    ctx!.strokeStyle = b.type === "mine" ? "#c9a227" : "#c49a5a";
    ctx!.lineWidth = 1.4;
    ctx!.stroke();
    ctx!.beginPath();
    ctx!.moveTo(c.x - 5, y);
    ctx!.lineTo(c.x + 5, y);
    ctx!.lineTo(c.x, y + 7);
    ctx!.closePath();
    ctx!.fillStyle = "rgba(36, 30, 22, 0.94)";
    ctx!.fill();
    ctx!.fillStyle = b.type === "mine" ? "#e4c15a" : "#d4b07a";
    ctx!.font = "700 12px Cinzel, serif";
    ctx!.textAlign = "center";
    ctx!.textBaseline = "middle";
    ctx!.fillText(`${stored}`, c.x + 6, y - bh / 2);
    ctx!.beginPath();
    ctx!.arc(c.x - 14, y - bh / 2, 5, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.restore();
  }

  function roundRect(x: number, y: number, bw: number, bh: number, r: number) {
    ctx!.beginPath();
    ctx!.moveTo(x + r, y);
    ctx!.lineTo(x + bw - r, y);
    ctx!.quadraticCurveTo(x + bw, y, x + bw, y + r);
    ctx!.lineTo(x + bw, y + bh - r);
    ctx!.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
    ctx!.lineTo(x + r, y + bh);
    ctx!.quadraticCurveTo(x, y + bh, x, y + bh - r);
    ctx!.lineTo(x, y + r);
    ctx!.quadraticCurveTo(x, y, x + r, y);
    ctx!.closePath();
  }

  function drawRubble(b: { gx: number; gy: number; type: BuildingType }) {
    const def = BUILDINGS[b.type];
    const c = tileCenter(b.gx, b.gy, def.size);
    drawPad(b.gx, b.gy, def.size);
    ctx!.fillStyle = "rgba(40, 32, 24, 0.85)";
    ctx!.beginPath();
    ctx!.ellipse(c.x, c.y, 16, 8, 0, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.fillStyle = "#5a4a3a";
    ctx!.fillRect(c.x - 10, c.y - 8, 8, 10);
    ctx!.fillRect(c.x + 2, c.y - 6, 7, 8);
  }

  function drawTroop(t: { type: TroopType; x: number; y: number; hp: number; maxHp: number; facing: number }) {
    const p = iso(t.x, t.y);
    const bob = Math.sin(time * 9 + t.x * 3 + t.y) * 2.2;
    const key = troopAsset(t.type);
    const img = getAsset(key);
    const flip = Math.cos(t.facing) < 0;
    ctx!.save();
    ctx!.fillStyle = "rgba(20,14,8,0.35)";
    ctx!.beginPath();
    ctx!.ellipse(p.x, p.y + 5, 11, 5, 0, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.translate(p.x, p.y + bob);
    if (flip) ctx!.scale(-1, 1);
    const hgt = t.type === "cavalry" || t.type === "general" || t.type === "generaless" ? 54 : 42;
    if (img) {
      const ratio = img.naturalWidth / img.naturalHeight;
      ctx!.drawImage(img, (-hgt * ratio) / 2, -hgt + 8, hgt * ratio, hgt);
    } else {
      ctx!.fillStyle = t.type === "archers" ? "#4a6b3e" : t.type === "cavalry" ? "#6a3030" : "#4a4038";
      ctx!.fillRect(-8, -28, 16, 28);
    }
    ctx!.restore();
    const bw = 18;
    ctx!.fillStyle = "rgba(12,10,8,0.7)";
    ctx!.fillRect(p.x - bw / 2, p.y - 40, bw, 3);
    ctx!.fillStyle = "#6b8f4a";
    ctx!.fillRect(p.x - bw / 2, p.y - 40, bw * (t.hp / t.maxHp), 3);
  }

  function drawProj(p: { kind: string; x: number; y: number; z?: number; tx: number; ty: number }) {
    const a = iso(p.x, p.y);
    const lift = (p.z ?? 0) * TILE_H * 1.15;
    const img = getAsset(p.kind === "boulder" ? "boulder" : "arrow");
    ctx!.save();
    ctx!.translate(a.x, a.y - lift);
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x) - 0.35 * (p.z ?? 0);
    ctx!.rotate(ang);
    if (img && p.kind !== "bolt") {
      const s = p.kind === "boulder" ? 18 : 22;
      ctx!.drawImage(img, -s / 2, -s / 4, s, s / 2);
    } else {
      ctx!.strokeStyle = "#f0e2c0";
      ctx!.lineWidth = 1.6;
      ctx!.beginPath();
      ctx!.moveTo(-7, 0);
      ctx!.lineTo(8, 0);
      ctx!.stroke();
      ctx!.fillStyle = "#6b8f4a";
      ctx!.beginPath();
      ctx!.moveTo(8, 0);
      ctx!.lineTo(3, -3);
      ctx!.lineTo(3, 3);
      ctx!.fill();
    }
    ctx!.restore();
  }

  function drawGhost(type: BuildingType, gx: number, gy: number, valid: boolean) {
    const def = BUILDINGS[type];
    const d = diamond(gx, gy, def.size);
    ctx!.beginPath();
    ctx!.moveTo(d.t.x, d.t.y);
    ctx!.lineTo(d.r.x, d.r.y);
    ctx!.lineTo(d.b.x, d.b.y);
    ctx!.lineTo(d.l.x, d.l.y);
    ctx!.closePath();
    ctx!.fillStyle = valid ? "rgba(90,140,70,0.35)" : "rgba(140,50,40,0.4)";
    ctx!.fill();
    ctx!.strokeStyle = valid ? "#8faf6a" : "#8b3a2a";
    ctx!.stroke();
    ctx!.globalAlpha = 0.55;
    drawBuilding(
      { id: "ghost", type, gx, gy, level: 1, hp: 1, maxHp: 1, alive: true },
      false,
      false,
    );
    ctx!.globalAlpha = 1;
  }

  function proceduralBuilding(type: BuildingType, x: number, y: number, size: number) {
    const w0 = size * 22;
    const h0 = size * 28;
    ctx!.fillStyle = type === "farm" ? "#6b5a3a" : type === "mine" ? "#4a4638" : "#3a3530";
    ctx!.fillRect(x - w0 / 2, y - h0, w0, h0);
    ctx!.fillStyle = "#2a2420";
    ctx!.beginPath();
    ctx!.moveTo(x - w0 / 2 - 4, y - h0 + 8);
    ctx!.lineTo(x, y - h0 - 14);
    ctx!.lineTo(x + w0 / 2 + 4, y - h0 + 8);
    ctx!.fill();
  }

  function drawVignette() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx!.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.5, w / 2, h / 2, Math.max(w, h) * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(12,10,8,0.28)");
    ctx!.fillStyle = g;
    ctx!.fillRect(0, 0, w, h);
  }

  function loop(now: number) {
    if (!running) return;
    try {
      if (w < 10 || h < 10) resize();
      const raw = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += raw;
      acc += raw;
      const s = useGame.getState();
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        if (battle && (s.screen === "prep" || s.screen === "battle")) {
          battle.tick(1 / 60);
          if (battle.phase === "ended" && s.screen === "battle") {
            useGame.getState().finishBattle();
          }
          if (battle.phase === "fight" && s.screen === "prep") {
            useGame.setState({ screen: "battle" });
          }
        }
        useGame.getState().tick(Date.now());
      }
      const clamped = clampCam(cam.x, cam.y, cam.z, w, h);
      cam.x = clamped.x;
      cam.y = clamped.y;
      draw();
    } catch (err) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.fillStyle = "#3a2018";
      ctx!.fillRect(0, 0, w, h);
      ctx!.fillStyle = "#e6d5b3";
      ctx!.font = "14px sans-serif";
      ctx!.fillText(String(err), 16, 40);
      console.error(err);
    }
    raf = requestAnimationFrame(loop);
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch0 = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      zoom0 = cam.z;
      dragging = false;
      return;
    }
    dragging = true;
    moved = 0;
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = toWorld(sx, sy);
    const g = worldToGrid(world.x, world.y);
    hoverG = { gx: g.gx, gy: g.gy };
    const st = useGame.getState();
    if (st.placing) st.hoverPlace(g.gx, g.gy);

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (pinch0 > 0) cam.z = Math.min(MAX_Z, Math.max(MIN_Z, zoom0 * (dist / pinch0)));
      return;
    }
    if (!dragging) return;
    const dx = e.movementX;
    const dy = e.movementY;
    moved += Math.abs(dx) + Math.abs(dy);
    cam.x -= dx / cam.z;
    cam.y -= dy / cam.z;
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (!dragging) return;
    dragging = false;
    if (moved > 12) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    tap(sx, sy);
  }

  function tap(sx: number, sy: number) {
    const st = useGame.getState();
    const world = toWorld(sx, sy);
    const g = worldToGrid(world.x, world.y);
    const gx = Math.floor(g.gx);
    const gy = Math.floor(g.gy);

    if (st.screen === "prep" && battle) {
      st.deploy(gx, gy);
      return;
    }
    if (st.placing) {
      st.confirmPlace(g.gx, g.gy);
      return;
    }
    if (st.screen !== "village") return;

    const bubble = bubbleAt(st.buildings, world.x, world.y);
    if (bubble) {
      st.collect(bubble.id);
      return;
    }
    const hit = hitAt(st.buildings, world.x, world.y);
    if (hit) st.selectBuilding(hit.id);
    else st.selectBuilding(null);
  }

  function bubbleAt(buildings: BuildingInst[], wx: number, wy: number): BuildingInst | null {
    const st = useGame.getState();
    for (const b of buildings) {
      if (b.type !== "mine" && b.type !== "farm") continue;
      if (st.storedOf(b) < COLLECT_READY) continue;
      const def = BUILDINGS[b.type];
      const c = tileCenter(b.gx, b.gy, def.size);
      const y = c.y - def.size * TILE_H * 1.55 - 20;
      if (Math.abs(wx - c.x) < 32 && Math.abs(wy - y) < 28) return b;
    }
    return null;
  }

  function hitAt(buildings: BuildingInst[], wx: number, wy: number): BuildingInst | null {
    const sorted = [...buildings].sort((a, b) => {
      const ay = tileCenter(a.gx, a.gy, BUILDINGS[a.type].size).y;
      const by = tileCenter(b.gx, b.gy, BUILDINGS[b.type].size).y;
      return by - ay;
    });
    for (const b of sorted) {
      const def = BUILDINGS[b.type];
      const c = tileCenter(b.gx, b.gy, def.size);
      const dw = def.size * TILE_W * 0.42;
      const dh = def.size * TILE_H * 1.35;
      if (wx > c.x - dw && wx < c.x + dw && wy > c.y - dh && wy < c.y + TILE_H * 0.35) return b;
    }
    return null;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const next = cam.z * (e.deltaY > 0 ? 0.92 : 1.08);
    cam.z = Math.min(MAX_Z, Math.max(MIN_Z, next));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      const st = useGame.getState();
      st.cancelPlace();
      st.setSheet(null);
      st.selectBuilding(null);
    }
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();
  reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKey);
  canvas.style.touchAction = "none";

  raf = requestAnimationFrame(loop);

  void hoverG;
  void raidTarget;
  void reduced;
  void TROOPS;

  return {
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    },
  };
}

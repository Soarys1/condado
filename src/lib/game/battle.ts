import {
  BATTLE_MS,
  BUILDINGS,
  GRID,
  PREP_MS,
  REAL_BUILDINGS,
  TROOPS,
  buildingHp,
  isHero,
  type BuildingType,
  type TroopType,
} from "./constants";
import { isEdgeTile } from "./iso";
import { approachCells, findPath, makeBlocked, pathCost } from "./pathfinding";
import { sfxArrow, sfxBoom, sfxHit, sfxHorn } from "./audio";
import type { ArmyCounts, BuildingInst } from "./types";

export type BattlePhase = "prep" | "fight" | "ended";

export interface BattleBuilding {
  id: string;
  type: BuildingType;
  gx: number;
  gy: number;
  size: number;
  level: number;
  hp: number;
  maxHp: number;
  cx: number;
  cy: number;
  alive: boolean;
  cooldown: number;
  archerCd: [number, number];
}

export interface BattleTroop {
  id: string;
  type: TroopType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  goalId: string | null;
  targetId: string | null;
  path: Array<[number, number]>;
  pathI: number;
  facing: number;
  cooldown: number;
  alive: boolean;
  repath: number;
}

export interface Projectile {
  id: string;
  kind: "arrow" | "boulder" | "bolt";
  x: number;
  y: number;
  z: number;
  tz: number;
  tx: number;
  ty: number;
  speed: number;
  dmg: number;
  aoe: number;
  fromDefense: boolean;
  dead: boolean;
}

export interface FloatingNum {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export interface BattleResult {
  stars: number;
  destruction: number;
  niens: number;
  gold: number;
  bread: number;
  castleDown: boolean;
  survivors: ArmyCounts;
  elapsed: number;
  retreated: boolean;
}

export interface Deployed {
  type: TroopType;
  gx: number;
  gy: number;
}

let uid = 1;
const nid = () => `e${uid++}`;

export class Battle {
  phase: BattlePhase = "prep";
  prepLeft = PREP_MS;
  fightLeft = BATTLE_MS;
  buildings: BattleBuilding[] = [];
  troops: BattleTroop[] = [];
  projectiles: Projectile[] = [];
  floats: FloatingNum[] = [];
  particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    size: number;
    color: string;
  }> = [];
  shake = 0;
  niensEarned = 0;
  goldLoot = 0;
  breadLoot = 0;
  result: BattleResult | null = null;
  private blocked: boolean[][] = [];
  private occupied: Set<string> = new Set();
  private lootGoldPool: number;
  private lootBreadPool: number;
  private armyLeft: ArmyCounts;
  private heroesUsed = new Set<TroopType>();
  private lastBand = 0;
  private sfxGate = 0;

  constructor(
    layout: BuildingInst[],
    army: ArmyCounts,
    lootGold: number,
    lootBread: number,
  ) {
    this.armyLeft = { ...army };
    this.lootGoldPool = lootGold;
    this.lootBreadPool = lootBread;
    this.buildings = layout.map((b) => {
      const def = BUILDINGS[b.type];
      const hp = buildingHp(b.type, b.level);
      return {
        id: b.id,
        type: b.type,
        gx: b.gx,
        gy: b.gy,
        size: def.size,
        level: b.level,
        hp,
        maxHp: hp,
        cx: b.gx + def.size / 2,
        cy: b.gy + def.size / 2,
        alive: true,
        cooldown: 0,
        archerCd: [0, 0.25],
      };
    });
    this.rebuildBlocked();
  }

  private rebuildBlocked() {
    this.blocked = makeBlocked(
      this.buildings.filter((b) => b.alive).map((b) => ({
        gx: b.gx,
        gy: b.gy,
        size: b.size,
      })),
    );
    this.occupied = new Set();
    for (const b of this.buildings) {
      if (!b.alive) continue;
      for (let y = 0; y < b.size; y++) {
        for (let x = 0; x < b.size; x++) {
          this.occupied.add(`${b.gx + x},${b.gy + y}`);
        }
      }
    }
  }

  remainingOf(type: TroopType): number {
    return this.armyLeft[type];
  }

  canDeploy(type: TroopType, gx: number, gy: number): boolean {
    if (this.phase !== "prep") return false;
    if (this.armyLeft[type] <= 0) return false;
    if (isHero(type) && this.heroesUsed.has(type)) return false;
    if (!isEdgeTile(gx, gy)) return false;
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return false;
    if (this.occupied.has(`${gx},${gy}`)) return false;
    return true;
  }

  deploy(type: TroopType, gx: number, gy: number): boolean {
    if (!this.canDeploy(type, gx, gy)) return false;
    const def = TROOPS[type];
    this.armyLeft[type] -= 1;
    if (isHero(type)) this.heroesUsed.add(type);
    this.troops.push({
      id: nid(),
      type,
      x: gx + 0.5,
      y: gy + 0.5,
      hp: def.hp,
      maxHp: def.hp,
      goalId: null,
      targetId: null,
      path: [],
      pathI: 0,
      facing: 0,
      cooldown: 0,
      alive: true,
      repath: 0,
    });
    return true;
  }

  startFight() {
    if (this.phase !== "prep") return;
    if (this.troops.length === 0) return;
    this.phase = "fight";
    this.prepLeft = 0;
  }

  skipPrep() {
    this.startFight();
  }

  retreat() {
    if (this.phase !== "fight") return;
    sfxHorn();
    this.end(true);
  }

  tick(dt: number) {
    const d = Math.min(dt, 0.1);
    this.shake = Math.max(0, this.shake - d * 2.4);
    this.sfxGate -= d;
    this.floats = this.floats.filter((f) => {
      f.life -= d;
      f.y -= d * 1.1;
      return f.life > 0;
    });
    this.particles = this.particles.filter((p) => {
      p.life -= d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.vy += 2.2 * d;
      return p.life > 0;
    });

    if (this.phase === "prep") {
      this.prepLeft = Math.max(0, this.prepLeft - d * 1000);
      if (this.prepLeft <= 0 && this.troops.length > 0) this.startFight();
      return;
    }
    if (this.phase !== "fight") return;

    this.fightLeft = Math.max(0, this.fightLeft - d * 1000);
    this.grantBands();

    for (const t of this.troops) {
      if (!t.alive) continue;
      this.tickTroop(t, d);
    }
    for (const b of this.buildings) {
      if (!b.alive) continue;
      this.tickDefense(b, d);
    }
    this.tickProjectiles(d);

    const buildingsLeft = this.buildings.filter((b) => b.alive && b.type !== "wall");
    const troopsLeft = this.troops.some((t) => t.alive);
    if (this.fightLeft <= 0 || buildingsLeft.length === 0 || !troopsLeft) {
      this.end(false);
    }
  }

  private grantBands() {
    const band = Math.min(4, Math.floor(this.destruction / 0.25));
    while (this.lastBand < band) {
      this.lastBand += 1;
      const bonus = Math.round(this.lootGoldPool * 0.12);
      if (bonus <= 0) continue;
      this.goldLoot += bonus;
      const castle = this.buildings.find((b) => b.type === "castle");
      this.float(castle?.cx ?? 12, (castle?.cy ?? 12) - 1.2, `+${bonus} ouro (${this.lastBand * 25}%)`, "#e4c15a");
    }
  }

  private tickTroop(t: BattleTroop, dt: number) {
    const def = TROOPS[t.type];
    t.repath -= dt;

    let goal = this.buildings.find((b) => b.id === t.goalId && b.alive && b.type !== "wall") ?? null;
    if (!goal) {
      goal = this.pickGoal(t);
      t.goalId = goal?.id ?? null;
      t.targetId = null;
      t.path = [];
      t.pathI = 0;
    }
    if (!goal) return;

    if (this.inRange(t, goal, def.range)) {
      t.path = [];
      this.strike(t, goal, dt);
      return;
    }

    if (def.ignoreWalls) {
      this.steer(t, goal.cx, goal.cy, def.speed, dt);
      if (this.inRange(t, goal, def.range)) this.strike(t, goal, dt);
      return;
    }

    let breach = this.buildings.find((b) => b.id === t.targetId && b.alive && b.type === "wall") ?? null;
    if (breach && this.inRange(t, breach, Math.max(def.range, 0.85))) {
      this.strike(t, breach, dt);
      return;
    }

    if (t.path.length === 0 || t.pathI >= t.path.length || t.repath <= 0) {
      const planned = this.planRoute(t, goal);
      t.path = planned.path;
      t.pathI = 0;
      t.repath = 0.45 + Math.random() * 0.25;
      if (planned.breach) {
        t.targetId = planned.breach.id;
        breach = planned.breach;
      } else {
        t.targetId = null;
        breach = null;
      }
    }

    if (breach && this.inRange(t, breach, Math.max(def.range, 0.9))) {
      this.strike(t, breach, dt);
      return;
    }

    const step = t.path[t.pathI];
    if (!step) {
      this.steer(t, goal.cx, goal.cy, def.speed, dt);
      return;
    }
    const reached = this.steer(t, step[0] + 0.5, step[1] + 0.5, def.speed, dt);
    if (reached) t.pathI += 1;
  }

  private planRoute(
    t: BattleTroop,
    goal: BattleBuilding,
  ): { path: Array<[number, number]>; breach: BattleBuilding | null } {
    const def = TROOPS[t.type];
    const direct = Math.hypot(goal.cx - t.x, goal.cy - t.y);
    const spots = this.approachSpots(t, goal, def.range);
    let best: Array<[number, number]> = [];
    let bestCost = Infinity;
    for (const [sx, sy] of spots.slice(0, 8)) {
      const p = findPath(t.x, t.y, sx + 0.5, sy + 0.5, this.blocked);
      if (!p.length) continue;
      const c = pathCost(p);
      if (c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    const tooFar = best.length > 0 && bestCost > Math.max(direct * 2.6, direct + 10);
    if (best.length && !tooFar) return { path: best, breach: null };

    if (def.shootOverWalls && direct <= def.range + goal.size + 1.5) {
      return { path: [], breach: null };
    }

    const wall = this.pickBreachWall(t, goal);
    if (wall) {
      const wp = findPath(t.x, t.y, wall.cx, wall.cy, this.blocked);
      return { path: wp.length ? wp : [[Math.floor(wall.cx), Math.floor(wall.cy)]], breach: wall };
    }
    return { path: best, breach: null };
  }

  private approachSpots(t: BattleTroop, goal: BattleBuilding, range: number): Array<[number, number]> {
    const cells = approachCells(goal.gx, goal.gy, goal.size);
    const open = cells.filter(([x, y]) => !this.blocked[y]?.[x]);
    const ranged: Array<[number, number]> = [];
    if (range > 1.4) {
      const r = Math.ceil(range);
      for (let y = Math.max(0, Math.floor(goal.cy) - r); y <= Math.min(GRID - 1, Math.floor(goal.cy) + r); y++) {
        for (let x = Math.max(0, Math.floor(goal.cx) - r); x <= Math.min(GRID - 1, Math.floor(goal.cx) + r); x++) {
          if (this.blocked[y]?.[x]) continue;
          const d = Math.hypot(x + 0.5 - goal.cx, y + 0.5 - goal.cy);
          if (d <= range + goal.size * 0.35 && d > 0.6) ranged.push([x, y]);
        }
      }
    }
    const pool = (open.length ? open : []).concat(ranged);
    pool.sort((a, b) => {
      const da = Math.hypot(a[0] + 0.5 - t.x, a[1] + 0.5 - t.y);
      const db = Math.hypot(b[0] + 0.5 - t.x, b[1] + 0.5 - t.y);
      return da - db;
    });
    const seen = new Set<string>();
    const uniq: Array<[number, number]> = [];
    for (const c of pool) {
      const k = `${c[0]},${c[1]}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(c);
    }
    return uniq;
  }

  private pickBreachWall(t: BattleTroop, goal: BattleBuilding): BattleBuilding | null {
    let best: BattleBuilding | null = null;
    let score = Infinity;
    for (const b of this.buildings) {
      if (!b.alive || b.type !== "wall") continue;
      const dx = b.cx - t.x;
      const dy = b.cy - t.y;
      const gx = goal.cx - t.x;
      const gy = goal.cy - t.y;
      const gl = Math.hypot(gx, gy) || 1;
      const toward = (dx * gx + dy * gy) / gl;
      if (toward < -0.15) continue;
      const dist = Math.hypot(dx, dy);
      const line = Math.abs(dx * gy - dy * gx) / gl;
      const s = dist * 0.55 + line * 1.35;
      if (s < score) {
        score = s;
        best = b;
      }
    }
    return best;
  }

  private inRange(t: BattleTroop, b: BattleBuilding, range: number): boolean {
    return Math.hypot(b.cx - t.x, b.cy - t.y) <= range + b.size * 0.35;
  }

  private strike(t: BattleTroop, target: BattleBuilding, dt: number) {
    const def = TROOPS[t.type];
    t.facing = Math.atan2(target.cy - t.y, target.cx - t.x);
    t.cooldown -= dt;
    if (t.cooldown > 0) return;
    if (def.range > 1.4) {
      this.spawnProj({
        kind: "arrow",
        x: t.x,
        y: t.y,
        z: 0.45,
        tz: 0.35,
        tx: target.cx,
        ty: target.cy,
        speed: 10,
        dmg: def.dps * 0.4,
        aoe: 0,
        fromDefense: false,
      });
      t.cooldown = 0.4;
      if (this.sfxGate <= 0) {
        sfxArrow();
        this.sfxGate = 0.12;
      }
    } else {
      this.hurtBuilding(target, def.dps * dt, t.x, t.y);
      t.cooldown = 0;
      if (this.sfxGate <= 0) {
        sfxHit();
        this.sfxGate = 0.16;
      }
    }
  }

  private steer(t: BattleTroop, tx: number, ty: number, speed: number, dt: number): boolean {
    let dx = tx - t.x;
    let dy = ty - t.y;
    const dist = Math.hypot(dx, dy);
    let sx = 0;
    let sy = 0;
    for (const o of this.troops) {
      if (o === t || !o.alive) continue;
      const ox = t.x - o.x;
      const oy = t.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d > 0.02 && d < 0.58) {
        const w = (0.58 - d) / 0.58;
        sx += (ox / d) * w;
        sy += (oy / d) * w;
      }
    }
    const wx = (dist > 0.001 ? dx / dist : 0) + sx * 1.15;
    const wy = (dist > 0.001 ? dy / dist : 0) + sy * 1.15;
    const wl = Math.hypot(wx, wy) || 1;
    const slow = dist < 0.35 ? 0.55 + dist : 1;
    const step = speed * slow * dt;
    if (dist < 0.1 && Math.hypot(sx, sy) < 0.08) {
      t.x = tx;
      t.y = ty;
      return true;
    }
    t.x += (wx / wl) * step;
    t.y += (wy / wl) * step;
    t.facing = Math.atan2(wy, wx);
    t.x = Math.min(GRID - 0.05, Math.max(0.05, t.x));
    t.y = Math.min(GRID - 0.05, Math.max(0.05, t.y));
    return dist < 0.12;
  }

  private pickGoal(t: BattleTroop): BattleBuilding | null {
    const def = TROOPS[t.type];
    const candidates = this.buildings.filter((b) => b.alive && REAL_BUILDINGS.includes(b.type));
    if (candidates.length === 0) return null;
    if (def.prefer === "defense") {
      const defs = candidates.filter((b) => b.type === "watchtower" || b.type === "catapult");
      return closest(t.x, t.y, defs.length ? defs : candidates);
    }
    if (def.prefer === "core") {
      const castle = candidates.find((b) => b.type === "castle");
      if (castle) return castle;
      return closest(t.x, t.y, candidates);
    }
    return closest(t.x, t.y, candidates);
  }

  private tickDefense(b: BattleBuilding, dt: number) {
    const def = BUILDINGS[b.type];
    if (def.damage <= 0) return;
    const tgt = this.closestTroop(b.cx, b.cy, def.range);
    if (!tgt) return;
    if (b.type === "watchtower") {
      for (let i = 0; i < 2; i++) {
        b.archerCd[i] -= dt;
        if (b.archerCd[i] > 0) continue;
        const side = i === 0 ? -0.22 : 0.22;
        this.spawnProj({
          kind: "bolt",
          x: b.cx + side,
          y: b.cy,
          z: 1.55,
          tz: 0.25,
          tx: tgt.x + (Math.random() - 0.5) * 0.12,
          ty: tgt.y + (Math.random() - 0.5) * 0.12,
          speed: 13,
          dmg: def.damage * 0.5,
          aoe: 0,
          fromDefense: true,
        });
        b.archerCd[i] = 1;
        if (this.sfxGate <= 0) {
          sfxArrow();
          this.sfxGate = 0.1;
        }
      }
    } else if (b.type === "catapult") {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        this.spawnProj({
          kind: "boulder",
          x: b.cx,
          y: b.cy,
          z: 0.5,
          tz: 0.2,
          tx: tgt.x,
          ty: tgt.y,
          speed: 5.5,
          dmg: def.damage,
          aoe: def.aoe,
          fromDefense: true,
        });
        b.cooldown = 1;
      }
    }
  }

  private closestTroop(x: number, y: number, range: number): BattleTroop | null {
    let best: BattleTroop | null = null;
    let bd = range;
    for (const t of this.troops) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private spawnProj(p: Omit<Projectile, "id" | "dead">) {
    this.projectiles.push({ ...p, id: nid(), dead: false });
  }

  private tickProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.05) {
        p.x = p.tx;
        p.y = p.ty;
        p.z = p.tz;
        this.impact(p);
        p.dead = true;
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        const t = Math.min(1, step / dist);
        p.z += (p.tz - p.z) * t;
        if (p.kind === "boulder") p.z += Math.sin(Math.min(1, 1 - dist / 8) * Math.PI) * 0.4 * dt * 8;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private impact(p: Projectile) {
    if (!p.fromDefense && p.dmg > 0) {
      const b = this.buildings.find(
        (bb) => bb.alive && Math.hypot(bb.cx - p.x, bb.cy - p.y) < bb.size * 0.85,
      );
      if (b) this.hurtBuilding(b, p.dmg, p.x, p.y);
      return;
    }
    if (p.fromDefense && p.dmg > 0) {
      for (const t of this.troops) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d <= Math.max(0.55, p.aoe)) {
          const fall = p.aoe > 0 ? 1 - d / (p.aoe + 0.01) : 1;
          this.hurtTroop(t, p.dmg * Math.max(0.4, fall), p.x, p.y);
        }
      }
      if (p.kind === "boulder") {
        this.burst(p.x, p.y, "#c45a2a", 10);
        this.shake = Math.min(1, this.shake + 0.28);
        sfxBoom();
      }
    }
  }

  private hurtBuilding(b: BattleBuilding, dmg: number, hx: number, hy: number) {
    if (!b.alive || dmg <= 0) return;
    b.hp -= dmg;
    if (Math.random() < 0.08) this.float(b.cx, b.cy - 0.4, `-${Math.round(dmg)}`, "#e8dcc4");
    if (b.hp <= 0) {
      b.hp = 0;
      b.alive = false;
      const reward = BUILDINGS[b.type].niensReward;
      this.niensEarned += reward;
      if (b.type === "mine") this.goldLoot += Math.round(this.lootGoldPool * 0.18);
      if (b.type === "farm") this.breadLoot += Math.round(this.lootBreadPool * 0.18);
      if (b.type === "castle") {
        this.goldLoot += Math.round(this.lootGoldPool * 0.45);
        this.breadLoot += Math.round(this.lootBreadPool * 0.45);
        this.shake = 1;
      } else {
        this.shake = Math.min(1, this.shake + 0.22);
      }
      this.burst(b.cx, b.cy, "#6a5340", 18);
      this.rebuildBlocked();
      for (const t of this.troops) {
        if (t.targetId === b.id || t.goalId === b.id) {
          t.targetId = null;
          t.goalId = t.goalId === b.id ? null : t.goalId;
          t.path = [];
          t.pathI = 0;
        }
      }
      if (reward > 0) this.float(b.cx, b.cy - 0.8, `+${reward} Niens`, "#e4c15a");
      sfxBoom();
    }
    void hx;
    void hy;
  }

  private hurtTroop(t: BattleTroop, dmg: number, hx: number, hy: number) {
    if (!t.alive || dmg <= 0) return;
    t.hp -= dmg;
    if (t.hp <= 0) {
      t.hp = 0;
      t.alive = false;
      this.burst(t.x, t.y, "#7a3030", 8);
    }
    void hx;
    void hy;
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.2 + Math.random() * 2.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 0.6,
        life: 0.35 + Math.random() * 0.45,
        max: 0.8,
        size: 0.08 + Math.random() * 0.12,
        color,
      });
    }
  }

  private float(x: number, y: number, text: string, color: string) {
    this.floats.push({ x, y, text, life: 1.1, color });
  }

  private end(retreated: boolean) {
    if (this.phase === "ended") return;
    this.phase = "ended";
    const nonWall = this.buildings.filter((b) => b.type !== "wall");
    const destroyed = nonWall.filter((b) => !b.alive).length;
    const destruction = nonWall.length ? destroyed / nonWall.length : 1;
    const castleDown = !this.buildings.find((b) => b.type === "castle")?.alive;
    let stars = 0;
    if (destruction >= 0.5) stars += 1;
    if (castleDown) stars += 1;
    if (destruction >= 0.999) stars = 3;
    if (retreated) stars = Math.min(stars, 2);
    const survivors: ArmyCounts = { infantry: 0, archers: 0, cavalry: 0, general: 0, generaless: 0 };
    for (const t of this.troops) {
      if (t.alive) survivors[t.type] += 1;
    }
    this.goldLoot = Math.min(this.lootGoldPool, this.goldLoot);
    this.breadLoot = Math.min(this.lootBreadPool, this.breadLoot);
    this.result = {
      stars,
      destruction,
      niens: this.niensEarned,
      gold: this.goldLoot,
      bread: this.breadLoot,
      castleDown,
      survivors,
      elapsed: (BATTLE_MS - this.fightLeft) / 1000,
      retreated,
    };
  }

  get destruction(): number {
    const nonWall = this.buildings.filter((b) => b.type !== "wall");
    if (!nonWall.length) return 1;
    const lost = nonWall.reduce((s, b) => s + (1 - b.hp / b.maxHp), 0);
    return lost / nonWall.length;
  }
}

function closest(x: number, y: number, list: BattleBuilding[]): BattleBuilding | null {
  let best: BattleBuilding | null = null;
  let bd = Infinity;
  for (const b of list) {
    const d = Math.hypot(b.cx - x, b.cy - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

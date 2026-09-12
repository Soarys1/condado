import {
  BATTLE_MS,
  BUILDINGS,
  GRID,
  LOOT_BANDS,
  LOOT_CAP,
  PREP_MS,
  REAL_BUILDINGS,
  TROOPS,
  GOLD_NAME,
  buildingDamage,
  buildingHp,
  isHero,
  scaledTroop,
  type BuildingType,
  type TroopType,
  type WallDir,
} from "./constants";
import { isEdgeTile } from "./iso";
import { approachCells, findPath, makeBlocked, pathCost } from "./pathfinding";
import { sfxArrow, sfxBoom, sfxHit, sfxHorn } from "./audio";
import type { ArmyCounts, BuildingInst, TroopLevels } from "./types";

export type BattlePhase = "prep" | "fight" | "ended";
export type BattleMode = "raid" | "field";
export type TroopSide = "atk" | "def";

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
  dir?: WallDir;
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
  side: TroopSide;
  waypoint: { x: number; y: number } | null;
  foeId: string | null;
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
  side?: TroopSide;
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
  casualties: number;
  elapsed: number;
  retreated: boolean;
  fieldWin: boolean;
  fieldWinner: "atk" | "def" | "draw";
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
  goldLoot = 0;
  result: BattleResult | null = null;
  spectator = false;
  focusId: string | null = null;
  mode: BattleMode = "raid";
  selected = new Set<string>();
  lootCap = LOOT_CAP;
  private blocked: boolean[][] = [];
  private occupied: Set<string> = new Set();
  private armyLeft: ArmyCounts;
  private foeArmy: ArmyCounts;
  private heroesUsed = new Set<TroopType>();
  private lastBand = 0;
  private sfxGate = 0;
  private stats: Record<TroopType, { hp: number; dps: number; speed: number }>;
  private foeStats: Record<TroopType, { hp: number; dps: number; speed: number }>;
  pvp = false;
  controlSide: TroopSide = "atk";
  hostSim = true;

  constructor(
    layout: BuildingInst[],
    army: ArmyCounts,
    _lootGold: number,
    opts?: {
      spectator?: boolean;
      levels?: TroopLevels;
      campLevel?: number;
      mode?: BattleMode;
      lootCap?: number;
      foeArmy?: ArmyCounts;
      foeLevels?: TroopLevels;
      foeCamp?: number;
      pvp?: boolean;
      controlSide?: TroopSide;
      hostSim?: boolean;
    },
  ) {
    this.armyLeft = {
      infantry: army.infantry || 0,
      archers: army.archers || 0,
      cavalry: army.cavalry || 0,
      general: Math.min(1, army.general || 0),
      generaless: Math.min(1, army.generaless || 0),
      defender: army.defender || 0,
    };
    this.foeArmy = {
      infantry: opts?.foeArmy?.infantry || 0,
      archers: opts?.foeArmy?.archers || 0,
      cavalry: opts?.foeArmy?.cavalry || 0,
      general: Math.min(1, opts?.foeArmy?.general || 0),
      generaless: Math.min(1, opts?.foeArmy?.generaless || 0),
      defender: opts?.foeArmy?.defender || 0,
    };
    this.spectator = !!opts?.spectator;
    this.mode = opts?.mode ?? "raid";
    this.pvp = !!opts?.pvp;
    this.controlSide = opts?.controlSide ?? "atk";
    this.hostSim = opts?.hostSim !== false;
    this.lootCap = Math.max(0, Math.floor(opts?.lootCap ?? LOOT_CAP));
    const lv = opts?.levels;
    const camp = opts?.campLevel ?? 1;
    const flv = opts?.foeLevels;
    const fcamp = opts?.foeCamp ?? 1;
    this.stats = {
      infantry: scaledTroop("infantry", lv?.infantry ?? 1),
      archers: scaledTroop("archers", lv?.archers ?? 1),
      cavalry: scaledTroop("cavalry", lv?.cavalry ?? 1),
      general: scaledTroop("general", lv?.general ?? 1),
      generaless: scaledTroop("generaless", lv?.generaless ?? 1),
      defender: scaledTroop("defender", 1, camp),
    };
    this.foeStats = {
      infantry: scaledTroop("infantry", flv?.infantry ?? 1),
      archers: scaledTroop("archers", flv?.archers ?? 1),
      cavalry: scaledTroop("cavalry", flv?.cavalry ?? 1),
      general: scaledTroop("general", flv?.general ?? 1),
      generaless: scaledTroop("generaless", flv?.generaless ?? 1),
      defender: scaledTroop("defender", 1, fcamp),
    };
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
        archerCd: [0, 0.25] as [number, number],
        dir: b.dir,
      };
    });
    this.rebuildBlocked();
    if (this.spectator) this.autoDeploy();
  }

  setFocus(id: string | null) {
    this.focusId = id;
  }

  private rebuildBlocked() {
    this.blocked = makeBlocked(
      this.buildings
        .filter((b) => b.alive)
        .map((b) => ({
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
    for (const t of this.troops) {
      if (!t.alive) continue;
      this.occupied.add(`${Math.floor(t.x)},${Math.floor(t.y)}`);
    }
  }

  remainingOf(type: TroopType, side: TroopSide = "atk"): number {
    return side === "atk" ? this.armyLeft[type] : this.foeArmy[type];
  }

  private deployEdge(gx: number, gy: number, side: TroopSide): boolean {
    if (this.mode === "field") {
      if (side === "atk") return gx <= 2 && gy >= 0 && gy < GRID;
      return gx >= GRID - 3 && gy >= 0 && gy < GRID;
    }
    return isEdgeTile(gx, gy);
  }

  canDeploy(type: TroopType, gx: number, gy: number, side: TroopSide = "atk"): boolean {
    if (this.phase !== "prep" && this.phase !== "fight") return false;
    if (this.spectator) return false;
    if (side === "atk" && this.armyLeft[type] <= 0) return false;
    if (side === "def" && this.foeArmy[type] <= 0) return false;
    if (isHero(type)) {
      const used = this.troops.some((t) => t.alive && t.side === side && t.type === type);
      if (used) return false;
    }
    if (!this.deployEdge(gx, gy, side)) return false;
    if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return false;
    if (this.occupied.has(`${gx},${gy}`)) return false;
    return true;
  }

  deploy(type: TroopType, gx: number, gy: number, side: TroopSide = "atk"): boolean {
    if (!this.canDeploy(type, gx, gy, side)) return false;
    const st = side === "atk" ? this.stats[type] : this.foeStats[type];
    this.troops.push({
      id: nid(),
      type,
      x: gx + 0.5,
      y: gy + 0.5,
      hp: st.hp,
      maxHp: st.hp,
      goalId: null,
      targetId: null,
      path: [],
      pathI: 0,
      facing: side === "atk" ? 0 : Math.PI,
      cooldown: 0,
      alive: true,
      repath: 0,
      side,
      waypoint: null,
      foeId: null,
    });
    if (side === "atk") this.armyLeft[type] = Math.max(0, this.armyLeft[type] - 1);
    else this.foeArmy[type] = Math.max(0, this.foeArmy[type] - 1);
    if (isHero(type) && side === "atk") this.heroesUsed.add(type);
    this.occupied.add(`${gx},${gy}`);
    if (this.phase === "fight") {
      const placed = this.troops[this.troops.length - 1];
      if (placed) {
        placed.repath = 0;
        this.tickTroop(placed, 0.016);
      }
    }
    return true;
  }

  deployAll(type: TroopType, gx: number, gy: number, side: TroopSide = "atk"): number {
    const bag = side === "atk" ? this.armyLeft : this.foeArmy;
    if (bag[type] <= 0) return 0;
    if (isHero(type)) return this.deploy(type, gx, gy, side) ? 1 : 0;
    const tiles = this.nearbyDeployTiles(gx, gy, side);
    let n = 0;
    for (const [x, y] of tiles) {
      if (bag[type] <= 0) break;
      if (this.deploy(type, x, y, side)) n += 1;
    }
    return n;
  }

  armyHome(side: TroopSide = this.controlSide): ArmyCounts {
    const bag = side === "atk" ? this.armyLeft : this.foeArmy;
    const s: ArmyCounts = {
      infantry: 0,
      archers: 0,
      cavalry: 0,
      general: 0,
      generaless: 0,
      defender: 0,
    };
    for (const t of this.troops) {
      if (t.side !== side || !t.alive) continue;
      s[t.type] += 1;
    }
    return {
      infantry: bag.infantry + s.infantry,
      archers: bag.archers + s.archers,
      cavalry: bag.cavalry + s.cavalry,
      general: Math.min(1, bag.general + s.general),
      generaless: Math.min(1, bag.generaless + s.generaless),
      defender: bag.defender + s.defender,
    };
  }

  private nearbyDeployTiles(gx: number, gy: number, side: TroopSide): Array<[number, number]> {
    const tiles: Array<[number, number, number]> = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!this.deployEdge(x, y, side)) continue;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        if (this.occupied.has(`${x},${y}`)) continue;
        const d = Math.abs(x - gx) + Math.abs(y - gy);
        tiles.push([x, y, d]);
      }
    }
    tiles.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    return tiles.map(([x, y]) => [x, y]);
  }

  autoDeploy() {
    this.autoDeploySide("atk", this.armyLeft);
    if (this.mode === "field") this.autoDeploySide("def", this.foeArmy);
    this.startFight();
  }

  private autoDeploySide(side: TroopSide, bag: ArmyCounts) {
    const order: TroopType[] = ["infantry", "archers", "defender", "cavalry", "general", "generaless"];
    for (const type of order) {
      let guard = 120;
      while (bag[type] > 0 && guard-- > 0) {
        const gx =
          side === "def" && this.mode === "field"
            ? GRID - 2
            : Math.random() < 0.5
              ? Math.random() < 0.5
                ? 1
                : GRID - 2
              : 2 + Math.floor(Math.random() * (GRID - 4));
        const gy =
          this.mode === "field" && (side === "atk" || side === "def")
            ? 2 + Math.floor(Math.random() * (GRID - 4))
            : gx <= 2 || gx >= GRID - 3
              ? 2 + Math.floor(Math.random() * (GRID - 4))
              : Math.random() < 0.5
                ? 1
                : GRID - 2;
        const useGx = side === "atk" && this.mode === "field" ? 1 : gx;
        if (!this.deploy(type, useGx, gy, side)) continue;
      }
    }
  }

  startFight() {
    if (this.phase !== "prep") return;
    this.phase = "fight";
    this.prepLeft = 0;
    if (this.mode === "field" && !this.pvp) this.autoDeploySide("def", this.foeArmy);
    for (const t of this.troops) {
      if (!t.alive) continue;
      t.repath = 0;
      t.path = [];
      t.pathI = 0;
    }
  }

  skipPrep() {
    this.startFight();
  }

  retreat() {
    if (this.phase !== "fight") return;
    sfxHorn();
    this.end(true);
  }

  pickAt(wx: number, wy: number): BattleTroop | null {
    let best: BattleTroop | null = null;
    let bd = 1.15;
    for (const t of this.troops) {
      if (!t.alive || t.side !== this.controlSide) continue;
      const d = Math.hypot(t.x - wx, t.y - wy);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  selectGroup(t: BattleTroop) {
    this.selected.clear();
    for (const o of this.troops) {
      if (!o.alive || o.side !== this.controlSide) continue;
      if (o.type !== t.type) continue;
      if (Math.hypot(o.x - t.x, o.y - t.y) > 2.6) continue;
      this.selected.add(o.id);
    }
    if (!this.selected.size) this.selected.add(t.id);
  }

  commandSelected(x: number, y: number) {
    const tx = Math.min(GRID - 0.2, Math.max(0.2, x));
    const ty = Math.min(GRID - 0.2, Math.max(0.2, y));
    for (const t of this.troops) {
      if (!t.alive || !this.selected.has(t.id)) continue;
      t.waypoint = { x: tx, y: ty };
      t.path = [];
      t.pathI = 0;
      t.repath = 0;
      t.goalId = null;
    }
  }

  clearSelection() {
    this.selected.clear();
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
    if (this.particles.length > 64) this.particles.splice(0, this.particles.length - 64);
    this.particles = this.particles.filter((p) => {
      p.life -= d;
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.vy += 2.2 * d;
      return p.life > 0;
    });

    if (this.phase === "prep") {
      this.prepLeft = Math.max(0, this.prepLeft - d * 1000);
      if (this.prepLeft <= 0 && this.troops.length > 0 && !this.pvp) this.startFight();
      return;
    }
    if (this.phase !== "fight") return;

    if (this.pvp && !this.hostSim) {
      this.fightLeft = Math.max(0, this.fightLeft - d * 1000);
      return;
    }

    this.fightLeft = Math.max(0, this.fightLeft - d * 1000);
    if (this.mode === "raid") this.grantBands();

    for (const t of this.troops) {
      if (!t.alive) continue;
      this.tickTroop(t, d);
    }
    if (this.mode === "raid") {
      for (const b of this.buildings) {
        if (!b.alive) continue;
        this.tickDefense(b, d);
      }
    }
    this.tickProjectiles(d);

    if (this.mode === "field") {
      const atkLeft = this.troops.some((t) => t.alive && t.side === "atk") || this.reserveCount("atk") > 0;
      const defLeft = this.troops.some((t) => t.alive && t.side === "def") || this.reserveCount("def") > 0;
      if (this.fightLeft <= 0 || !atkLeft || !defLeft) this.end(false);
      return;
    }

    const buildingsLeft = this.buildings.filter((b) => b.alive && b.type !== "wall");
    const troopsLeft = this.troops.some((t) => t.alive && t.side === "atk");
    if (this.fightLeft <= 0 || buildingsLeft.length === 0 || (!troopsLeft && this.reserveCount("atk") <= 0)) {
      this.end(false);
    }
  }

  private reserveCount(side: TroopSide): number {
    const a = side === "atk" ? this.armyLeft : this.foeArmy;
    return a.infantry + a.archers + a.cavalry + a.general + a.generaless + a.defender;
  }

  private grantBands() {
    const scale = this.lootCap / LOOT_CAP;
    while (this.lastBand < LOOT_BANDS.length) {
      const band = LOOT_BANDS[this.lastBand]!;
      if (this.destruction < band.at - 1e-6) break;
      this.lastBand += 1;
      const gold = Math.round(band.gold * scale);
      this.goldLoot = Math.min(this.lootCap, this.goldLoot + gold);
      const castle = this.buildings.find((b) => b.type === "castle");
      const sign = this.spectator ? "−" : "+";
      this.float(
        castle?.cx ?? 20,
        (castle?.cy ?? 20) - 1.2,
        `${sign}${gold} ${GOLD_NAME} (${Math.round(band.at * 100)}%)`,
        "#e4c15a",
      );
    }
  }

  private tickTroop(t: BattleTroop, dt: number) {
    const def = TROOPS[t.type];
    const st = t.side === "atk" ? this.stats[t.type] : this.foeStats[t.type];
    t.repath -= dt;

    if (t.waypoint) {
      const wd = Math.hypot(t.waypoint.x - t.x, t.waypoint.y - t.y);
      if (wd < 0.35) {
        t.waypoint = null;
        t.path = [];
      } else {
        const nearbyWall = this.nearestWallInRange(t, Math.max(def.range, 1.15));
        if (nearbyWall && !def.ignoreWalls && this.tileBlockedToward(t, t.waypoint.x, t.waypoint.y)) {
          this.strike(t, nearbyWall, dt);
          return;
        }
        if (this.mode === "field") {
          const foe = this.closestFoe(t, def.range + 0.55);
          if (foe) {
            this.strikeTroop(t, foe, dt);
            return;
          }
        }
        this.walk(t, t.waypoint.x, t.waypoint.y, st.speed, dt, def.ignoreWalls);
        return;
      }
    }

    if (this.mode === "field") {
      this.tickFieldTroop(t, dt, def, st);
      return;
    }

    if (this.focusId && t.side === "atk" && !this.spectator) {
      const focused = this.buildings.find((b) => b.id === this.focusId && b.alive && b.type !== "wall");
      if (focused && Math.hypot(focused.cx - t.x, focused.cy - t.y) <= 8.5) {
        t.goalId = focused.id;
      }
    }

    let goal = this.buildings.find((b) => b.id === t.goalId && b.alive && b.type !== "wall") ?? null;
    if (!goal) {
      goal = this.pickGoal(t);
      t.goalId = goal?.id ?? null;
      t.targetId = null;
      t.path = [];
      t.pathI = 0;
    }
    if (!goal) return;

    const meleeReach = Math.max(def.range, 1.05);
    if (this.inRange(t, goal, def.range)) {
      t.path = [];
      this.strike(t, goal, dt);
      return;
    }

    const nearWall = this.nearestWallInRange(t, meleeReach);
    if (nearWall && !def.ignoreWalls && !def.shootOverWalls) {
      const blockedToGoal = this.tileBlockedToward(t, goal.cx, goal.cy);
      if (blockedToGoal || this.inRange(t, nearWall, meleeReach)) {
        this.strike(t, nearWall, dt);
        return;
      }
    }

    if (def.ignoreWalls) {
      this.steer(t, goal.cx, goal.cy, st.speed, dt);
      if (this.inRange(t, goal, def.range)) this.strike(t, goal, dt);
      return;
    }

    let breach =
      this.buildings.find((b) => b.id === t.targetId && b.alive && b.type === "wall") ?? null;
    if (breach && this.inRange(t, breach, meleeReach)) {
      this.strike(t, breach, dt);
      return;
    }

    if (t.path.length === 0 || t.pathI >= t.path.length || t.repath <= 0) {
      const planned = this.planRoute(t, goal);
      t.path = planned.path;
      t.pathI = 0;
      t.repath = 1.05 + Math.random() * 0.45;
      if (planned.breach) {
        t.targetId = planned.breach.id;
        breach = planned.breach;
      } else {
        t.targetId = null;
        breach = null;
      }
    }

    if (breach && this.inRange(t, breach, meleeReach)) {
      this.strike(t, breach, dt);
      return;
    }

    const beforeX = t.x;
    const beforeY = t.y;
    const step = t.path[t.pathI];
    if (!step) {
      const wall = this.pickBreachWall(t, goal) ?? nearWall;
      if (wall) {
        t.targetId = wall.id;
        if (this.inRange(t, wall, meleeReach)) {
          this.strike(t, wall, dt);
          return;
        }
        this.walk(t, wall.cx, wall.cy, st.speed, dt, false);
      } else {
        this.walk(t, goal.cx, goal.cy, st.speed, dt, false);
      }
    } else {
      const reached = this.steer(t, step[0] + 0.5, step[1] + 0.5, st.speed, dt);
      if (reached) t.pathI += 1;
    }

    if (Math.hypot(t.x - beforeX, t.y - beforeY) < 0.004) {
      const wall = this.nearestWallInRange(t, meleeReach + 0.4) ?? this.pickBreachWall(t, goal);
      if (wall) {
        t.targetId = wall.id;
        this.strike(t, wall, dt);
      }
    }
  }

  private tickFieldTroop(
    t: BattleTroop,
    dt: number,
    def: (typeof TROOPS)[TroopType],
    st: { hp: number; dps: number; speed: number },
  ) {
    const foe = this.closestFoe(t, 99);
    if (!foe) return;
    if (this.inTroopRange(t, foe, def.range)) {
      this.strikeTroop(t, foe, dt);
      return;
    }
    this.steer(t, foe.x, foe.y, st.speed, dt);
    if (this.inTroopRange(t, foe, def.range)) this.strikeTroop(t, foe, dt);
  }

  private walk(t: BattleTroop, tx: number, ty: number, speed: number, dt: number, ignoreWalls: boolean) {
    if (ignoreWalls) {
      this.steer(t, tx, ty, speed, dt);
      return;
    }
    if (t.path.length === 0 || t.pathI >= t.path.length || t.repath <= 0) {
      const p = findPath(t.x, t.y, tx, ty, this.blocked);
      t.path = p;
      t.pathI = 0;
      t.repath = 0.9;
    }
    const step = t.path[t.pathI];
    if (!step) {
      this.steer(t, tx, ty, speed, dt);
      return;
    }
    const reached = this.steer(t, step[0] + 0.5, step[1] + 0.5, speed, dt);
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
    for (const [sx, sy] of spots.slice(0, 6)) {
      const p = findPath(t.x, t.y, sx + 0.5, sy + 0.5, this.blocked);
      if (!p.length) continue;
      const c = pathCost(p);
      if (c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    const tooFar = best.length > 0 && bestCost > Math.max(direct * 3.2, direct + 14);
    if (best.length && !tooFar) return { path: best, breach: null };

    if (def.shootOverWalls && direct <= def.range + goal.size + 1.5) {
      return { path: [], breach: null };
    }

    const wall = this.pickBreachWall(t, goal) ?? this.nearestWallInRange(t, 8);
    if (wall) {
      const wp = findPath(t.x, t.y, wall.cx, wall.cy, this.blocked);
      return { path: wp.length ? wp : [[Math.floor(wall.cx), Math.floor(wall.cy)]], breach: wall };
    }
    return { path: best, breach: null };
  }

  private approachSpots(
    t: BattleTroop,
    goal: BattleBuilding,
    range: number,
  ): Array<[number, number]> {
    const cells = approachCells(goal.gx, goal.gy, goal.size);
    const open = cells.filter(([x, y]) => !this.blocked[y]?.[x]);
    const ranged: Array<[number, number]> = [];
    if (range > 1.4) {
      const r = Math.ceil(range);
      for (
        let y = Math.max(0, Math.floor(goal.cy) - r);
        y <= Math.min(GRID - 1, Math.floor(goal.cy) + r);
        y++
      ) {
        for (
          let x = Math.max(0, Math.floor(goal.cx) - r);
          x <= Math.min(GRID - 1, Math.floor(goal.cx) + r);
          x++
        ) {
          if (this.blocked[y]?.[x]) continue;
          const d = Math.hypot(x + 0.5 - goal.cx, y + 0.5 - goal.cy);
          if (d <= range + goal.size * 0.45 && d > 0.6) ranged.push([x, y]);
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
      if (toward < -0.55) continue;
      const dist = Math.hypot(dx, dy);
      const line = Math.abs(dx * gy - dy * gx) / gl;
      const s = dist * 0.45 + line * 1.1;
      if (s < score) {
        score = s;
        best = b;
      }
    }
    return best;
  }

  private nearestWallInRange(t: BattleTroop, range: number): BattleBuilding | null {
    let best: BattleBuilding | null = null;
    let bd = range;
    for (const b of this.buildings) {
      if (!b.alive || b.type !== "wall") continue;
      const d = Math.hypot(b.cx - t.x, b.cy - t.y);
      if (d <= bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private tileBlockedToward(t: BattleTroop, tx: number, ty: number): boolean {
    const dist = Math.hypot(tx - t.x, ty - t.y) || 1;
    const nx = t.x + ((tx - t.x) / dist) * 0.7;
    const ny = t.y + ((ty - t.y) / dist) * 0.7;
    const gx = Math.floor(nx);
    const gy = Math.floor(ny);
    return !!this.blocked[gy]?.[gx];
  }

  private inRange(t: BattleTroop, b: BattleBuilding, range: number): boolean {
    return Math.hypot(b.cx - t.x, b.cy - t.y) <= range + b.size * 0.55 + 0.12;
  }

  private inTroopRange(t: BattleTroop, o: BattleTroop, range: number): boolean {
    return Math.hypot(o.x - t.x, o.y - t.y) <= range + 0.5;
  }

  private closestFoe(t: BattleTroop, range: number): BattleTroop | null {
    let best: BattleTroop | null = null;
    let bd = range;
    for (const o of this.troops) {
      if (!o.alive || o.side === t.side) continue;
      const d = Math.hypot(o.x - t.x, o.y - t.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private strike(t: BattleTroop, target: BattleBuilding, dt: number) {
    const def = TROOPS[t.type];
    const st = t.side === "atk" ? this.stats[t.type] : this.foeStats[t.type];
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
        speed: 7,
        dmg: st.dps,
        aoe: 0,
        fromDefense: false,
        side: t.side,
      });
      t.cooldown = 1;
      if (this.sfxGate <= 0) {
        sfxArrow();
        this.sfxGate = 0.12;
      }
    } else {
      this.hurtBuilding(target, st.dps, t.x, t.y);
      t.cooldown = 1;
      if (this.sfxGate <= 0) {
        sfxHit();
        this.sfxGate = 0.16;
      }
    }
  }

  private strikeTroop(t: BattleTroop, target: BattleTroop, dt: number) {
    const def = TROOPS[t.type];
    const st = t.side === "atk" ? this.stats[t.type] : this.foeStats[t.type];
    t.facing = Math.atan2(target.y - t.y, target.x - t.x);
    t.cooldown -= dt;
    if (t.cooldown > 0) return;
    if (def.range > 1.4) {
      this.spawnProj({
        kind: "arrow",
        x: t.x,
        y: t.y,
        z: 0.45,
        tz: 0.25,
        tx: target.x,
        ty: target.y,
        speed: 8,
        dmg: st.dps,
        aoe: 0,
        fromDefense: t.side === "def",
        side: t.side,
      });
      t.cooldown = 1;
      if (this.sfxGate <= 0) {
        sfxArrow();
        this.sfxGate = 0.12;
      }
    } else {
      this.hurtTroop(target, st.dps, t.x, t.y);
      t.cooldown = 1;
      if (this.sfxGate <= 0) {
        sfxHit();
        this.sfxGate = 0.14;
      }
    }
  }

  private steer(t: BattleTroop, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - t.x;
    const dy = ty - t.y;
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
    const dmg = buildingDamage(b.type, b.level);
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
          dmg: dmg * 0.5,
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
          dmg: dmg,
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
      if (!t.alive || t.side !== "atk") continue;
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
        if (p.kind === "boulder")
          p.z += Math.sin(Math.min(1, 1 - dist / 8) * Math.PI) * 0.4 * dt * 8;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private impact(p: Projectile) {
    if (this.mode === "field") {
      const side = p.side ?? (p.fromDefense ? "def" : "atk");
      for (const t of this.troops) {
        if (!t.alive || t.side === side) continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d <= Math.max(0.55, p.aoe)) {
          const fall = p.aoe > 0 ? 1 - d / (p.aoe + 0.01) : 1;
          this.hurtTroop(t, p.dmg * Math.max(0.4, fall), p.x, p.y);
        }
      }
      return;
    }
    if (!p.fromDefense && p.dmg > 0) {
      const b = this.buildings.find(
        (bb) => bb.alive && Math.hypot(bb.cx - p.x, bb.cy - p.y) < bb.size * 0.85,
      );
      if (b) this.hurtBuilding(b, p.dmg, p.x, p.y);
      return;
    }
    if (p.fromDefense && p.dmg > 0) {
      for (const t of this.troops) {
        if (!t.alive || t.side !== "atk") continue;
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d <= Math.max(0.55, p.aoe)) {
          const fall = p.aoe > 0 ? 1 - d / (p.aoe + 0.01) : 1;
          this.hurtTroop(t, p.dmg * Math.max(0.4, fall), p.x, p.y);
        }
      }
      if (p.kind === "boulder") {
        this.burst(p.x, p.y, "#c45a2a", 8);
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
      if (b.type === "castle") this.shake = 1;
      else this.shake = Math.min(1, this.shake + 0.22);
      this.burst(b.cx, b.cy, "#6a5340", 12);
      this.rebuildBlocked();
      for (const t of this.troops) {
        if (t.targetId === b.id || t.goalId === b.id) {
          t.targetId = null;
          t.goalId = t.goalId === b.id ? null : t.goalId;
          t.path = [];
          t.pathI = 0;
        }
      }
      if (b.type === "castle") this.float(b.cx, b.cy - 0.8, "Castelo caiu", "#e4c15a");
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
      this.selected.delete(t.id);
      this.burst(t.x, t.y, "#7a3030", 6);
    }
    void hx;
    void hy;
  }

  private burst(x: number, y: number, color: string, n: number) {
    const count = Math.min(n, 8);
    for (let i = 0; i < count; i++) {
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

  end(retreated: boolean) {
    if (this.phase === "ended") return;
    this.phase = "ended";
    if (this.mode === "field") {
      const atkAlive = this.troops.some((t) => t.alive && t.side === "atk");
      const defAlive = this.troops.some((t) => t.alive && t.side === "def");
      const atkN = (atkAlive ? 1 : 0) + this.reserveCount("atk");
      const defN = (defAlive ? 1 : 0) + this.reserveCount("def");
      let fieldWinner: "atk" | "def" | "draw" = "draw";
      if (retreated) fieldWinner = this.controlSide === "atk" ? "def" : "atk";
      else if (defN <= 0 && atkN > 0) fieldWinner = "atk";
      else if (atkN <= 0 && defN > 0) fieldWinner = "def";
      else if (this.pvp) {
        const atkTotal = this.armyHome("atk");
        const defTotal = this.armyHome("def");
        const a =
          atkTotal.infantry + atkTotal.archers + atkTotal.cavalry + atkTotal.general + atkTotal.generaless + atkTotal.defender;
        const b =
          defTotal.infantry + defTotal.archers + defTotal.cavalry + defTotal.general + defTotal.generaless + defTotal.defender;
        fieldWinner = a > b ? "atk" : b > a ? "def" : "draw";
      } else {
        fieldWinner = !retreated && atkAlive && !defAlive ? "atk" : "def";
      }
      const fieldWin = fieldWinner === "atk";
      const survivors = this.armyHome("atk");
      let casualties = 0;
      for (const t of this.troops) {
        if (t.side !== "atk") continue;
        if (!t.alive) casualties += 1;
      }
      this.result = {
        stars: fieldWin ? 3 : 0,
        destruction: fieldWinner === "atk" ? 1 : fieldWinner === "def" ? 0 : 0.5,
        niens: 0,
        gold: 0,
        bread: 0,
        castleDown: fieldWin,
        survivors,
        casualties,
        elapsed: (BATTLE_MS - this.fightLeft) / 1000,
        retreated,
        fieldWin,
        fieldWinner,
      };
      return;
    }
    const nonWall = this.buildings.filter((b) => b.type !== "wall");
    const destroyed = nonWall.filter((b) => !b.alive).length;
    const destruction = nonWall.length ? destroyed / nonWall.length : 1;
    const castleDown = !this.buildings.find((b) => b.type === "castle")?.alive;
    let stars = 0;
    if (destruction >= 0.5) stars += 1;
    if (castleDown) stars += 1;
    if (destruction >= 0.999) stars = 3;
    if (retreated) stars = Math.min(stars, 2);
    if (destruction >= 0.99) this.goldLoot = this.lootCap;
    const survivors: ArmyCounts = {
      infantry: 0,
      archers: 0,
      cavalry: 0,
      general: 0,
      generaless: 0,
      defender: 0,
    };
    let casualties = 0;
    for (const t of this.troops) {
      if (t.side !== "atk") continue;
      if (t.alive) survivors[t.type] += 1;
      else casualties += 1;
    }
    this.result = {
      stars,
      destruction,
      niens: 0,
      gold: Math.min(this.lootCap, this.goldLoot),
      bread: 0,
      castleDown,
      survivors,
      casualties,
      elapsed: (BATTLE_MS - this.fightLeft) / 1000,
      retreated,
      fieldWin: false,
      fieldWinner: "def" as const,
    };
  }

  get destruction(): number {
    if (this.mode === "field") {
      const defs = this.troops.filter((t) => t.side === "def");
      if (!defs.length) return this.reserveCount("def") > 0 ? 0 : 1;
      const lost = defs.filter((t) => !t.alive).length;
      return lost / defs.length;
    }
    const nonWall = this.buildings.filter((b) => b.type !== "wall");
    if (!nonWall.length) return 1;
    const lost = nonWall.reduce((s, b) => s + (1 - b.hp / b.maxHp), 0);
    return lost / nonWall.length;
  }

  exportSnapshot(): DuelSnap {
    return {
      phase: this.phase,
      prepLeft: this.prepLeft,
      fightLeft: this.fightLeft,
      armyLeft: { ...this.armyLeft },
      foeArmy: { ...this.foeArmy },
      troops: this.troops.map((t) => ({
        id: t.id,
        type: t.type,
        x: t.x,
        y: t.y,
        hp: t.hp,
        maxHp: t.maxHp,
        side: t.side,
        alive: t.alive,
        facing: t.facing,
      })),
    };
  }

  applySnapshot(snap: DuelSnap) {
    this.phase = snap.phase === "fight" || snap.phase === "ended" || snap.phase === "prep" ? snap.phase : this.phase;
    this.prepLeft = snap.prepLeft;
    this.fightLeft = snap.fightLeft;
    this.armyLeft = { ...snap.armyLeft };
    this.foeArmy = { ...snap.foeArmy };
    const keep = this.hostSim ? this.controlSide : null;
    const local = keep ? this.troops.filter((t) => t.side === keep) : [];
    const remote = snap.troops.filter((t) => !keep || t.side !== keep);
    const rebuilt: BattleTroop[] = [
      ...local,
      ...remote.map((t) => ({
        id: t.id,
        type: t.type,
        x: t.x,
        y: t.y,
        hp: t.hp,
        maxHp: t.maxHp,
        goalId: null,
        targetId: null,
        path: [] as Array<[number, number]>,
        pathI: 0,
        facing: t.facing,
        cooldown: 0,
        alive: t.alive,
        repath: 0,
        side: t.side,
        waypoint: null,
        foeId: null,
      })),
    ];
    this.troops = rebuilt;
    if (snap.phase === "fight" && this.phase === "fight") {
      /* already fighting */
    } else if (snap.phase === "fight" && this.phase !== "ended") {
      this.phase = "fight";
      this.prepLeft = 0;
    }
    this.rebuildBlocked();
  }
}

export type DuelSnap = {
  phase: BattlePhase;
  prepLeft: number;
  fightLeft: number;
  armyLeft: ArmyCounts;
  foeArmy: ArmyCounts;
  troops: Array<{
    id: string;
    type: TroopType;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    side: TroopSide;
    alive: boolean;
    facing: number;
  }>;
};

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

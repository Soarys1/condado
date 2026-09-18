import {
  ALLIANCE_FOUND_NIENS,
  BREAD_PACK,
  BREAD_PACK_BUY_GOLD,
  BREAD_PACK_SELL_GOLD,
  BREAD_UPKEEP_PER_TROOP_HOUR,
  BUILDINGS,
  COUNTY_MAX,
  DAILY_ATTACK_CAP,
  DEFENDER_COST,
  GENERAL_MAX_LEVEL,
  GENERAL_UNLOCK_COUNTY,
  GOLD_NAME_PL,
  MAX_TRAIN_QTY,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_BOOST_MS,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  REFERRAL_GOLD,
  SPEED_TRAIN_GOLD,
  TROOPS,
  allianceSlots,
  armyCapacity,
  brtDayKey,
  campUpgradeGold,
  countyUpgradeCost,
  dailyAttackCap,
  dailyNienSendCap,
  defenderCap,
  freePassReward,
  generalCardsFor,
  goldWord,
  isHero,
  lootCapForCounty,
  lootForStars,
  passCostWithDiscount,
  passReward,
  passSeasonKey,
  passWindow,
  productionPerSec,
  rankingWindow,
  resourceLabel,
  storageCap,
  trainCostFor,
  troopCardsFor,
  troopUpgradeBread,
  troopUpgradeGold,
  upgradeCost,
  wallCap,
  weeklyPrize,
  ALLIANCE_DUEL_STALE_MS,
  type BuildingType,
  type PassExtra,
  type ResourceKind,
  type Tradable,
  type TroopType,
  type WallDir,
} from "./constants";
import type { ArmyCounts, BuildingInst, DuelStatus, SaveState, TrainingJob } from "./types";
import { canPlace, canPlaceWall, countType, nid, snapPlace, wallRow } from "./world";

export type LedgerEntry = {
  type: string;
  currency: ResourceKind;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  source: string;
};

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

export const EMPTY_ARMY: ArmyCounts = {
  infantry: 0,
  archers: 0,
  cavalry: 0,
  general: 0,
  generaless: 0,
  defender: 0,
};

export function armyCountOf(a: Partial<ArmyCounts> | null | undefined): number {
  if (!a) return 0;
  return (
    (a.infantry || 0) +
    (a.archers || 0) +
    (a.cavalry || 0) +
    (a.general || 0) +
    (a.generaless || 0) +
    (a.defender || 0)
  );
}

export function normalizeArmy(raw: unknown, fallback?: ArmyCounts): ArmyCounts {
  if (!raw || typeof raw !== "object") return fallback ?? { ...EMPTY_ARMY };
  const a = raw as Record<string, unknown>;
  const has =
    "infantry" in a ||
    "archers" in a ||
    "cavalry" in a ||
    "defender" in a ||
    "general" in a ||
    "generaless" in a;
  if (!has) return fallback ?? { ...EMPTY_ARMY };
  return {
    infantry: Math.max(0, Math.floor(Number(a.infantry) || 0)),
    archers: Math.max(0, Math.floor(Number(a.archers) || 0)),
    cavalry: Math.max(0, Math.floor(Number(a.cavalry) || 0)),
    general: Math.min(1, Math.max(0, Math.floor(Number(a.general) || 0))),
    generaless: Math.min(1, Math.max(0, Math.floor(Number(a.generaless) || 0))),
    defender: Math.max(0, Math.floor(Number(a.defender) || 0)),
  };
}

export function pickDeployType(army: ArmyCounts): TroopType {
  if (army.infantry > 0) return "infantry";
  if (army.archers > 0) return "archers";
  if (army.defender > 0) return "defender";
  if (army.cavalry > 0) return "cavalry";
  if (army.general > 0) return "general";
  return "generaless";
}

export function resolveDuelStatus(
  status: DuelStatus | string,
  opts: {
    until?: number;
    fightEndsAt?: number;
    createdAt?: number;
    challengeUntil?: number;
    now?: number;
  } = {},
): DuelStatus {
  const now = opts.now ?? Date.now();
  const s = String(status ?? "pending") as DuelStatus;
  if (s === "pending") {
    const until = Number(opts.until ?? opts.challengeUntil ?? 0);
    if (until && now > until) return "expired";
    return "pending";
  }
  if (s === "prep" || s === "fight") {
    const fightEndsAt = Number(opts.fightEndsAt ?? 0);
    const until = Number(opts.until ?? 0);
    const createdAt = Number(opts.createdAt ?? 0);
    const challengeUntil = Number(opts.challengeUntil ?? 0);
    const deadline =
      fightEndsAt ||
      until ||
      (createdAt ? createdAt + ALLIANCE_DUEL_STALE_MS : 0) ||
      (challengeUntil ? challengeUntil + ALLIANCE_DUEL_STALE_MS : 0);
    if (!deadline || now > deadline) return "expired";
    return s;
  }
  if (s === "declined" || s === "expired" || s === "done") return s;
  return "expired";
}

export function jobCount(j: Pick<TrainingJob, "count">): number {
  const n = Math.floor(Number(j.count ?? 1));
  return n > 0 ? n : 1;
}

export function trainingQueued(jobs: Pick<TrainingJob, "count">[]): number {
  return jobs.reduce((n, j) => n + jobCount(j), 0);
}

export function armySize(s: Pick<SaveState, "army" | "training">): number {
  const a = s.army;
  return a.infantry + a.archers + a.cavalry + a.general + a.generaless + a.defender + trainingQueued(s.training);
}

export function producerKind(t: BuildingType): "gold" | "bread" | null {
  if (t === "mine") return "gold";
  if (t === "farm") return "bread";
  return null;
}

export function storedAmount(b: BuildingInst, now = Date.now(), boosted = false): number {
  if (b.type !== "mine" && b.type !== "farm") return 0;
  const t0 = b.lastCollect ?? now;
  const elapsed = Math.max(0, (now - t0) / 1000);
  return Math.floor(Math.min(storageCap(b.level), productionPerSec(b.level, boosted) * elapsed));
}

export { lootForStars, lootCapForCounty };

export function kindField(kind: ResourceKind): keyof Pick<SaveState, "gold" | "bread" | "niens" | "troopCards" | "generalCards"> {
  if (kind === "troopCards") return "troopCards";
  if (kind === "generalCards") return "generalCards";
  return kind;
}

function pushLedger(
  out: LedgerEntry[],
  s: SaveState,
  type: string,
  currency: ResourceKind,
  amount: number,
  source: string,
): void {
  if (!amount) return;
  const field = kindField(currency);
  const before = Number(s[field]);
  out.push({
    type,
    currency,
    amount,
    balanceBefore: before,
    balanceAfter: before + amount,
    source,
  });
}

function coalesceJobs(jobs: TrainingJob[]): TrainingJob[] {
  const map = new Map<TroopType, TrainingJob>();
  const order: TroopType[] = [];
  for (const j of jobs) {
    const prev = map.get(j.type);
    if (!prev) {
      map.set(j.type, { ...j, count: jobCount(j) });
      order.push(j.type);
    } else {
      map.set(j.type, {
        ...prev,
        count: jobCount(prev) + jobCount(j),
        remaining: Math.min(prev.remaining, j.remaining),
      });
    }
  }
  return order.map((t) => map.get(t)!);
}

export function applyTraining(s: SaveState, dtMs: number): { army: ArmyCounts; jobs: TrainingJob[] } {
  const army = { ...s.army };
  const raw: TrainingJob[] = [];
  for (const j of s.training) {
    let remaining = j.remaining - dtMs;
    let count = jobCount(j);
    const trainMs = Math.max(1, TROOPS[j.type]?.trainMs ?? 6_000);
    while (count > 0 && remaining <= 0) {
      army[j.type] += 1;
      count -= 1;
      if (count > 0) remaining += trainMs;
    }
    if (count > 0) raw.push({ id: j.id, type: j.type, remaining, count });
  }
  return { army, jobs: coalesceJobs(raw) };
}

export function settle(s: SaveState, now = Date.now()): { save: SaveState; ledger: LedgerEntry[] } {
  const ledger: LedgerEntry[] = [];
  const dtMs = Math.min(8 * 3600_000, Math.max(0, now - (s.lastTick || now)));
  const trained = applyTraining(s, dtMs);
  const season = passSeasonKey(now).key;
  const pass =
    s.pass?.season === season
      ? {
          season,
          purchased: !!s.pass.purchased,
          stars: Number(s.pass.stars ?? 0),
          claimed: Array.isArray(s.pass.claimed) ? s.pass.claimed : [],
          claimedFree: Array.isArray(s.pass.claimedFree) ? s.pass.claimedFree : [],
          extrasClaimed: Array.isArray(s.pass.extrasClaimed) ? s.pass.extrasClaimed : [],
        }
      : { season, purchased: false, stars: 0, claimed: [], claimedFree: [], extrasClaimed: [] };

  const war = s.war;
  const gold = s.gold;

  const troopsNow = armySize({ army: trained.army, training: trained.jobs });
  const upkeep = troopsNow * BREAD_UPKEEP_PER_TROOP_HOUR * (dtMs / 3600_000);
  let bread = s.bread;
  if (upkeep > 0) {
    const spend = Math.min(bread, upkeep);
    if (spend) {
      pushLedger(ledger, { ...s, bread }, "upkeep", "bread", -spend, "upkeep");
      bread -= spend;
    }
  }

  const rankWin = rankingWindow(now);
  const weekStars = s.weekKey === rankWin.key ? s.weekStars : 0;

  return {
    save: {
      ...s,
      army: trained.army,
      training: trained.jobs,
      lastTick: now,
      pass,
      war,
      gold,
      bread,
      weekStars,
      weekKey: rankWin.key,
    },
    ledger,
  };
}

export function collectBuilding(s: SaveState, id: string, now = Date.now()): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const b = s.buildings.find((x) => x.id === id);
  if (!b) throw new GameError("Construção não encontrada.");
  const kind = producerKind(b.type);
  if (!kind) throw new GameError("Isto não produz recursos.");
  const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
  if (amt < 1) throw new GameError("Ainda está a produzir.");
  const buildings = s.buildings.map((x) => (x.id === id ? { ...x, lastCollect: now } : x));
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "collect", kind, amt, id);
  const next = {
    ...s,
    buildings,
    gold: kind === "gold" ? s.gold + amt : s.gold,
    bread: kind === "bread" ? s.bread + amt : s.bread,
  };
  return {
    save: next,
    ledger,
    toast: kind === "gold" ? `+${amt} ${goldWord(amt)}` : `+${amt} pão`,
  };
}

export function collectAllBuildings(s: SaveState, now = Date.now()): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  let gold = 0;
  let bread = 0;
  const buildings = s.buildings.map((b) => {
    if (b.type === "mine") {
      const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
      gold += amt;
      return amt > 0 ? { ...b, lastCollect: now } : b;
    }
    if (b.type === "farm") {
      const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
      bread += amt;
      return amt > 0 ? { ...b, lastCollect: now } : b;
    }
    return b;
  });
  if (!gold && !bread) throw new GameError("Nada pronto para recolher.");
  const ledger: LedgerEntry[] = [];
  const next = { ...s, buildings, gold: s.gold + gold, bread: s.bread + bread };
  if (gold) pushLedger(ledger, s, "collect_all", "gold", gold, "collectAll");
  if (bread) pushLedger(ledger, { ...s, gold: next.gold }, "collect_all", "bread", bread, "collectAll");
  return { save: next, ledger, toast: `Coletado ${gold} ${goldWord(gold)} e ${bread} pão.` };
}

export function placeBuilding(
  s: SaveState,
  input: { type: BuildingType; gx: number; gy: number; dir?: WallDir; movingId?: string | null },
): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const type = input.type;
  const def = BUILDINGS[type];
  if (!def) throw new GameError("Construção inválida.");
  const ignore = input.movingId ?? undefined;
  const snapped = snapPlace(s.buildings, type, input.gx, input.gy, ignore);
  if (!snapped || !canPlace(s.buildings, type, snapped.gx, snapped.gy, ignore)) {
    throw new GameError("Não cabe aqui. Deixe espaço entre as construções.");
  }
  if (ignore) {
    const existing = s.buildings.find((b) => b.id === ignore);
    if (!existing) throw new GameError("Construção não encontrada.");
    return {
      save: {
        ...s,
        buildings: s.buildings.map((b) => (b.id === ignore ? { ...b, gx: snapped.gx, gy: snapped.gy } : b)),
      },
      ledger: [],
      toast: "Estrutura movida.",
    };
  }
  if (s.gold < def.costGold) throw new GameError(`Faltam ${GOLD_NAME_PL}.`);
  if (type === "wall" && !canPlaceWall(s.buildings, s.countyLevel)) {
    throw new GameError(`Limite de muros: ${wallCap(s.countyLevel)}.`);
  }
  const b: BuildingInst = {
    id: nid(type),
    type,
    gx: snapped.gx,
    gy: snapped.gy,
    level: 1,
    lastCollect: Date.now(),
    ...(type === "wall" ? { dir: input.dir ?? "h" } : {}),
  };
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "place", "gold", -def.costGold, type);
  return {
    save: { ...s, buildings: [...s.buildings, b], gold: s.gold - def.costGold },
    ledger,
    toast: `${def.name} erguido.`,
  };
}

export function upgradeBuilding(s: SaveState, id: string): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const b = s.buildings.find((x) => x.id === id);
  if (!b) throw new GameError("Construção não encontrada.");
  if (b.type === "castle") throw new GameError("O castelo avança com o nível do condado.");
  if (b.level >= s.countyLevel) throw new GameError("Limite do condado. Maximize tudo e avance o nível.");
  const cost = upgradeCost(b.type, b.level);
  if (s.gold < cost) throw new GameError(`Faltam ${GOLD_NAME_PL} para melhorar.`);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "upgrade", "gold", -cost, b.type);
  return {
    save: {
      ...s,
      gold: s.gold - cost,
      buildings: s.buildings.map((x) => (x.id === id ? { ...x, level: x.level + 1 } : x)),
    },
    ledger,
    toast: `${BUILDINGS[b.type].name} nível ${b.level + 1}.`,
  };
}

export function upgradeAllOfType(s: SaveState, type: BuildingType): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const targets = s.buildings.filter((b) => b.type === type && b.type !== "castle" && b.level < s.countyLevel);
  if (!targets.length) throw new GameError("Nada para melhorar neste tipo.");
  const cost = targets.reduce((n, b) => n + upgradeCost(b.type, b.level), 0);
  if (s.gold < cost) throw new GameError(`Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  const ids = new Set(targets.map((b) => b.id));
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "upgrade_type", "gold", -cost, type);
  return {
    save: {
      ...s,
      gold: s.gold - cost,
      buildings: s.buildings.map((b) => (ids.has(b.id) ? { ...b, level: b.level + 1 } : b)),
    },
    ledger,
    toast: `${targets.length}× ${BUILDINGS[type].name} → Nv.+1 · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
  };
}

export function upgradeWallRowSim(s: SaveState, id: string): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const start = s.buildings.find((x) => x.id === id);
  if (!start || start.type !== "wall") throw new GameError("Escolhe um muro.");
  const row = wallRow(s.buildings, start);
  const targets = row.filter((b) => b.level < s.countyLevel);
  if (!targets.length) throw new GameError("Fileira já no limite do condado.");
  const cost = targets.reduce((n, b) => n + upgradeCost("wall", b.level), 0);
  if (s.gold < cost) throw new GameError(`Fileira: ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  const ids = new Set(targets.map((b) => b.id));
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "upgrade_wall_row", "gold", -cost, "wall");
  return {
    save: {
      ...s,
      gold: s.gold - cost,
      buildings: s.buildings.map((b) => (ids.has(b.id) ? { ...b, level: b.level + 1 } : b)),
    },
    ledger,
    toast: `Fileira ${targets.length} muros · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
  };
}

export function demolishBuilding(s: SaveState, id: string): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const b = s.buildings.find((x) => x.id === id);
  if (!b || b.type === "castle") throw new GameError("Não podes demolir o castelo.");
  const refund = Math.floor(BUILDINGS[b.type].costGold * 0.5);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "demolish", "gold", refund, b.type);
  return {
    save: {
      ...s,
      buildings: s.buildings.filter((x) => x.id !== id),
      gold: s.gold + refund,
    },
    ledger,
    toast: `Demolido. +${refund} ${goldWord(refund)}.`,
  };
}

export function rotateWalls(s: SaveState, id: string, rowIds?: string[]): { save: SaveState; toast: string } {
  const b = s.buildings.find((x) => x.id === id);
  if (!b || b.type !== "wall") throw new GameError("Escolhe um muro.");
  const ids = new Set(rowIds && rowIds.length ? rowIds : [id]);
  const dir: WallDir = b.dir === "v" ? "h" : "v";
  return {
    save: {
      ...s,
      buildings: s.buildings.map((x) => (ids.has(x.id) ? { ...x, dir } : x)),
    },
    toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—).",
  };
}

function enqueueTrain(training: TrainingJob[], type: TroopType, qty: number, trainMs: number): TrainingJob[] {
  const i = training.findIndex((t) => t.type === type);
  if (i >= 0) {
    const cur = training[i]!;
    const next = training.slice();
    next[i] = { ...cur, count: jobCount(cur) + qty };
    return next;
  }
  return [...training, { id: nid("t"), type, remaining: trainMs, count: qty }];
}

function clampTrainQty(raw: unknown): number {
  const n = Math.floor(Number(raw ?? 1));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_TRAIN_QTY, n);
}

export function trainTroop(
  s: SaveState,
  type: TroopType,
  qtyRaw: unknown = 1,
): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const def = TROOPS[type];
  if (!def) throw new GameError("Tropa inválida.");
  if (countType(s.buildings, "barracks") < 1) throw new GameError("Construa um quartel primeiro.");
  let qty = clampTrainQty(qtyRaw);
  const ledger: LedgerEntry[] = [];
  if (isHero(type)) {
    if (s.army[type] + s.training.filter((t) => t.type === type).reduce((n, t) => n + jobCount(t), 0) >= 1) {
      throw new GameError(`Só um${type === "generaless" ? "a" : ""} ${def.name.toLowerCase()} por condado.`);
    }
    qty = 1;
  }
  if (type === "defender") {
    if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
    const used = s.army.defender + s.training.filter((t) => t.type === "defender").reduce((n, t) => n + jobCount(t), 0);
    const room = defenderCap(s.campLevel) - used;
    qty = Math.min(qty, room);
    if (qty < 1) throw new GameError("Capacidade de defensores no máximo. Melhore o campo.");
    const campRoom = armyCapacity(countType(s.buildings, "camp")) - armySize(s);
    qty = Math.min(qty, campRoom);
    if (qty < 1) throw new GameError("Acampamento lotado. Construa outro.");
    const unit = trainCostFor(type, s.troopLevels[type] ?? 1);
    const cost = unit.amount * qty;
    if (s.gold < cost) throw new GameError(`Faltam ${GOLD_NAME_PL}.`);
    pushLedger(ledger, s, "train", "gold", -cost, type);
    return {
      save: {
        ...s,
        gold: s.gold - cost,
        training: enqueueTrain(s.training, type, qty, def.trainMs),
      },
      ledger,
      toast: qty === 1 ? "Recrutando defensor da guilda." : `Recrutando ${qty} defensores da guilda.`,
    };
  }
  const cap = armyCapacity(countType(s.buildings, "camp"));
  const room = cap - armySize(s);
  qty = Math.min(qty, room);
  if (qty < 1) throw new GameError("Acampamento lotado. Construa outro.");
  const unit = trainCostFor(type, s.troopLevels[type] ?? 1);
  const cost = unit.amount * qty;
  if (s.bread < cost) throw new GameError("Pão insuficiente.");
  pushLedger(ledger, s, "train", "bread", -cost, type);
  return {
    save: {
      ...s,
      bread: s.bread - cost,
      training: enqueueTrain(s.training, type, qty, def.trainMs),
    },
    ledger,
    toast: qty === 1 ? `Recrutando ${def.name}.` : `Recrutando ${qty} ${def.name}.`,
  };
}

export function speedTrainJob(s: SaveState, id: string): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const job = s.training.find((t) => t.id === id);
  if (!job) throw new GameError("Recruta não encontrado.");
  if (s.gold < SPEED_TRAIN_GOLD) {
    throw new GameError(`Precisa de ${SPEED_TRAIN_GOLD} ${GOLD_NAME_PL} para acelerar.`);
  }
  const army = { ...s.army };
  army[job.type] += 1;
  const left = jobCount(job) - 1;
  const training =
    left > 0
      ? s.training.map((t) =>
          t.id === id ? { ...t, count: left, remaining: TROOPS[job.type].trainMs } : t,
        )
      : s.training.filter((t) => t.id !== id);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "speed_train", "gold", -SPEED_TRAIN_GOLD, job.type);
  return {
    save: {
      ...s,
      gold: s.gold - SPEED_TRAIN_GOLD,
      army,
      training,
    },
    ledger,
    toast: `${TROOPS[job.type].name} pronto.`,
  };
}

export function buyNienSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.gold < NIEN_COST_GOLD) {
    throw new GameError(`Precisa de ${NIEN_COST_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  }
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "buy_nien", "gold", -NIEN_COST_GOLD, "shop");
  const next = { ...s, gold: s.gold - NIEN_COST_GOLD, niens: s.niens + 1 };
  pushLedger(ledger, next, "buy_nien", "niens", 1, "shop");
  return { save: next, ledger, toast: "+1 Nien. Gema selada." };
}

export function sellNienSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.niens < 1) throw new GameError("Sem Niens para vender.");
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "sell_nien", "niens", -1, "shop");
  const next = { ...s, niens: s.niens - 1, gold: s.gold + NIEN_SELL_GOLD };
  pushLedger(ledger, { ...s, niens: next.niens }, "sell_nien", "gold", NIEN_SELL_GOLD, "shop");
  return { save: next, ledger, toast: `+${NIEN_SELL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.` };
}

export function buyBreadPackSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.gold < BREAD_PACK_BUY_GOLD) {
    throw new GameError(`Precisa de ${BREAD_PACK_BUY_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  }
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "buy_bread", "gold", -BREAD_PACK_BUY_GOLD, "shop");
  const next = { ...s, gold: s.gold - BREAD_PACK_BUY_GOLD, bread: s.bread + BREAD_PACK };
  pushLedger(ledger, { ...s, gold: next.gold }, "buy_bread", "bread", BREAD_PACK, "shop");
  return { save: next, ledger, toast: `+${BREAD_PACK.toLocaleString("pt")} pães.` };
}

export function sellBreadPackSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.bread < BREAD_PACK) throw new GameError(`Precisa de ${BREAD_PACK.toLocaleString("pt")} pães.`);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "sell_bread", "bread", -BREAD_PACK, "shop");
  const next = { ...s, bread: s.bread - BREAD_PACK, gold: s.gold + BREAD_PACK_SELL_GOLD };
  pushLedger(ledger, { ...s, bread: next.bread }, "sell_bread", "gold", BREAD_PACK_SELL_GOLD, "shop");
  return { save: next, ledger, toast: `+${BREAD_PACK_SELL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.` };
}

export function spendForTransfer(
  s: SaveState,
  amount: number,
  kind: ResourceKind,
  now = Date.now(),
): { save: SaveState; ledger: LedgerEntry[] } {
  const n = Math.floor(amount);
  if (n <= 0) throw new GameError("Quantia inválida.");
  const field = kindField(kind);
  if (n > Number(s[field])) throw new GameError("Quantia inválida.");
  let next = { ...s };
  if (kind === "niens") {
    const day = brtDayKey(now);
    const sent = s.niensSentDay === day ? s.niensSentToday : 0;
    const cap = dailyNienSendCap(s.countyLevel);
    if (sent + n > cap) {
      throw new GameError(`No nível ${s.countyLevel} podes enviar ${cap} Niens por dia. Já enviaste ${sent}.`);
    }
    next.niensSentDay = day;
    next.niensSentToday = sent + n;
  }
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, next, "transfer_out", kind, -n, "transfer");
  next = { ...next, [field]: Number(next[field]) - n } as SaveState;
  return { save: next, ledger };
}

export function creditResource(
  s: SaveState,
  amount: number,
  kind: ResourceKind,
  type: string,
  source: string,
): { save: SaveState; ledger: LedgerEntry[] } {
  const n = Math.floor(amount);
  if (!n) return { save: s, ledger: [] };
  const field = kindField(kind);
  if (n < 0 && Number(s[field]) + n < 0) throw new GameError("Recurso insuficiente.");
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, type, kind, n, source);
  return { save: { ...s, [field]: Number(s[field]) + n } as SaveState, ledger };
}

export function upgradeCountySim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.countyLevel >= COUNTY_MAX) throw new GameError("Condado no nível máximo.");
  const need = s.buildings.filter((b) => b.type !== "wall" && b.type !== "castle" && b.level < s.countyLevel);
  if (need.length) throw new GameError("Full construção: maximize todas as estruturas atuais.");
  const cost = countyUpgradeCost(s.countyLevel);
  if (s.gold < cost.gold || s.niens < cost.niens) {
    throw new GameError(cost.niens ? `Precisa de ${cost.niens} Niens.` : `Precisa de ${cost.gold.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  }
  const ledger: LedgerEntry[] = [];
  if (cost.gold) pushLedger(ledger, s, "upgrade_county", "gold", -cost.gold, "county");
  if (cost.niens) pushLedger(ledger, s, "upgrade_county", "niens", -cost.niens, "county");
  const next = s.countyLevel + 1;
  return {
    save: {
      ...s,
      countyLevel: next,
      gold: s.gold - cost.gold,
      niens: s.niens - cost.niens,
      buildings: s.buildings.map((b) => (b.type === "castle" ? { ...b, level: next } : b)),
    },
    ledger,
    toast: `Condado nível ${next}. Saque máximo +5%.`,
  };
}

export function upgradeTroopSim(s: SaveState, type: TroopType): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
  const cur = s.troopLevels[type];
  const ledger: LedgerEntry[] = [];
  if (isHero(type)) {
    if (s.countyLevel < GENERAL_UNLOCK_COUNTY) throw new GameError(`Generais só evoluem no condado ${GENERAL_UNLOCK_COUNTY}.`);
    if (cur >= GENERAL_MAX_LEVEL) throw new GameError("General no nível 7.");
    const cards = generalCardsFor(cur + 1);
    if (s.generalCards < cards) throw new GameError(`Precisa de ${cards} cartas de general.`);
    pushLedger(ledger, s, "upgrade_troop", "generalCards", -cards, type);
    return {
      save: {
        ...s,
        generalCards: s.generalCards - cards,
        troopLevels: { ...s.troopLevels, [type]: cur + 1 },
      },
      ledger,
      toast: `${TROOPS[type].name} nível ${cur + 1}.`,
    };
  }
  if (cur >= 15) throw new GameError("Tropa no nível 15.");
  const cards = troopCardsFor(cur + 1);
  const g = troopUpgradeGold(cur + 1);
  const br = troopUpgradeBread(cur + 1);
  if (s.troopCards < cards || s.gold < g || s.bread < br) {
    throw new GameError(`Precisa ${cards} cartas, ${g} ${GOLD_NAME_PL}, ${br} pão.`);
  }
  pushLedger(ledger, s, "upgrade_troop", "troopCards", -cards, type);
  pushLedger(ledger, s, "upgrade_troop", "gold", -g, type);
  pushLedger(ledger, s, "upgrade_troop", "bread", -br, type);
  return {
    save: {
      ...s,
      troopCards: s.troopCards - cards,
      gold: s.gold - g,
      bread: s.bread - br,
      troopLevels: { ...s.troopLevels, [type]: cur + 1 },
    },
    ledger,
    toast: `${TROOPS[type].name} nível ${cur + 1}.`,
  };
}

export function upgradeCampSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
  if (s.campLevel >= s.countyLevel) throw new GameError("Campo no limite do condado.");
  const cost = campUpgradeGold(s.campLevel);
  if (s.gold < cost) throw new GameError(`Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "upgrade_camp", "gold", -cost, "camp");
  return {
    save: { ...s, gold: s.gold - cost, campLevel: s.campLevel + 1 },
    ledger,
    toast: `Campo de treino nível ${s.campLevel + 1}.`,
  };
}

export function buyPassSim(s: SaveState, now = Date.now()): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const win = passWindow(now);
  if (!win.active) throw new GameError("O passe abre no dia 1. Fevereiro dura 27 dias.");
  if (s.pass.purchased) throw new GameError("Passe já selado nesta temporada.");
  const cost = passCostWithDiscount(s.pass.season, !!s.passDiscount);
  if (s.niens < cost) throw new GameError(`Precisa de ${cost} Niens.`);
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "buy_pass", "niens", -cost, s.pass.season);
  return {
    save: { ...s, niens: s.niens - cost, pass: { ...s.pass, purchased: true }, passDiscount: false },
    ledger,
    toast: s.passDiscount ? `Passe selado com 45% de desconto · ${cost} Niens.` : "Passe de Batalha selado.",
  };
}

export function claimPassSim(s: SaveState, level: number): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
  const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
  if (level > reached || s.pass.claimed.includes(level)) throw new GameError("Este nível ainda não está disponível.");
  const r = passReward(level);
  const ledger: LedgerEntry[] = [];
  if (r.gold) pushLedger(ledger, s, "claim_pass", "gold", r.gold, `pass:${level}`);
  if (r.bread) pushLedger(ledger, s, "claim_pass", "bread", r.bread, `pass:${level}`);
  if (r.niens) pushLedger(ledger, s, "claim_pass", "niens", r.niens, `pass:${level}`);
  if (r.troopCards) pushLedger(ledger, s, "claim_pass", "troopCards", r.troopCards, `pass:${level}`);
  if (r.generalCards) pushLedger(ledger, s, "claim_pass", "generalCards", r.generalCards, `pass:${level}`);
  return {
    save: {
      ...s,
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      niens: s.niens + r.niens,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, claimed: [...s.pass.claimed, level] },
    },
    ledger,
    toast: `Nível ${level}: ${r.label}`,
  };
}

export function claimFreePassSim(s: SaveState, level: number): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
  const claimedFree = s.pass.claimedFree ?? [];
  if (level > reached || claimedFree.includes(level)) throw new GameError("Este nível ainda não está disponível.");
  const r = freePassReward(level);
  const ledger: LedgerEntry[] = [];
  if (r.gold) pushLedger(ledger, s, "claim_pass_free", "gold", r.gold, `pass-free:${level}`);
  if (r.bread) pushLedger(ledger, s, "claim_pass_free", "bread", r.bread, `pass-free:${level}`);
  if (r.troopCards) pushLedger(ledger, s, "claim_pass_free", "troopCards", r.troopCards, `pass-free:${level}`);
  if (r.generalCards) pushLedger(ledger, s, "claim_pass_free", "generalCards", r.generalCards, `pass-free:${level}`);
  return {
    save: {
      ...s,
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, claimedFree: [...claimedFree, level] },
    },
    ledger,
    toast: `Trilha grátis Nv.${level}: ${r.label}`,
  };
}

export function claimPassAllSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
  const claimedFree = new Set(s.pass.claimedFree ?? []);
  const claimedPaid = new Set(s.pass.claimed);
  let gold = 0;
  let bread = 0;
  let niens = 0;
  let troopCards = 0;
  let generalCards = 0;
  const nextFree = [...(s.pass.claimedFree ?? [])];
  const nextPaid = [...s.pass.claimed];
  let nFree = 0;
  let nPaid = 0;
  for (let lv = 1; lv <= reached; lv++) {
    if (!claimedFree.has(lv)) {
      const r = freePassReward(lv);
      gold += r.gold;
      bread += r.bread;
      troopCards += r.troopCards;
      generalCards += r.generalCards;
      nextFree.push(lv);
      nFree += 1;
    }
    if (s.pass.purchased && !claimedPaid.has(lv)) {
      const r = passReward(lv);
      gold += r.gold;
      bread += r.bread;
      niens += r.niens;
      troopCards += r.troopCards;
      generalCards += r.generalCards;
      nextPaid.push(lv);
      nPaid += 1;
    }
  }
  if (nFree + nPaid < 1) throw new GameError("Não há recompensas por recolher.");
  const ledger: LedgerEntry[] = [];
  let cur: SaveState = s;
  if (gold) {
    pushLedger(ledger, cur, "claim_pass_all", "gold", gold, "pass");
    cur = { ...cur, gold: cur.gold + gold };
  }
  if (bread) {
    pushLedger(ledger, cur, "claim_pass_all", "bread", bread, "pass");
    cur = { ...cur, bread: cur.bread + bread };
  }
  if (niens) {
    pushLedger(ledger, cur, "claim_pass_all", "niens", niens, "pass");
    cur = { ...cur, niens: cur.niens + niens };
  }
  if (troopCards) {
    pushLedger(ledger, cur, "claim_pass_all", "troopCards", troopCards, "pass");
    cur = { ...cur, troopCards: cur.troopCards + troopCards };
  }
  if (generalCards) {
    pushLedger(ledger, cur, "claim_pass_all", "generalCards", generalCards, "pass");
    cur = { ...cur, generalCards: cur.generalCards + generalCards };
  }
  return {
    save: {
      ...cur,
      pass: { ...s.pass, claimed: nextPaid, claimedFree: nextFree },
    },
    ledger,
    toast: `Recolhidas ${nFree + nPaid} recompensas do passe.`,
  };
}

export function claimPassExtraSim(
  s: SaveState,
  extra: PassExtra,
  now = Date.now(),
): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
  const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
  if (reached < PASS_LEVELS && !s.pass.claimed.includes(PASS_LEVELS)) {
    throw new GameError("Chega ao nível 50 do passe pago para resgatar os cupons.");
  }
  const extras = s.pass.extrasClaimed ?? [];
  if (extras.includes(extra)) throw new GameError("Este cupom já foi resgatado.");
  if (extra === "boost") {
    return {
      save: {
        ...s,
        boostUntil: now + PASS_BOOST_MS,
        pass: { ...s.pass, extrasClaimed: [...extras, "boost"] },
      },
      ledger: [],
      toast: "Boost +40% em minas e fazendas por 30 dias. Já está ativo.",
    };
  }
  return {
    save: {
      ...s,
      passDiscount: true,
      pass: { ...s.pass, extrasClaimed: [...extras, "discount"] },
    },
    ledger: [],
    toast: "Pergaminho de 45% no próximo passe. Usa-o na compra.",
  };
}

export function skipPassSim(s: SaveState, now = Date.now()): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (!passWindow(now).active) throw new GameError("O passe abre em setembro, dia 1.");
  if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
  if (s.niens < 1) throw new GameError("Precisa de 1 Nien.");
  const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
  const next = reached + 1;
  if (next > PASS_LEVELS) throw new GameError("Passe no máximo.");
  const r = passReward(next);
  const claimed = s.pass.claimed.includes(next) ? s.pass.claimed : [...s.pass.claimed, next];
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "skip_pass", "niens", -1, `pass:${next}`);
  if (r.niens) pushLedger(ledger, s, "skip_pass", "niens", r.niens, `pass:${next}`);
  if (r.gold) pushLedger(ledger, s, "skip_pass", "gold", r.gold, `pass:${next}`);
  if (r.bread) pushLedger(ledger, s, "skip_pass", "bread", r.bread, `pass:${next}`);
  if (r.troopCards) pushLedger(ledger, s, "skip_pass", "troopCards", r.troopCards, `pass:${next}`);
  if (r.generalCards) pushLedger(ledger, s, "skip_pass", "generalCards", r.generalCards, `pass:${next}`);
  return {
    save: {
      ...s,
      niens: s.niens - 1 + r.niens,
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, stars: s.pass.stars + PASS_STARS_PER_LEVEL, claimed },
    },
    ledger,
    toast: `Nível ${next} comprado: ${r.label}`,
  };
}

export function foundAllianceSim(
  s: SaveState,
  name: string,
  openJoin = true,
): { save: SaveState; ledger: LedgerEntry[]; toast: string } {
  if (s.alliance) throw new GameError("Já tens aliança.");
  if (s.niens < ALLIANCE_FOUND_NIENS) throw new GameError(`Precisa de ${ALLIANCE_FOUND_NIENS} Niens.`);
  const id = `AL-${s.player.id.slice(4, 8)}`;
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "found_alliance", "niens", -ALLIANCE_FOUND_NIENS, id);
  return {
    save: {
      ...s,
      niens: s.niens - ALLIANCE_FOUND_NIENS,
      alliance: {
        id,
        name: name.trim().slice(0, 22) || "Aliança do Condado",
        members: [{ id: s.player.id, nick: s.player.nick }],
        minLevel: 1,
        level: 1,
        xp: 0,
        leaderId: s.player.id,
        viceId: null,
        slots: allianceSlots(1),
        openJoin,
        joinRequests: [],
        ceasefire: {},
      },
    },
    ledger,
    toast: openJoin ? `Aliança ${name.trim()} fundada. Entrada livre.` : `Aliança ${name.trim()} fundada. Entrada com pedido.`,
  };
}

export function grantReferralSim(s: SaveState): { save: SaveState; ledger: LedgerEntry[]; toast: string } | null {
  if (s.referralClaimed || s.countyLevel < 3 || !s.referredBy) return null;
  const ledger: LedgerEntry[] = [];
  pushLedger(ledger, s, "referral", "gold", REFERRAL_GOLD, s.referredBy);
  return {
    save: { ...s, gold: s.gold + REFERRAL_GOLD, referralClaimed: true },
    ledger,
    toast: `Indique e Ganhe: tu e o amigo recebem ${REFERRAL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
  };
}

export function applyWeeklyPrize(
  s: SaveState,
  rank: number,
): { save: SaveState; ledger: LedgerEntry[]; prize: NonNullable<ReturnType<typeof weeklyPrize>> } {
  const prize = weeklyPrize(rank);
  if (!prize) throw new GameError("Fora do top 20 desta semana.");
  const ledger: LedgerEntry[] = [];
  if (prize.gold) pushLedger(ledger, s, "weekly_prize", "gold", prize.gold, `rank:${rank}`);
  if (prize.troopCards) pushLedger(ledger, s, "weekly_prize", "troopCards", prize.troopCards, `rank:${rank}`);
  if (prize.generalCards) pushLedger(ledger, s, "weekly_prize", "generalCards", prize.generalCards, `rank:${rank}`);
  return {
    save: {
      ...s,
      gold: s.gold + prize.gold,
      troopCards: s.troopCards + prize.troopCards,
      generalCards: s.generalCards + prize.generalCards,
      weekClaimed: s.weekKey,
    },
    ledger,
    prize,
  };
}

export function addWeekStars(
  s: SaveState,
  stars: number,
  now = Date.now(),
  opts?: { countRaid?: boolean },
): SaveState {
  const n = Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)));
  const win = rankingWindow(now);
  const weekStars = (s.weekKey === win.key ? s.weekStars : 0) + (win.open ? n : 0);
  return {
    ...s,
    stars: s.stars + n,
    weekStars,
    weekKey: win.key,
    pass: { ...s.pass, stars: s.pass.stars + n },
    raidsWon: s.raidsWon + (opts?.countRaid !== false && n > 0 ? 1 : 0),
  };
}

export function applyRaidFinish(
  s: SaveState,
  input: {
    stars: number;
    survivors: ArmyCounts;
    startedArmy: ArmyCounts;
    goldTaken: number;
    defenderNick: string;
    defenderLevel?: number;
    now?: number;
  },
): { save: SaveState; ledger: LedgerEntry[] } {
  const now = input.now ?? Date.now();
  const stars = Math.max(0, Math.min(3, Math.floor(input.stars)));
  const lv = Math.max(1, input.defenderLevel ?? s.countyLevel);
  const goldTaken = Math.max(0, Math.min(lootForStars(stars, lv), Math.floor(input.goldTaken)));
  const army: ArmyCounts = {
    infantry: clampSurvivor("infantry", input.survivors, input.startedArmy),
    archers: clampSurvivor("archers", input.survivors, input.startedArmy),
    cavalry: clampSurvivor("cavalry", input.survivors, input.startedArmy),
    general: clampSurvivor("general", input.survivors, input.startedArmy),
    generaless: clampSurvivor("generaless", input.survivors, input.startedArmy),
    defender: clampSurvivor("defender", input.survivors, input.startedArmy),
  };
  const starred = addWeekStars(s, stars, now);
  const ledger: LedgerEntry[] = [];
  if (goldTaken) pushLedger(ledger, starred, "raid_loot", "gold", goldTaken, input.defenderNick);
  return {
    save: {
      ...starred,
      army: {
        infantry: s.army.infantry - input.startedArmy.infantry + army.infantry,
        archers: s.army.archers - input.startedArmy.archers + army.archers,
        cavalry: s.army.cavalry - input.startedArmy.cavalry + army.cavalry,
        general: s.army.general - input.startedArmy.general + army.general,
        generaless: s.army.generaless - input.startedArmy.generaless + army.generaless,
        defender: s.army.defender - input.startedArmy.defender + army.defender,
      },
      gold: s.gold + goldTaken,
    },
    ledger,
  };
}

function clampSurvivor(type: keyof ArmyCounts, survivors: ArmyCounts, started: ArmyCounts): number {
  const sent = Math.max(0, Math.floor(started[type] ?? 0));
  const got = Math.max(0, Math.floor(survivors[type] ?? 0));
  return Math.min(sent, got);
}

export function registerAttack(s: SaveState, targetId: string, warOn: boolean, now = Date.now()): SaveState {
  const day = brtDayKey(now);
  const rec = s.attacksByTarget[targetId];
  const usedToday = rec && rec.day === day ? rec.count : 0;
  const cap = dailyAttackCap(warOn);
  if (usedToday >= cap) {
    throw new GameError(
      warOn
        ? `Esta base já sofreu ${cap} ataques de guerra hoje.`
        : `Uma conta só pode ser atacada ${DAILY_ATTACK_CAP} vezes por dia.`,
    );
  }
  return {
    ...s,
    attacksByTarget: { ...s.attacksByTarget, [targetId]: { day, count: usedToday + 1 } },
  };
}

export { resourceLabel, REFERRAL_GOLD };

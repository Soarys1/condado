export const SAVE_KEY = "condado.save.v3";
export const SAVE_VERSION = 6;

export const GRID = 44;
export const TILE_W = 68;
export const TILE_H = 34;
export const CASTLE_START = 20;

export const PREP_MS = 120_000;
export const BATTLE_MS = 240_000;
export const TICK = 1 / 60;
export const PROD_PER_MIN = 36;
export const COLLECT_READY = 20;
export const STORAGE_CAP_MINUTES = 8 * 60;
export const BASE_ARMY_CAP = 30;
export const CAMP_CAP = 40;

export const NIEN_COST_GOLD = 550_000;
export const NIEN_SELL_GOLD = 165_000;
export const SPEED_TRAIN_GOLD = 2_500;

export const LOOT_BANDS = [
  { at: 0.33, gold: 2700 },
  { at: 0.66, gold: 2700 },
  { at: 0.99, gold: 3000 },
] as const;
export const LOOT_CAP = 8400;
export const LOOT_PER_COUNTY = 0.05;

export const SHIELD_MS = 60 * 60 * 1000;
export const REFERRAL_GOLD = 300_000;
export const ALLIANCE_FOUND_GOLD = 5_000_000;
export const DEFENDER_COST = 5_000;
export const PASS_LEVELS = 50;
export const PASS_STARS_PER_LEVEL = 6;
export const PASS_BASE_NIENS = 15;
export const PASS_BOOST_MULT = 1.4;
export const PASS_BOOST_MS = 30 * 24 * 3600_000;
export const PASS_DISCOUNT = 0.45;
export const WALL_BASE_CAP = 200;
export const WALL_PER_LEVEL = 55;
export const COUNTY_MAX = 15;
export const GENERAL_MAX_LEVEL = 7;
export const GENERAL_UNLOCK_COUNTY = 8;
export const BUILDING_MAX = 15;
export const MARCH_MS = 3400;
export const WHATSAPP_GROUP = "https://chat.whatsapp.com/H5SSZINqtk0HOMPBjhTrqk?s=cl&p=a&mlu=0";

/** Display name of the gold resource. Internal field stays `gold`. */
export const GOLD_NAME = "Libra";
export const GOLD_NAME_PL = "Libras";
export const BREAD_UPKEEP_PER_TROOP_HOUR = 20;
/** @deprecated use BREAD_UPKEEP_PER_TROOP_HOUR */
export const BREAD_UPKEEP_PER_TROOP_DAY = BREAD_UPKEEP_PER_TROOP_HOUR;
export const DAILY_ATTACK_CAP = 12;
export const WAR_ATTACK_CAP = 2;
export const BREAD_PACK = 1000;
export const BREAD_PACK_BUY_GOLD = 2_400;
export const BREAD_PACK_SELL_GOLD = 900;

export const ALLIANCE_MAX_LEVEL = 7;
export const ALLIANCE_SLOTS_BASE = 30;
export const ALLIANCE_SLOTS_STEP = 10;
export const ALLIANCE_XP_WIN = 1000;
export const ALLIANCE_XP_BASE = 4000;
export const ALLIANCE_WAR_CHEST = 50_000_000;
export const ALLIANCE_DUEL_MIN = 70_000;
export const ALLIANCE_DUEL_MAX = 100_000;
export const ALLIANCE_DUEL_WIN_POINTS = 3;
export const ALLIANCE_DUEL_LOSS_POINTS = 1;

export type BuildingType =
  | "castle"
  | "wall"
  | "watchtower"
  | "catapult"
  | "mine"
  | "farm"
  | "barracks"
  | "camp"
  | "training";

export type TroopType = "infantry" | "archers" | "cavalry" | "general" | "generaless" | "defender";

export type ResourceKind = "gold" | "bread" | "niens" | "troopCards" | "generalCards";
export type Tradable = "gold" | "bread" | "niens";
export type WallDir = "h" | "v";
export type PassExtra = "boost" | "discount";

export interface BuildingDef {
  type: BuildingType;
  name: string;
  costGold: number;
  hp: number;
  size: number;
  damage: number;
  range: number;
  aoe: number;
  goldReward: number;
  role: "core" | "defense" | "economy" | "army" | "wall" | "train";
  desc: string;
}

export interface TroopDef {
  type: TroopType;
  name: string;
  costBread: number;
  costGold: number;
  hp: number;
  dps: number;
  speed: number;
  range: number;
  trainMs: number;
  prefer: "nearest" | "defense" | "core";
  ignoreWalls: boolean;
  shootOverWalls: boolean;
  desc: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  castle: {
    type: "castle",
    name: "Castelo Principal",
    costGold: 0,
    hp: 5000,
    size: 3,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "core",
    desc: "Define o nível do condado. Niens nunca saem daqui.",
  },
  wall: {
    type: "wall",
    name: "Muro",
    costGold: 100,
    hp: 800,
    size: 1,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "wall",
    desc: "Reto como I ou deitado como —. Gira com a seta. Limite sobe com o nível do condado.",
  },
  watchtower: {
    type: "watchtower",
    name: "Torre de Vigia",
    costGold: 500,
    hp: 1100,
    size: 1,
    damage: 84,
    range: 5.4,
    aoe: 0,
    goldReward: 0,
    role: "defense",
    desc: "Um alvo por vez. Dois arqueiros no topo.",
  },
  catapult: {
    type: "catapult",
    name: "Catapulta",
    costGold: 1500,
    hp: 900,
    size: 2,
    damage: 68,
    range: 8.2,
    aoe: 1.8,
    goldReward: 0,
    role: "defense",
    desc: "Alcance longo, dano menor, ainda em área.",
  },
  mine: {
    type: "mine",
    name: "Mina",
    costGold: 200,
    hp: 600,
    size: 2,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "economy",
    desc: "Produz Libras com o tempo.",
  },
  farm: {
    type: "farm",
    name: "Fazenda",
    costGold: 200,
    hp: 600,
    size: 2,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "economy",
    desc: "Produz pão com o tempo.",
  },
  barracks: {
    type: "barracks",
    name: "Quartel",
    costGold: 300,
    hp: 700,
    size: 2,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "army",
    desc: "Libera o recrutamento de tropas.",
  },
  camp: {
    type: "camp",
    name: "Acampamento",
    costGold: 250,
    hp: 500,
    size: 2,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "army",
    desc: "Aumenta a capacidade do exército em 40.",
  },
  training: {
    type: "training",
    name: "Campo de Treino",
    costGold: 800,
    hp: 900,
    size: 2,
    damage: 0,
    range: 0,
    aoe: 0,
    goldReward: 0,
    role: "train",
    desc: "Evolui tropas, generais e defensores da guilda.",
  },
};

export const TROOPS: Record<TroopType, TroopDef> = {
  infantry: {
    type: "infantry",
    name: "Infantaria",
    costBread: 50,
    costGold: 0,
    hp: 150,
    dps: 14,
    speed: 1.05,
    range: 1.05,
    trainMs: 6_000,
    prefer: "nearest",
    ignoreWalls: false,
    shootOverWalls: false,
    desc: "A pé. A mais lenta. Só rompe muro se não houver passagem.",
  },
  archers: {
    type: "archers",
    name: "Arqueiros",
    costBread: 30,
    costGold: 0,
    hp: 60,
    dps: 11,
    speed: 1.32,
    range: 4.5,
    trainMs: 4_000,
    prefer: "nearest",
    ignoreWalls: false,
    shootOverWalls: true,
    desc: "Mais rápidos que a infantaria. Atiram por cima dos muros.",
  },
  cavalry: {
    type: "cavalry",
    name: "Cavalaria",
    costBread: 150,
    costGold: 0,
    hp: 400,
    dps: 28,
    speed: 1.85,
    range: 0.85,
    trainMs: 14_000,
    prefer: "defense",
    ignoreWalls: true,
    shootOverWalls: false,
    desc: "A tropa mais veloz. Salta muros e foca defesas.",
  },
  general: {
    type: "general",
    name: "General Shin",
    costBread: 1000,
    costGold: 0,
    hp: 2000,
    dps: 85,
    speed: 1.45,
    range: 1.05,
    trainMs: 40_000,
    prefer: "core",
    ignoreWalls: true,
    shootOverWalls: false,
    desc: "Um por condado. Evolui só com cartas a partir do Nv.8.",
  },
  generaless: {
    type: "generaless",
    name: "General Leona",
    costBread: 900,
    costGold: 0,
    hp: 1100,
    dps: 62,
    speed: 1.55,
    range: 4.8,
    trainMs: 36_000,
    prefer: "core",
    ignoreWalls: true,
    shootOverWalls: true,
    desc: "À distância. Evolui só com cartas.",
  },
  defender: {
    type: "defender",
    name: "Defensor da Guilda",
    costBread: 0,
    costGold: 5_000,
    hp: 220,
    dps: 16,
    speed: 1.05,
    range: 1.05,
    trainMs: 10_000,
    prefer: "nearest",
    ignoreWalls: false,
    shootOverWalls: false,
    desc: "Custa 5.000 Libras. Capacidade sobe no Campo de Treino.",
  },
};

export const BUILD_ORDER: BuildingType[] = [
  "wall",
  "mine",
  "farm",
  "barracks",
  "camp",
  "training",
  "watchtower",
  "catapult",
];

export const TROOP_ORDER: TroopType[] = ["infantry", "archers", "cavalry", "defender", "general", "generaless"];

export const REAL_BUILDINGS: BuildingType[] = [
  "castle",
  "watchtower",
  "catapult",
  "mine",
  "farm",
  "barracks",
  "camp",
  "training",
];

export function wallCap(countyLevel: number): number {
  return WALL_BASE_CAP + WALL_PER_LEVEL * Math.max(0, countyLevel - 1);
}

export function countyUpgradeCost(fromLevel: number): { gold: number; niens: number } {
  if (fromLevel < 1 || fromLevel >= COUNTY_MAX) return { gold: 0, niens: 0 };
  if (fromLevel < 10) return { gold: 30_000 * 2 ** (fromLevel - 1), niens: 0 };
  const niens = fromLevel === 10 ? 1 : fromLevel === 11 ? 2 : fromLevel === 12 ? 4 : fromLevel === 13 ? 8 : 10;
  return { gold: 0, niens };
}

export function buildingHp(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].hp * (1 + 0.22 * (level - 1)));
}

export function buildingDamage(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].damage * (1 + 0.18 * (level - 1)));
}

export function upgradeCost(type: BuildingType, level: number): number {
  const base = BUILDINGS[type].costGold || 400;
  return base * 2 ** (level - 1);
}

export function productionPerSec(level: number, boosted = false): number {
  const base = (PROD_PER_MIN * level) / 60;
  return boosted ? base * PASS_BOOST_MULT : base;
}

export function storageCap(level: number): number {
  return Math.round(productionPerSec(level) * 60 * 12);
}

export function armyCapacity(campCount: number): number {
  return BASE_ARMY_CAP + campCount * CAMP_CAP;
}

export function isHero(type: TroopType): boolean {
  return type === "general" || type === "generaless";
}

export function troopAsset(type: TroopType): "infantry" | "archer" | "cavalry" | "general" | "generaless" | "defender" {
  if (type === "archers") return "archer";
  return type;
}

export function troopCardsFor(nextLevel: number): number {
  if (nextLevel < 2) return 0;
  return 3 * 2 ** (nextLevel - 2);
}

export function troopUpgradeGold(nextLevel: number): number {
  return 1500 * 2 ** (nextLevel - 2);
}

export function troopUpgradeBread(nextLevel: number): number {
  return 600 * 2 ** (nextLevel - 2);
}

export function generalCardsFor(nextLevel: number): number {
  return nextLevel;
}

export function campUpgradeGold(fromLevel: number): number {
  if (fromLevel < 1) return 0;
  return 80_000 * 2 ** (fromLevel - 1);
}

export function defenderCap(campLevel: number): number {
  return 2 + campLevel * 2;
}

export function scaledTroop(type: TroopType, level: number, campLevel = 1): { hp: number; dps: number; speed: number } {
  const d = TROOPS[type];
  const lv = Math.max(1, level);
  if (type === "defender") {
    const mul = 1 + 0.15 * (campLevel - 1);
    return { hp: Math.round(d.hp * mul), dps: Math.round(d.dps * mul), speed: d.speed };
  }
  const mul = 1 + 0.12 * (lv - 1);
  return { hp: Math.round(d.hp * mul), dps: Math.round(d.dps * mul), speed: d.speed };
}

export function lootCapForCounty(countyLevel: number): number {
  const lv = Math.max(1, Math.min(COUNTY_MAX, Math.floor(countyLevel || 1)));
  return Math.round(LOOT_CAP * (1 + LOOT_PER_COUNTY) ** (lv - 1));
}

export function lootForStars(stars: number, countyLevel = 1): number {
  const n = Math.max(0, Math.min(3, Math.floor(stars)));
  const cap = lootCapForCounty(countyLevel);
  const scale = cap / LOOT_CAP;
  let gold = 0;
  for (let i = 0; i < n; i++) gold += Math.round((LOOT_BANDS[i]?.gold ?? 0) * scale);
  return Math.min(cap, gold);
}

export function passSeasonKey(now = Date.now()): { year: number; month: number; key: string } {
  const d = new Date(now);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

export function passWindow(now = Date.now()): { active: boolean; endsAt: number; startsAt: number; wait: boolean } {
  const { year, month } = passSeasonKey(now);
  if (year < 2026 || (year === 2026 && month < 9)) {
    const start = new Date("2026-09-01T00:00:00-03:00").getTime();
    return { active: false, endsAt: start, startsAt: start, wait: true };
  }
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`).getTime();
  const durationDays = month === 2 ? 27 : 30;
  const end = start + durationDays * 24 * 3600_000;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextStart = new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`).getTime();
  return { active: now >= start && now < end, endsAt: end, startsAt: start, wait: now >= end && now < nextStart };
}

export function passCostNiens(seasonKey: string): number {
  const [y, m] = seasonKey.split("-").map(Number);
  const idx = (y! - 2026) * 12 + (m! - 9);
  return PASS_BASE_NIENS + Math.max(0, idx);
}

export function passCostWithDiscount(seasonKey: string, hasScroll: boolean): number {
  const base = passCostNiens(seasonKey);
  if (!hasScroll) return base;
  return Math.max(1, Math.ceil(base * (1 - PASS_DISCOUNT)));
}

export type PassPrize = {
  gold: number;
  bread: number;
  niens: number;
  troopCards: number;
  generalCards: number;
  label: string;
};

export function passReward(level: number): PassPrize {
  if (level === 48) return { gold: 0, bread: 0, niens: 0, troopCards: 12, generalCards: 0, label: "12 cartas de tropa" };
  if (level === 49) return { gold: 0, bread: 0, niens: 0, troopCards: 0, generalCards: 6, label: "6 cartas de general" };
  if (level === 50) return { gold: 500_000, bread: 500_000, niens: 1, troopCards: 0, generalCards: 0, label: `1 Nien + 500k ${GOLD_NAME_PL} + 500k pão` };
  if (level % 2 === 0) return { gold: 0, bread: 4000 + level * 600, niens: 0, troopCards: 0, generalCards: 0, label: `${4000 + level * 600} pão` };
  return { gold: 5000 + level * 800, bread: 0, niens: 0, troopCards: 0, generalCards: 0, label: `${5000 + level * 800} ${GOLD_NAME_PL}` };
}

export function freePassReward(level: number): PassPrize {
  if (level === 48) return { gold: 0, bread: 0, niens: 0, troopCards: 6, generalCards: 0, label: "6 cartas de tropa" };
  if (level === 49) return { gold: 0, bread: 0, niens: 0, troopCards: 0, generalCards: 3, label: "3 cartas de general" };
  if (level === 50) {
    return {
      gold: 100_000,
      bread: 100_000,
      niens: 0,
      troopCards: 3,
      generalCards: 0,
      label: `3 cartas de tropa + 100k ${GOLD_NAME_PL} + 100k pão`,
    };
  }
  if (level % 2 === 0) {
    const bread = Math.round((4000 + level * 600) / 2);
    return { gold: 0, bread, niens: 0, troopCards: 0, generalCards: 0, label: `${bread} pão` };
  }
  const gold = Math.round((5000 + level * 800) / 2);
  return { gold, bread: 0, niens: 0, troopCards: 0, generalCards: 0, label: `${gold} ${GOLD_NAME_PL}` };
}

export function allianceSlots(level: number): number {
  const lv = Math.max(1, Math.min(ALLIANCE_MAX_LEVEL, Math.floor(level || 1)));
  return ALLIANCE_SLOTS_BASE + ALLIANCE_SLOTS_STEP * (lv - 1);
}

export function allianceXpToNext(level: number): number {
  if (level < 1 || level >= ALLIANCE_MAX_LEVEL) return 0;
  return ALLIANCE_XP_BASE * 2 ** (level - 1);
}

export function applyAllianceXp(level: number, xp: number, gained: number): { level: number; xp: number } {
  let lv = Math.max(1, Math.min(ALLIANCE_MAX_LEVEL, Math.floor(level || 1)));
  let cur = Math.max(0, Math.floor(xp || 0)) + Math.max(0, Math.floor(gained));
  while (lv < ALLIANCE_MAX_LEVEL) {
    const need = allianceXpToNext(lv);
    if (cur < need) break;
    cur -= need;
    lv += 1;
  }
  return { level: lv, xp: cur };
}

export function duelGold(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const t = (h >>> 0) / 4294967296;
  const span = ALLIANCE_DUEL_MAX - ALLIANCE_DUEL_MIN;
  return Math.round((ALLIANCE_DUEL_MIN + t * span) / 1000) * 1000;
}

export function warWindow(now = Date.now()): { open: boolean; start: number; end: number; key: string } {
  const key = brtDayKey(now);
  const start = new Date(`${key}T00:00:00-03:00`).getTime();
  const end = start + 24 * 3600_000;
  return { open: now >= start && now < end, start, end, key };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function brtParts(now: number) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
}

/** Segunda 8h → domingo 23h, horário de Brasília. */
export function rankingWindow(now = Date.now()): { key: string; open: boolean; claim: boolean; start: number; end: number } {
  const parts = brtParts(now);
  const wd = parts.weekday ?? "Mon";
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const idx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  const midnight = new Date(`${y}-${pad2(m)}-${pad2(d)}T00:00:00-03:00`).getTime();
  const mondayOffset = idx === 0 ? -6 : 1 - idx;
  let monday = midnight + mondayOffset * 24 * 3600_000;
  let mondayParts = brtParts(monday + 12 * 3600_000);
  let key = `${mondayParts.year}-${mondayParts.month}-${mondayParts.day}`;
  let start = new Date(`${key}T08:00:00-03:00`).getTime();
  if (now < start) {
    monday -= 7 * 24 * 3600_000;
    mondayParts = brtParts(monday + 12 * 3600_000);
    key = `${mondayParts.year}-${mondayParts.month}-${mondayParts.day}`;
    start = new Date(`${key}T08:00:00-03:00`).getTime();
  }
  const sunday = monday + 6 * 24 * 3600_000;
  const sunParts = brtParts(sunday + 12 * 3600_000);
  const end = new Date(`${sunParts.year}-${sunParts.month}-${sunParts.day}T23:00:00-03:00`).getTime();
  const nextStart = start + 7 * 24 * 3600_000;
  return {
    key,
    open: now >= start && now < end,
    claim: now >= end && now < nextStart,
    start,
    end,
  };
}

export function weeklyPrize(rank: number): { gold: number; troopCards: number; generalCards: number; label: string } | null {
  if (rank < 1 || rank > 20) return null;
  if (rank <= 3) return { gold: 0, troopCards: 4, generalCards: 2, label: "4 cartas tropa + 2 general" };
  if (rank <= 7) return { gold: 0, troopCards: 3, generalCards: 0, label: "3 cartas tropa" };
  const t = (20 - rank) / 12;
  const gold = Math.round((50_000 + t * 250_000) / 1000) * 1000;
  return { gold, troopCards: 0, generalCards: 0, label: `${gold.toLocaleString("pt")} ${GOLD_NAME_PL}` };
}

export function goldWord(n = 2): string {
  return n === 1 ? GOLD_NAME : GOLD_NAME_PL;
}

export function resourceLabel(kind: ResourceKind | Tradable, n = 2): string {
  if (kind === "gold") return goldWord(n);
  if (kind === "bread") return n === 1 ? "pão" : "pães";
  if (kind === "niens") return n === 1 ? "Nien" : "Niens";
  if (kind === "troopCards") return "cartas de tropa";
  return "cartas de general";
}

export function brtDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

export function dailyNienSendCap(countyLevel: number): number {
  if (countyLevel >= 11) return 20;
  if (countyLevel >= 6) return 10;
  return 5;
}

export function dailyAttackCap(war: boolean): number {
  return war ? WAR_ATTACK_CAP : DAILY_ATTACK_CAP;
}

export function marketOfferId(giveKind: Tradable, giveAmount: number, wantKind: Tradable, wantAmount: number): string {
  return `${giveKind}_${giveAmount}_${wantKind}_${wantAmount}`;
}

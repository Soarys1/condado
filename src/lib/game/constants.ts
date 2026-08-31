export const SAVE_KEY = "condado.save.v2";
export const SAVE_VERSION = 2;

export const GRID = 24;
export const TILE_W = 68;
export const TILE_H = 34;

export const PREP_MS = 120_000;
export const BATTLE_MS = 240_000;
export const TICK = 1 / 60;
export const PROD_PER_MIN = 36;
export const COLLECT_READY = 20;
export const STORAGE_CAP_MINUTES = 8 * 60;
export const BASE_ARMY_CAP = 30;
export const CAMP_CAP = 40;

export const CASTLE_NIENS = 50;

export type BuildingType =
  | "castle"
  | "wall"
  | "watchtower"
  | "catapult"
  | "mine"
  | "farm"
  | "barracks"
  | "camp";

export type TroopType = "infantry" | "archers" | "cavalry" | "general" | "generaless";

export type ResourceKind = "gold" | "bread" | "niens";

export interface BuildingDef {
  type: BuildingType;
  name: string;
  costGold: number;
  hp: number;
  size: number;
  damage: number;
  range: number;
  aoe: number;
  niensReward: number;
  role: "core" | "defense" | "economy" | "army" | "wall";
  desc: string;
}

export interface TroopDef {
  type: TroopType;
  name: string;
  costBread: number;
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
    niensReward: CASTLE_NIENS,
    role: "core",
    desc: "Coração do condado. Se cair, o atacante leva um tesouro de Niens.",
  },
  wall: {
    type: "wall",
    name: "Muro",
    costGold: 50,
    hp: 800,
    size: 1,
    damage: 0,
    range: 0,
    aoe: 0,
    niensReward: 0,
    role: "wall",
    desc: "Só é atacado se bloquear de vez o caminho até uma construção real.",
  },
  watchtower: {
    type: "watchtower",
    name: "Torre de Vigia",
    costGold: 500,
    hp: 1100,
    size: 1,
    damage: 50,
    range: 5.4,
    aoe: 0,
    niensReward: 8,
    role: "defense",
    desc: "Dois arqueiros no topo. 50 de dano por segundo, terra ou ar.",
  },
  catapult: {
    type: "catapult",
    name: "Catapulta",
    costGold: 1500,
    hp: 900,
    size: 2,
    damage: 100,
    range: 6.4,
    aoe: 1.8,
    niensReward: 12,
    role: "defense",
    desc: "Dano em área. Lenta, mas devastadora contra infantaria.",
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
    niensReward: 2,
    role: "economy",
    desc: "Produz ouro com o tempo. Recolha quando a janelinha aparecer.",
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
    niensReward: 2,
    role: "economy",
    desc: "Produz pão com o tempo. Recolha quando a janelinha aparecer.",
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
    niensReward: 3,
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
    niensReward: 2,
    role: "army",
    desc: "Aumenta a capacidade do exército em 40.",
  },
};

export const TROOPS: Record<TroopType, TroopDef> = {
  infantry: {
    type: "infantry",
    name: "Infantaria",
    costBread: 50,
    hp: 150,
    dps: 25,
    speed: 1.7,
    range: 0.72,
    trainMs: 6_000,
    prefer: "nearest",
    ignoreWalls: false,
    shootOverWalls: false,
    desc: "Segue o caminho até construções reais. Só rompe um muro se não houver passagem.",
  },
  archers: {
    type: "archers",
    name: "Arqueiros",
    costBread: 30,
    hp: 60,
    dps: 20,
    speed: 2.25,
    range: 4.5,
    trainMs: 4_000,
    prefer: "nearest",
    ignoreWalls: false,
    shootOverWalls: true,
    desc: "Atiram de longe, por cima dos muros.",
  },
  cavalry: {
    type: "cavalry",
    name: "Cavalaria",
    costBread: 150,
    hp: 400,
    dps: 70,
    speed: 3.45,
    range: 0.85,
    trainMs: 14_000,
    prefer: "defense",
    ignoreWalls: true,
    shootOverWalls: false,
    desc: "Salta muros e foca nas defesas primeiro.",
  },
  general: {
    type: "general",
    name: "General",
    costBread: 1000,
    hp: 2000,
    dps: 200,
    speed: 3.05,
    range: 1.05,
    trainMs: 40_000,
    prefer: "core",
    ignoreWalls: true,
    shootOverWalls: false,
    desc: "Um por condado. Imparável contra estruturas.",
  },
  generaless: {
    type: "generaless",
    name: "Generala",
    costBread: 900,
    hp: 1100,
    dps: 155,
    speed: 3.9,
    range: 4.8,
    trainMs: 36_000,
    prefer: "core",
    ignoreWalls: true,
    shootOverWalls: true,
    desc: "Rápida, ataca à distância. Menos vida que o general.",
  },
};

export const BUILD_ORDER: BuildingType[] = [
  "wall",
  "mine",
  "farm",
  "barracks",
  "camp",
  "watchtower",
  "catapult",
];

export const TROOP_ORDER: TroopType[] = ["infantry", "archers", "cavalry", "general", "generaless"];

export const REAL_BUILDINGS: BuildingType[] = [
  "castle",
  "watchtower",
  "catapult",
  "mine",
  "farm",
  "barracks",
  "camp",
];

export function buildingHp(type: BuildingType, level: number): number {
  return Math.round(BUILDINGS[type].hp * (1 + 0.22 * (level - 1)));
}

export function upgradeCost(type: BuildingType, level: number): number {
  const base = BUILDINGS[type].costGold || 400;
  return Math.round(base * level * 1.45);
}

export function productionPerSec(level: number): number {
  return (PROD_PER_MIN * level) / 60;
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

export function troopAsset(type: TroopType): "infantry" | "archer" | "cavalry" | "general" | "generaless" {
  if (type === "archers") return "archer";
  return type;
}

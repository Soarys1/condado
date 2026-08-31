import type { BuildingType, ResourceKind, TroopType } from "./constants";

export type GameScreen =
  | "splash"
  | "village"
  | "raid"
  | "prep"
  | "battle"
  | "results";

export interface BuildingInst {
  id: string;
  type: BuildingType;
  gx: number;
  gy: number;
  level: number;
  lastCollect?: number;
}

export interface ArmyCounts {
  infantry: number;
  archers: number;
  cavalry: number;
  general: number;
  generaless: number;
}

export interface TrainingJob {
  id: string;
  type: TroopType;
  remaining: number;
}

export interface ChatMsg {
  id: string;
  fromId: string;
  fromNick: string;
  text: string;
  at: number;
  self?: boolean;
}

export interface RaidLog {
  id: string;
  at: number;
  attacker: string;
  gold: number;
  bread: number;
  incoming: boolean;
}

export interface MarketOffer {
  id: string;
  sellerId: string;
  sellerNick: string;
  give: { kind: "gold" | "bread"; amount: number };
  wantNiens: number;
}

export interface Lord {
  id: string;
  nick: string;
  title: string;
  rank: number;
  lootGold: number;
  lootBread: number;
}

export interface PlayerProfile {
  id: string;
  nick: string;
  createdAt: number;
}

export interface SaveState {
  version: number;
  player: PlayerProfile;
  gold: number;
  bread: number;
  niens: number;
  buildings: BuildingInst[];
  army: ArmyCounts;
  training: TrainingJob[];
  lastTick: number;
  tutorial: boolean;
  chat: ChatMsg[];
  raids: RaidLog[];
  stars: number;
  raidsWon: number;
  muted: boolean;
}

export type SheetId = "build" | "army" | "attack" | "chat" | "market" | "info" | "profile" | null;

export interface SelectedCell {
  gx: number;
  gy: number;
}

export interface PlaceGhost {
  type: BuildingType;
  gx: number;
  gy: number;
  valid: boolean;
}

export type TransferKind = ResourceKind;

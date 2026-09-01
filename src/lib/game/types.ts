import type { BuildingType, ResourceKind, TroopType, WallDir } from "./constants";

export type GameScreen =
  | "splash"
  | "village"
  | "raid"
  | "march"
  | "prep"
  | "battle"
  | "spectate"
  | "results";

export interface BuildingInst {
  id: string;
  type: BuildingType;
  gx: number;
  gy: number;
  level: number;
  lastCollect?: number;
  dir?: WallDir;
}

export interface ArmyCounts {
  infantry: number;
  archers: number;
  cavalry: number;
  general: number;
  generaless: number;
  defender: number;
}

export interface TroopLevels {
  infantry: number;
  archers: number;
  cavalry: number;
  general: number;
  generaless: number;
  defender: number;
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
  channel?: "global" | "alliance";
}

export interface RaidLog {
  id: string;
  at: number;
  attacker: string;
  gold: number;
  bread: number;
  incoming: boolean;
}

export interface TransferRecord {
  id: string;
  at: number;
  fromId: string;
  fromNick: string;
  toId: string;
  toNick: string;
  kind: ResourceKind;
  amount: number;
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
  allianceId?: string;
}

export interface PlayerProfile {
  id: string;
  nick: string;
  createdAt: number;
}

export interface BattlePassState {
  season: string;
  purchased: boolean;
  stars: number;
  claimed: number[];
}

export interface AllianceState {
  id: string;
  name: string;
  members: Array<{ id: string; nick: string }>;
}

export interface WarState {
  week: string;
  foeId: string | null;
  foeName: string;
  chest: number;
  ourStars: number;
  theirStars: number;
  attacks: Record<string, number>;
  sittingOut: boolean;
  resolved: boolean;
}

export interface SaveState {
  version: number;
  player: PlayerProfile;
  gold: number;
  bread: number;
  niens: number;
  troopCards: number;
  generalCards: number;
  countyLevel: number;
  campLevel: number;
  troopLevels: TroopLevels;
  buildings: BuildingInst[];
  army: ArmyCounts;
  training: TrainingJob[];
  lastTick: number;
  tutorial: boolean;
  chat: ChatMsg[];
  allianceChat: ChatMsg[];
  raids: RaidLog[];
  stars: number;
  raidsWon: number;
  muted: boolean;
  shieldUntil: number;
  referredBy: string | null;
  referralClaimed: boolean;
  inviteCopied: boolean;
  pass: BattlePassState;
  alliance: AllianceState | null;
  war: WarState | null;
  weekStars: number;
  weekKey: string;
  weekClaimed: string | null;
  ledger: TransferRecord[];
}

export type SheetId =
  | "build"
  | "army"
  | "attack"
  | "chat"
  | "market"
  | "info"
  | "profile"
  | "pass"
  | "alliance"
  | "train"
  | "rank"
  | null;

export interface SelectedCell {
  gx: number;
  gy: number;
}

export interface PlaceGhost {
  type: BuildingType;
  gx: number;
  gy: number;
  valid: boolean;
  dir?: WallDir;
}

export type TransferKind = ResourceKind;

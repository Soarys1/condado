import type { BuildingType, PassExtra, ResourceKind, Tradable, TroopType, WallDir } from "./constants";

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
  /** Units still in this job. Missing count is treated as 1 (saves antigos). */
  count?: number;
}

export interface ChatMsg {
  id: string;
  fromId: string;
  fromNick: string;
  text: string;
  at: number;
  self?: boolean;
  channel?: "global" | "alliance";
  recruitAllianceId?: string;
  recruitMinLevel?: number;
  joinRequestId?: string;
}

export interface AllianceJoinRequest {
  id: string;
  playerId: string;
  nick: string;
  uid?: string;
  at: number;
}

export interface RaidLog {
  id: string;
  at: number;
  attacker: string;
  defender: string;
  gold: number;
  bread: number;
  incoming: boolean;
  destruction: number;
  troopsLost: number;
  stars: number;
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
  sellerUid: string;
  sellerNick: string;
  giveKind: Tradable;
  giveAmount: number;
  wantKind: Tradable;
  wantAmount: number;
  createdAt: number;
}

export interface Lord {
  id: string;
  nick: string;
  title: string;
  rank: number;
  lootGold: number;
  lootBread: number;
  allianceId?: string;
  countyLevel?: number;
  buildings?: BuildingInst[];
  real?: boolean;
  shieldUntil?: number;
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
  claimedFree: number[];
  extrasClaimed: PassExtra[];
}

export interface AllianceMember {
  id: string;
  nick: string;
  uid?: string;
}

export interface AllianceState {
  id: string;
  name: string;
  members: AllianceMember[];
  minLevel: number;
  level: number;
  xp: number;
  leaderId: string;
  slots: number;
  openJoin: boolean;
  joinRequests: AllianceJoinRequest[];
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
  participants: string[];
}

export type DuelStatus = "pending" | "prep" | "fight" | "declined" | "expired" | "done";

export interface DuelChallenge {
  sessionId: string;
  fromId: string;
  fromNick: string;
  toId: string;
  toNick: string;
  until: number;
  status: DuelStatus;
  incoming: boolean;
}

export interface AllianceRival {
  id: string;
  name: string;
  level: number;
  members: number;
  slots: number;
  atWar: boolean;
  foeName: string;
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
  niensSentDay: string;
  niensSentToday: number;
  attacksReceivedDay: string;
  attacksReceived: number;
  attacksByTarget: Record<string, { day: string; count: number }>;
  boostUntil: number;
  passDiscount: boolean;
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

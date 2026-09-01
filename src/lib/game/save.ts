import { SAVE_KEY, SAVE_VERSION, passSeasonKey } from "./constants";
import type { SaveState, TroopLevels } from "./types";
import { makeId, starterVillage } from "./world";
import { seedChat } from "./bots";

const DEFAULT_LEVELS: TroopLevels = {
  infantry: 1,
  archers: 1,
  cavalry: 1,
  general: 1,
  generaless: 1,
  defender: 1,
};

export function defaultSave(nick = "Senhor", referredBy: string | null = null): SaveState {
  const now = Date.now();
  const season = passSeasonKey(now).key;
  return {
    version: SAVE_VERSION,
    player: { id: makeId("CDN"), nick: nick.trim() || "Senhor", createdAt: now },
    gold: 8_000,
    bread: 400,
    niens: 1,
    troopCards: 2,
    generalCards: 0,
    countyLevel: 1,
    campLevel: 1,
    troopLevels: { ...DEFAULT_LEVELS },
    buildings: starterVillage(),
    army: { infantry: 6, archers: 4, cavalry: 0, general: 0, generaless: 0, defender: 0 },
    training: [],
    lastTick: now,
    tutorial: false,
    chat: seedChat(now),
    allianceChat: [],
    raids: [],
    stars: 0,
    raidsWon: 0,
    muted: false,
    shieldUntil: 0,
    referredBy,
    referralClaimed: false,
    inviteCopied: false,
    pass: { season, purchased: false, stars: 0, claimed: [] },
    alliance: null,
    war: null,
    weekStars: 0,
    weekKey: "",
    weekClaimed: null,
    ledger: [],
  };
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem("condado.save.v2") ?? localStorage.getItem("condado.save.v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveState;
    return migrate(parsed);
  } catch {
    return null;
  }
}

function migrate(s: SaveState): SaveState {
  const base = defaultSave(s.player?.nick ?? "Senhor");
  const now = Date.now();
  const buildings = Array.isArray(s.buildings) && s.buildings.length ? s.buildings : base.buildings;
  const season = passSeasonKey(now).key;
  const pass = s.pass?.season === season ? s.pass : { season, purchased: false, stars: 0, claimed: [] };
  return {
    ...base,
    ...s,
    version: SAVE_VERSION,
    player: { ...base.player, ...s.player, id: s.player?.id || base.player.id },
    army: { ...base.army, ...s.army, defender: s.army?.defender ?? 0 },
    troopLevels: { ...base.troopLevels, ...s.troopLevels },
    troopCards: s.troopCards ?? 2,
    generalCards: s.generalCards ?? 0,
    countyLevel: s.countyLevel ?? 1,
    campLevel: s.campLevel ?? 1,
    buildings: buildings.map((b) => ({
      ...b,
      lastCollect: b.lastCollect ?? now,
      dir: b.type === "wall" ? b.dir ?? "h" : b.dir,
    })),
    training: Array.isArray(s.training) ? s.training : [],
    chat: Array.isArray(s.chat) ? s.chat.slice(-40) : base.chat,
    allianceChat: Array.isArray(s.allianceChat) ? s.allianceChat.slice(-40) : [],
    raids: Array.isArray(s.raids) ? s.raids.slice(-12) : [],
    shieldUntil: s.shieldUntil ?? 0,
    referredBy: s.referredBy ?? null,
    referralClaimed: s.referralClaimed ?? false,
    inviteCopied: s.inviteCopied ?? false,
    pass,
    alliance: s.alliance ?? null,
    war: s.war ?? null,
    weekStars: s.weekStars ?? 0,
    weekKey: s.weekKey ?? "",
    weekClaimed: s.weekClaimed ?? null,
    ledger: Array.isArray(s.ledger) ? s.ledger.slice(0, 40) : [],
  };
}

let cloudSync: ((s: SaveState) => Promise<void>) | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;

export function setCloudSync(fn: ((s: SaveState) => Promise<void>) | null) {
  cloudSync = fn;
}

export function migrateCloud(s: SaveState): SaveState {
  return migrate(s);
}

export function persist(state: SaveState) {
  try {
    const blob: SaveState = {
      ...state,
      version: SAVE_VERSION,
      player: state.player,
      chat: state.chat.slice(-40),
      allianceChat: state.allianceChat.slice(-40),
      raids: state.raids.slice(-12),
      ledger: state.ledger.slice(0, 40),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    localStorage.setItem(SAVE_KEY + ".bak", JSON.stringify(blob));
    if (cloudSync) {
      if (cloudTimer) clearTimeout(cloudTimer);
      cloudTimer = setTimeout(() => {
        void cloudSync?.(blob);
      }, 1400);
    }
  } catch {
    /* quota */
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem("condado.save.v2");
    localStorage.removeItem("condado.save.v1");
  } catch {
    /* ignore */
  }
}

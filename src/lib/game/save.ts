import { SAVE_KEY, SAVE_VERSION, passSeasonKey } from "./constants";
import type { BuildingInst, SaveState, TroopLevels } from "./types";
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

const SAVE_FIELDS: (keyof SaveState)[] = [
  "version",
  "player",
  "gold",
  "bread",
  "niens",
  "troopCards",
  "generalCards",
  "countyLevel",
  "campLevel",
  "troopLevels",
  "buildings",
  "army",
  "training",
  "lastTick",
  "tutorial",
  "chat",
  "allianceChat",
  "raids",
  "stars",
  "raidsWon",
  "muted",
  "shieldUntil",
  "referredBy",
  "referralClaimed",
  "inviteCopied",
  "pass",
  "alliance",
  "war",
  "weekStars",
  "weekKey",
  "weekClaimed",
  "ledger",
  "niensSentDay",
  "niensSentToday",
  "attacksReceivedDay",
  "attacksReceived",
  "attacksByTarget",
  "boostUntil",
  "passDiscount",
];

export function defaultSave(nick = "Senhor", referredBy: string | null = null): SaveState {
  const now = Date.now();
  const season = passSeasonKey(now).key;
  return {
    version: SAVE_VERSION,
    player: { id: makeId("CDN"), nick: nick.trim() || "Senhor", createdAt: now },
    gold: 8_000,
    bread: 400,
    niens: 0,
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
    pass: { season, purchased: false, stars: 0, claimed: [], claimedFree: [], extrasClaimed: [] },
    alliance: null,
    war: null,
    weekStars: 0,
    weekKey: "",
    weekClaimed: null,
    ledger: [],
    niensSentDay: "",
    niensSentToday: 0,
    attacksReceivedDay: "",
    attacksReceived: 0,
    attacksByTarget: {},
    boostUntil: 0,
    passDiscount: false,
  };
}

export function loadSave(): SaveState | null {
  try {
    const raw =
      localStorage.getItem(SAVE_KEY) ??
      localStorage.getItem(SAVE_KEY + ".bak") ??
      localStorage.getItem("condado.save.v2") ??
      localStorage.getItem("condado.save.v1");
    if (!raw) return null;
    const parsed = migrate(JSON.parse(raw) as SaveState);
    try {
      const bakRaw = localStorage.getItem(SAVE_KEY + ".bak");
      if (bakRaw) {
        const bak = migrate(JSON.parse(bakRaw) as SaveState);
        if (bak.player?.id === parsed.player.id && progressScore(bak) > progressScore(parsed) + 50) {
          return bak;
        }
      }
    } catch {
      /* bak inválido */
    }
    return parsed;
  } catch {
    return null;
  }
}

function cleanBuilding(b: BuildingInst, countyLevel: number, now: number): BuildingInst {
  const next: BuildingInst = {
    id: String(b.id ?? ""),
    type: b.type,
    gx: Number(b.gx),
    gy: Number(b.gy),
    level: b.type === "castle" ? Math.max(1, countyLevel) : Math.max(1, Number(b.level || 1)),
  };
  if (b.lastCollect != null) next.lastCollect = Number(b.lastCollect) || now;
  else if (b.type === "mine" || b.type === "farm") next.lastCollect = now;
  if (b.type === "wall") next.dir = b.dir === "v" ? "v" : "h";
  return next;
}

function migrate(s: SaveState): SaveState {
  const base = defaultSave(s.player?.nick ?? "Senhor");
  const now = Date.now();
  const countyLevel = Math.max(1, Number(s.countyLevel ?? base.countyLevel ?? 1));
  const buildings = Array.isArray(s.buildings) && s.buildings.length ? s.buildings : base.buildings;
  const season = passSeasonKey(now).key;
  const passRaw = s.pass;
  const pass =
    passRaw?.season === season
      ? {
          season,
          purchased: !!passRaw.purchased,
          stars: Number(passRaw.stars ?? 0),
          claimed: Array.isArray(passRaw.claimed) ? passRaw.claimed.map(Number) : [],
          claimedFree: Array.isArray(passRaw.claimedFree) ? passRaw.claimedFree.map(Number) : [],
          extrasClaimed: Array.isArray(passRaw.extrasClaimed)
            ? passRaw.extrasClaimed.filter((x): x is "boost" | "discount" => x === "boost" || x === "discount")
            : [],
        }
      : { season, purchased: false, stars: 0, claimed: [], claimedFree: [], extrasClaimed: [] };
  const alliance = s.alliance
    ? {
        id: String(s.alliance.id),
        name: String(s.alliance.name ?? "Aliança"),
        members: Array.isArray(s.alliance.members) ? s.alliance.members : [],
        minLevel: Math.max(1, Number(s.alliance.minLevel ?? 1)),
        level: Math.max(1, Number(s.alliance.level ?? 1)),
        xp: Math.max(0, Number(s.alliance.xp ?? 0)),
        leaderId: String(s.alliance.leaderId ?? s.player?.id ?? ""),
        viceId: s.alliance.viceId ? String(s.alliance.viceId) : null,
        slots: Math.max(30, Number(s.alliance.slots ?? 30)),
        openJoin: s.alliance.openJoin !== false,
        joinRequests: Array.isArray(s.alliance.joinRequests)
          ? s.alliance.joinRequests.map((r) => ({
              id: String(r.id),
              playerId: String(r.playerId),
              nick: String(r.nick ?? "Senhor"),
              uid: r.uid ? String(r.uid) : undefined,
              at: Number(r.at ?? 0),
            }))
          : [],
        ceasefire:
          s.alliance.ceasefire && typeof s.alliance.ceasefire === "object"
            ? Object.fromEntries(Object.entries(s.alliance.ceasefire).map(([k, v]) => [String(k), Number(v)]))
            : {},
      }
    : null;
  const war = s.war
    ? {
        week: String(s.war.week ?? ""),
        foeId: s.war.foeId ?? null,
        foeName: String(s.war.foeName ?? ""),
        chest: Number(s.war.chest ?? 0),
        ourStars: Number(s.war.ourStars ?? 0),
        theirStars: Number(s.war.theirStars ?? 0),
        attacks: s.war.attacks ?? {},
        sittingOut: !!s.war.sittingOut,
        resolved: !!s.war.resolved,
        participants: Array.isArray(s.war.participants) ? s.war.participants.map(String) : [],
      }
    : null;
  return {
    ...base,
    ...s,
    version: SAVE_VERSION,
    player: { ...base.player, ...s.player, id: s.player?.id || base.player.id },
    army: {
      ...base.army,
      ...s.army,
      defender: s.army?.defender ?? 0,
      general: Math.min(1, Number(s.army?.general ?? 0)),
      generaless: Math.min(1, Number(s.army?.generaless ?? 0)),
    },
    troopLevels: { ...base.troopLevels, ...s.troopLevels },
    troopCards: s.troopCards ?? 2,
    generalCards: s.generalCards ?? 0,
    countyLevel,
    campLevel: s.campLevel ?? 1,
    buildings: buildings.map((b) => cleanBuilding(b, countyLevel, now)),
    training: Array.isArray(s.training) ? s.training : [],
    chat: Array.isArray(s.chat) ? s.chat.slice(-40) : base.chat,
    allianceChat: Array.isArray(s.allianceChat) ? s.allianceChat.slice(-40) : [],
    shieldUntil: s.shieldUntil ?? 0,
    referredBy: s.referredBy ?? null,
    referralClaimed: s.referralClaimed ?? false,
    inviteCopied: s.inviteCopied ?? false,
    pass,
    alliance,
    war,
    weekStars: s.weekStars ?? 0,
    weekKey: s.weekKey ?? "",
    weekClaimed: s.weekClaimed ?? null,
    ledger: Array.isArray(s.ledger) ? s.ledger.slice(0, 40) : [],
    raids: (Array.isArray(s.raids) ? s.raids.slice(-24) : []).map((r) => ({
      id: r.id,
      at: r.at,
      attacker: r.attacker,
      defender: r.defender ?? "",
      gold: r.gold ?? 0,
      bread: r.bread ?? 0,
      incoming: !!r.incoming,
      destruction: r.destruction ?? 0,
      troopsLost: r.troopsLost ?? 0,
      stars: r.stars ?? 0,
    })),
    niensSentDay: s.niensSentDay ?? "",
    niensSentToday: s.niensSentToday ?? 0,
    attacksReceivedDay: s.attacksReceivedDay ?? "",
    attacksReceived: s.attacksReceived ?? 0,
    attacksByTarget: s.attacksByTarget ?? {},
    boostUntil: Number(s.boostUntil ?? 0),
    passDiscount: Boolean(s.passDiscount),
  };
}

/** Drop Zustand actions / UI fields so the cache never stores functions. */
export function toSave(raw: unknown): SaveState {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const picked: Record<string, unknown> = {};
  for (const key of SAVE_FIELDS) {
    if (key in src) picked[key] = src[key];
  }
  return migrate(picked as unknown as SaveState);
}

function progressScore(s: SaveState): number {
  const built = s.buildings.reduce((n, b) => n + (b.level || 1), 0);
  return s.countyLevel * 1_000_000_000 + built * 10_000 + s.gold + s.bread + s.niens * 100_000 + s.stars * 1_000;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

let cloudSync: ((s: SaveState) => Promise<void>) | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let lastBlob: SaveState | null = null;

export function setCloudSync(fn: ((s: SaveState) => Promise<void>) | null) {
  cloudSync = fn;
}

export function migrateCloud(s: SaveState): SaveState {
  return migrate(s);
}

export function persist(state: SaveState) {
  try {
    const blob = cloneJson(toSave(state));
    lastBlob = blob;
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    localStorage.setItem(SAVE_KEY + ".bak", JSON.stringify(blob));
  } catch {
    /* quota */
  }
}

export async function flushCloud() {
  if (cloudTimer) {
    clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  if (cloudSync) {
    try {
      await cloudSync(lastBlob ?? (loadSave() as SaveState));
    } catch {
      /* offline */
    }
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_KEY + ".bak");
    localStorage.removeItem("condado.save.v2");
    localStorage.removeItem("condado.save.v1");
  } catch {
    /* ignore */
  }
  lastBlob = null;
}

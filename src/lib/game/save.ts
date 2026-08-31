import { SAVE_KEY, SAVE_VERSION } from "./constants";
import type { SaveState } from "./types";
import { makeId, starterVillage } from "./world";
import { seedChat } from "./bots";

export function defaultSave(nick = "Senhor"): SaveState {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    player: { id: makeId("CDN"), nick: nick.trim() || "Senhor", createdAt: now },
    gold: 900,
    bread: 280,
    niens: 8,
    buildings: starterVillage(),
    army: { infantry: 6, archers: 4, cavalry: 0, general: 0, generaless: 0 },
    training: [],
    lastTick: now,
    tutorial: false,
    chat: seedChat(now),
    raids: [],
    stars: 0,
    raidsWon: 0,
    muted: false,
  };
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem("condado.save.v1");
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
  return {
    ...base,
    ...s,
    version: SAVE_VERSION,
    player: { ...base.player, ...s.player, id: s.player?.id || base.player.id },
    army: { ...base.army, ...s.army, generaless: s.army?.generaless ?? 0 },
    buildings: buildings.map((b) => ({
      ...b,
      lastCollect: b.lastCollect ?? now,
    })),
    training: Array.isArray(s.training) ? s.training : [],
    chat: Array.isArray(s.chat) ? s.chat.slice(-40) : base.chat,
    raids: Array.isArray(s.raids) ? s.raids.slice(-12) : [],
  };
}

export function persist(state: SaveState) {
  try {
    const blob: SaveState = {
      ...state,
      version: SAVE_VERSION,
      player: state.player,
      chat: state.chat.slice(-40),
      raids: state.raids.slice(-12),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    localStorage.setItem(SAVE_KEY + ".bak", JSON.stringify(blob));
  } catch {
    /* quota / private mode */
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem("condado.save.v1");
  } catch {
    /* ignore */
  }
}

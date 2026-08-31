import { create } from "zustand";
import {
  BUILDINGS,
  TROOPS,
  armyCapacity,
  isHero,
  productionPerSec,
  storageCap,
  upgradeCost,
  type BuildingType,
  type ResourceKind,
  type TroopType,
} from "./constants";
import { Battle } from "./battle";
import { findLord, LORDS, marketBoard, randomChat } from "./bots";
import { defaultSave, loadSave, persist, wipeSave } from "./save";
import type {
  BuildingInst,
  ChatMsg,
  GameScreen,
  Lord,
  MarketOffer,
  PlaceGhost,
  SaveState,
  SheetId,
  TrainingJob,
} from "./types";
import { canPlace, countType, generateBase, nid, snapPlace } from "./world";
import { sfxBuild, sfxClick, sfxCoin, sfxError, sfxStar } from "./audio";

export let battle: Battle | null = null;
export let raidTarget: Lord | null = null;
let lastPersist = 0;

function applyTraining(s: SaveState, dtMs: number) {
  const army = { ...s.army };
  const jobs: TrainingJob[] = [];
  for (const j of s.training) {
    const remaining = j.remaining - dtMs;
    if (remaining <= 0) army[j.type] += 1;
    else jobs.push({ ...j, remaining });
  }
  return { army, jobs };
}

interface GameStore extends SaveState {
  hydrated: boolean;
  screen: GameScreen;
  sheet: SheetId;
  selectedId: string | null;
  placing: BuildingType | null;
  ghost: PlaceGhost | null;
  deployType: TroopType;
  toast: string | null;
  offers: MarketOffer[];
  nickDraft: string;
  hydrate: () => void;
  startGame: (nick: string) => void;
  resetGame: () => void;
  tick: (now: number) => void;
  setSheet: (s: SheetId) => void;
  setMuted: (v: boolean) => void;
  selectBuilding: (id: string | null) => void;
  beginPlace: (type: BuildingType) => void;
  hoverPlace: (gx: number, gy: number) => void;
  confirmPlace: (gx: number, gy: number) => boolean;
  cancelPlace: () => void;
  collect: (id: string) => void;
  collectAll: () => void;
  upgrade: (id: string) => boolean;
  demolish: (id: string) => void;
  train: (type: TroopType) => boolean;
  speedTrain: (id: string) => boolean;
  openRaid: () => void;
  beginAttack: (lord: Lord) => void;
  setDeployType: (t: TroopType) => void;
  deploy: (gx: number, gy: number) => boolean;
  skipPrep: () => void;
  retreat: () => void;
  finishBattle: () => void;
  sendChat: (text: string) => void;
  buyOffer: (id: string) => boolean;
  sellGold: () => boolean;
  sellBread: () => boolean;
  transfer: (toId: string, amount: number, kind: ResourceKind) => boolean;
  rename: (nick: string) => boolean;
  setToast: (t: string | null) => void;
  storedOf: (b: BuildingInst, now?: number) => number;
  returnVillage: () => void;
}

function armySize(s: SaveState): number {
  const a = s.army;
  return a.infantry + a.archers + a.cavalry + a.general + a.generaless + s.training.length;
}

function producerKind(t: BuildingType): "gold" | "bread" | null {
  if (t === "mine") return "gold";
  if (t === "farm") return "bread";
  return null;
}

function storedAmount(b: BuildingInst, now = Date.now()): number {
  if (b.type !== "mine" && b.type !== "farm") return 0;
  const t0 = b.lastCollect ?? now;
  const elapsed = Math.max(0, (now - t0) / 1000);
  return Math.floor(Math.min(storageCap(b.level), productionPerSec(b.level) * elapsed));
}

export const useGame = create<GameStore>((set, get) => ({
  ...defaultSave(),
  hydrated: false,
  screen: "splash",
  sheet: null,
  selectedId: null,
  placing: null,
  ghost: null,
  deployType: "infantry",
  toast: null,
  offers: marketBoard(),
  nickDraft: "",

  hydrate: () => {
    const loaded = loadSave();
    if (loaded) {
      const now = Date.now();
      const training = applyTraining(loaded, Math.min(8 * 3600_000, Math.max(0, now - loaded.lastTick)));
      set({
        ...loaded,
        army: training.army,
        training: training.jobs,
        lastTick: now,
        hydrated: true,
        screen: "village",
        nickDraft: loaded.player.nick,
      });
      persist({ ...get() });
    } else {
      set({ hydrated: true, screen: "splash" });
    }
  },

  startGame: (nick) => {
    const s = defaultSave(nick);
    persist(s);
    set({ ...s, hydrated: true, screen: "village", sheet: null, nickDraft: s.player.nick });
    sfxClick();
  },

  resetGame: () => {
    wipeSave();
    battle = null;
    raidTarget = null;
    set({ ...defaultSave(), hydrated: true, screen: "splash", sheet: null });
  },

  tick: (now) => {
    const s = get();
    if (s.screen === "splash") return;
    const dt = Math.min(60, Math.max(0, (now - s.lastTick) / 1000));
    if (dt < 0.2) return;

    const trained = applyTraining(s, dt * 1000);
    let chat = s.chat;
    if (Math.random() < dt * 0.05) {
      chat = [...chat.slice(-39), randomChat(now)];
    }

    set({
      lastTick: now,
      army: trained.army,
      training: trained.jobs,
      chat,
    });
    if (now - lastPersist > 5000) {
      lastPersist = now;
      persist({ ...get() });
    }
  },

  storedOf: (b, now) => storedAmount(b, now),

  setSheet: (sheet) => set({ sheet, placing: sheet === "build" ? get().placing : null }),
  setMuted: (muted) => {
    set({ muted });
    persist({ ...get(), muted });
  },
  selectBuilding: (selectedId) =>
    set({ selectedId, sheet: selectedId ? "info" : get().sheet === "info" ? null : get().sheet }),
  beginPlace: (type) => set({ placing: type, sheet: null, selectedId: null }),
  cancelPlace: () => set({ placing: null, ghost: null }),

  hoverPlace: (gx, gy) => {
    const type = get().placing;
    if (!type) return;
    const snapped = snapPlace(get().buildings, type, gx, gy);
    if (!snapped) {
      set({ ghost: { type, gx: Math.round(gx), gy: Math.round(gy), valid: false } });
      return;
    }
    set({ ghost: { type, gx: snapped.gx, gy: snapped.gy, valid: true } });
  },

  confirmPlace: (gx, gy) => {
    const type = get().placing;
    if (!type) return false;
    const def = BUILDINGS[type];
    const s = get();
    if (s.gold < def.costGold) {
      sfxError();
      set({ toast: "Ouro insuficiente." });
      return false;
    }
    const snapped = snapPlace(s.buildings, type, gx, gy);
    if (!snapped || !canPlace(s.buildings, type, snapped.gx, snapped.gy)) {
      sfxError();
      set({ toast: "Não cabe aqui. Deixe espaço entre as construções." });
      return false;
    }
    const b: BuildingInst = {
      id: nid(type),
      type,
      gx: snapped.gx,
      gy: snapped.gy,
      level: 1,
      lastCollect: Date.now(),
    };
    const buildings = [...s.buildings, b];
    set({
      buildings,
      gold: s.gold - def.costGold,
      placing: type === "wall" ? "wall" : null,
      ghost: type === "wall" ? get().ghost : null,
      toast: `${def.name} erguido.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  collect: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return;
    const kind = producerKind(b.type);
    if (!kind) return;
    const amt = storedAmount(b);
    if (amt < 1) {
      set({ toast: "Ainda está a produzir." });
      return;
    }
    const buildings = s.buildings.map((x) => (x.id === id ? { ...x, lastCollect: Date.now() } : x));
    if (kind === "gold") set({ gold: s.gold + amt, buildings, toast: `+${amt} ouro` });
    else set({ bread: s.bread + amt, buildings, toast: `+${amt} pão` });
    persist({ ...get() });
    sfxCoin();
  },

  collectAll: () => {
    const s = get();
    let gold = 0;
    let bread = 0;
    const now = Date.now();
    const buildings = s.buildings.map((b) => {
      if (b.type === "mine") {
        const amt = storedAmount(b, now);
        gold += amt;
        return amt > 0 ? { ...b, lastCollect: now } : b;
      }
      if (b.type === "farm") {
        const amt = storedAmount(b, now);
        bread += amt;
        return amt > 0 ? { ...b, lastCollect: now } : b;
      }
      return b;
    });
    if (!gold && !bread) {
      set({ toast: "Nada pronto para recolher." });
      return;
    }
    set({
      buildings,
      gold: s.gold + gold,
      bread: s.bread + bread,
      toast: `Coletado ${gold} ouro e ${bread} pão.`,
    });
    persist({ ...get() });
    sfxCoin();
  },

  upgrade: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || (b.type === "castle" && b.level >= 8)) return false;
    if (b.level >= 8) {
      set({ toast: "Nível máximo." });
      return false;
    }
    const cost = upgradeCost(b.type, b.level);
    if (s.gold < cost) {
      sfxError();
      set({ toast: "Ouro insuficiente para melhorar." });
      return false;
    }
    set({
      gold: s.gold - cost,
      buildings: s.buildings.map((x) => (x.id === id ? { ...x, level: x.level + 1 } : x)),
      toast: `${BUILDINGS[b.type].name} nível ${b.level + 1}.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  demolish: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || b.type === "castle") return;
    const refund = Math.floor(BUILDINGS[b.type].costGold * 0.5);
    set({
      buildings: s.buildings.filter((x) => x.id !== id),
      gold: s.gold + refund,
      selectedId: null,
      sheet: null,
      toast: `Demolido. +${refund} ouro.`,
    });
    persist({ ...get() });
  },

  train: (type) => {
    const s = get();
    if (countType(s.buildings, "barracks") < 1) {
      set({ toast: "Construa um quartel primeiro." });
      sfxError();
      return false;
    }
    const def = TROOPS[type];
    if (isHero(type) && s.army[type] + s.training.filter((t) => t.type === type).length >= 1) {
      set({ toast: `Só um${type === "generaless" ? "a" : ""} ${def.name.toLowerCase()} por condado.` });
      sfxError();
      return false;
    }
    const cap = armyCapacity(countType(s.buildings, "camp"));
    if (armySize(s) >= cap) {
      set({ toast: "Acampamento lotado. Construa outro." });
      sfxError();
      return false;
    }
    if (s.bread < def.costBread) {
      set({ toast: "Pão insuficiente." });
      sfxError();
      return false;
    }
    set({
      bread: s.bread - def.costBread,
      training: [...s.training, { id: nid("t"), type, remaining: def.trainMs }],
      toast: `Recrutando ${def.name}.`,
    });
    persist({ ...get() });
    sfxClick();
    return true;
  },

  speedTrain: (id) => {
    const s = get();
    const job = s.training.find((t) => t.id === id);
    if (!job) return false;
    if (s.niens < 1) {
      set({ toast: "Precisa de 1 Nien para acelerar." });
      return false;
    }
    const army = { ...s.army };
    army[job.type] += 1;
    set({
      niens: s.niens - 1,
      army,
      training: s.training.filter((t) => t.id !== id),
      toast: `${TROOPS[job.type].name} pronto.`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  openRaid: () => set({ screen: "raid", sheet: null, placing: null }),

  beginAttack: (lord) => {
    const s = get();
    const armyN = s.army.infantry + s.army.archers + s.army.cavalry + s.army.general + s.army.generaless;
    if (armyN <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      sfxError();
      return;
    }
    raidTarget = lord;
    const layout = generateBase(lord.id, lord.rank);
    battle = new Battle(layout, { ...s.army }, lord.lootGold, lord.lootBread);
    const deployType: TroopType =
      s.army.infantry > 0
        ? "infantry"
        : s.army.archers > 0
          ? "archers"
          : s.army.cavalry > 0
            ? "cavalry"
            : s.army.general > 0
              ? "general"
              : "generaless";
    set({
      screen: "prep",
      sheet: null,
      deployType,
    });
    sfxClick();
  },

  setDeployType: (deployType) => set({ deployType }),

  deploy: (gx, gy) => {
    if (!battle) return false;
    const s = get();
    const type = s.deployType;
    const ok = battle.deploy(type, gx, gy);
    if (!ok) return false;
    const army = { ...s.army };
    army[type] = Math.max(0, army[type] - 1);
    set({ army });
    return true;
  },

  skipPrep: () => {
    if (!battle) return;
    if (battle.troops.length === 0) {
      set({ toast: "Posicione ao menos uma tropa nas bordas." });
      sfxError();
      return;
    }
    battle.skipPrep();
    set({ screen: "battle" });
  },

  retreat: () => {
    if (!battle || battle.phase !== "fight") return;
    battle.retreat();
    get().finishBattle();
  },

  finishBattle: () => {
    if (!battle?.result || !raidTarget) {
      battle = null;
      raidTarget = null;
      set({ screen: "village" });
      return;
    }
    if (get().screen === "results") return;
    const r = battle.result;
    const s = get();
    const army = { ...s.army };
    army.infantry += r.survivors.infantry;
    army.archers += r.survivors.archers;
    army.cavalry += r.survivors.cavalry;
    army.general += r.survivors.general;
    army.generaless += r.survivors.generaless;
    const incoming =
      Math.random() < 0.35
        ? {
            id: nid("r"),
            at: Date.now(),
            attacker: raidTarget.nick,
            gold: Math.floor(s.gold * 0.04),
            bread: Math.floor(s.bread * 0.03),
            incoming: true as const,
          }
        : null;
    set({
      army,
      gold: Math.max(0, s.gold + r.gold - (incoming?.gold ?? 0)),
      bread: Math.max(0, s.bread + r.bread - (incoming?.bread ?? 0)),
      niens: s.niens + r.niens,
      stars: s.stars + r.stars,
      raidsWon: s.raidsWon + (r.stars > 0 ? 1 : 0),
      raids: [
        {
          id: nid("r"),
          at: Date.now(),
          attacker: s.player.nick,
          gold: r.gold,
          bread: r.bread,
          incoming: false,
        },
        ...(incoming ? [incoming] : []),
        ...s.raids,
      ].slice(0, 12),
      screen: "results",
    });
    persist({ ...get() });
    if (r.stars > 0) sfxStar();
  },

  sendChat: (text) => {
    const t = text.trim();
    if (!t) return;
    const s = get();
    const msg: ChatMsg = {
      id: nid("m"),
      fromId: s.player.id,
      fromNick: s.player.nick,
      text: t.slice(0, 160),
      at: Date.now(),
      self: true,
    };
    const replyLord = LORDS[Math.floor(Math.random() * LORDS.length)]!;
    const reply: ChatMsg = {
      id: nid("m"),
      fromId: replyLord.id,
      fromNick: replyLord.nick,
      text: t.toLowerCase().includes("nien")
        ? `Trato visto, ${s.player.nick}. Manda para ${replyLord.id}.`
        : `Ouvido, ${s.player.nick}. O condado observa.`,
      at: Date.now() + 400,
    };
    set({ chat: [...s.chat, msg, reply].slice(-40) });
    persist({ ...get() });
  },

  buyOffer: (id) => {
    const s = get();
    const o = s.offers.find((x) => x.id === id);
    if (!o) return false;
    if (s.niens < o.wantNiens) {
      set({ toast: "Niens insuficientes." });
      sfxError();
      return false;
    }
    const gold = o.give.kind === "gold" ? s.gold + o.give.amount : s.gold;
    const bread = o.give.kind === "bread" ? s.bread + o.give.amount : s.bread;
    set({
      niens: s.niens - o.wantNiens,
      gold,
      bread,
      offers: s.offers.filter((x) => x.id !== id),
      toast: `Comprado de ${o.sellerNick}.`,
      chat: [
        ...s.chat,
        {
          id: nid("m"),
          fromId: o.sellerId,
          fromNick: o.sellerNick,
          text: `Trato fechado com ${s.player.nick}. Niens recebidos.`,
          at: Date.now(),
        },
      ].slice(-40),
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  sellGold: () => {
    const s = get();
    if (s.gold < 1000) {
      set({ toast: "Precisa de 1000 ouro." });
      return false;
    }
    set({ gold: s.gold - 1000, niens: s.niens + 1, toast: "+1 Nien" });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  sellBread: () => {
    const s = get();
    if (s.bread < 1000) {
      set({ toast: "Precisa de 1000 pão." });
      return false;
    }
    set({ bread: s.bread - 1000, niens: s.niens + 1, toast: "+1 Nien" });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  transfer: (toId, amount, kind) => {
    const s = get();
    const n = Math.floor(amount);
    const pool = kind === "niens" ? s.niens : kind === "gold" ? s.gold : s.bread;
    if (n <= 0 || n > pool) {
      set({ toast: "Quantia inválida." });
      sfxError();
      return false;
    }
    if (toId.trim().toUpperCase() === s.player.id) {
      set({ toast: "Não envie para si mesmo." });
      return false;
    }
    const lord = findLord(toId);
    const label = kind === "niens" ? "Niens" : kind === "gold" ? "ouro" : "pão";
    const patch =
      kind === "niens" ? { niens: s.niens - n } : kind === "gold" ? { gold: s.gold - n } : { bread: s.bread - n };
    set({
      ...patch,
      toast: lord ? `${n} ${label} enviados a ${lord.nick}.` : `${n} ${label} enviados a ${toId.toUpperCase()}.`,
      chat: [
        ...s.chat,
        {
          id: nid("m"),
          fromId: s.player.id,
          fromNick: s.player.nick,
          text: `Transferiu ${n} ${label} para ${toId.toUpperCase()}.`,
          at: Date.now(),
          self: true,
        },
        ...(lord
          ? [
              {
                id: nid("m"),
                fromId: lord.id,
                fromNick: lord.nick,
                text: `Recebi ${n} ${label} de ${s.player.nick}. Trato honrado.`,
                at: Date.now() + 200,
              },
            ]
          : []),
      ].slice(-40),
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  rename: (nick) => {
    const n = nick.trim().slice(0, 18);
    if (!n) {
      set({ toast: "Nome vazio." });
      return false;
    }
    const s = get();
    set({ player: { ...s.player, nick: n }, nickDraft: n, toast: "Nome atualizado." });
    persist({ ...get() });
    sfxClick();
    return true;
  },

  setToast: (toast) => set({ toast }),

  returnVillage: () => {
    battle = null;
    raidTarget = null;
    set({ screen: "village", sheet: null });
  },
}));

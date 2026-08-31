import { create } from "zustand";
import {
  ALLIANCE_FOUND_GOLD,
  BUILDINGS,
  COUNTY_MAX,
  DEFENDER_COST,
  GENERAL_MAX_LEVEL,
  GENERAL_UNLOCK_COUNTY,
  LOOT_CAP,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  REFERRAL_GOLD,
  SHIELD_MS,
  SPEED_TRAIN_GOLD,
  TROOPS,
  armyCapacity,
  campUpgradeGold,
  countyUpgradeCost,
  defenderCap,
  generalCardsFor,
  isHero,
  passCostNiens,
  passReward,
  passSeasonKey,
  passWindow,
  productionPerSec,
  storageCap,
  troopCardsFor,
  troopUpgradeBread,
  troopUpgradeGold,
  upgradeCost,
  wallCap,
  warWindow,
  type BuildingType,
  type ResourceKind,
  type TroopType,
  type WallDir,
} from "./constants";
import { Battle } from "./battle";
import { botArmy, findLord, findNick, LORDS, lordsOfAlliance, marketBoard, pairWar, randomChat, warChest } from "./bots";
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
import { canPlace, canPlaceWall, countType, generateBase, nid, snapPlace, wallRow } from "./world";
import { sfxBuild, sfxClick, sfxCoin, sfxError, sfxHorn, sfxStar } from "./audio";

export let battle: Battle | null = null;
export let raidTarget: Lord | null = null;
let lastPersist = 0;
let lastIncomingAt = 0;

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
  placingDir: WallDir;
  movingId: string | null;
  selectedRow: string[];
  marchLord: Lord | null;
  lookup: { id: string; nick: string } | null;
  hydrate: () => void;
  startGame: (nick: string, referredBy?: string) => void;
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
  buyNien: () => boolean;
  sellNien: () => boolean;
  transfer: (toId: string, amount: number, kind: ResourceKind) => boolean;
  peekId: (id: string) => void;
  rename: (nick: string) => boolean;
  setToast: (t: string | null) => void;
  storedOf: (b: BuildingInst, now?: number) => number;
  returnVillage: () => void;
  rotateWall: (id: string) => void;
  selectWallRow: (id: string) => void;
  noteTap: (id: string) => void;
  cancelMove: () => void;
  upgradeCounty: () => boolean;
  upgradeTroop: (type: TroopType) => boolean;
  upgradeCamp: () => boolean;
  recruitDefender: () => boolean;
  buyPass: () => boolean;
  claimPass: (level: number) => boolean;
  foundAlliance: (name: string) => boolean;
  sendAllianceChat: (text: string) => void;
  setFocus: (id: string | null) => void;
  finishMarch: () => void;
  copyInvite: () => void;
  flipPlacingDir: () => void;
  beginIncoming: (lord?: Lord) => void;
}

function armySize(s: SaveState): number {
  const a = s.army;
  return a.infantry + a.archers + a.cavalry + a.general + a.generaless + a.defender + s.training.length;
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
  placingDir: "h",
  movingId: null,
  selectedRow: [],
  marchLord: null,
  lookup: null,

  hydrate: () => {
    const loaded = loadSave();
    if (loaded) {
      const now = Date.now();
      const training = applyTraining(loaded, Math.min(8 * 3600_000, Math.max(0, now - loaded.lastTick)));
      let gold = loaded.gold;
      let shieldUntil = loaded.shieldUntil;
      let raids = loaded.raids;
      if (
        now - loaded.lastTick > 10 * 60_000 &&
        now > (loaded.shieldUntil || 0) &&
        now - loaded.player.createdAt > 90_000
      ) {
        const lost = Math.min(LOOT_CAP, Math.max(400, Math.floor(loaded.gold * 0.04)));
        gold = Math.max(0, gold - lost);
        shieldUntil = now + SHIELD_MS;
        raids = [
          {
            id: nid("r"),
            at: now,
            attacker: LORDS[Math.floor(Math.random() * LORDS.length)]!.nick,
            gold: lost,
            bread: 0,
            incoming: true,
          },
          ...raids,
        ].slice(0, 12);
      }
      set({
        ...loaded,
        gold,
        shieldUntil,
        raids,
        army: training.army,
        training: training.jobs,
        lastTick: now,
        hydrated: true,
        screen: "village",
        nickDraft: loaded.player.nick,
        placingDir: "h",
        movingId: null,
        selectedRow: [],
        marchLord: null,
      });
      persist({ ...get() });
    } else {
      set({ hydrated: true, screen: "splash" });
    }
  },

  startGame: (nick, referredBy) => {
    const s = defaultSave(nick, referredBy?.trim().toUpperCase() || null);
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
    const season = passSeasonKey(now).key;
    let pass = s.pass;
    if (pass.season !== season) pass = { season, purchased: false, stars: 0, claimed: [] };

    let war = s.war;
    const win = warWindow(now);
    const week = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    if (win.open && s.alliance) {
      if (!war || war.week !== week) {
        const pair = pairWar(s.alliance.id, week);
        war = {
          week,
          foeId: pair.foeId,
          foeName: pair.foeName,
          chest: warChest(week + s.alliance.id),
          ourStars: 0,
          theirStars: Math.floor(Math.random() * 8),
          attacks: {},
          sittingOut: pair.sittingOut,
          resolved: false,
        };
      } else if (!war.sittingOut && Math.random() < dt * 0.02) {
        war = { ...war, theirStars: war.theirStars + (Math.random() < 0.55 ? 1 : 2) };
      }
    }

    let gold = s.gold;
    let toast: string | null = s.toast;
    if (war && !win.open && !war.resolved) {
      const won = !war.sittingOut && war.ourStars > war.theirStars;
      const members = Math.max(1, s.alliance?.members.length ?? 1);
      const share = won ? Math.floor(war.chest / members) : 0;
      gold += share;
      war = { ...war, resolved: true };
      toast = won
        ? `Guerra vencida. +${share.toLocaleString("pt")} ouro do cofre.`
        : war.sittingOut
          ? "Sábado ímpar: a aliança ficou de fora."
          : "Guerra perdida. O cofre ficou com o rival.";
      chat = [
        ...chat,
        {
          id: nid("m"),
          fromId: "CDN-HERALDO",
          fromNick: "Heraldo",
          text: toast,
          at: now,
        },
      ];
    }

    let referralClaimed = s.referralClaimed;
    if (s.inviteCopied && !referralClaimed && now - s.player.createdAt > 8 * 60_000) {
      gold += REFERRAL_GOLD;
      referralClaimed = true;
      chat = [
        ...chat,
        {
          id: nid("m"),
          fromId: "CDN-HERALDO",
          fromNick: "Heraldo",
          text: `Um amigo teu chegou ao nível 3. +${REFERRAL_GOLD.toLocaleString("pt")} ouro (Indique e Ganhe).`,
          at: now,
        },
      ];
    }

    set({
      lastTick: now,
      army: trained.army,
      training: trained.jobs,
      chat,
      pass,
      war,
      gold,
      referralClaimed,
      toast,
    });
    if (now - lastPersist > 5000) {
      lastPersist = now;
      persist({ ...get() });
    }

    if (
      s.screen === "village" &&
      !s.placing &&
      !s.sheet &&
      now > s.shieldUntil &&
      now - s.player.createdAt > 90_000 &&
      now - lastIncomingAt > 180_000 &&
      Math.random() < dt * 0.004
    ) {
      lastIncomingAt = now;
      const pool = s.war?.foeId ? lordsOfAlliance(s.war.foeId) : LORDS;
      const lord = (pool.length ? pool : LORDS)[Math.floor(Math.random() * (pool.length || LORDS.length))]!;
      get().beginIncoming(lord);
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
  beginPlace: (type) => set({ placing: type, sheet: null, selectedId: null, movingId: null }),
  cancelPlace: () => set({ placing: null, ghost: null, movingId: null }),

  hoverPlace: (gx, gy) => {
    const s = get();
    const type = s.placing;
    if (!type) return;
    const snapped = snapPlace(s.buildings, type, gx, gy, s.movingId ?? undefined);
    const dir = type === "wall" ? s.placingDir : undefined;
    if (!snapped) {
      set({ ghost: { type, gx: Math.round(gx), gy: Math.round(gy), valid: false, dir } });
      return;
    }
    set({ ghost: { type, gx: snapped.gx, gy: snapped.gy, valid: true, dir } });
  },

  confirmPlace: (gx, gy) => {
    const type = get().placing;
    if (!type) return false;
    const def = BUILDINGS[type];
    const s = get();
    const ignore = s.movingId ?? undefined;
    const snapped = snapPlace(s.buildings, type, gx, gy, ignore);
    if (!snapped || !canPlace(s.buildings, type, snapped.gx, snapped.gy, ignore)) {
      sfxError();
      set({ toast: "Não cabe aqui. Deixe espaço entre as construções." });
      return false;
    }
    if (s.movingId) {
      set({
        buildings: s.buildings.map((b) => (b.id === s.movingId ? { ...b, gx: snapped.gx, gy: snapped.gy } : b)),
        movingId: null,
        placing: null,
        ghost: null,
        toast: "Estrutura movida.",
      });
      persist({ ...get() });
      sfxBuild();
      return true;
    }
    if (s.gold < def.costGold) {
      sfxError();
      set({ toast: "Ouro insuficiente." });
      return false;
    }
    if (type === "wall" && !canPlaceWall(s.buildings, s.countyLevel)) {
      set({ toast: `Limite de muros: ${wallCap(s.countyLevel)}.` });
      sfxError();
      return false;
    }
    const b: BuildingInst = {
      id: nid(type),
      type,
      gx: snapped.gx,
      gy: snapped.gy,
      level: 1,
      lastCollect: Date.now(),
      dir: type === "wall" ? s.placingDir : undefined,
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
    if (!b) return false;
    if (b.level >= s.countyLevel) {
      set({ toast: "Limite do condado. Maximize tudo e avance o nível." });
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
    if (type === "defender") {
      if (countType(s.buildings, "training") < 1) {
        set({ toast: "Construa o Campo de Treino." });
        return false;
      }
      if (s.army.defender + s.training.filter((t) => t.type === "defender").length >= defenderCap(s.campLevel)) {
        set({ toast: "Capacidade de defensores no máximo. Melhore o campo." });
        return false;
      }
      if (s.gold < DEFENDER_COST) {
        set({ toast: "Ouro insuficiente." });
        return false;
      }
      set({
        gold: s.gold - DEFENDER_COST,
        training: [...s.training, { id: nid("t"), type, remaining: def.trainMs }],
        toast: "Recrutando defensor da guilda.",
      });
      persist({ ...get() });
      sfxClick();
      return true;
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
    if (s.gold < SPEED_TRAIN_GOLD) {
      set({ toast: `Precisa de ${SPEED_TRAIN_GOLD} ouro para acelerar.` });
      return false;
    }
    const army = { ...s.army };
    army[job.type] += 1;
    set({
      gold: s.gold - SPEED_TRAIN_GOLD,
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
    const armyN = armySize(s) - s.training.length;
    if (armyN <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      sfxError();
      return;
    }
    if (s.war && s.war.foeId && lord.allianceId === s.war.foeId) {
      const used = s.war.attacks[lord.id] ?? 0;
      if (used >= 2) {
        set({ toast: "Anti-farm: no máximo 2 ataques por base nesta guerra." });
        sfxError();
        return;
      }
    }
    raidTarget = lord;
    set({ screen: "march", sheet: null, marchLord: lord });
    sfxClick();
  },

  finishMarch: () => {
    const s = get();
    const lord = s.marchLord ?? raidTarget;
    if (!lord) {
      set({ screen: "village" });
      return;
    }
    raidTarget = lord;
    const layout = generateBase(lord.id, lord.rank);
    battle = new Battle(layout, { ...s.army }, lord.lootGold, { levels: s.troopLevels, campLevel: s.campLevel });
    const deployType: TroopType =
      s.army.infantry > 0
        ? "infantry"
        : s.army.archers > 0
          ? "archers"
          : s.army.defender > 0
            ? "defender"
            : s.army.cavalry > 0
              ? "cavalry"
              : s.army.general > 0
                ? "general"
                : "generaless";
    set({ screen: "prep", sheet: null, deployType, marchLord: lord });
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
    if (battle.spectator) {
      set({ screen: "spectate" });
      return;
    }
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
    if (!battle.spectator) {
      army.infantry += r.survivors.infantry;
      army.archers += r.survivors.archers;
      army.cavalry += r.survivors.cavalry;
      army.general += r.survivors.general;
      army.generaless += r.survivors.generaless;
      army.defender += r.survivors.defender;
    }
    const pass = s.pass.purchased ? { ...s.pass, stars: s.pass.stars + (battle.spectator ? 0 : r.stars) } : s.pass;
    let war = s.war;
    if (!battle.spectator && war && raidTarget.allianceId && raidTarget.allianceId === war.foeId && !war.sittingOut) {
      const used = (war.attacks[raidTarget.id] ?? 0) + 1;
      war = {
        ...war,
        ourStars: war.ourStars + r.stars,
        attacks: { ...war.attacks, [raidTarget.id]: used },
      };
    }
    const stolen = battle.spectator ? r.gold : 0;
    set({
      army,
      gold: Math.max(0, s.gold + (battle.spectator ? 0 : r.gold) - stolen),
      bread: s.bread,
      niens: s.niens,
      stars: s.stars + (battle.spectator ? 0 : r.stars),
      raidsWon: s.raidsWon + (r.stars > 0 && !battle.spectator ? 1 : 0),
      shieldUntil: battle.spectator ? Date.now() + SHIELD_MS : s.shieldUntil,
      pass,
      war,
      raids: [
        {
          id: nid("r"),
          at: Date.now(),
          attacker: battle.spectator ? raidTarget.nick : s.player.nick,
          gold: r.gold,
          bread: 0,
          incoming: !!battle.spectator,
        },
        ...s.raids,
      ].slice(0, 12),
      screen: "results",
    });
    persist({ ...get() });
    if (r.stars > 0 && !battle.spectator) sfxStar();
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

  buyNien: () => {
    const s = get();
    if (s.gold < NIEN_COST_GOLD) {
      set({ toast: `Precisa de ${NIEN_COST_GOLD.toLocaleString("pt")} ouro.` });
      sfxError();
      return false;
    }
    set({ gold: s.gold - NIEN_COST_GOLD, niens: s.niens + 1, toast: "+1 Nien. Gema selada." });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  sellNien: () => {
    const s = get();
    if (s.niens < 1) {
      set({ toast: "Sem Niens para vender." });
      sfxError();
      return false;
    }
    set({
      niens: s.niens - 1,
      gold: s.gold + NIEN_SELL_GOLD,
      toast: `+${NIEN_SELL_GOLD.toLocaleString("pt")} ouro.`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  transfer: (toId, amount, kind) => {
    const s = get();
    const n = Math.floor(amount);
    const pool =
      kind === "niens"
        ? s.niens
        : kind === "gold"
          ? s.gold
          : kind === "bread"
            ? s.bread
            : kind === "troopCards"
              ? s.troopCards
              : s.generalCards;
    if (n <= 0 || n > pool) {
      set({ toast: "Quantia inválida." });
      sfxError();
      return false;
    }
    if (toId.trim().toUpperCase() === s.player.id) {
      set({ toast: "Não envie para si mesmo." });
      return false;
    }
    const nick = findNick(toId) ?? findLord(toId)?.nick;
    if (!nick) {
      set({ toast: "ID não encontrado. Cole e confira o nick." });
      sfxError();
      return false;
    }
    const lord = findLord(toId);
    const label =
      kind === "niens" ? "Niens" : kind === "gold" ? "ouro" : kind === "bread" ? "pão" : kind === "troopCards" ? "cartas de tropa" : "cartas de general";
    const patch =
      kind === "niens"
        ? { niens: s.niens - n }
        : kind === "gold"
          ? { gold: s.gold - n }
          : kind === "bread"
            ? { bread: s.bread - n }
            : kind === "troopCards"
              ? { troopCards: s.troopCards - n }
              : { generalCards: s.generalCards - n };
    set({
      ...patch,
      toast: `${n} ${label} enviados a ${nick}.`,
      chat: [
        ...s.chat,
        {
          id: nid("m"),
          fromId: s.player.id,
          fromNick: s.player.nick,
          text: `Transferiu ${n} ${label} para ${toId.toUpperCase()} (${nick}).`,
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

  peekId: (id) => {
    const nick = findNick(id);
    set({ lookup: nick ? { id: id.trim().toUpperCase(), nick } : null, toast: nick ? `Senhor: ${nick}` : "ID desconhecido." });
  },

  rotateWall: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || b.type !== "wall") {
      const dir: WallDir = s.placingDir === "v" ? "h" : "v";
      set({ placingDir: dir, toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—)." });
      return;
    }
    const ids = new Set(s.selectedRow.includes(id) && s.selectedRow.length > 1 ? s.selectedRow : [id]);
    const dir: WallDir = b.dir === "v" ? "h" : "v";
    set({
      buildings: s.buildings.map((x) => (ids.has(x.id) ? { ...x, dir } : x)),
      placingDir: dir,
      toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—).",
    });
    persist({ ...get() });
  },

  selectWallRow: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return;
    const row = wallRow(s.buildings, b);
    set({ selectedRow: row.map((x) => x.id), selectedId: id, sheet: "info", toast: `${row.length} muros na fileira.` });
  },

  noteTap: (id) => {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return;
    const prev = (get() as { _tap?: { id: string; n: number; at: number } })._tap;
    const now = Date.now();
    const n = prev && prev.id === id && now - prev.at < 750 ? prev.n + 1 : 1;
    (get() as { _tap?: { id: string; n: number; at: number } })._tap = { id, n, at: now };
    if (n >= 3) {
      set({ movingId: id, placing: b.type, sheet: null, toast: "Toque o chão para plantar de novo." });
    } else if (b.type === "wall") {
      get().selectWallRow(id);
    } else {
      get().selectBuilding(id);
    }
  },

  cancelMove: () => set({ movingId: null, placing: null, ghost: null }),

  upgradeCounty: () => {
    const s = get();
    if (s.countyLevel >= COUNTY_MAX) {
      set({ toast: "Condado no nível máximo." });
      return false;
    }
    const need = s.buildings.filter((b) => b.type !== "wall" && b.level < s.countyLevel);
    if (need.length) {
      set({ toast: "Full construção: maximize todas as estruturas atuais." });
      return false;
    }
    const cost = countyUpgradeCost(s.countyLevel);
    if (s.gold < cost.gold || s.niens < cost.niens) {
      set({ toast: cost.niens ? `Precisa de ${cost.niens} Niens.` : `Precisa de ${cost.gold.toLocaleString("pt")} ouro.` });
      sfxError();
      return false;
    }
    const next = s.countyLevel + 1;
    set({
      countyLevel: next,
      gold: s.gold - cost.gold,
      niens: s.niens - cost.niens,
      toast: `Condado nível ${next}.`,
    });
    persist({ ...get() });
    sfxStar();
    return true;
  },

  upgradeTroop: (type) => {
    const s = get();
    if (countType(s.buildings, "training") < 1) {
      set({ toast: "Construa o Campo de Treino." });
      return false;
    }
    const cur = s.troopLevels[type];
    if (isHero(type)) {
      if (s.countyLevel < GENERAL_UNLOCK_COUNTY) {
        set({ toast: `Generais só evoluem no condado ${GENERAL_UNLOCK_COUNTY}.` });
        return false;
      }
      if (cur >= GENERAL_MAX_LEVEL) {
        set({ toast: "General no nível 7." });
        return false;
      }
      const cards = generalCardsFor(cur + 1);
      if (s.generalCards < cards) {
        set({ toast: `Precisa de ${cards} cartas de general.` });
        return false;
      }
      set({
        generalCards: s.generalCards - cards,
        troopLevels: { ...s.troopLevels, [type]: cur + 1 },
        toast: `${TROOPS[type].name} nível ${cur + 1}.`,
      });
      persist({ ...get() });
      sfxBuild();
      return true;
    }
    if (cur >= 15) {
      set({ toast: "Tropa no nível 15." });
      return false;
    }
    const cards = troopCardsFor(cur + 1);
    const g = troopUpgradeGold(cur + 1);
    const br = troopUpgradeBread(cur + 1);
    if (s.troopCards < cards || s.gold < g || s.bread < br) {
      set({ toast: `Precisa ${cards} cartas, ${g} ouro, ${br} pão.` });
      return false;
    }
    set({
      troopCards: s.troopCards - cards,
      gold: s.gold - g,
      bread: s.bread - br,
      troopLevels: { ...s.troopLevels, [type]: cur + 1 },
      toast: `${TROOPS[type].name} nível ${cur + 1}.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  upgradeCamp: () => {
    const s = get();
    if (countType(s.buildings, "training") < 1) {
      set({ toast: "Construa o Campo de Treino." });
      return false;
    }
    if (s.campLevel >= s.countyLevel) {
      set({ toast: "Campo no limite do condado." });
      return false;
    }
    const cost = campUpgradeGold(s.campLevel);
    if (s.gold < cost) {
      set({ toast: `Precisa de ${cost.toLocaleString("pt")} ouro.` });
      return false;
    }
    set({ gold: s.gold - cost, campLevel: s.campLevel + 1, toast: `Campo de treino nível ${s.campLevel + 1}.` });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  recruitDefender: () => get().train("defender"),

  buyPass: () => {
    const s = get();
    const win = passWindow();
    if (!win.active) {
      set({ toast: "O passe abre no dia 1. Fevereiro dura 27 dias." });
      return false;
    }
    if (s.pass.purchased) {
      set({ toast: "Passe já selado nesta temporada." });
      return false;
    }
    const cost = passCostNiens(s.pass.season);
    if (s.niens < cost) {
      set({ toast: `Precisa de ${cost} Niens.` });
      return false;
    }
    set({ niens: s.niens - cost, pass: { ...s.pass, purchased: true }, toast: "Passe de Batalha selado." });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  claimPass: (level) => {
    const s = get();
    if (!s.pass.purchased) {
      set({ toast: "Compre o passe primeiro." });
      return false;
    }
    const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
    if (level > reached || s.pass.claimed.includes(level)) return false;
    const r = passReward(level);
    set({
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      niens: s.niens + r.niens,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, claimed: [...s.pass.claimed, level] },
      toast: `Nível ${level}: ${r.label}`,
    });
    persist({ ...get() });
    sfxStar();
    return true;
  },

  foundAlliance: (name) => {
    const s = get();
    if (s.alliance) {
      set({ toast: "Já tens aliança." });
      return false;
    }
    if (s.gold < ALLIANCE_FOUND_GOLD) {
      set({ toast: "Precisa de 5.000.000 de ouro." });
      sfxError();
      return false;
    }
    const id = `AL-${s.player.id.slice(4, 8)}`;
    set({
      gold: s.gold - ALLIANCE_FOUND_GOLD,
      alliance: {
        id,
        name: name.trim().slice(0, 22) || "Aliança do Condado",
        members: [{ id: s.player.id, nick: s.player.nick }, { id: "CDN-ALDRIC", nick: "Sir Aldric" }, { id: "CDN-ISOLDE", nick: "Dama Isolde" }],
      },
      toast: "Aliança fundada. Chat liberado.",
    });
    persist({ ...get() });
    sfxStar();
    return true;
  },

  sendAllianceChat: (text) => {
    const t = text.trim();
    const s = get();
    if (!t || !s.alliance) return;
    const msg: ChatMsg = {
      id: nid("m"),
      fromId: s.player.id,
      fromNick: s.player.nick,
      text: t.slice(0, 160),
      at: Date.now(),
      self: true,
      channel: "alliance",
    };
    const reply: ChatMsg = {
      id: nid("m"),
      fromId: "CDN-ALDRIC",
      fromNick: "Sir Aldric",
      text: "Ouvido no pavilhão. As estrelas da guerra contam.",
      at: Date.now() + 300,
      channel: "alliance",
    };
    set({ allianceChat: [...s.allianceChat, msg, reply].slice(-40) });
    persist({ ...get() });
  },

  setFocus: (id) => {
    battle?.setFocus(id);
  },

  copyInvite: () => {
    const id = get().player.id;
    try {
      void navigator.clipboard.writeText(id);
    } catch {
      /* ignore */
    }
    set({ inviteCopied: true, toast: "ID copiado. Amigo no nível 3 rende 100 mil ouro." });
  },

  flipPlacingDir: () => {
    const s = get();
    const dir: WallDir = s.placingDir === "h" ? "v" : "h";
    set({
      placingDir: dir,
      ghost: s.ghost ? { ...s.ghost, dir } : s.ghost,
      toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—).",
    });
  },

  beginIncoming: (lord) => {
    const s = get();
    if (s.screen !== "village") return;
    const attacker = lord ?? LORDS[Math.floor(Math.random() * LORDS.length)]!;
    raidTarget = attacker;
    battle = new Battle(s.buildings, botArmy(attacker.rank), LOOT_CAP, {
      spectator: true,
      levels: s.troopLevels,
      campLevel: s.campLevel,
    });
    lastIncomingAt = Date.now();
    set({
      screen: "spectate",
      sheet: null,
      placing: null,
      ghost: null,
      toast: `${attacker.nick} ataca o teu condado. Só podes assistir.`,
    });
    sfxHorn();
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

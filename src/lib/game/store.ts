import { create } from "zustand";
import {
  ALLIANCE_FOUND_GOLD,
  BREAD_PACK,
  BREAD_PACK_BUY_GOLD,
  BREAD_PACK_SELL_GOLD,
  BREAD_UPKEEP_PER_TROOP_DAY,
  BUILDINGS,
  COUNTY_MAX,
  DAILY_ATTACK_CAP,
  DEFENDER_COST,
  GENERAL_MAX_LEVEL,
  GENERAL_UNLOCK_COUNTY,
  GOLD_NAME_PL,
  LOOT_CAP,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  REFERRAL_GOLD,
  SHIELD_MS,
  SPEED_TRAIN_GOLD,
  TROOPS,
  WAR_ATTACK_CAP,
  armyCapacity,
  brtDayKey,
  campUpgradeGold,
  countyUpgradeCost,
  dailyAttackCap,
  dailyNienSendCap,
  defenderCap,
  generalCardsFor,
  goldWord,
  isHero,
  passCostNiens,
  passReward,
  passSeasonKey,
  passWindow,
  productionPerSec,
  resourceLabel,
  storageCap,
  troopCardsFor,
  troopUpgradeBread,
  troopUpgradeGold,
  upgradeCost,
  wallCap,
  warWindow,
  rankingWindow,
  type BuildingType,
  type ResourceKind,
  type Tradable,
  type TroopType,
  type WallDir,
} from "./constants";
import { Battle } from "./battle";
import { ALLIANCES, botArmy, findLord, findNick, LORDS, lordsOfAlliance, pairWar, randomChat, warChest } from "./bots";
import { defaultSave, flushCloud, loadSave, persist, setCloudSync, wipeSave } from "./save";
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
  TransferRecord,
} from "./types";
import { canPlace, canPlaceWall, countType, generateBase, nid, snapPlace, wallRow } from "./world";
import { isEdgeTile } from "./iso";
import { sfxBuild, sfxClick, sfxCoin, sfxError, sfxHorn, sfxStar } from "./audio";
import { auth } from "@/lib/firebase";
import {
  cancelMarketOffer,
  cloudTransfer,
  createMarketOffer,
  createProfile,
  creditReferral,
  listenGlobalChat,
  listMarket,
  listRaidTargets,
  listTransfers,
  peekPlayer,
  pullCloud,
  renameCounty,
  sendGlobalChat,
  startRaid,
  finishRaid,
  submitRaidResult,
  takeMarketOffer,
  playAction,
} from "./cloud";

export let battle: Battle | null = null;
export let raidTarget: Lord | null = null;
let raidSessionId: string | null = null;
let lastPersist = 0;
let lastIncomingAt = 0;

function isLive() {
  return Boolean(auth.currentUser);
}

function applyServerSave(save: SaveState, extra?: { toast?: string | null; offers?: MarketOffer[]; raidTargets?: Lord[] }) {
  const cur = useGame.getState();
  useGame.setState({
    ...save,
    hydrated: true,
    screen: cur.screen === "splash" ? "village" : cur.screen,
    sheet: cur.sheet,
    selectedId: cur.selectedId,
    placing: cur.placing,
    ghost: cur.ghost,
    deployType: cur.deployType,
    toast: extra?.toast ?? cur.toast,
    offers: extra?.offers ?? cur.offers,
    nickDraft: save.player.nick,
    placingDir: cur.placingDir,
    movingId: cur.movingId,
    selectedRow: cur.selectedRow,
    marchLord: cur.marchLord,
    lookup: cur.lookup,
    raidTargets: extra?.raidTargets ?? cur.raidTargets,
  });
  persist(save);
}

async function liveAction(action: string, payload: Record<string, unknown> = {}) {
  const r = await playAction(action, payload);
  if (r.save) applyServerSave(r.save, { toast: r.toast ?? null, offers: r.offers });
  return r;
}

function liveFail(error: unknown) {
  useGame.setState({ toast: error instanceof Error ? error.message : "Não foi possível concluir." });
  sfxError();
}

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
  raidTargets: Lord[];
  admin: boolean;
  needsCounty: boolean;
  bootError: string | null;
  hydrate: () => void;
  hydrateFromCloud: () => Promise<boolean>;
  startGame: (nick: string, referredBy?: string) => void;
  startCloud: (nick: string, referredBy?: string) => Promise<boolean>;
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
  buyOffer: (id: string) => Promise<boolean>;
  buyNien: () => boolean;
  sellNien: () => boolean;
  buyBreadPack: () => boolean;
  sellBreadPack: () => boolean;
  postOffer: (giveKind: Tradable, giveAmount: number, wantKind: Tradable, wantAmount: number) => Promise<boolean>;
  withdrawOffer: (id: string) => Promise<boolean>;
  refreshMarket: () => Promise<void>;
  transfer: (toId: string, amount: number, kind: ResourceKind) => Promise<boolean>;
  peekId: (id: string) => void;
  rename: (nick: string) => Promise<boolean>;
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
  skipPass: () => boolean;
  upgradeType: (type: BuildingType) => boolean;
  upgradeWallRow: (id: string) => boolean;
  refreshLedger: () => Promise<void>;
  refreshTargets: () => Promise<void>;
}

function armySize(s: SaveState): number {
  const a = s.army;
  return (
    a.infantry + a.archers + a.cavalry + a.general + a.generaless + a.defender + s.training.length
  );
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

function wireCloudSync() {
  setCloudSync(async () => {
    if (!auth.currentUser) return;
    try {
      const r = await playAction("sync");
      if (r.save) applyServerSave(r.save, { toast: null });
    } catch {
      /* offline */
    }
  });
}

let chatUnsub: (() => void) | null = null;
let liveChat = false;

function startLiveChat() {
  chatUnsub?.();
  liveChat = false;
  if (!auth.currentUser) return;
  try {
    chatUnsub = listenGlobalChat((rows) => {
      liveChat = true;
      useGame.setState({ chat: rows });
    });
  } catch {
    liveChat = false;
  }
}

function applyLoadedSave(save: ReturnType<typeof defaultSave>, extra?: { toast?: string | null }) {
  const now = Date.now();
  const win = rankingWindow(now);
  const weekStars = save.weekKey === win.key ? save.weekStars : 0;
  const training = applyTraining(save, Math.min(8 * 3600_000, Math.max(0, now - save.lastTick)));
  useGame.setState({
    ...save,
    weekStars,
    weekKey: win.key,
    army: training.army,
    training: training.jobs,
    lastTick: now,
    hydrated: true,
    screen: "village",
    nickDraft: save.player.nick,
    placingDir: "h",
    movingId: null,
    selectedRow: [],
    marchLord: null,
    sheet: null,
    toast: extra?.toast ?? null,
  });
  persist({ ...useGame.getState() });
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
  offers: [],
  nickDraft: "",
  placingDir: "h",
  movingId: null,
  selectedRow: [],
  marchLord: null,
  lookup: null,
  raidTargets: [],
  admin: false,
  needsCounty: false,
  bootError: null,

  hydrate: () => {
    wireCloudSync();
    const local = loadSave();
    if (local) applyLoadedSave(local);
    else set({ hydrated: true, screen: "splash" });
  },

  hydrateFromCloud: async () => {
    wireCloudSync();
    try {
      const cloudResult = await pullCloud();
      const save = cloudResult?.save ?? null;
      if (!save) {
        set({ hydrated: true, screen: "splash", needsCounty: true, bootError: null, toast: null });
        return false;
      }
      applyLoadedSave(save);
      useGame.setState({ needsCounty: false, bootError: null });
      if (cloudResult.admin) useGame.setState({ admin: true });
      startLiveChat();
      try {
        const led = await listTransfers();
        set({ ledger: led.rows });
      } catch {
        /* ignore */
      }
      void get().refreshMarket();
      void get().refreshTargets();
      void flushCloud();
      return true;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Não foi possível abrir o condado. Entra novamente.";
      const toast = /Firestore|undefined|valid document|HTTPError|FUNCTION_INVOCATION/i.test(raw)
        ? "Não foi possível abrir o condado. Tenta novamente."
        : raw;
      set({
        hydrated: true,
        screen: "splash",
        needsCounty: false,
        bootError: toast,
        toast,
      });
      return false;
    }
  },

  startGame: (nick, referredBy) => {
    const s = defaultSave(nick, referredBy?.trim().toUpperCase() || null);
    persist(s);
    set({ ...s, hydrated: true, screen: "village", sheet: null, nickDraft: s.player.nick });
    sfxClick();
  },

  startCloud: async (nick, referredBy) => {
    try {
      const result = await createProfile({
        nick,
        referredBy: referredBy?.trim().toUpperCase() || null,
      });
      if (!result?.save) {
        throw new Error("Não foi possível fundar o condado. Tenta novamente.");
      }
      const { save } = result;
      const now = Date.now();
      const win = rankingWindow(now);
      set({
        ...save,
        weekKey: win.key,
        weekStars: 0,
        hydrated: true,
        screen: "village",
        sheet: null,
        nickDraft: save.player.nick,
        needsCounty: false,
        bootError: null,
        toast: null,
      });
      persist({ ...get() });
      sfxClick();
      startLiveChat();
      void flushCloud();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Não foi possível fundar o condado." });
      sfxError();
      return false;
    }
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
    const season = passSeasonKey(now).key;
    const pass = s.pass.season === season ? s.pass : { season, purchased: false, stars: 0, claimed: [] };

    if (isLive()) {
      set({ lastTick: now, army: trained.army, training: trained.jobs, pass });
      if (now - lastPersist > 30_000) {
        lastPersist = now;
        void flushCloud();
      }
      return;
    }

    let chat = s.chat;
    if (!liveChat && !auth.currentUser && Math.random() < dt * 0.05) {
      chat = [...chat.slice(-39), randomChat(now)];
    }

    let war = s.war;
    const win = warWindow(now);
    const week = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now));
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
        ? `Guerra vencida. +${share.toLocaleString("pt")} ${GOLD_NAME_PL} do cofre.`
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

    const referralClaimed = s.referralClaimed;
    const troopsNow =
      trained.army.infantry +
      trained.army.archers +
      trained.army.cavalry +
      trained.army.general +
      trained.army.generaless +
      trained.army.defender +
      trained.jobs.length;
    let bread = s.bread;
    const upkeep = troopsNow * BREAD_UPKEEP_PER_TROOP_DAY * (dt / 86400);
    if (upkeep > 0) {
      if (bread >= upkeep) bread -= upkeep;
      else {
        bread = 0;
        if (!toast) toast = "Sem pão para a manutenção. Cada tropa gasta 20 pães por dia.";
      }
    }

    set({
      lastTick: now,
      army: trained.army,
      training: trained.jobs,
      chat,
      pass,
      war,
      gold,
      bread,
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
      const lord = (pool.length ? pool : LORDS)[
        Math.floor(Math.random() * (pool.length || LORDS.length))
      ]!;
      get().beginIncoming(lord);
    }
  },

  storedOf: (b, now) => storedAmount(b, now),

  setSheet: (sheet) => set({ sheet, placing: sheet === "build" ? get().placing : null }),
  setMuted: (muted) => {
    set({ muted });
    persist({ ...get(), muted });
    if (isLive()) void playAction("setPrefs", { muted }).catch(() => undefined);
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
    if (isLive()) {
      const s = get();
      void liveAction("placeBuilding", {
        type,
        gx,
        gy,
        dir: s.placingDir,
        movingId: s.movingId,
      })
        .then(() => {
          sfxBuild();
          useGame.setState({
            placing: type === "wall" && !s.movingId ? "wall" : null,
            ghost: type === "wall" && !s.movingId ? useGame.getState().ghost : null,
            movingId: null,
          });
        })
        .catch(liveFail);
      return true;
    }
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
        buildings: s.buildings.map((b) =>
          b.id === s.movingId ? { ...b, gx: snapped.gx, gy: snapped.gy } : b,
        ),
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
      set({ toast: `Faltam ${GOLD_NAME_PL}.` });
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
    if (isLive()) {
      void liveAction("collect", { id }).then(() => sfxCoin()).catch(liveFail);
      return;
    }
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
    if (kind === "gold") set({ gold: s.gold + amt, buildings, toast: `+${amt} ${goldWord(amt)}` });
    else set({ bread: s.bread + amt, buildings, toast: `+${amt} pão` });
    persist({ ...get() });
    sfxCoin();
  },

  collectAll: () => {
    if (isLive()) {
      void liveAction("collectAll").then(() => sfxCoin()).catch(liveFail);
      return;
    }
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
      toast: `Coletado ${gold} ${goldWord(gold)} e ${bread} pão.`,
    });
    persist({ ...get() });
    sfxCoin();
  },

  upgrade: (id) => {
    if (isLive()) {
      void liveAction("upgrade", { id }).then(() => sfxBuild()).catch(liveFail);
      return true;
    }
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || b.type === "castle") return false;
    if (b.level >= s.countyLevel) {
      set({ toast: "Limite do condado. Maximize tudo e avance o nível." });
      return false;
    }
    const cost = upgradeCost(b.type, b.level);
    if (s.gold < cost) {
      sfxError();
      set({ toast: `Faltam ${GOLD_NAME_PL} para melhorar.` });
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
    if (isLive()) {
      void liveAction("demolish", { id }).catch(liveFail);
      return;
    }
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || b.type === "castle") return;
    const refund = Math.floor(BUILDINGS[b.type].costGold * 0.5);
    set({
      buildings: s.buildings.filter((x) => x.id !== id),
      gold: s.gold + refund,
      selectedId: null,
      sheet: null,
      toast: `Demolido. +${refund} ${goldWord(refund)}.`,
    });
    persist({ ...get() });
  },

  train: (type) => {
    if (isLive()) {
      void liveAction("train", { type }).then(() => sfxClick()).catch(liveFail);
      return true;
    }
    const s = get();
    if (countType(s.buildings, "barracks") < 1) {
      set({ toast: "Construa um quartel primeiro." });
      sfxError();
      return false;
    }
    const def = TROOPS[type];
    if (isHero(type) && s.army[type] + s.training.filter((t) => t.type === type).length >= 1) {
      set({
        toast: `Só um${type === "generaless" ? "a" : ""} ${def.name.toLowerCase()} por condado.`,
      });
      sfxError();
      return false;
    }
    if (type === "defender") {
      if (countType(s.buildings, "training") < 1) {
        set({ toast: "Construa o Campo de Treino." });
        return false;
      }
      if (
        s.army.defender + s.training.filter((t) => t.type === "defender").length >=
        defenderCap(s.campLevel)
      ) {
        set({ toast: "Capacidade de defensores no máximo. Melhore o campo." });
        return false;
      }
      if (s.gold < DEFENDER_COST) {
        set({ toast: `Faltam ${GOLD_NAME_PL}.` });
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
    if (isLive()) {
      void liveAction("speedTrain", { id }).then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    const job = s.training.find((t) => t.id === id);
    if (!job) return false;
    if (s.gold < SPEED_TRAIN_GOLD) {
      set({ toast: `Precisa de ${SPEED_TRAIN_GOLD} ${GOLD_NAME_PL} para acelerar.` });
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

  openRaid: () => {
    set({ screen: "raid", sheet: null, placing: null });
    void get().refreshTargets();
  },

  beginAttack: (lord) => {
    if (isLive() && lord.real) {
      void (async () => {
        try {
          const r = await startRaid(lord.id);
          if (r.save) applyServerSave(r.save, { toast: r.toast ?? null });
          raidSessionId = r.sessionId ?? null;
          const target: Lord = {
            ...lord,
            nick: r.nick ?? lord.nick,
            buildings: r.buildings,
            lootGold: r.lootGold ?? lord.lootGold,
            real: true,
          };
          raidTarget = target;
          set({ screen: "march", sheet: null, marchLord: target });
          sfxClick();
        } catch (error) {
          liveFail(error);
        }
      })();
      return;
    }
    const s = get();
    const armyN = armySize(s) - s.training.length;
    if (armyN <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      sfxError();
      return;
    }
    const warOn = !!(s.war && s.war.foeId && lord.allianceId === s.war.foeId && !s.war.sittingOut);
    if (lord.real && lord.countyLevel != null && Math.abs(lord.countyLevel - s.countyLevel) > 1) {
      set({ toast: "Só podes atacar condados de um nível acima, igual ou abaixo." });
      sfxError();
      return;
    }
    if (lord.real && (lord.shieldUntil ?? 0) > Date.now()) {
      set({ toast: "Este condado está sob escudo." });
      sfxError();
      return;
    }
    if (warOn) {
      const used = s.war!.attacks[lord.id] ?? 0;
      if (used >= WAR_ATTACK_CAP) {
        set({ toast: `Guerra de aliança: no máximo ${WAR_ATTACK_CAP} ataques por base.` });
        sfxError();
        return;
      }
    }
    const day = brtDayKey();
    const rec = s.attacksByTarget[lord.id];
    const usedToday = rec && rec.day === day ? rec.count : 0;
    const cap = dailyAttackCap(warOn);
    if (usedToday >= cap) {
      set({
        toast: warOn
          ? `Esta base já sofreu ${cap} ataques de guerra hoje.`
          : `Uma conta só pode ser atacada ${DAILY_ATTACK_CAP} vezes por dia.`,
      });
      sfxError();
      return;
    }
    raidTarget = lord;
    set({
      screen: "march",
      sheet: null,
      marchLord: lord,
      attacksByTarget: { ...s.attacksByTarget, [lord.id]: { day, count: usedToday + 1 } },
    });
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
    const layout =
      lord.real && lord.buildings && lord.buildings.length > 0
        ? lord.buildings
        : generateBase(lord.id, lord.rank);
    battle = new Battle(layout, { ...s.army }, lord.lootGold, {
      levels: s.troopLevels,
      campLevel: s.campLevel,
    });
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
    if (!ok) {
      if (!isEdgeTile(gx, gy)) set({ toast: "Posicione nas bordas douradas." });
      return false;
    }
    const army = { ...s.army };
    army[type] = Math.max(0, army[type] - 1);
    set({ army, toast: `${TROOPS[type].name} em campo.` });
    return true;
  },

  skipPrep: () => {
    if (!battle) return;
    if (battle.spectator) {
      set({ screen: "spectate" });
      return;
    }
    const left =
      battle.remainingOf("infantry") +
      battle.remainingOf("archers") +
      battle.remainingOf("cavalry") +
      battle.remainingOf("general") +
      battle.remainingOf("generaless") +
      battle.remainingOf("defender");
    if (battle.troops.length === 0 && left <= 0) {
      set({ toast: "Sem tropas no acampamento." });
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
    const pass = s.pass.purchased
      ? { ...s.pass, stars: s.pass.stars + (battle.spectator ? 0 : r.stars) }
      : s.pass;
    let war = s.war;
    if (
      !battle.spectator &&
      war &&
      raidTarget.allianceId &&
      raidTarget.allianceId === war.foeId &&
      !war.sittingOut
    ) {
      const used = (war.attacks[raidTarget.id] ?? 0) + 1;
      war = {
        ...war,
        ourStars: war.ourStars + r.stars,
        attacks: { ...war.attacks, [raidTarget.id]: used },
      };
    }
    const stolen = battle.spectator ? r.gold : 0;
    const win = rankingWindow();
    let weekStars = s.weekKey === win.key ? s.weekStars : 0;
    const weekKey = win.key;
    if (!battle.spectator && win.open) weekStars += r.stars;
    const attackerNick = battle.spectator ? raidTarget.nick : s.player.nick;
    const defenderNick = battle.spectator ? s.player.nick : raidTarget.nick;
    const troopsLost = battle.spectator ? 0 : r.casualties;
    set({
      army,
      gold: Math.max(0, s.gold + (battle.spectator ? 0 : r.gold) - stolen),
      bread: s.bread,
      niens: s.niens,
      stars: s.stars + (battle.spectator ? 0 : r.stars),
      weekStars,
      weekKey,
      raidsWon: s.raidsWon + (r.stars > 0 && !battle.spectator ? 1 : 0),
      shieldUntil: battle.spectator ? Date.now() + SHIELD_MS : s.shieldUntil,
      pass,
      war,
      raids: [
        {
          id: nid("r"),
          at: Date.now(),
          attacker: attackerNick,
          defender: defenderNick,
          gold: r.gold,
          bread: 0,
          incoming: !!battle.spectator,
          destruction: r.destruction,
          troopsLost,
          stars: r.stars,
        },
        ...s.raids,
      ].slice(0, 24),
      screen: "results",
    });
    persist({ ...get() });
    if (r.stars > 0 && !battle.spectator) sfxStar();
    if (!battle.spectator && raidTarget.real && isLive() && raidSessionId) {
      const session = raidSessionId;
      raidSessionId = null;
      void finishRaid({
        sessionId: session,
        stars: r.stars,
        goldTaken: r.gold,
        destruction: r.destruction,
        troopsLost,
        survivors: army,
      })
        .then((res) => {
          if (res.save) applyServerSave(res.save);
        })
        .catch(liveFail);
      return;
    }
    if (!battle.spectator && raidTarget.real) {
      void submitRaidResult({
        defenderId: raidTarget.id,
        defenderNick: raidTarget.nick,
        goldTaken: r.gold,
        destruction: r.destruction,
        stars: r.stars,
        troopsLost,
      }).catch(() => {
        /* inbox opcional */
      });
    }
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
    set({ chat: [...s.chat, msg].slice(-40) });
    if (liveChat || auth.currentUser) {
      void sendGlobalChat({ playerId: s.player.id, nick: s.player.nick, text: t }).catch((e) => {
        set({ toast: e instanceof Error ? e.message : "Chat indisponível." });
      });
      return;
    }
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
    set({ chat: [...get().chat, reply].slice(-40) });
    persist({ ...get() });
  },

  buyOffer: async (id) => {
    try {
      const r = await takeMarketOffer(id);
      if (r.save) applyServerSave(r.save, { toast: r.toast ?? `Trato fechado com ${r.sellerNick}.` });
      else {
        set({
          gold: r.gold,
          bread: r.bread,
          niens: r.niens,
          toast: `Trato fechado com ${r.sellerNick}.`,
        });
        persist({ ...get() });
      }
      await get().refreshMarket();
      sfxCoin();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Falha no trato." });
      sfxError();
      return false;
    }
  },

  buyNien: () => {
    if (isLive()) {
      void liveAction("buyNien").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.gold < NIEN_COST_GOLD) {
      set({ toast: `Precisa de ${NIEN_COST_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.` });
      sfxError();
      return false;
    }
    set({ gold: s.gold - NIEN_COST_GOLD, niens: s.niens + 1, toast: "+1 Nien. Gema selada." });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  sellNien: () => {
    if (isLive()) {
      void liveAction("sellNien").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.niens < 1) {
      set({ toast: "Sem Niens para vender." });
      sfxError();
      return false;
    }
    set({
      niens: s.niens - 1,
      gold: s.gold + NIEN_SELL_GOLD,
      toast: `+${NIEN_SELL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  buyBreadPack: () => {
    if (isLive()) {
      void liveAction("buyBreadPack").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.gold < BREAD_PACK_BUY_GOLD) {
      set({ toast: `Precisa de ${BREAD_PACK_BUY_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.` });
      sfxError();
      return false;
    }
    set({
      gold: s.gold - BREAD_PACK_BUY_GOLD,
      bread: s.bread + BREAD_PACK,
      toast: `+${BREAD_PACK.toLocaleString("pt")} pães.`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  sellBreadPack: () => {
    if (isLive()) {
      void liveAction("sellBreadPack").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.bread < BREAD_PACK) {
      set({ toast: `Precisa de ${BREAD_PACK.toLocaleString("pt")} pães.` });
      sfxError();
      return false;
    }
    set({
      bread: s.bread - BREAD_PACK,
      gold: s.gold + BREAD_PACK_SELL_GOLD,
      toast: `+${BREAD_PACK_SELL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  postOffer: async (giveKind, giveAmount, wantKind, wantAmount) => {
    try {
      const r = await createMarketOffer({ giveKind, giveAmount, wantKind, wantAmount });
      if (r.save) applyServerSave(r.save, { toast: r.toast ?? "Oferta publicada no mercado." });
      else {
        set({ gold: r.gold, bread: r.bread, niens: r.niens, toast: "Oferta publicada no mercado." });
        persist({ ...get() });
      }
      await get().refreshMarket();
      sfxCoin();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Não foi possível publicar." });
      sfxError();
      return false;
    }
  },

  withdrawOffer: async (id) => {
    try {
      const r = await cancelMarketOffer(id);
      if (r.save) applyServerSave(r.save, { toast: r.toast ?? "Oferta retirada." });
      else {
        set({ gold: r.gold, bread: r.bread, niens: r.niens, toast: "Oferta retirada." });
        persist({ ...get() });
      }
      await get().refreshMarket();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Não foi possível retirar." });
      sfxError();
      return false;
    }
  },

  refreshMarket: async () => {
    try {
      const { offers } = await listMarket();
      set({ offers });
    } catch {
      /* offline */
    }
  },

  transfer: async (toId, amount, kind) => {
    const s = get();
    const n = Math.floor(amount);
    if (n <= 0) {
      set({ toast: "Quantia inválida." });
      return false;
    }
    if (kind === "niens") {
      const day = brtDayKey();
      const sent = s.niensSentDay === day ? s.niensSentToday : 0;
      const cap = dailyNienSendCap(s.countyLevel);
      if (sent + n > cap) {
        set({
          toast: `No nível ${s.countyLevel} podes enviar ${cap} Niens por dia. Já enviaste ${sent}.`,
        });
        sfxError();
        return false;
      }
    }
    try {
      const r = await cloudTransfer({ toId, amount: n, kind });
      if (r.save) {
        applyServerSave(r.save, { toast: r.toast ?? `${n} ${resourceLabel(kind, n)} enviados a ${r.toNick}.` });
        sfxCoin();
        return true;
      }
      const label = resourceLabel(kind, n);
      const rec: TransferRecord = {
        id: r.id,
        at: Date.now(),
        fromId: s.player.id,
        fromNick: s.player.nick,
        toId: toId.trim().toUpperCase(),
        toNick: r.toNick,
        kind,
        amount: n,
        incoming: false,
      };
      const day = brtDayKey();
      const sent = s.niensSentDay === day ? s.niensSentToday : 0;
      set({
        gold: r.gold,
        bread: r.bread,
        niens: r.niens,
        troopCards: r.troopCards,
        generalCards: r.generalCards,
        ledger: [rec, ...s.ledger].slice(0, 40),
        niensSentDay: kind === "niens" ? day : s.niensSentDay,
        niensSentToday: kind === "niens" ? sent + n : s.niensSentToday,
        toast: `${n} ${label} enviados a ${r.toNick}.`,
      });
      persist({ ...get() });
      sfxCoin();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Falha no envio." });
      sfxError();
      return false;
    }
  },

  peekId: (id) => {
    void peekPlayer(id)
      .then((r) => {
        set({
          lookup: r.nick ? { id: r.id, nick: r.nick } : null,
          toast: r.nick ? `Senhor: ${r.nick}` : "ID desconhecido.",
        });
      })
      .catch(() => {
        const nick = findNick(id);
        set({
          lookup: nick ? { id: id.trim().toUpperCase(), nick } : null,
          toast: nick ? `Senhor: ${nick}` : "ID desconhecido.",
        });
      });
  },

  rotateWall: (id) => {
    if (isLive()) {
      const s = get();
      const b = s.buildings.find((x) => x.id === id);
      if (!b || b.type !== "wall") {
        const dir: WallDir = s.placingDir === "v" ? "h" : "v";
        set({ placingDir: dir, toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—)." });
        return;
      }
      const ids = s.selectedRow.includes(id) && s.selectedRow.length > 1 ? s.selectedRow : [id];
      void liveAction("rotateWall", { id, rowIds: ids }).catch(liveFail);
      return;
    }
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b || b.type !== "wall") {
      const dir: WallDir = s.placingDir === "v" ? "h" : "v";
      set({ placingDir: dir, toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—)." });
      return;
    }
    const ids = new Set(
      s.selectedRow.includes(id) && s.selectedRow.length > 1 ? s.selectedRow : [id],
    );
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
    set({
      selectedRow: row.map((x) => x.id),
      selectedId: id,
      sheet: "info",
      toast: `${row.length} muros na fileira.`,
    });
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
      set({
        movingId: id,
        placing: b.type,
        sheet: null,
        toast: "Toque o chão para plantar de novo.",
      });
    } else if (b.type === "wall") {
      get().selectWallRow(id);
    } else {
      get().selectBuilding(id);
    }
  },

  cancelMove: () => set({ movingId: null, placing: null, ghost: null }),

  upgradeCounty: () => {
    if (isLive()) {
      void liveAction("upgradeCounty").then(() => sfxStar()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.countyLevel >= COUNTY_MAX) {
      set({ toast: "Condado no nível máximo." });
      return false;
    }
    const need = s.buildings.filter((b) => b.type !== "wall" && b.type !== "castle" && b.level < s.countyLevel);
    if (need.length) {
      set({ toast: "Full construção: maximize todas as estruturas atuais." });
      return false;
    }
    const cost = countyUpgradeCost(s.countyLevel);
    if (s.gold < cost.gold || s.niens < cost.niens) {
      set({
        toast: cost.niens
          ? `Precisa de ${cost.niens} Niens.`
          : `Precisa de ${cost.gold.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
      });
      sfxError();
      return false;
    }
    const next = s.countyLevel + 1;
    set({
      countyLevel: next,
      gold: s.gold - cost.gold,
      niens: s.niens - cost.niens,
      buildings: s.buildings.map((b) => (b.type === "castle" ? { ...b, level: next } : b)),
      toast: `Condado nível ${next}.`,
    });
    persist({ ...get() });
    sfxStar();
    if (next >= 3 && !s.referralClaimed && s.referredBy) {
      void creditReferral()
        .then(async (r) => {
          if (!r.granted) return;
          try {
            const cloudResult = await pullCloud();
            const save = cloudResult?.save;
            set({
              gold: save?.gold ?? get().gold + r.gold,
              bread: save?.bread ?? get().bread,
              niens: save?.niens ?? get().niens,
              troopCards: save?.troopCards ?? get().troopCards,
              generalCards: save?.generalCards ?? get().generalCards,
              referralClaimed: true,
              toast: `Indique e Ganhe: tu e o amigo recebem ${REFERRAL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
            });
          } catch {
            set({
              gold: get().gold + r.gold,
              referralClaimed: true,
              toast: `Indique e Ganhe: tu e o amigo recebem ${REFERRAL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
            });
          }
          persist({ ...get() });
        })
        .catch(() => {
          /* ignore */
        });
    }
    return true;
  },

  upgradeTroop: (type) => {
    if (isLive()) {
      void liveAction("upgradeTroop", { type }).then(() => sfxBuild()).catch(liveFail);
      return true;
    }
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
      set({ toast: `Precisa ${cards} cartas, ${g} ${GOLD_NAME_PL}, ${br} pão.` });
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
    if (isLive()) {
      void liveAction("upgradeCamp").then(() => sfxBuild()).catch(liveFail);
      return true;
    }
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
      set({ toast: `Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.` });
      return false;
    }
    set({
      gold: s.gold - cost,
      campLevel: s.campLevel + 1,
      toast: `Campo de treino nível ${s.campLevel + 1}.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  recruitDefender: () => get().train("defender"),

  buyPass: () => {
    if (isLive()) {
      void liveAction("buyPass").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
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
    set({
      niens: s.niens - cost,
      pass: { ...s.pass, purchased: true },
      toast: "Passe de Batalha selado.",
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  claimPass: (level) => {
    if (isLive()) {
      void liveAction("claimPass", { level }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
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
    if (isLive()) {
      void liveAction("foundAlliance", { name }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.alliance) {
      set({ toast: "Já tens aliança." });
      return false;
    }
    if (s.gold < ALLIANCE_FOUND_GOLD) {
      set({ toast: `Precisa de 5.000.000 de ${GOLD_NAME_PL}.` });
      sfxError();
      return false;
    }
    const id = `AL-${s.player.id.slice(4, 8)}`;
    set({
      gold: s.gold - ALLIANCE_FOUND_GOLD,
      alliance: {
        id,
        name: name.trim().slice(0, 22) || "Aliança do Condado",
        members: [
          { id: s.player.id, nick: s.player.nick },
          { id: "CDN-ALDRIC", nick: "Sir Aldric" },
          { id: "CDN-ISOLDE", nick: "Dama Isolde" },
        ],
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
    if (isLive()) {
      void liveAction("sendAllianceChat", { text: t }).catch(liveFail);
      return;
    }
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
    set({
      inviteCopied: true,
      toast: `ID copiado. Quando o amigo chegar ao Condado 3, ambos ganham 300.000 ${GOLD_NAME_PL}.`,
    });
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
    const day = brtDayKey();
    const warOn = !!(s.war && warWindow().open && !s.war.sittingOut);
    const received = s.attacksReceivedDay === day ? s.attacksReceived : 0;
    const cap = dailyAttackCap(warOn);
    if (received >= cap) return;
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
      attacksReceivedDay: day,
      attacksReceived: received + 1,
      toast: `${attacker.nick} ataca o teu condado. Só podes assistir.`,
    });
    sfxHorn();
  },

  rename: async (nick) => {
    const n = nick.trim().slice(0, 18);
    if (n.length < 3) {
      set({ toast: "Nome curto demais." });
      return false;
    }
    try {
      const r = await renameCounty(n);
      const s = get();
      set({ player: { ...s.player, nick: r.nick }, nickDraft: r.nick, toast: "Nome atualizado." });
      persist({ ...get() });
      sfxClick();
      return true;
    } catch (e) {
      set({ toast: e instanceof Error ? e.message : "Este nome já está em uso." });
      sfxError();
      return false;
    }
  },

  setToast: (toast) => set({ toast }),

  returnVillage: () => {
    battle = null;
    raidTarget = null;
    set({ screen: "village", sheet: null });
  },

  skipPass: () => {
    if (isLive()) {
      void liveAction("skipPass").then(() => sfxCoin()).catch(liveFail);
      return true;
    }
    const s = get();
    if (!passWindow().active) {
      set({ toast: "O passe abre em setembro, dia 1." });
      return false;
    }
    if (!s.pass.purchased) {
      set({ toast: "Compre o passe primeiro." });
      return false;
    }
    if (s.niens < 1) {
      set({ toast: "Precisa de 1 Nien." });
      return false;
    }
    const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
    const next = reached + 1;
    if (next > PASS_LEVELS) {
      set({ toast: "Passe no máximo." });
      return false;
    }
    const r = passReward(next);
    const claimed = s.pass.claimed.includes(next) ? s.pass.claimed : [...s.pass.claimed, next];
    set({
      niens: s.niens - 1 + r.niens,
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, stars: s.pass.stars + PASS_STARS_PER_LEVEL, claimed },
      toast: `Nível ${next} comprado: ${r.label}`,
    });
    persist({ ...get() });
    sfxCoin();
    return true;
  },

  upgradeType: (type) => {
    if (isLive()) {
      void liveAction("upgradeType", { type }).then(() => sfxBuild()).catch(liveFail);
      return true;
    }
    const s = get();
    const targets = s.buildings.filter((b) => b.type === type && b.level < s.countyLevel);
    if (!targets.length) {
      set({ toast: "Nada para melhorar neste tipo." });
      return false;
    }
    const cost = targets.reduce((n, b) => n + upgradeCost(b.type, b.level), 0);
    if (s.gold < cost) {
      set({ toast: `Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.` });
      sfxError();
      return false;
    }
    const ids = new Set(targets.map((b) => b.id));
    set({
      gold: s.gold - cost,
      buildings: s.buildings.map((b) => (ids.has(b.id) ? { ...b, level: b.level + 1 } : b)),
      toast: `${targets.length}× ${BUILDINGS[type].name} → Nv.+1 · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  upgradeWallRow: (id) => {
    if (isLive()) {
      void liveAction("upgradeWallRow", { id }).then(() => sfxBuild()).catch(liveFail);
      return true;
    }
    const s = get();
    const start = s.buildings.find((x) => x.id === id);
    if (!start || start.type !== "wall") return false;
    const row = wallRow(s.buildings, start);
    const targets = row.filter((b) => b.level < s.countyLevel);
    if (!targets.length) {
      set({ toast: "Fileira já no limite do condado." });
      return false;
    }
    const cost = targets.reduce((n, b) => n + upgradeCost("wall", b.level), 0);
    if (s.gold < cost) {
      set({ toast: `Fileira: ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.` });
      sfxError();
      return false;
    }
    const ids = new Set(targets.map((b) => b.id));
    set({
      gold: s.gold - cost,
      buildings: s.buildings.map((b) => (ids.has(b.id) ? { ...b, level: b.level + 1 } : b)),
      toast: `Fileira ${targets.length} muros · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`,
    });
    persist({ ...get() });
    sfxBuild();
    return true;
  },

  refreshLedger: async () => {
    try {
      const led = await listTransfers();
      set({ ledger: led.rows });
    } catch {
      /* ignore */
    }
  },

  refreshTargets: async () => {
    const s = get();
    const bots: Lord[] = LORDS.filter((l) => Math.abs((l.rank || 0) + 1 - s.countyLevel) <= 1).map(
      (l) => ({
        ...l,
        countyLevel: (l.rank || 0) + 1,
        title: `${l.title} · Nv.${(l.rank || 0) + 1}`,
        real: false,
      }),
    );
    try {
      const { targets } = await listRaidTargets(s.player.id, s.countyLevel);
      set({ raidTargets: [...targets, ...bots] });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      set({
        raidTargets: bots,
        toast: msg.includes("Entre") ? null : "Lista de senhores incompleta. Mostrando treino.",
      });
    }
  },
}));

import { create } from "zustand";
import {
  ALLIANCE_DUEL_LOSS_GOLD,
  ALLIANCE_DUEL_LOSS_POT,
  ALLIANCE_DUEL_WIN_GOLD,
  ALLIANCE_DUEL_WIN_POT,
  ALLIANCE_FOUND_NIENS,
  ALLIANCE_XP_WIN,
  BREAD_PACK,
  BREAD_PACK_BUY_GOLD,
  BREAD_PACK_SELL_GOLD,
  BREAD_UPKEEP_PER_TROOP_HOUR,
  BUILDINGS,
  COUNTY_MAX,
  DAILY_ATTACK_CAP,
  DEFENDER_COST,
  GENERAL_MAX_LEVEL,
  GENERAL_UNLOCK_COUNTY,
  GOLD_NAME_PL,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  REFERRAL_GOLD,
  SHIELD_MS,
  SPEED_TRAIN_GOLD,
  TROOPS,
  WAR_ATTACK_CAP,
  allianceSlots,
  allianceAtWarToday,
  armyCapacity,
  brtDayKey,
  campUpgradeGold,
  countyUpgradeCost,
  dailyAttackCap,
  dailyNienSendCap,
  defenderCap,
  freePassReward,
  generalCardsFor,
  goldWord,
  isHero,
  lootCapForCounty,
  passCostWithDiscount,
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
  type PassExtra,
  type ResourceKind,
  type Tradable,
  type TroopType,
  type WallDir,
} from "./constants";
import { Battle, type TroopSide } from "./battle";
import { ALLIANCES, botArmy, findLord, findNick, LORDS, lordsOfAlliance, randomChat } from "./bots";
import { defaultSave, flushCloud, loadSave, persist, setCloudSync, wipeSave } from "./save";
import type {
  BuildingInst,
  ChatMsg,
  DuelChallenge,
  GameScreen,
  Lord,
  MarketOffer,
  PlaceGhost,
  SaveState,
  SheetId,
  TransferRecord,
} from "./types";
import { canPlace, canPlaceWall, countType, generateBase, nid, snapPlace, wallRow } from "./world";
import { isEdgeTile } from "./iso";
import { sfxBuild, sfxClick, sfxCoin, sfxError, sfxHorn, sfxStar } from "./audio";
import { auth } from "@/lib/firebase";
import {
  applyTraining,
  armySize,
  claimPassAllSim,
  trainTroop,
} from "./sim";
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
  startRaid,
  finishRaid,
  submitRaidResult,
  takeMarketOffer,
  playAction,
} from "./cloud";

export let battle: Battle | null = null;
export let raidTarget: Lord | null = null;
export let duelSide: TroopSide = "atk";
let raidSessionId: string | null = null;
let raidKind: "raid" | "alliance" = "raid";
let duelHost = true;
let pendingDeploys: Array<{ type: TroopType; gx: number; gy: number }> = [];
let duelTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapAt = 0;
let lastPersist = 0;
let lastIncomingAt = 0;
let trainLock = false;
let passAllLock = false;

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
    chat: cur.chat,
    allianceChat: save.allianceChat?.length ? save.allianceChat : cur.allianceChat,
    ledger: save.ledger?.length ? save.ledger : cur.ledger,
    boostUntil: save.boostUntil ?? cur.boostUntil,
    passDiscount: save.passDiscount ?? cur.passDiscount,
    duelInbox: cur.duelInbox,
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

function stopDuelLoop() {
  if (duelTimer != null) {
    clearInterval(duelTimer);
    duelTimer = null;
  }
  pendingDeploys = [];
}

function enterAllianceField(opts: {
  sessionId: string;
  side: TroopSide;
  lord: Lord;
  atkArmy: SaveState["army"];
  defArmy: SaveState["army"];
  atkLevels: SaveState["troopLevels"];
  defLevels: SaveState["troopLevels"];
  atkCamp: number;
  defCamp: number;
  toast?: string;
}) {
  raidSessionId = opts.sessionId;
  raidKind = "alliance";
  duelSide = opts.side;
  duelHost = opts.side === "atk";
  raidTarget = opts.lord;
  battle = new Battle([], { ...opts.atkArmy }, 0, {
    mode: "field",
    pvp: true,
    controlSide: opts.side,
    hostSim: opts.side === "atk",
    levels: opts.atkLevels,
    campLevel: opts.atkCamp,
    foeArmy: { ...opts.defArmy },
    foeLevels: opts.defLevels,
    foeCamp: opts.defCamp,
  });
  useGame.setState({
    screen: "prep",
    sheet: null,
    deployType: (opts.side === "atk" ? opts.atkArmy : opts.defArmy).infantry > 0 ? "infantry" : "archers",
    marchLord: opts.lord,
    toast: opts.toast ?? (opts.side === "atk" ? "Campo limpo. Coloca as tropas na borda oeste." : "Campo limpo. Coloca as tropas na borda leste."),
  });
  startDuelLoop();
}

function startDuelLoop() {
  stopDuelLoop();
  if (typeof window === "undefined") return;
  const beat = () => {
    if (!raidSessionId || raidKind !== "alliance" || !battle?.pvp) {
      stopDuelLoop();
      return;
    }
    const sid = raidSessionId;
    const deploys = pendingDeploys.splice(0, pendingDeploys.length);
    const now = Date.now();
    const sendSnap = duelHost && now - lastSnapAt > 450;
    if (sendSnap) lastSnapAt = now;
    void playAction("syncAllianceDuel", {
      sessionId: sid,
      deploys,
      snapshot: sendSnap ? battle.exportSnapshot() : undefined,
    })
      .then((r) => applyDuelWire(r))
      .catch(() => undefined);
  };
  duelTimer = setInterval(beat, 700);
  void playAction("pollAllianceDuel", { sessionId: raidSessionId }).then(applyDuelWire).catch(() => undefined);
}

function applyDuelWire(r: { status?: string; side?: "atk" | "def"; duel?: Record<string, unknown>; nick?: string | null }) {
  if (!battle?.pvp) return;
  const d = r.duel ?? {};
  const phase = String(d.phase ?? r.status ?? "");
  if (r.status === "declined" || r.status === "expired") {
    stopDuelLoop();
    battle = null;
    raidSessionId = null;
    useGame.setState({ screen: "village", toast: r.status === "declined" ? "O lorde recusou. Escolhe outro." : "O desafio expirou. Escolhe outro lorde." });
    return;
  }
  if (r.status === "done") {
    if (battle.phase !== "ended") battle.end(false);
    return;
  }
  const deploys = Array.isArray(d.pendingDeploys) ? d.pendingDeploys : [];
  if (duelHost) {
    for (const raw of deploys) {
      const dep = raw as { type?: TroopType; gx?: number; gy?: number; side?: TroopSide };
      if (!dep.type || dep.side === duelSide) continue;
      battle.deploy(dep.type, Number(dep.gx ?? 0), Number(dep.gy ?? 0), dep.side ?? "def");
    }
  } else if (d.snapshot && typeof d.snapshot === "object") {
    battle.applySnapshot(d.snapshot as import("./battle").DuelSnap);
  }
  if (phase === "fight" && battle.phase === "prep") {
    battle.startFight();
    useGame.setState({ screen: "battle" });
  }
  if (d.attackerRetreated && duelSide !== "atk" && battle.phase === "fight") {
    battle.end(false);
  }
  if (d.defenderRetreated && duelSide !== "def" && battle.phase === "fight") {
    battle.end(false);
  }
  const prepEndsAt = Number(d.prepEndsAt ?? 0);
  if (phase === "prep" && prepEndsAt && Date.now() >= prepEndsAt && battle.phase === "prep") {
    void playAction("syncAllianceDuel", { sessionId: raidSessionId, ready: true }).catch(() => undefined);
  }
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
  duelInbox: DuelChallenge[];
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
  train: (type: TroopType, qty?: number) => boolean;
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
  claimPassAll: () => boolean;
  foundAlliance: (name: string, openJoin?: boolean) => boolean;
  joinAlliance: (id: string) => boolean;
  leaveAlliance: () => void;
  recruitAlliance: () => void;
  acceptJoin: (requestId: string) => void;
  rejectJoin: (requestId: string) => void;
  startAllianceDuel: (lord: Lord) => void;
  declareWar: (allianceId: string) => void;
  respondDuel: (sessionId: string, accept: boolean) => void;
  refreshWarHall: () => Promise<void>;
  claimPassFree: (level: number) => boolean;
  claimPassExtra: (extra: PassExtra) => boolean;
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

function producerKind(t: BuildingType): "gold" | "bread" | null {
  if (t === "mine") return "gold";
  if (t === "farm") return "bread";
  return null;
}

function storedAmount(b: BuildingInst, now = Date.now(), boosted = false): number {
  if (b.type !== "mine" && b.type !== "farm") return 0;
  const t0 = b.lastCollect ?? now;
  const elapsed = Math.max(0, (now - t0) / 1000);
  return Math.floor(Math.min(storageCap(b.level), productionPerSec(b.level, boosted) * elapsed));
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
  duelInbox: [],
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
    chatUnsub?.();
    chatUnsub = null;
    liveChat = false;
    setCloudSync(null);
    wipeSave();
    battle = null;
    raidTarget = null;
    raidSessionId = null;
    raidKind = "raid";
    stopDuelLoop();
    set({ ...defaultSave(), hydrated: true, screen: "splash", sheet: null, toast: null, bootError: null, needsCounty: false, duelInbox: [] });
  },

  tick: (now) => {
    const s = get();
    if (s.screen === "splash") return;
    const dt = Math.min(60, Math.max(0, (now - s.lastTick) / 1000));
    if (dt < 0.2) return;

    const trained = applyTraining(s, dt * 1000);
    const season = passSeasonKey(now).key;
    const pass = s.pass.season === season ? s.pass : { season, purchased: false, stars: 0, claimed: [], claimedFree: [], extrasClaimed: [] };

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
      if (war && war.week !== week) {
        war = null;
      } else if (war && allianceAtWarToday(war) && Math.random() < dt * 0.02) {
        war = { ...war, theirStars: war.theirStars + (Math.random() < 0.55 ? 1 : 2) };
      }
    }

    let gold = s.gold;
    let toast: string | null = s.toast;
    if (war && !win.open && !war.resolved) {
      const won = !war.sittingOut && war.ourStars > war.theirStars;
      const n = Math.max(1, war.participants?.length || s.alliance?.members.length || 1);
      const share = won ? Math.floor((war.chest || 0) / n) : Math.floor((war.chest || 0) / n);
      gold += share;
      war = { ...war, resolved: true };
      toast = won
        ? `Guerra vencida. +${ALLIANCE_XP_WIN.toLocaleString("pt")} XP e ${share.toLocaleString("pt")} ${GOLD_NAME_PL} do pote.`
        : war.sittingOut
          ? "Neste dia a aliança ficou sem guerra."
          : `Guerra perdida. Sem XP. ${share ? share.toLocaleString("pt") + " Libras do pote." : "O pote ficou vazio."}`;
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
    const upkeep = troopsNow * BREAD_UPKEEP_PER_TROOP_HOUR * (dt / 3600);
    if (upkeep > 0) {
      if (bread >= upkeep) bread -= upkeep;
      else {
        bread = 0;
        if (!toast) toast = "Sem pão para a manutenção. Cada tropa gasta 20 pães por hora.";
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

  storedOf: (b, now) => storedAmount(b, now, (get().boostUntil ?? 0) > Date.now()),

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
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return;
    const kind = producerKind(b.type);
    if (!kind) return;
    const amt = storedAmount(b, Date.now(), (s.boostUntil ?? 0) > Date.now());
    if (amt < 1) {
      set({ toast: "Ainda está a produzir." });
      return;
    }
    const buildings = s.buildings.map((x) => (x.id === id ? { ...x, lastCollect: Date.now() } : x));
    if (kind === "gold") set({ gold: s.gold + amt, buildings, toast: `+${amt} ${goldWord(amt)}` });
    else set({ bread: s.bread + amt, buildings, toast: `+${amt} pão` });
    persist({ ...get() });
    sfxCoin();
    if (isLive()) {
      void liveAction("collect", { id }).catch((error) => {
        if (error instanceof Error && /produzir|pronto para recolher/i.test(error.message)) return;
        liveFail(error);
      });
    }
  },

  collectAll: () => {
    const s = get();
    let gold = 0;
    let bread = 0;
    const now = Date.now();
    const boosted = (s.boostUntil ?? 0) > now;
    const buildings = s.buildings.map((b) => {
      if (b.type === "mine") {
        const amt = storedAmount(b, now, boosted);
        gold += amt;
        return amt > 0 ? { ...b, lastCollect: now } : b;
      }
      if (b.type === "farm") {
        const amt = storedAmount(b, now, boosted);
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
    if (isLive()) {
      void liveAction("collectAll").catch((error) => {
        if (error instanceof Error && /pronto para recolher/i.test(error.message)) return;
        liveFail(error);
      });
    }
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

  train: (type, qty = 1) => {
    const amount = Math.max(1, Math.floor(Number(qty) || 1));
    if (isLive()) {
      if (trainLock) {
        set({ toast: "Recrutamento a processar..." });
        return false;
      }
      trainLock = true;
      void liveAction("train", { type, qty: amount })
        .then(() => sfxClick())
        .catch(liveFail)
        .finally(() => {
          trainLock = false;
        });
      return true;
    }
    try {
      const r = trainTroop(get(), type, amount);
      set({ ...r.save, toast: r.toast });
      persist({ ...get() });
      sfxClick();
      return true;
    } catch (error) {
      set({ toast: error instanceof Error ? error.message : "Não foi possível recrutar." });
      sfxError();
      return false;
    }
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
          raidKind = "raid";
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
    const armyN = armySize({ army: s.army, training: [] });
    if (armyN <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      sfxError();
      return;
    }
    const warOn = !!(s.war && s.war.foeId && lord.allianceId === s.war.foeId && !s.war.sittingOut);
    if (warOn) {
      set({ toast: "Na guerra, desafia o lorde na aba Guerra. Ele precisa de aceitar o 1v1." });
      sfxError();
      return;
    }
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
      lootCap: lord.lootGold || lootCapForCounty(lord.countyLevel ?? s.countyLevel),
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
    const side = battle.pvp ? duelSide : "atk";
    const n = battle.deployAll(type, gx, gy, side);
    if (n < 1) {
      if (battle.mode === "field") {
        set({ toast: side === "def" ? "Neste campo, coloca as tropas na borda leste." : "Neste campo, coloca as tropas na borda oeste." });
      } else if (!isEdgeTile(gx, gy)) set({ toast: "Posicione nas bordas douradas." });
      return false;
    }
    if (battle.pvp) {
      for (let i = 0; i < n; i++) pendingDeploys.push({ type, gx, gy });
    }
    const army = { ...s.army, [type]: battle.remainingOf(type, side) };
    set({
      army,
      toast: n === 1 ? `${TROOPS[type].name} em campo.` : `${n} ${TROOPS[type].name} em campo.`,
    });
    return true;
  },

  skipPrep: () => {
    if (!battle) return;
    if (battle.spectator) {
      set({ screen: "spectate" });
      return;
    }
    const side = battle.pvp ? duelSide : "atk";
    const left =
      battle.remainingOf("infantry", side) +
      battle.remainingOf("archers", side) +
      battle.remainingOf("cavalry", side) +
      battle.remainingOf("general", side) +
      battle.remainingOf("generaless", side) +
      battle.remainingOf("defender", side);
    if (battle.troops.filter((t) => t.side === side).length === 0 && left <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      sfxError();
      return;
    }
    if (battle.pvp && raidSessionId) {
      void playAction("syncAllianceDuel", { sessionId: raidSessionId, ready: true, deploys: pendingDeploys.splice(0) })
        .then((r) => {
          applyDuelWire(r);
          set({ toast: "Pronto. À espera do rival no campo." });
        })
        .catch(liveFail);
      return;
    }
    battle.skipPrep();
    set({ screen: "battle" });
  },

  retreat: () => {
    if (!battle || battle.phase !== "fight") return;
    if (battle.pvp && raidSessionId) {
      void playAction("syncAllianceDuel", { sessionId: raidSessionId, retreat: true }).catch(() => undefined);
    }
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
    const army = battle.spectator ? s.army : battle.armyHome(battle.pvp ? duelSide : "atk");
    const pass = {
      ...s.pass,
      stars: s.pass.stars + (battle.spectator || battle.mode === "field" ? 0 : r.stars),
    };
    let war = s.war;
    if (
      !battle.spectator &&
      war &&
      raidTarget.allianceId &&
      raidTarget.allianceId === war.foeId &&
      !war.sittingOut
    ) {
      const used = (war.attacks[raidTarget.id] ?? 0) + 1;
      const winPts = battle.mode === "field" ? (r.fieldWinner === (battle.pvp ? duelSide : "atk") ? 3 : 1) : r.stars;
      const losePts = battle.mode === "field" ? (r.fieldWinner === (battle.pvp ? duelSide : "atk") ? 1 : 3) : 0;
      const parts = war.participants.includes(s.player.id) ? war.participants : [...war.participants, s.player.id];
      const potAdd =
        battle.mode === "field"
          ? r.fieldWinner === (battle.pvp ? duelSide : "atk")
            ? ALLIANCE_DUEL_WIN_POT
            : ALLIANCE_DUEL_LOSS_POT
          : 0;
      war = {
        ...war,
        ourStars: war.ourStars + winPts,
        theirStars: war.theirStars + losePts,
        attacks: { ...war.attacks, [raidTarget.id]: used },
        participants: parts,
        chest: (war.chest || 0) + potAdd,
      };
    }
    const stolen = battle.spectator ? r.gold : 0;
    const win = rankingWindow();
    let weekStars = s.weekKey === win.key ? s.weekStars : 0;
    const weekKey = win.key;
    if (!battle.spectator && win.open && battle.mode !== "field") weekStars += r.stars;
    let goldGain = battle.spectator ? 0 : r.gold;
    if (!isLive() && battle.mode === "field" && r.fieldWinner === "atk") {
      goldGain = ALLIANCE_DUEL_WIN_GOLD;
    } else if (!isLive() && battle.mode === "field") {
      goldGain = ALLIANCE_DUEL_LOSS_GOLD;
    }
    const attackerNick = battle.spectator ? raidTarget.nick : s.player.nick;
    const defenderNick = battle.spectator ? s.player.nick : raidTarget.nick;
    const troopsLost = battle.spectator ? 0 : r.casualties;
    set({
      army,
      gold: Math.max(0, s.gold + goldGain - stolen),
      bread: s.bread,
      niens: s.niens,
      stars: s.stars + (battle.spectator || battle.mode === "field" ? 0 : r.stars),
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
      const kind = raidKind;
      raidSessionId = null;
      raidKind = "raid";
      if (kind === "alliance") {
        const winner = r.fieldWinner ?? (r.fieldWin ? "atk" : "def");
        stopDuelLoop();
        void liveAction("finishAllianceDuel", {
          sessionId: session,
          won: winner === duelSide,
          winner,
          retreated: !!r.retreated,
          survivors: army,
          atkSurvivors: battle.armyHome("atk"),
          defSurvivors: battle.armyHome("def"),
        }).catch(liveFail);
        return;
      }
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
    if (liveChat || auth.currentUser) {
      void liveAction("sendChat", { text: t }).catch(liveFail);
      return;
    }
    const msg: ChatMsg = {
      id: nid("m"),
      fromId: s.player.id,
      fromNick: s.player.nick,
      text: t.slice(0, 160),
      at: Date.now(),
      self: true,
    };
    set({ chat: [...s.chat, msg].slice(-40) });
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
    const cost = passCostWithDiscount(s.pass.season, !!s.passDiscount);
    if (s.niens < cost) {
      set({ toast: `Precisa de ${cost} Niens.` });
      return false;
    }
    set({
      niens: s.niens - cost,
      pass: { ...s.pass, purchased: true },
      passDiscount: false,
      toast: s.passDiscount ? `Passe selado com 45% de desconto · ${cost} Niens.` : "Passe de Batalha selado.",
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

  claimPassAll: () => {
    if (isLive()) {
      if (passAllLock) return false;
      passAllLock = true;
      void liveAction("claimPassAll")
        .then(() => sfxStar())
        .catch(liveFail)
        .finally(() => {
          passAllLock = false;
        });
      return true;
    }
    try {
      const r = claimPassAllSim(get());
      set({ ...r.save, toast: r.toast });
      persist({ ...get() });
      sfxStar();
      return true;
    } catch (error) {
      set({ toast: error instanceof Error ? error.message : "Não foi possível recolher." });
      sfxError();
      return false;
    }
  },

  claimPassFree: (level) => {
    if (isLive()) {
      void liveAction("claimFreePass", { level }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
    const s = get();
    const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
    const claimedFree = s.pass.claimedFree ?? [];
    if (level > reached || claimedFree.includes(level)) return false;
    const r = freePassReward(level);
    set({
      gold: s.gold + r.gold,
      bread: s.bread + r.bread,
      troopCards: s.troopCards + r.troopCards,
      generalCards: s.generalCards + r.generalCards,
      pass: { ...s.pass, claimedFree: [...claimedFree, level] },
      toast: `Trilha grátis Nv.${level}: ${r.label}`,
    });
    persist({ ...get() });
    sfxStar();
    return true;
  },

  claimPassExtra: (extra) => {
    if (isLive()) {
      void liveAction("claimPassExtra", { extra }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
    const s = get();
    if (!s.pass.purchased) {
      set({ toast: "Compre o passe primeiro." });
      return false;
    }
    const reached = Math.min(PASS_LEVELS, Math.floor(s.pass.stars / PASS_STARS_PER_LEVEL));
    if (reached < PASS_LEVELS && !s.pass.claimed.includes(PASS_LEVELS)) {
      set({ toast: "Chega ao nível 50 do passe pago para resgatar os cupons." });
      return false;
    }
    const extras = s.pass.extrasClaimed ?? [];
    if (extras.includes(extra)) return false;
    if (extra === "boost") {
      set({
        boostUntil: Date.now() + 30 * 24 * 3600_000,
        pass: { ...s.pass, extrasClaimed: [...extras, "boost"] },
        toast: "Boost +40% em minas e fazendas por 30 dias. Já está ativo.",
      });
    } else {
      set({
        passDiscount: true,
        pass: { ...s.pass, extrasClaimed: [...extras, "discount"] },
        toast: "Pergaminho de 45% no próximo passe. Usa-o na compra.",
      });
    }
    persist({ ...get() });
    sfxStar();
    return true;
  },

  foundAlliance: (name, openJoin = true) => {
    if (isLive()) {
      void liveAction("foundAlliance", { name, openJoin }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
    const s = get();
    if (s.alliance) {
      set({ toast: "Já tens aliança." });
      return false;
    }
    if (s.niens < ALLIANCE_FOUND_NIENS) {
      set({ toast: `Precisa de ${ALLIANCE_FOUND_NIENS} Niens.` });
      sfxError();
      return false;
    }
    const id = `AL-${s.player.id.slice(4, 8)}`;
    set({
      niens: s.niens - ALLIANCE_FOUND_NIENS,
      alliance: {
        id,
        name: name.trim().slice(0, 22) || "Aliança do Condado",
        members: [{ id: s.player.id, nick: s.player.nick }],
        minLevel: 1,
        level: 1,
        xp: 0,
        leaderId: s.player.id,
        slots: allianceSlots(1),
        openJoin,
        joinRequests: [],
      },
      toast: openJoin ? "Aliança fundada. Entrada livre." : "Aliança fundada. Quem entra precisa de pedido.",
    });
    persist({ ...get() });
    sfxStar();
    return true;
  },

  joinAlliance: (id) => {
    if (!id) return false;
    if (isLive()) {
      void liveAction("joinAlliance", { allianceId: id }).then(() => sfxStar()).catch(liveFail);
      return true;
    }
    set({ toast: "Entra na tua conta para juntar-te a uma aliança." });
    return false;
  },

  leaveAlliance: () => {
    if (isLive()) {
      void liveAction("leaveAlliance").then(() => sfxClick()).catch(liveFail);
      return;
    }
    set({ alliance: null, war: null, allianceChat: [], toast: "Saíste da aliança." });
    persist({ ...get() });
  },

  recruitAlliance: () => {
    if (isLive()) {
      void liveAction("recruitAlliance").then(() => sfxClick()).catch(liveFail);
      return;
    }
    const s = get();
    if (!s.alliance) return;
    const msg = {
      id: nid("m"),
      fromId: s.player.id,
      fromNick: s.player.nick,
      text: s.alliance.openJoin
        ? `Recruta: ${s.alliance.name} · entrada livre`
        : `Recruta: ${s.alliance.name} · pede aprovação`,
      at: Date.now(),
      self: true,
      channel: "global" as const,
      recruitAllianceId: s.alliance.id,
    };
    set({ chat: [...s.chat, msg].slice(-40), toast: "Pedido de recrutamento no chat." });
    persist({ ...get() });
  },

  acceptJoin: (requestId) => {
    if (!requestId) return;
    if (isLive()) {
      void liveAction("acceptJoin", { requestId }).then(() => sfxStar()).catch(liveFail);
    }
  },

  rejectJoin: (requestId) => {
    if (!requestId) return;
    if (isLive()) {
      void liveAction("rejectJoin", { requestId }).then(() => sfxClick()).catch(liveFail);
    }
  },

  declareWar: (allianceId) => {
    const s = get();
    if (!s.alliance) {
      set({ toast: "Sem aliança." });
      return;
    }
    if (s.alliance.leaderId !== s.player.id) {
      set({ toast: "Só o líder declara a guerra." });
      sfxError();
      return;
    }
    if (isLive()) {
      void liveAction("declareWar", { allianceId })
        .then(() => sfxHorn())
        .catch(liveFail);
      return;
    }
    if (s.war && allianceAtWarToday(s.war)) {
      set({ toast: `A tua aliança já está em guerra com ${s.war.foeName}.` });
      sfxError();
      return;
    }
    const foe = ALLIANCES.find((a) => a.id === allianceId);
    if (!foe) {
      set({ toast: "Aliança não encontrada." });
      return;
    }
    const win = warWindow();
    const note = {
      id: nid("m"),
      fromId: s.player.id,
      fromNick: s.player.nick,
      text: `Guerra declarada contra ${foe.name}.`,
      at: Date.now(),
      self: true,
      channel: "alliance" as const,
    };
    set({
      war: {
        week: win.key,
        foeId: foe.id,
        foeName: foe.name,
        chest: 0,
        ourStars: 0,
        theirStars: 0,
        attacks: {},
        sittingOut: false,
        resolved: false,
        participants: [],
      },
      allianceChat: [...s.allianceChat, note].slice(-40),
      toast: `Guerra declarada contra ${foe.name}. Os duelos estão na aba Guerra.`,
    });
    persist({ ...get() });
    sfxHorn();
  },

  startAllianceDuel: (lord) => {
    const s = get();
    const armyN = s.army.infantry + s.army.archers + s.army.cavalry + s.army.general + s.army.generaless + s.army.defender;
    if (armyN <= 0) {
      set({ toast: "Sem tropas no acampamento." });
      return;
    }
    if (s.duelInbox.some((c) => c.status === "pending" || c.status === "prep" || c.status === "fight")) {
      set({ toast: "Já tens um desafio a decorrer." });
      sfxError();
      return;
    }
    raidTarget = lord;
    const startField = () => {
      battle = new Battle([], { ...get().army }, 0, {
        mode: "field",
        levels: get().troopLevels,
        campLevel: get().campLevel,
        foeArmy: {
          infantry: Math.max(4, Math.min(20, (lord.rank || 1) * 3)),
          archers: Math.max(2, Math.min(12, (lord.rank || 1) * 2)),
          cavalry: Math.max(0, Math.min(6, (lord.rank || 1) - 1)),
          general: 0,
          generaless: 0,
          defender: 2,
        },
      });
      set({
        screen: "prep",
        sheet: null,
        deployType: s.army.infantry > 0 ? "infantry" : s.army.archers > 0 ? "archers" : "defender",
        marchLord: lord,
        toast: "Campo de guerra. Coloca as tropas na borda oeste.",
      });
    };
    if (isLive()) {
      void liveAction("startAllianceDuel", { targetId: lord.id })
        .then((r) => {
          if (r.challenges) set({ duelInbox: r.challenges });
          if (r.status === "pending" || !r.status) {
            set({ toast: r.toast ?? `Desafio enviado a ${lord.nick}. Ele precisa de aceitar.` });
            sfxHorn();
            return;
          }
          if (r.sessionId && (r.status === "prep" || r.status === "fight")) {
            enterAllianceField({
              sessionId: r.sessionId,
              side: r.side === "def" ? "def" : "atk",
              lord,
              atkArmy: r.atkArmy ?? get().army,
              defArmy: r.foeArmy ?? get().army,
              atkLevels: r.atkLevels ?? get().troopLevels,
              defLevels: r.foeLevels ?? get().troopLevels,
              atkCamp: r.atkCamp ?? get().campLevel,
              defCamp: r.foeCamp ?? get().campLevel,
              toast: r.toast,
            });
          }
        })
        .catch(liveFail);
      return;
    }
    startField();
  },

  respondDuel: (sessionId, accept) => {
    if (!sessionId) return;
    if (isLive()) {
      void liveAction("respondAllianceDuel", { sessionId, accept })
        .then((r) => {
          if (r.challenges) set({ duelInbox: r.challenges });
          if (!accept) {
            set({ toast: r.toast ?? "Desafio recusado." });
            return;
          }
          if (r.sessionId && r.status === "prep") {
            const lord: Lord = {
              id: String(r.nick ? "" : ""),
              nick: r.nick || "Rival",
              title: "Campo",
              rank: 1,
              lootGold: 0,
              lootBread: 0,
              real: true,
            };
            const inbox = get().duelInbox.find((c) => c.sessionId === r.sessionId);
            enterAllianceField({
              sessionId: r.sessionId,
              side: "def",
              lord: {
                id: inbox?.fromId || "CDN-RIVAL",
                nick: inbox?.fromNick || r.nick || "Rival",
                title: "Campo",
                rank: 1,
                lootGold: 0,
                lootBread: 0,
                real: true,
                allianceId: get().war?.foeId ?? undefined,
              },
              atkArmy: r.atkArmy ?? get().army,
              defArmy: r.foeArmy ?? get().army,
              atkLevels: r.atkLevels ?? get().troopLevels,
              defLevels: r.foeLevels ?? get().troopLevels,
              atkCamp: r.atkCamp ?? 1,
              defCamp: r.foeCamp ?? get().campLevel,
              toast: r.toast,
            });
            void lord;
            sfxHorn();
          }
        })
        .catch(liveFail);
    }
  },

  refreshWarHall: async () => {
    if (!isLive() || !get().alliance) return;
    try {
      const r = await playAction("listAllianceHall");
      const cur = get();
      useGame.setState({
        alliance: r.save?.alliance ?? cur.alliance,
        war: r.save?.war ?? cur.war,
        allianceChat: r.save?.allianceChat ?? cur.allianceChat,
        duelInbox: r.challenges ?? cur.duelInbox,
      });
      const screen = get().screen;
      const pending = (r.challenges ?? []).find((c) => c.status === "prep" || c.status === "fight");
      if (pending && screen === "village" && raidSessionId !== pending.sessionId) {
        const poll = await playAction("pollAllianceDuel", { sessionId: pending.sessionId });
        const side = poll.side === "def" ? "def" : "atk";
        const incoming = pending.incoming;
        enterAllianceField({
          sessionId: pending.sessionId,
          side,
          lord: {
            id: incoming ? pending.fromId : pending.toId,
            nick: incoming ? pending.fromNick : pending.toNick,
            title: "Campo",
            rank: 1,
            lootGold: 0,
            lootBread: 0,
            real: true,
            allianceId: get().war?.foeId ?? undefined,
          },
          atkArmy: poll.atkArmy ?? get().army,
          defArmy: poll.foeArmy ?? get().army,
          atkLevels: poll.atkLevels ?? get().troopLevels,
          defLevels: poll.foeLevels ?? get().troopLevels,
          atkCamp: poll.atkCamp ?? 1,
          defCamp: poll.foeCamp ?? get().campLevel,
          toast: "O duelo foi aceite. Para o campo.",
        });
      }
    } catch {
      /* offline */
    }
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
    battle = new Battle(s.buildings, botArmy(attacker.rank), lootCapForCounty(s.countyLevel), {
      spectator: true,
      levels: s.troopLevels,
      campLevel: s.campLevel,
      lootCap: lootCapForCounty(s.countyLevel),
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
    stopDuelLoop();
    battle = null;
    raidTarget = null;
    raidSessionId = null;
    raidKind = "raid";
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

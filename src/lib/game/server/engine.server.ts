import type { DocumentData, DocumentReference, Transaction } from "firebase-admin/firestore";
import { getAdminFirestore } from "../../firebase-admin.server";
import {
  ALLIANCE_FOUND_GOLD,
  ALLIANCE_WAR_CHEST,
  CHAT_TTL_MS,
  SHIELD_MS,
  allianceSlots,
  applyAllianceXp,
  duelGold,
  lootCapForCounty,
  lootForStars,
  rankingWindow,
  warWindow,
  weeklyPrize,
  type BuildingType,
  type ResourceKind,
  type Tradable,
  type TroopType,
  type WallDir,
} from "../constants";
import { defaultSave, migrateCloud, toSave } from "../save";
import type { AllianceState, ArmyCounts, ChatMsg, Lord, MarketOffer, SaveState, TransferRecord } from "../types";
import { botWeekBoard, findNick } from "../bots";
import { makeId } from "../world";
import {
  GameError,
  applyRaidFinish,
  applyWeeklyPrize,
  buyBreadPackSim,
  buyNienSim,
  buyPassSim,
  claimFreePassSim,
  claimPassAllSim,
  claimPassExtraSim,
  claimPassSim,
  collectAllBuildings,
  collectBuilding,
  creditResource,
  demolishBuilding,
  grantReferralSim,
  kindField,
  placeBuilding,
  registerAttack,
  rotateWalls,
  sellBreadPackSim,
  sellNienSim,
  settle,
  skipPassSim,
  speedTrainJob,
  spendForTransfer,
  trainTroop,
  upgradeAllOfType,
  upgradeBuilding,
  upgradeCampSim,
  upgradeCountySim,
  upgradeTroopSim,
  upgradeWallRowSim,
  type LedgerEntry,
} from "../sim";

export type PlayerAuth = { uid: string; email: string | null };
type Profile = SaveState & {
  userId: string;
  appliedTransferIds: string[];
  appliedRaidIds: string[];
  accountEmail?: string | null;
};

type ActionResult = {
  save?: SaveState | null;
  toast?: string;
  admin?: boolean;
  offers?: MarketOffer[];
  targets?: Lord[];
  board?: Array<{ playerId: string; nick: string; stars: number; you?: boolean; bot?: boolean }>;
  yourRank?: number;
  claimed?: boolean;
  week?: ReturnType<typeof rankingWindow>;
  rows?: TransferRecord[];
  nick?: string | null;
  id?: string;
  buildings?: SaveState["buildings"];
  lootGold?: number;
  sessionId?: string;
  lookup?: Record<string, unknown>;
  foes?: Lord[];
  duelGold?: number;
  foeArmy?: ArmyCounts;
  foeLevels?: SaveState["troopLevels"];
  foeCamp?: number;
};

const RATE: Record<string, { n: number; windowMs: number }> = {
  default: { n: 24, windowMs: 10_000 },
  transfer: { n: 8, windowMs: 60_000 },
  chat: { n: 8, windowMs: 10_000 },
  startRaid: { n: 6, windowMs: 60_000 },
  finishRaid: { n: 8, windowMs: 60_000 },
  createMarketOffer: { n: 8, windowMs: 60_000 },
  takeMarketOffer: { n: 8, windowMs: 60_000 },
  collect: { n: 16, windowMs: 10_000 },
  collectAll: { n: 8, windowMs: 10_000 },
  claimWeekly: { n: 4, windowMs: 60_000 },
  sendChat: { n: 6, windowMs: 10_000 },
  train: { n: 10, windowMs: 10_000 },
  speedTrain: { n: 16, windowMs: 10_000 },
  claimPassAll: { n: 6, windowMs: 10_000 },
  foundAlliance: { n: 3, windowMs: 60_000 },
  joinAlliance: { n: 6, windowMs: 60_000 },
  startAllianceDuel: { n: 6, windowMs: 60_000 },
};

const FAST_ACTIONS = new Set([
  "collect",
  "collectAll",
  "train",
  "upgrade",
  "placeBuilding",
  "speedTrain",
  "rotateWall",
  "demolish",
  "upgradeType",
  "upgradeWallRow",
]);

function db() {
  return getAdminFirestore();
}
const col = (name: string) => db().collection(name);
const profileRef = (uid: string) => col("condado_profiles").doc(uid);

function isAdmin(email: string | null): boolean {
  if (!email) return false;
  const extra = String(globalThis.process?.env?.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(["ifcorporationsu@gmail.com", ...extra]);
  return allowed.has(email.toLowerCase());
}

function profileFromDoc(uid: string, data: DocumentData): Profile {
  const raw = (data.save as SaveState | undefined) ?? defaultSave(String(data.nick ?? "Senhor"));
  const save = migrateCloud({
    ...raw,
    player: {
      ...raw.player,
      id: String(data.playerId ?? raw.player.id),
      nick: String(data.nick ?? raw.player.nick),
    },
  });
  const applied = Array.isArray(data.appliedTransferIds) ? data.appliedTransferIds.map(String) : [];
  const appliedRaids = Array.isArray(data.appliedRaidIds) ? data.appliedRaidIds.map(String) : [];
  return {
    ...save,
    userId: uid,
    gold: Number(data.gold ?? save.gold) + Number(data.goldPending ?? 0),
    bread: Number(data.bread ?? save.bread) + Number(data.breadPending ?? 0),
    niens: Number(data.niens ?? save.niens) + Number(data.niensPending ?? 0),
    troopCards: Number(data.troopCards ?? save.troopCards) + Number(data.troopCardsPending ?? 0),
    generalCards: Number(data.generalCards ?? save.generalCards) + Number(data.generalCardsPending ?? 0),
    countyLevel: Number(data.countyLevel ?? save.countyLevel),
    weekStars: Number(data.weekStars ?? save.weekStars),
    weekKey: String(data.weekKey ?? save.weekKey),
    referredBy: (data.referredBy as string | null | undefined) ?? save.referredBy,
    referralClaimed: Boolean(data.referralClaimed ?? save.referralClaimed),
    shieldUntil: Number(data.shieldUntil ?? save.shieldUntil ?? 0),
    appliedTransferIds: applied,
    appliedRaidIds: appliedRaids,
    accountEmail: (data.accountEmail as string | null | undefined) ?? null,
  };
}

function withoutMeta(p: Profile): SaveState {
  const { userId: _u, appliedTransferIds: _a, appliedRaidIds: _r, accountEmail: _e, ...save } = p;
  return toSave(save);
}

function toFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function profilePayload(
  save: SaveState,
  extra?: { appliedTransferIds?: string[]; appliedRaidIds?: string[]; accountEmail?: string | null },
) {
  const clean = toSave(save);
  return JSON.parse(
    JSON.stringify({
      save: {
        ...clean,
        chat: [],
        allianceChat: clean.allianceChat.slice(-40),
        raids: clean.raids.slice(-24),
        ledger: clean.ledger.slice(0, 40),
      },
      playerId: clean.player.id,
      nick: clean.player.nick,
      gold: clean.gold,
      bread: clean.bread,
      niens: clean.niens,
      troopCards: clean.troopCards,
      generalCards: clean.generalCards,
      goldPending: 0,
      breadPending: 0,
      niensPending: 0,
      troopCardsPending: 0,
      generalCardsPending: 0,
      countyLevel: clean.countyLevel,
      weekStars: clean.weekStars,
      weekKey: clean.weekKey,
      referredBy: clean.referredBy ?? null,
      referralClaimed: clean.referralClaimed ?? false,
      shieldUntil: clean.shieldUntil ?? 0,
      appliedTransferIds: extra?.appliedTransferIds ?? [],
      appliedRaidIds: extra?.appliedRaidIds ?? [],
      accountEmail: extra?.accountEmail ?? null,
      updatedAt: new Date().toISOString(),
    }),
  ) as Record<string, unknown>;
}

function writeProfile(tx: Transaction, ref: DocumentReference, p: Profile) {
  tx.set(
    ref,
    profilePayload(withoutMeta(p), {
      appliedTransferIds: p.appliedTransferIds,
      appliedRaidIds: p.appliedRaidIds,
      accountEmail: p.accountEmail ?? null,
    }),
    { merge: true },
  );
}

function writeLedger(tx: Transaction, uid: string, playerId: string, requestId: string, entries: LedgerEntry[]) {
  for (const e of entries) {
    if (!e.amount) continue;
    const ref = col("condado_economy_ledger").doc();
    tx.set(ref, {
      userId: uid,
      playerId,
      type: e.type,
      currency: e.currency,
      amount: e.amount,
      balanceBefore: e.balanceBefore,
      balanceAfter: e.balanceAfter,
      source: e.source,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

function writeAudit(tx: Transaction, uid: string, action: string, requestId: string, ok: boolean, detail?: string) {
  tx.set(col("condado_audit_logs").doc(), {
    userId: uid,
    action,
    requestId,
    ok,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });
}

function ratePatch(data: DocumentData | undefined, action: string): Record<string, { t: number; n: number }> {
  const spec = RATE[action] ?? RATE.default!;
  const now = Date.now();
  const bag = (data ?? {}) as Record<string, { t?: number; n?: number }>;
  const cur = bag[action] ?? {};
  const start = Number(cur.t ?? 0);
  let n = Number(cur.n ?? 0);
  if (now - start > spec.windowMs) n = 0;
  if (n >= spec.n) throw new GameError("Estás a agir depressa demais. Espera um momento.");
  return { [action]: { t: now - start > spec.windowMs ? now : start || now, n: n + 1 } };
}

async function loadProfile(tx: Transaction, uid: string): Promise<Profile> {
  const snap = await tx.get(profileRef(uid));
  if (!snap.exists) throw new GameError("Condado não encontrado.");
  return profileFromDoc(uid, snap.data() as DocumentData);
}

function settled(p: Profile, now = Date.now()): { profile: Profile; ledger: LedgerEntry[] } {
  const r = settle(withoutMeta(p), now);
  return {
    profile: {
      ...p,
      ...r.save,
      userId: p.userId,
      appliedTransferIds: p.appliedTransferIds,
      appliedRaidIds: p.appliedRaidIds,
      accountEmail: p.accountEmail,
    },
    ledger: r.ledger,
  };
}

type Prepared = {
  profile: Profile;
  ledger: LedgerEntry[];
  creditRefs: DocumentReference[];
};

async function preparePlayer(tx: Transaction, uid: string): Promise<Prepared> {
  const loaded = await loadProfile(tx, uid);
  const incoming = await tx.get(col("condado_transfers").where("toPlayerId", "==", loaded.player.id).limit(80));
  const raids = await tx.get(col("condado_raid_inbox").where("toPlayerId", "==", loaded.player.id).limit(40));
  const ledger: LedgerEntry[] = [];
  let next = loaded;
  const creditRefs: DocumentReference[] = [];
  const seen = new Set(loaded.appliedTransferIds);
  for (const doc of incoming.docs) {
    if (seen.has(doc.id)) continue;
    const row = doc.data();
    if (row.chat || row.raid || row.credited) continue;
    if (String(row.fromPlayerId ?? "") === loaded.player.id) continue;
    const kind = row.kind as ResourceKind;
    const amount = Number(row.amount ?? 0);
    if (amount <= 0) continue;
    const cred = creditResource(withoutMeta(next), amount, kind, "transfer_in", String(row.fromNick ?? "envio"));
    next = { ...next, ...cred.save, appliedTransferIds: [...next.appliedTransferIds, doc.id].slice(-200) };
    ledger.push(...cred.ledger);
    seen.add(doc.id);
    creditRefs.push(doc.ref);
  }
  const seenR = new Set(next.appliedRaidIds);
  for (const doc of raids.docs) {
    if (seenR.has(doc.id)) continue;
    const row = doc.data();
    const goldTaken = Math.max(0, Number(row.goldTaken ?? 0));
    const gold = Math.max(0, next.gold - goldTaken);
    if (goldTaken) {
      ledger.push({
        type: "raid_loss",
        currency: "gold",
        amount: -goldTaken,
        balanceBefore: next.gold,
        balanceAfter: gold,
        source: String(row.fromNick ?? "raid"),
      });
    }
    next = {
      ...next,
      gold,
      shieldUntil: Math.max(next.shieldUntil, Date.now() + SHIELD_MS),
      raids: [
        {
          id: doc.id,
          at: Date.parse(String(row.createdAt ?? "")) || Date.now(),
          attacker: String(row.fromNick ?? "Senhor"),
          defender: next.player.nick,
          gold: goldTaken,
          bread: 0,
          incoming: true,
          destruction: Number(row.destruction ?? 0),
          troopsLost: Number(row.troopsLost ?? 0),
          stars: Number(row.stars ?? 0),
        },
        ...next.raids,
      ].slice(0, 24),
      appliedRaidIds: [...next.appliedRaidIds, doc.id].slice(-200),
    };
    seenR.add(doc.id);
  }
  const base = settled(next);
  return { profile: base.profile, ledger: [...ledger, ...base.ledger], creditRefs };
}

function commitPrepared(
  tx: Transaction,
  uid: string,
  profile: Profile,
  requestId: string,
  ledger: LedgerEntry[],
  creditRefs: DocumentReference[],
) {
  for (const ref of creditRefs) tx.set(ref, { credited: true }, { merge: true });
  writeProfile(tx, profileRef(uid), profile);
  writeLedger(tx, uid, profile.player.id, requestId, ledger);
}

const READ_ONLY = new Set([
  "listMarket",
  "weeklyBoard",
  "listTransfers",
  "peekPlayer",
  "listRaidTargets",
  "adminLookup",
  "listAllianceFoes",
]);

export async function handleGameAction(
  player: PlayerAuth,
  action: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  if (!requestId || requestId.length < 8 || requestId.length > 80) {
    throw new GameError("Pedido inválido.");
  }
  if (READ_ONLY.has(action)) {
    return dispatch(null, player, action, payload, requestId);
  }
  const reqRef = col("condado_request_ids").doc(`${player.uid}_${requestId}`);
  try {
    const result = await db().runTransaction(async (tx) => {
      const cached = await tx.get(reqRef);
      if (cached.exists) return (cached.data()?.result ?? {}) as ActionResult;
      const rateRef = col("condado_rate_limits").doc(player.uid);
      const rateSnap = await tx.get(rateRef);
      const patch = ratePatch(rateSnap.data(), action);
      const out = await dispatch(tx, player, action, payload, requestId);
      tx.set(rateRef, patch, { merge: true });
      const stored = FAST_ACTIONS.has(action) ? slimResult(out) : out;
      tx.set(reqRef, toFirestore({ result: stored, action, userId: player.uid, at: new Date().toISOString() }));
      if (!FAST_ACTIONS.has(action)) writeAudit(tx, player.uid, action, requestId, true);
      return out;
    });
    if (action === "sendChat") void pruneExpiredChat();
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "fail";
    if (!detail.includes("depressa demais")) {
      try {
        await col("condado_audit_logs").add({
          userId: player.uid,
          action,
          requestId,
          ok: false,
          detail,
          timestamp: new Date().toISOString(),
        });
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
}

async function dispatch(
  tx: Transaction | null,
  player: PlayerAuth,
  action: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const write = (): Transaction => {
    if (!tx) throw new GameError("Ação inválida.");
    return tx;
  };
  switch (action) {
    case "createProfile":
      return createProfile(write(), player, payload, requestId);
    case "sync":
    case "pull":
      return syncProfile(write(), player, requestId);
    case "rename":
      return rename(write(), player, String(payload.nick ?? ""), requestId);
    case "collect":
      return mutateFast(write(), player, requestId, (p) => collectBuilding(withoutMeta(p), String(payload.id ?? "")));
    case "collectAll":
      return mutateFast(write(), player, requestId, (p) => collectAllBuildings(withoutMeta(p)));
    case "upgrade":
      return mutateFast(write(), player, requestId, (p) => upgradeBuilding(withoutMeta(p), String(payload.id ?? "")));
    case "upgradeType":
      return mutateFast(write(), player, requestId, (p) => upgradeAllOfType(withoutMeta(p), payload.type as BuildingType));
    case "upgradeWallRow":
      return mutateFast(write(), player, requestId, (p) => upgradeWallRowSim(withoutMeta(p), String(payload.id ?? "")));
    case "demolish":
      return mutateFast(write(), player, requestId, (p) => demolishBuilding(withoutMeta(p), String(payload.id ?? "")));
    case "rotateWall":
      return mutateFast(write(), player, requestId, (p) =>
        rotateWalls(withoutMeta(p), String(payload.id ?? ""), Array.isArray(payload.rowIds) ? payload.rowIds.map(String) : undefined),
      );
    case "train":
      return mutateFast(write(), player, requestId, (p) =>
        trainTroop(withoutMeta(p), payload.type as TroopType, payload.qty),
      );
    case "speedTrain":
      return mutateFast(write(), player, requestId, (p) => speedTrainJob(withoutMeta(p), String(payload.id ?? "")));
    case "placeBuilding":
      return mutateFast(write(), player, requestId, (p) =>
        placeBuilding(withoutMeta(p), {
          type: payload.type as BuildingType,
          gx: Number(payload.gx),
          gy: Number(payload.gy),
          dir: payload.dir as WallDir | undefined,
          movingId: typeof payload.movingId === "string" ? payload.movingId : null,
        }),
      );
    case "buyNien":
      return mutate(write(), player, requestId, (p) => buyNienSim(withoutMeta(p)));
    case "sellNien":
      return mutate(write(), player, requestId, (p) => sellNienSim(withoutMeta(p)));
    case "buyBreadPack":
      return mutate(write(), player, requestId, (p) => buyBreadPackSim(withoutMeta(p)));
    case "sellBreadPack":
      return mutate(write(), player, requestId, (p) => sellBreadPackSim(withoutMeta(p)));
    case "upgradeCounty":
      return upgradeCountyAction(write(), player, requestId);
    case "upgradeTroop":
      return mutate(write(), player, requestId, (p) => upgradeTroopSim(withoutMeta(p), payload.type as TroopType));
    case "upgradeCamp":
      return mutate(write(), player, requestId, (p) => upgradeCampSim(withoutMeta(p)));
    case "buyPass":
      return mutate(write(), player, requestId, (p) => buyPassSim(withoutMeta(p)));
    case "claimPass":
      return mutate(write(), player, requestId, (p) => claimPassSim(withoutMeta(p), Number(payload.level)));
    case "claimFreePass":
      return mutate(write(), player, requestId, (p) => claimFreePassSim(withoutMeta(p), Number(payload.level)));
    case "claimPassAll":
      return mutate(write(), player, requestId, (p) => claimPassAllSim(withoutMeta(p)));
    case "claimPassExtra":
      return mutate(write(), player, requestId, (p) =>
        claimPassExtraSim(withoutMeta(p), payload.extra === "discount" ? "discount" : "boost"),
      );
    case "skipPass":
      return mutate(write(), player, requestId, (p) => skipPassSim(withoutMeta(p)));
    case "foundAlliance":
      return foundAllianceAction(write(), player, payload, requestId);
    case "joinAlliance":
      return joinAllianceAction(write(), player, String(payload.allianceId ?? ""), requestId);
    case "leaveAlliance":
      return leaveAllianceAction(write(), player, requestId);
    case "recruitAlliance":
      return recruitAllianceAction(write(), player, requestId);
    case "listAllianceFoes":
      return listAllianceFoesAction(player);
    case "startAllianceDuel":
      return startAllianceDuelAction(write(), player, String(payload.targetId ?? ""), requestId);
    case "finishAllianceDuel":
      return finishAllianceDuelAction(write(), player, payload, requestId);
    case "sendAllianceChat":
      return sendAlliance(write(), player, String(payload.text ?? ""), requestId);
    case "setPrefs":
      return setPrefs(write(), player, payload, requestId);
    case "transfer":
      return transferAction(write(), player, payload, requestId);
    case "createMarketOffer":
      return createOffer(write(), player, payload, requestId);
    case "takeMarketOffer":
      return takeOffer(write(), player, String(payload.offerId ?? ""), requestId);
    case "cancelMarketOffer":
      return cancelOffer(write(), player, String(payload.offerId ?? ""), requestId);
    case "listMarket":
      return listMarketAction();
    case "claimWeekly":
      return claimWeeklyAction(write(), player, requestId);
    case "weeklyBoard":
      return weeklyBoardAction(player);
    case "listTransfers":
      return listTransfersAction(player);
    case "peekPlayer":
      return peekPlayerAction(String(payload.id ?? ""));
    case "listRaidTargets":
      return listTargetsAction(player);
    case "startRaid":
      return startRaidAction(write(), player, String(payload.targetId ?? ""), requestId);
    case "finishRaid":
      return finishRaidAction(write(), player, payload, requestId);
    case "sendChat":
      return sendChatAction(write(), player, String(payload.text ?? ""), requestId);
    case "syncAccountEmail":
      return syncEmail(write(), player, requestId);
    case "adminLookup":
      return adminLookup(player, String(payload.playerId ?? ""));
    default:
      throw new GameError("Ação desconhecida.");
  }
}

async function mutate(
  tx: Transaction,
  player: PlayerAuth,
  requestId: string,
  fn: (p: Profile) => { save: SaveState; ledger?: LedgerEntry[]; toast?: string },
): Promise<ActionResult> {
  const prep = await preparePlayer(tx, player.uid);
  const r = fn(prep.profile);
  const profile: Profile = {
    ...prep.profile,
    ...r.save,
    userId: player.uid,
    appliedTransferIds: prep.profile.appliedTransferIds,
    appliedRaidIds: prep.profile.appliedRaidIds,
    accountEmail: prep.profile.accountEmail,
  };
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...(r.ledger ?? [])], prep.creditRefs);
  return { save: withoutMeta(profile), toast: r.toast };
}

async function prepareFast(tx: Transaction, uid: string): Promise<Prepared> {
  const loaded = await loadProfile(tx, uid);
  const base = settled(loaded);
  return { profile: base.profile, ledger: base.ledger, creditRefs: [] };
}

async function mutateFast(
  tx: Transaction,
  player: PlayerAuth,
  requestId: string,
  fn: (p: Profile) => { save: SaveState; ledger?: LedgerEntry[]; toast?: string },
): Promise<ActionResult> {
  const prep = await prepareFast(tx, player.uid);
  const r = fn(prep.profile);
  const profile: Profile = {
    ...prep.profile,
    ...r.save,
    userId: player.uid,
    appliedTransferIds: prep.profile.appliedTransferIds,
    appliedRaidIds: prep.profile.appliedRaidIds,
    accountEmail: prep.profile.accountEmail,
  };
  writeProfile(tx, profileRef(player.uid), profile);
  writeLedger(tx, player.uid, profile.player.id, requestId, [...prep.ledger, ...(r.ledger ?? [])]);
  return { save: slimSave(withoutMeta(profile)), toast: r.toast };
}

function slimSave(s: SaveState): SaveState {
  return { ...s, chat: [], allianceChat: [], ledger: [], raids: s.raids.slice(-6) };
}

function slimResult(out: ActionResult): ActionResult {
  if (!out.save) return { toast: out.toast };
  return { save: slimSave(out.save), toast: out.toast };
}

async function createProfile(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const nick = String(payload.nick ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
  if (nick.length < 3) throw new GameError("O nome do condado precisa de ao menos 3 letras.");
  const email = player.email;
  if (!email) throw new GameError("A conta precisa de um e-mail.");
  const deviceId = String(payload.deviceId ?? "").slice(0, 80);
  const fingerprint = String(payload.fingerprint ?? "").slice(0, 80);
  const referredBy = String(payload.referredBy ?? "").trim().toUpperCase() || null;
  const ref = profileRef(player.uid);
  const existing = await tx.get(ref);
  if (existing.exists) {
    const p = profileFromDoc(player.uid, existing.data() as DocumentData);
    return { save: withoutMeta(p) };
  }
  const nickRef = col("condado_nick_index").doc(nick.toLowerCase());
  const emailRef = col("condado_email_index").doc(email);
  const deviceRef = deviceId ? col("condado_devices").doc(deviceId) : null;
  const fpRef = fingerprint ? col("condado_devices").doc(`fp_${fingerprint}`) : null;
  const taken = await tx.get(nickRef);
  if (taken.exists) throw new GameError("Este nome de condado já está em uso.");
  const emailTaken = await tx.get(emailRef);
  if (emailTaken.exists && emailTaken.data()?.userId !== player.uid) {
    throw new GameError("Este e-mail já está ligado a outro condado.");
  }
  if (deviceRef) {
    const deviceTaken = await tx.get(deviceRef);
    if (deviceTaken.exists && deviceTaken.data()?.userId !== player.uid) {
      throw new GameError("Já existe um condado neste aparelho.");
    }
  }
  if (fpRef) {
    const fpTaken = await tx.get(fpRef);
    if (fpTaken.exists && fpTaken.data()?.userId !== player.uid) {
      throw new GameError("Já existe um condado neste aparelho.");
    }
  }
  const save = defaultSave(nick, referredBy);
  const profile: Profile = { ...save, userId: player.uid, appliedTransferIds: [], appliedRaidIds: [], accountEmail: email };
  writeProfile(tx, ref, profile);
  tx.set(nickRef, { userId: player.uid, playerId: save.player.id });
  tx.set(col("condado_player_index").doc(save.player.id), { userId: player.uid, nick: save.player.nick });
  tx.set(emailRef, { userId: player.uid, playerId: save.player.id });
  if (deviceRef) tx.set(deviceRef, { userId: player.uid, playerId: save.player.id, kind: "device" });
  if (fpRef) tx.set(fpRef, { userId: player.uid, playerId: save.player.id, kind: "fingerprint" });
  writeLedger(tx, player.uid, save.player.id, requestId, []);
  return { save };
}

async function syncProfile(tx: Transaction, player: PlayerAuth, requestId: string): Promise<ActionResult> {
  const ref = profileRef(player.uid);
  const snap = await tx.get(ref);
  if (!snap.exists) return { save: null, admin: isAdmin(player.email) };
  const prep = await preparePlayer(tx, player.uid);
  let profile = prep.profile;
  const extra: LedgerEntry[] = [];
  if (profile.alliance) {
    const asnap = await tx.get(allianceRef(profile.alliance.id));
    if (asnap.exists) {
      let a = allianceFromDoc(asnap.id, asnap.data() as DocumentData);
      const payout = await readAlliancePayout(tx, a);
      a = payout.next;
      const mine = payout.rows.find((row) => row.uid === player.uid);
      if (mine) {
        extra.push(...mine.ledger);
        profile = { ...profile, gold: mine.profile.gold };
      }
      if (payout.settled) {
        writeAlliancePayout(tx, payout.rows, requestId, player.uid);
        tx.set(allianceRef(a.id), { resolved: true, xp: a.xp, level: a.level, warDay: a.warDay }, { merge: true });
      }
      profile = {
        ...profile,
        alliance: allianceStateOf(a),
        war: warFromAlliance(a),
        allianceChat: a.chat.map((m) => ({ ...m, self: m.fromId === profile.player.id })),
      };
    }
  }
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...extra], prep.creditRefs);
  return { save: withoutMeta(profile), admin: isAdmin(player.email) };
}

async function rename(tx: Transaction, player: PlayerAuth, nickRaw: string, requestId: string): Promise<ActionResult> {
  const nick = nickRaw.trim().slice(0, 18);
  if (nick.length < 3) throw new GameError("Nome curto demais.");
  const p0 = await loadProfile(tx, player.uid);
  const newIndex = col("condado_nick_index").doc(nick.toLowerCase());
  const taken = await tx.get(newIndex);
  if (taken.exists && taken.data()?.userId !== player.uid) throw new GameError("Este nome de condado já está em uso.");
  const oldIndex = col("condado_nick_index").doc(p0.player.nick.toLowerCase());
  tx.delete(oldIndex);
  tx.set(newIndex, { userId: player.uid, playerId: p0.player.id });
  tx.set(col("condado_player_index").doc(p0.player.id), { userId: player.uid, nick }, { merge: true });
  const profile: Profile = { ...p0, player: { ...p0.player, nick } };
  writeProfile(tx, profileRef(player.uid), profile);
  writeLedger(tx, player.uid, profile.player.id, requestId, []);
  return { save: withoutMeta(profile), toast: "Nome atualizado.", nick };
}

async function upgradeCountyAction(tx: Transaction, player: PlayerAuth, requestId: string): Promise<ActionResult> {
  const prep = await preparePlayer(tx, player.uid);
  const r = upgradeCountySim(withoutMeta(prep.profile));
  let profile: Profile = { ...prep.profile, ...r.save };
  const grant = grantReferralSim(withoutMeta(profile));
  const ledger = [...prep.ledger, ...r.ledger];
  let toast = r.toast;
  let destUid = "";
  let destProfile: Profile | null = null;
  let destLedger: LedgerEntry[] = [];
  if (grant && profile.referredBy) {
    const idx = await tx.get(col("condado_player_index").doc(profile.referredBy));
    if (idx.exists) {
      destUid = String(idx.data()?.userId ?? "");
      if (destUid) {
        const destSnap = await tx.get(profileRef(destUid));
        if (destSnap.exists) {
          destProfile = profileFromDoc(destUid, destSnap.data() as DocumentData);
          const cred = creditResource(withoutMeta(destProfile), 300_000, "gold", "referral", profile.player.id);
          destProfile = { ...destProfile, ...cred.save };
          destLedger = cred.ledger;
        }
      }
    }
  }
  if (grant) {
    profile = { ...profile, ...grant.save };
    ledger.push(...grant.ledger);
    toast = grant.toast;
  }
  commitPrepared(tx, player.uid, profile, requestId, ledger, prep.creditRefs);
  if (destUid && destProfile) {
    writeProfile(tx, profileRef(destUid), destProfile);
    writeLedger(tx, destUid, destProfile.player.id, requestId, destLedger);
  }
  return { save: withoutMeta(profile), toast };
}

async function setPrefs(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const p = await loadProfile(tx, player.uid);
  const profile: Profile = { ...p, muted: Boolean(payload.muted ?? p.muted) };
  writeProfile(tx, profileRef(player.uid), profile);
  writeLedger(tx, player.uid, profile.player.id, requestId, []);
  return { save: withoutMeta(profile) };
}

async function transferAction(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const amount = Math.floor(Number(payload.amount));
  const kind = payload.kind as ResourceKind;
  const toId = String(payload.toId ?? "").trim().toUpperCase();
  const prep = await preparePlayer(tx, player.uid);
  if (toId === prep.profile.player.id) throw new GameError("Não envie para si mesmo.");
  const spent = spendForTransfer(withoutMeta(prep.profile), amount, kind);
  const destIndex = await tx.get(col("condado_player_index").doc(toId));
  const toNick = destIndex.exists ? String(destIndex.data()?.nick ?? "") : findNick(toId);
  if (!toNick) throw new GameError("ID não encontrado. Cole e confira o nick.");
  let destUid = "";
  let destProfile: Profile | null = null;
  let destLedger: LedgerEntry[] = [];
  if (destIndex.exists) {
    destUid = String(destIndex.data()?.userId ?? "");
    if (destUid) {
      const destSnap = await tx.get(profileRef(destUid));
      if (destSnap.exists) {
        destProfile = profileFromDoc(destUid, destSnap.data() as DocumentData);
        const cred = creditResource(withoutMeta(destProfile), amount, kind, "transfer_in", prep.profile.player.nick);
        destProfile = { ...destProfile, ...cred.save };
        destLedger = cred.ledger;
      }
    }
  }
  const me: Profile = { ...prep.profile, ...spent.save };
  commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...spent.ledger], prep.creditRefs);
  if (destUid && destProfile) {
    writeProfile(tx, profileRef(destUid), destProfile);
    writeLedger(tx, destUid, destProfile.player.id, requestId, destLedger);
  }
  const txRef = col("condado_transfers").doc(makeId("TX"));
  tx.set(txRef, {
    fromUserId: player.uid,
    fromPlayerId: me.player.id,
    fromNick: me.player.nick,
    toPlayerId: toId,
    toNick,
    kind,
    amount,
    createdAt: new Date().toISOString(),
    credited: Boolean(destUid && destProfile),
  });
  return {
    save: withoutMeta(me),
    toast: `${amount} enviados a ${toNick}.`,
    id: txRef.id,
    nick: toNick,
  };
}

function offerFromDoc(id: string, data: DocumentData): MarketOffer {
  return {
    id,
    sellerId: String(data.sellerId ?? ""),
    sellerUid: String(data.sellerUid ?? ""),
    sellerNick: String(data.sellerNick ?? ""),
    giveKind: data.giveKind as Tradable,
    giveAmount: Number(data.giveAmount ?? 0),
    wantKind: data.wantKind as Tradable,
    wantAmount: Number(data.wantAmount ?? 0),
    createdAt: Date.parse(String(data.createdAt ?? "")) || Date.now(),
  };
}

async function createOffer(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const giveKind = payload.giveKind as Tradable;
  const wantKind = payload.wantKind as Tradable;
  const giveAmount = Math.floor(Number(payload.giveAmount));
  const wantAmount = Math.floor(Number(payload.wantAmount));
  if (giveAmount <= 0 || wantAmount <= 0) throw new GameError("Quantia inválida.");
  if (giveKind === wantKind) throw new GameError("Troca precisa de recursos diferentes.");
  const id = `${giveKind}_${giveAmount}_${wantKind}_${wantAmount}`;
  const offerRef = col("condado_market").doc(id);
  const offerSnap = await tx.get(offerRef);
  if (offerSnap.exists) throw new GameError("Esta proposta já está no mercado. As ofertas são únicas.");
  const prep = await preparePlayer(tx, player.uid);
  const field = kindField(giveKind);
  if (giveAmount > Number(prep.profile[field])) throw new GameError("Não tens esse recurso para listar.");
  const ledger: LedgerEntry[] = [
    {
      type: "market_list",
      currency: giveKind,
      amount: -giveAmount,
      balanceBefore: Number(prep.profile[field]),
      balanceAfter: Number(prep.profile[field]) - giveAmount,
      source: id,
    },
  ];
  const me: Profile = { ...prep.profile, [field]: Number(prep.profile[field]) - giveAmount } as Profile;
  commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...ledger], prep.creditRefs);
  tx.set(offerRef, {
    sellerUid: player.uid,
    sellerId: me.player.id,
    sellerNick: me.player.nick,
    giveKind,
    giveAmount,
    wantKind,
    wantAmount,
    createdAt: new Date().toISOString(),
  });
  return { save: withoutMeta(me), toast: "Oferta publicada no mercado." };
}

async function takeOffer(tx: Transaction, player: PlayerAuth, offerId: string, requestId: string): Promise<ActionResult> {
  const offerRef = col("condado_market").doc(offerId);
  const offerSnap = await tx.get(offerRef);
  if (!offerSnap.exists) throw new GameError("Esta oferta já foi fechada.");
  const offer = offerFromDoc(offerSnap.id, offerSnap.data() as DocumentData);
  if (offer.sellerUid === player.uid) throw new GameError("Não podes comprar a tua própria oferta.");
  const prep = await preparePlayer(tx, player.uid);
  const sellerSnap = await tx.get(profileRef(offer.sellerUid));
  const payField = kindField(offer.wantKind);
  if (offer.wantAmount > Number(prep.profile[payField])) throw new GameError("Recurso insuficiente para este trato.");
  const debit = creditResource(withoutMeta(prep.profile), -offer.wantAmount, offer.wantKind, "market_buy", offer.id);
  const credit = creditResource(debit.save, offer.giveAmount, offer.giveKind, "market_buy", offer.id);
  const me: Profile = { ...prep.profile, ...credit.save };
  let sellerP: Profile | null = null;
  let sellerLedger: LedgerEntry[] = [];
  if (sellerSnap.exists) {
    const seller = profileFromDoc(offer.sellerUid, sellerSnap.data() as DocumentData);
    const pay = creditResource(withoutMeta(seller), offer.wantAmount, offer.wantKind, "market_sell", offer.id);
    sellerP = { ...seller, ...pay.save };
    sellerLedger = pay.ledger;
  }
  commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...debit.ledger, ...credit.ledger], prep.creditRefs);
  if (sellerP) {
    writeProfile(tx, profileRef(offer.sellerUid), sellerP);
    writeLedger(tx, offer.sellerUid, sellerP.player.id, requestId, sellerLedger);
  }
  tx.delete(offerRef);
  return { save: withoutMeta(me), toast: `Trato fechado com ${offer.sellerNick}.` };
}

async function cancelOffer(tx: Transaction, player: PlayerAuth, offerId: string, requestId: string): Promise<ActionResult> {
  const offerRef = col("condado_market").doc(offerId);
  const offerSnap = await tx.get(offerRef);
  if (!offerSnap.exists) throw new GameError("Oferta já não existe.");
  const offer = offerFromDoc(offerSnap.id, offerSnap.data() as DocumentData);
  if (offer.sellerUid !== player.uid) throw new GameError("Só o autor pode retirar a oferta.");
  const prep = await preparePlayer(tx, player.uid);
  const cred = creditResource(withoutMeta(prep.profile), offer.giveAmount, offer.giveKind, "market_cancel", offer.id);
  const me: Profile = { ...prep.profile, ...cred.save };
  commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...cred.ledger], prep.creditRefs);
  tx.delete(offerRef);
  return { save: withoutMeta(me), toast: "Oferta retirada." };
}

async function listMarketAction(): Promise<ActionResult> {
  const snap = await col("condado_market").limit(80).get();
  const offers = snap.docs
    .map((d) => offerFromDoc(d.id, d.data()))
    .filter((o) => o.giveAmount > 0 && o.wantAmount > 0 && o.giveKind !== o.wantKind)
    .sort((a, b) => b.createdAt - a.createdAt);
  return { offers };
}

async function weeklyBoardAction(player: PlayerAuth): Promise<ActionResult> {
  const win = rankingWindow();
  const meSnap = await profileRef(player.uid).get();
  const you = meSnap.exists ? profileFromDoc(player.uid, meSnap.data() as DocumentData) : null;
  const q = await col("condado_profiles").where("weekKey", "==", win.key).orderBy("weekStars", "desc").limit(20).get();
  const byId = new Map<string, { playerId: string; nick: string; stars: number; you?: boolean; bot?: boolean }>();
  for (const b of botWeekBoard(win.key)) byId.set(b.playerId, { ...b, bot: true });
  for (const d of q.docs) {
    const r = d.data();
    byId.set(String(r.playerId), {
      playerId: String(r.playerId),
      nick: String(r.nick),
      stars: Number(r.weekStars ?? 0),
      you: you?.player.id === r.playerId,
    });
  }
  const board = [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, 20);
  const yourRank = board.findIndex((r) => r.you) + 1;
  const claim = you ? await col("condado_week_claims").doc(`${player.uid}_${win.key}`).get() : null;
  return { board, yourRank, claimed: Boolean(claim?.exists), week: win };
}

async function claimWeeklyAction(tx: Transaction, player: PlayerAuth, requestId: string): Promise<ActionResult> {
  const win = rankingWindow();
  if (!win.claim) throw new GameError("O prêmio abre domingo às 23h de Brasília.");
  const claimRef = col("condado_week_claims").doc(`${player.uid}_${win.key}`);
  const claimSnap = await tx.get(claimRef);
  if (claimSnap.exists) throw new GameError("Prêmio já recolhido.");
  const boardQ = await tx.get(col("condado_profiles").where("weekKey", "==", win.key).orderBy("weekStars", "desc").limit(20));
  const prep = await preparePlayer(tx, player.uid);
  const byId = new Map<string, { playerId: string; stars: number }>();
  for (const b of botWeekBoard(win.key)) byId.set(b.playerId, { playerId: b.playerId, stars: b.stars });
  for (const d of boardQ.docs) {
    const r = d.data();
    byId.set(String(r.playerId), { playerId: String(r.playerId), stars: Number(r.weekStars ?? 0) });
  }
  const board = [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, 20);
  const rank = board.findIndex((r) => r.playerId === prep.profile.player.id) + 1;
  if (!weeklyPrize(rank)) throw new GameError("Fora do top 20 desta semana.");
  const r = applyWeeklyPrize(withoutMeta(prep.profile), rank);
  const profile: Profile = { ...prep.profile, ...r.save };
  tx.set(claimRef, { userId: player.uid, weekKey: win.key, rank, claimedAt: new Date().toISOString() });
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...r.ledger], prep.creditRefs);
  return { save: withoutMeta(profile), toast: `Prêmio do ${rank}º lugar recolhido.`, yourRank: rank };
}

async function listTransfersAction(player: PlayerAuth): Promise<ActionResult> {
  const snap = await profileRef(player.uid).get();
  if (!snap.exists) return { rows: [] };
  const p = profileFromDoc(player.uid, snap.data() as DocumentData);
  const fromSnap = await col("condado_transfers").where("fromPlayerId", "==", p.player.id).limit(40).get();
  const toSnap = await col("condado_transfers").where("toPlayerId", "==", p.player.id).limit(40).get();
  const docs = [...fromSnap.docs, ...toSnap.docs]
    .filter((d) => !d.data().chat && !d.data().raid)
    .sort((a, b) => String(b.data().createdAt ?? "").localeCompare(String(a.data().createdAt ?? "")))
    .slice(0, 40);
  const rows: TransferRecord[] = docs.map((d) => {
    const r = d.data();
    return {
      id: d.id,
      at: Date.parse(String(r.createdAt ?? "")) || Date.now(),
      fromId: String(r.fromPlayerId),
      fromNick: String(r.fromNick),
      toId: String(r.toPlayerId),
      toNick: String(r.toNick),
      kind: r.kind as ResourceKind,
      amount: Number(r.amount),
      incoming: r.toPlayerId === p.player.id && r.fromPlayerId !== p.player.id,
    };
  });
  return { rows };
}

async function peekPlayerAction(idRaw: string): Promise<ActionResult> {
  const id = idRaw.trim().toUpperCase();
  const npc = findNick(id);
  if (npc) return { id, nick: npc };
  const snap = await col("condado_player_index").doc(id).get();
  return snap.exists ? { id, nick: String(snap.data()?.nick) } : { id, nick: null };
}

async function listTargetsAction(player: PlayerAuth): Promise<ActionResult> {
  const meSnap = await profileRef(player.uid).get();
  if (!meSnap.exists) return { targets: [] };
  const me = profileFromDoc(player.uid, meSnap.data() as DocumentData);
  const levels = [me.countyLevel - 1, me.countyLevel, me.countyLevel + 1].filter((n) => n >= 1);
  const targets: Lord[] = [];
  const now = Date.now();
  for (const level of levels) {
    const snap = await col("condado_profiles").where("countyLevel", "==", level).limit(25).get();
    for (const d of snap.docs) {
      if (d.id === player.uid) continue;
      const data = d.data();
      const pid = String(data.playerId ?? "");
      if (!pid || pid === me.player.id) continue;
      targets.push({
        id: pid,
        nick: String(data.nick ?? "Senhor"),
        title: `Condado Nv.${level}`,
        rank: level,
        lootGold: Math.min(lootCapForCounty(level), Number(data.gold ?? 0)),
        lootBread: 0,
        countyLevel: level,
        real: true,
        shieldUntil: Number(data.shieldUntil ?? 0),
      });
    }
  }
  targets.sort((a, b) => (a.shieldUntil && a.shieldUntil > now ? 1 : 0) - (b.shieldUntil && b.shieldUntil > now ? 1 : 0));
  return { targets };
}

async function startRaidAction(tx: Transaction, player: PlayerAuth, targetId: string, requestId: string): Promise<ActionResult> {
  const prep = await preparePlayer(tx, player.uid);
  let me = prep.profile;
  const armyN = me.army.infantry + me.army.archers + me.army.cavalry + me.army.general + me.army.generaless + me.army.defender;
  if (armyN <= 0) throw new GameError("Sem tropas no acampamento.");
  const idx = await tx.get(col("condado_player_index").doc(targetId));
  if (!idx.exists) throw new GameError("Alvo não encontrado.");
  const toUid = String(idx.data()?.userId ?? "");
  const destSnap = await tx.get(profileRef(toUid));
  if (!destSnap.exists) throw new GameError("Alvo não encontrado.");
  const dest = profileFromDoc(toUid, destSnap.data() as DocumentData);
  if (Math.abs(dest.countyLevel - me.countyLevel) > 1) {
    throw new GameError("Só podes atacar condados de um nível acima, igual ou abaixo.");
  }
  if ((dest.shieldUntil ?? 0) > Date.now()) throw new GameError("Este condado está sob escudo.");
  const warOn = !!(me.war && me.war.foeId && dest.alliance?.id === me.war.foeId && !me.war.sittingOut);
  if (warOn && me.war && (me.war.attacks[dest.player.id] ?? 0) >= 2) {
    throw new GameError("Guerra de aliança: no máximo 2 ataques por base.");
  }
  me = { ...me, ...registerAttack(withoutMeta(me), dest.player.id, warOn) };
  const lootGold = Math.min(lootForStars(3, dest.countyLevel), Math.max(0, dest.gold));
  const sessionId = makeId("RD");
  commitPrepared(tx, player.uid, me, requestId, prep.ledger, prep.creditRefs);
  tx.set(col("condado_raid_sessions").doc(sessionId), {
    attackerUid: player.uid,
    defenderUid: toUid,
    defenderId: dest.player.id,
    defenderNick: dest.player.nick,
    startedArmy: me.army,
    lootCap: lootGold,
    defenderLevel: dest.countyLevel,
    buildings: dest.buildings,
    createdAt: Date.now(),
    open: true,
  });
  return {
    save: withoutMeta(me),
    sessionId,
    buildings: dest.buildings,
    lootGold,
    nick: dest.player.nick,
  };
}

async function finishRaidAction(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const sessionId = String(payload.sessionId ?? "");
  const sessionRef = col("condado_raid_sessions").doc(sessionId);
  const sessionSnap = await tx.get(sessionRef);
  if (!sessionSnap.exists) throw new GameError("Ataque inválido.");
  const session = sessionSnap.data() as DocumentData;
  if (session.attackerUid !== player.uid) throw new GameError("Ataque inválido.");
  if (!session.open) throw new GameError("Este ataque já foi resolvido.");
  const stars = Math.max(0, Math.min(3, Math.floor(Number(payload.stars ?? 0))));
  const defLevel = Number(session.defenderLevel ?? 1);
  const goldTaken = Math.min(Number(session.lootCap ?? 0), lootForStars(stars, defLevel));
  const survivors = (payload.survivors ?? {}) as ArmyCounts;
  const startedArmy = session.startedArmy as ArmyCounts;
  const prep = await preparePlayer(tx, player.uid);
  const defRef = profileRef(String(session.defenderUid));
  const defSnap = await tx.get(defRef);
  const raid = applyRaidFinish(withoutMeta(prep.profile), {
    stars,
    survivors,
    startedArmy,
    goldTaken,
    defenderNick: String(session.defenderNick ?? "Senhor"),
    defenderLevel: defLevel,
  });
  const me: Profile = {
    ...prep.profile,
    ...raid.save,
    raids: [
      {
        id: sessionId,
        at: Date.now(),
        attacker: prep.profile.player.nick,
        defender: String(session.defenderNick ?? ""),
        gold: goldTaken,
        bread: 0,
        incoming: false,
        destruction: Number(payload.destruction ?? 0),
        troopsLost: Number(payload.troopsLost ?? 0),
        stars,
      },
      ...prep.profile.raids,
    ].slice(0, 24),
  };
  let destP: Profile | null = null;
  let destLedger: LedgerEntry[] = [];
  if (defSnap.exists && goldTaken > 0) {
    const dest = profileFromDoc(String(session.defenderUid), defSnap.data() as DocumentData);
    const gold = Math.max(0, dest.gold - goldTaken);
    destP = {
      ...dest,
      gold,
      shieldUntil: Math.max(dest.shieldUntil, Date.now() + SHIELD_MS),
      appliedRaidIds: [...dest.appliedRaidIds, sessionId].slice(-200),
    };
    destLedger = [
      {
        type: "raid_loss",
        currency: "gold",
        amount: -goldTaken,
        balanceBefore: dest.gold,
        balanceAfter: gold,
        source: me.player.nick,
      },
    ];
  }
  commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...raid.ledger], prep.creditRefs);
  if (destP) {
    writeProfile(tx, defRef, destP);
    writeLedger(tx, String(session.defenderUid), destP.player.id, requestId, destLedger);
  }
  tx.set(col("condado_raid_inbox").doc(sessionId), {
    fromUserId: player.uid,
    fromPlayerId: me.player.id,
    fromNick: me.player.nick,
    toPlayerId: session.defenderId,
    toNick: session.defenderNick,
    goldTaken,
    destruction: Number(payload.destruction ?? 0),
    stars,
    troopsLost: Number(payload.troopsLost ?? 0),
    createdAt: new Date().toISOString(),
  });
  tx.set(sessionRef, { open: false, goldTaken, stars, resolvedAt: Date.now() }, { merge: true });
  return { save: withoutMeta(me) };
}

async function sendChatAction(tx: Transaction, player: PlayerAuth, textRaw: string, requestId: string): Promise<ActionResult> {
  const text = textRaw.trim().slice(0, 160);
  if (!text) throw new GameError("Mensagem vazia.");
  const p = await loadProfile(tx, player.uid);
  const now = Date.now();
  tx.set(col("condado_chat").doc(), {
    fromUserId: player.uid,
    fromPlayerId: p.player.id,
    fromId: p.player.id,
    fromNick: p.player.nick,
    text,
    at: now,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CHAT_TTL_MS).toISOString(),
    channel: "global",
  });
  writeLedger(tx, player.uid, p.player.id, requestId, []);
  return {};
}

async function pruneExpiredChat() {
  try {
    const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
    const old = await col("condado_chat").where("createdAt", "<", cutoff).limit(40).get();
    if (old.empty) return;
    const batch = db().batch();
    for (const d of old.docs) batch.delete(d.ref);
    await batch.commit();
  } catch {
    /* ignore */
  }
}

async function syncEmail(tx: Transaction, player: PlayerAuth, requestId: string): Promise<ActionResult> {
  if (!player.email) throw new GameError("Nenhum e-mail está vinculado a esta conta.");
  const p = await loadProfile(tx, player.uid);
  const profile: Profile = { ...p, accountEmail: player.email };
  writeProfile(tx, profileRef(player.uid), profile);
  tx.set(col("condado_email_index").doc(player.email), { userId: player.uid, playerId: p.player.id }, { merge: true });
  writeLedger(tx, player.uid, p.player.id, requestId, []);
  return { save: withoutMeta(profile) };
}

async function adminLookup(player: PlayerAuth, playerIdRaw: string): Promise<ActionResult> {
  if (!isAdmin(player.email)) throw new GameError("Sem permissão.");
  const playerId = playerIdRaw.trim().toUpperCase();
  const idx = await col("condado_player_index").doc(playerId).get();
  if (!idx.exists) throw new GameError("Jogador não encontrado.");
  const uid = String(idx.data()?.userId ?? "");
  const snap = await profileRef(uid).get();
  if (!snap.exists) throw new GameError("Jogador não encontrado.");
  const p = profileFromDoc(uid, snap.data() as DocumentData);
  const led = await col("condado_economy_ledger").where("userId", "==", uid).orderBy("timestamp", "desc").limit(50).get();
  const rows = led.docs.map((d) => {
    const r = d.data();
    return {
      type: r.type,
      currency: r.currency,
      amount: r.amount,
      balanceBefore: r.balanceBefore,
      balanceAfter: r.balanceAfter,
      source: r.source,
      timestamp: r.timestamp,
    };
  });
  return {
    lookup: {
      playerId: p.player.id,
      nick: p.player.nick,
      gold: p.gold,
      bread: p.bread,
      niens: p.niens,
      troopCards: p.troopCards,
      generalCards: p.generalCards,
      countyLevel: p.countyLevel,
      weekStars: p.weekStars,
      ledger: rows,
    },
  };
}

type AllianceDoc = {
  id: string;
  name: string;
  leaderId: string;
  leaderUid: string;
  minLevel: number;
  level: number;
  xp: number;
  members: Array<{ id: string; nick: string; uid: string }>;
  chat: ChatMsg[];
  warDay: string;
  foeId: string | null;
  foeName: string;
  ourPoints: number;
  theirPoints: number;
  participants: string[];
  sittingOut: boolean;
  resolved: boolean;
};

function allianceRef(id: string) {
  return col("condado_alliances").doc(id);
}

function allianceFromDoc(id: string, data: DocumentData): AllianceDoc {
  return {
    id,
    name: String(data.name ?? "Aliança"),
    leaderId: String(data.leaderId ?? ""),
    leaderUid: String(data.leaderUid ?? ""),
    minLevel: Number(data.minLevel ?? 3) === 5 ? 5 : 3,
    level: Math.max(1, Number(data.level ?? 1)),
    xp: Math.max(0, Number(data.xp ?? 0)),
    members: Array.isArray(data.members)
      ? data.members.map((m: { id?: string; nick?: string; uid?: string }) => ({
          id: String(m.id ?? ""),
          nick: String(m.nick ?? "Senhor"),
          uid: String(m.uid ?? ""),
        }))
      : [],
    chat: Array.isArray(data.chat) ? (data.chat as ChatMsg[]).slice(-40) : [],
    warDay: String(data.warDay ?? ""),
    foeId: (data.foeId as string | null) ?? null,
    foeName: String(data.foeName ?? ""),
    ourPoints: Number(data.ourPoints ?? 0),
    theirPoints: Number(data.theirPoints ?? 0),
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    sittingOut: !!data.sittingOut,
    resolved: !!data.resolved,
  };
}

function allianceStateOf(a: AllianceDoc): AllianceState {
  return {
    id: a.id,
    name: a.name,
    members: a.members.map((m) => ({ id: m.id, nick: m.nick, uid: m.uid })),
    minLevel: a.minLevel,
    level: a.level,
    xp: a.xp,
    leaderId: a.leaderId,
    slots: allianceSlots(a.level),
  };
}

function warFromAlliance(a: AllianceDoc) {
  return {
    week: a.warDay,
    foeId: a.foeId,
    foeName: a.foeName,
    chest: ALLIANCE_WAR_CHEST,
    ourStars: a.ourPoints,
    theirStars: a.theirPoints,
    attacks: {} as Record<string, number>,
    sittingOut: a.sittingOut,
    resolved: a.resolved,
    participants: a.participants,
  };
}

type PayoutRow = { uid: string; profile: Profile; ledger: LedgerEntry[]; share: number };

async function readAlliancePayout(
  tx: Transaction,
  a: AllianceDoc,
): Promise<{ next: AllianceDoc; rows: PayoutRow[]; settled: boolean }> {
  const win = warWindow();
  if (!a.warDay || a.warDay === win.key || a.resolved) {
    return { next: a, rows: [], settled: false };
  }
  const won = !a.sittingOut && a.ourPoints > a.theirPoints;
  let xp = a.xp;
  let level = a.level;
  if (won) {
    const grown = applyAllianceXp(a.level, a.xp, 1000);
    xp = grown.xp;
    level = grown.level;
  }
  const rows: PayoutRow[] = [];
  const parts = a.participants.filter(Boolean);
  const share = won && parts.length ? Math.floor(ALLIANCE_WAR_CHEST / parts.length) : 0;
  if (share) {
    for (const pid of parts) {
      const member = a.members.find((m) => m.id === pid);
      let uid = member?.uid ? String(member.uid) : "";
      if (!uid) {
        const idx = await tx.get(col("condado_player_index").doc(pid));
        uid = idx.exists ? String(idx.data()?.userId ?? "") : "";
      }
      if (!uid) continue;
      const snap = await tx.get(profileRef(uid));
      if (!snap.exists) continue;
      const p = profileFromDoc(uid, snap.data() as DocumentData);
      rows.push({
        uid,
        profile: { ...p, gold: p.gold + share },
        ledger: [
          {
            type: "alliance_war_chest",
            currency: "gold",
            amount: share,
            balanceBefore: p.gold,
            balanceAfter: p.gold + share,
            source: a.id,
          },
        ],
        share,
      });
    }
  }
  return { next: { ...a, xp, level, resolved: true }, rows, settled: true };
}

function writeAlliancePayout(tx: Transaction, rows: PayoutRow[], requestId: string, exceptUid?: string) {
  for (const row of rows) {
    if (exceptUid && row.uid === exceptUid) continue;
    writeProfile(tx, profileRef(row.uid), row.profile);
    writeLedger(tx, row.uid, row.profile.player.id, requestId, row.ledger);
  }
}

async function foundAllianceAction(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const name = String(payload.name ?? "").trim().replace(/\s+/g, " ").slice(0, 22);
  if (name.length < 3) throw new GameError("O nome da aliança precisa de ao menos 3 letras.");
  const minLevel = Number(payload.minLevel) === 5 ? 5 : 3;
  const prep = await preparePlayer(tx, player.uid);
  if (prep.profile.alliance) throw new GameError("Já tens aliança.");
  if (prep.profile.gold < ALLIANCE_FOUND_GOLD) throw new GameError(`Precisa de 5.000.000 de Libras.`);
  const nameRef = col("condado_alliance_names").doc(name.toLowerCase());
  const taken = await tx.get(nameRef);
  if (taken.exists) throw new GameError("Este nome de aliança já está em uso.");
  const id = makeId("AL");
  const aref = allianceRef(id);
  const member = { id: prep.profile.player.id, nick: prep.profile.player.nick, uid: player.uid };
  const doc: AllianceDoc = {
    id,
    name,
    leaderId: prep.profile.player.id,
    leaderUid: player.uid,
    minLevel,
    level: 1,
    xp: 0,
    members: [member],
    chat: [],
    warDay: "",
    foeId: null,
    foeName: "",
    ourPoints: 0,
    theirPoints: 0,
    participants: [],
    sittingOut: false,
    resolved: true,
  };
  const gold = prep.profile.gold - ALLIANCE_FOUND_GOLD;
  const profile: Profile = {
    ...prep.profile,
    gold,
    alliance: allianceStateOf(doc),
    allianceChat: [],
  };
  const ledger: LedgerEntry[] = [
    {
      type: "found_alliance",
      currency: "gold",
      amount: -ALLIANCE_FOUND_GOLD,
      balanceBefore: prep.profile.gold,
      balanceAfter: gold,
      source: id,
    },
  ];
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...ledger], prep.creditRefs);
  tx.set(nameRef, { allianceId: id, name });
  tx.set(aref, { ...doc, createdAt: new Date().toISOString() });
  return { save: withoutMeta(profile), toast: `Aliança ${name} fundada. Entrada a partir do condado ${minLevel}.` };
}

async function joinAllianceAction(
  tx: Transaction,
  player: PlayerAuth,
  allianceIdRaw: string,
  requestId: string,
): Promise<ActionResult> {
  const allianceId = allianceIdRaw.trim();
  if (!allianceId) throw new GameError("Aliança inválida.");
  const prep = await preparePlayer(tx, player.uid);
  if (prep.profile.alliance) throw new GameError("Já tens aliança.");
  const aref = allianceRef(allianceId);
  const asnap = await tx.get(aref);
  if (!asnap.exists) throw new GameError("Aliança não encontrada.");
  const a = allianceFromDoc(allianceId, asnap.data() as DocumentData);
  if (prep.profile.countyLevel < a.minLevel) {
    throw new GameError(`Esta aliança pede condado nível ${a.minLevel}.`);
  }
  if (a.members.length >= allianceSlots(a.level)) throw new GameError("Aliança lotada.");
  if (a.members.some((m) => m.id === prep.profile.player.id)) throw new GameError("Já estás nesta aliança.");
  a.members.push({ id: prep.profile.player.id, nick: prep.profile.player.nick, uid: player.uid });
  const profile: Profile = {
    ...prep.profile,
    alliance: allianceStateOf(a),
    allianceChat: a.chat,
    war: warFromAlliance(a),
  };
  commitPrepared(tx, player.uid, profile, requestId, prep.ledger, prep.creditRefs);
  tx.set(aref, { members: a.members }, { merge: true });
  return { save: withoutMeta(profile), toast: `Entraste em ${a.name}.` };
}

async function leaveAllianceAction(
  tx: Transaction,
  player: PlayerAuth,
  requestId: string,
): Promise<ActionResult> {
  const prep = await preparePlayer(tx, player.uid);
  if (!prep.profile.alliance) throw new GameError("Sem aliança.");
  const aref = allianceRef(prep.profile.alliance.id);
  const asnap = await tx.get(aref);
  const profile: Profile = { ...prep.profile, alliance: null, war: null, allianceChat: [] };
  commitPrepared(tx, player.uid, profile, requestId, prep.ledger, prep.creditRefs);
  if (asnap.exists) {
    const a = allianceFromDoc(asnap.id, asnap.data() as DocumentData);
    const members = a.members.filter((m) => m.id !== prep.profile.player.id);
    if (!members.length) {
      tx.delete(aref);
      tx.delete(col("condado_alliance_names").doc(a.name.toLowerCase()));
    } else {
      const leaderId = a.leaderId === prep.profile.player.id ? members[0]!.id : a.leaderId;
      const leaderUid = a.leaderId === prep.profile.player.id ? members[0]!.uid : a.leaderUid;
      tx.set(aref, { members, leaderId, leaderUid }, { merge: true });
    }
  }
  return { save: withoutMeta(profile), toast: "Saíste da aliança." };
}

async function recruitAllianceAction(
  tx: Transaction,
  player: PlayerAuth,
  requestId: string,
): Promise<ActionResult> {
  const p = await loadProfile(tx, player.uid);
  if (!p.alliance) throw new GameError("Sem aliança.");
  if (p.alliance.leaderId !== p.player.id) throw new GameError("Só o fundador envia recrutamento.");
  const now = Date.now();
  tx.set(col("condado_chat").doc(), {
    fromUserId: player.uid,
    fromPlayerId: p.player.id,
    fromId: p.player.id,
    fromNick: p.player.nick,
    text: `Recruta: ${p.alliance.name} · condado ${p.alliance.minLevel}+ · ${p.alliance.members.length}/${p.alliance.slots} vagas`,
    at: now,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CHAT_TTL_MS).toISOString(),
    channel: "global",
    recruitAllianceId: p.alliance.id,
    recruitMinLevel: p.alliance.minLevel,
  });
  writeLedger(tx, player.uid, p.player.id, requestId, []);
  return { save: withoutMeta(p), toast: "Pedido de recrutamento no chat global." };
}

async function sendAlliance(
  tx: Transaction,
  player: PlayerAuth,
  textRaw: string,
  requestId: string,
): Promise<ActionResult> {
  const text = textRaw.trim().slice(0, 160);
  if (!text) throw new GameError("Mensagem vazia.");
  const p = await loadProfile(tx, player.uid);
  if (!p.alliance) throw new GameError("Sem aliança.");
  const aref = allianceRef(p.alliance.id);
  const asnap = await tx.get(aref);
  if (!asnap.exists) throw new GameError("Aliança não encontrada.");
  const a = allianceFromDoc(asnap.id, asnap.data() as DocumentData);
  const msg: ChatMsg = {
    id: makeId("m"),
    fromId: p.player.id,
    fromNick: p.player.nick,
    text,
    at: Date.now(),
    self: true,
    channel: "alliance",
  };
  const chat = [...a.chat, { ...msg, self: false }].slice(-40);
  const profile: Profile = { ...p, allianceChat: [...p.allianceChat, msg].slice(-40), alliance: allianceStateOf({ ...a, chat }) };
  writeProfile(tx, profileRef(player.uid), profile);
  tx.set(aref, { chat }, { merge: true });
  writeLedger(tx, player.uid, p.player.id, requestId, []);
  return { save: withoutMeta(profile) };
}

async function pairAllianceWar(tx: Transaction, a: AllianceDoc): Promise<{ next: AllianceDoc; foe?: AllianceDoc; queueRef: DocumentReference; waiting: string[] }> {
  const win = warWindow();
  const qref = col("condado_war_queue").doc(win.key);
  const qsnap = await tx.get(qref);
  const waiting: string[] = Array.isArray(qsnap.data()?.waiting) ? qsnap.data()!.waiting.map(String) : [];
  if (a.warDay === win.key && !a.resolved) {
    let foe: AllianceDoc | undefined;
    if (a.foeId) {
      const foeSnap = await tx.get(allianceRef(a.foeId));
      if (foeSnap.exists) foe = allianceFromDoc(foeSnap.id, foeSnap.data() as DocumentData);
    }
    return { next: a, foe, queueRef: qref, waiting };
  }
  const filtered = waiting.filter((id) => id !== a.id);
  if (!filtered.length) {
    const next: AllianceDoc = {
      ...a,
      warDay: win.key,
      foeId: null,
      foeName: "",
      ourPoints: 0,
      theirPoints: 0,
      participants: [],
      sittingOut: true,
      resolved: false,
    };
    return { next, queueRef: qref, waiting: [...filtered, a.id] };
  }
  const foeId = filtered[0]!;
  const foeSnap = await tx.get(allianceRef(foeId));
  if (!foeSnap.exists) {
    const next: AllianceDoc = {
      ...a,
      warDay: win.key,
      foeId: null,
      foeName: "",
      ourPoints: 0,
      theirPoints: 0,
      participants: [],
      sittingOut: true,
      resolved: false,
    };
    return { next, queueRef: qref, waiting: [...filtered.slice(1), a.id] };
  }
  const foe = allianceFromDoc(foeId, foeSnap.data() as DocumentData);
  const next: AllianceDoc = {
    ...a,
    warDay: win.key,
    foeId: foe.id,
    foeName: foe.name,
    ourPoints: 0,
    theirPoints: 0,
    participants: [],
    sittingOut: false,
    resolved: false,
  };
  return { next, foe, queueRef: qref, waiting: filtered.slice(1) };
}

async function listAllianceFoesAction(player: PlayerAuth): Promise<ActionResult> {
  const meSnap = await profileRef(player.uid).get();
  if (!meSnap.exists) return { foes: [] };
  const me = profileFromDoc(player.uid, meSnap.data() as DocumentData);
  if (!me.alliance) return { foes: [] };
  const aSnap = await allianceRef(me.alliance.id).get();
  if (!aSnap.exists) return { foes: [] };
  const a = allianceFromDoc(aSnap.id, aSnap.data() as DocumentData);
  if (!a.foeId || a.sittingOut) return { foes: [], save: { ...withoutMeta(me), alliance: allianceStateOf(a), war: warFromAlliance(a) } };
  const foeSnap = await allianceRef(a.foeId).get();
  if (!foeSnap.exists) return { foes: [] };
  const foe = allianceFromDoc(foeSnap.id, foeSnap.data() as DocumentData);
  const foes: Lord[] = [];
  for (const m of foe.members) {
    if (!m.uid) continue;
    const ps = await profileRef(m.uid).get();
    const level = ps.exists ? Number(ps.data()?.countyLevel ?? 1) : 1;
    foes.push({
      id: m.id,
      nick: m.nick,
      title: `Aliança ${foe.name}`,
      rank: level,
      lootGold: 0,
      lootBread: 0,
      allianceId: foe.id,
      countyLevel: level,
      real: true,
    });
  }
  return { foes, save: { ...withoutMeta(me), alliance: allianceStateOf(a), war: warFromAlliance(a), allianceChat: a.chat } };
}

async function startAllianceDuelAction(
  tx: Transaction,
  player: PlayerAuth,
  targetId: string,
  requestId: string,
): Promise<ActionResult> {
  const prep = await preparePlayer(tx, player.uid);
  if (!prep.profile.alliance) throw new GameError("Sem aliança.");
  const armyN =
    prep.profile.army.infantry +
    prep.profile.army.archers +
    prep.profile.army.cavalry +
    prep.profile.army.general +
    prep.profile.army.generaless +
    prep.profile.army.defender;
  if (armyN <= 0) throw new GameError("Sem tropas no acampamento.");
  const aref = allianceRef(prep.profile.alliance.id);
  const asnap = await tx.get(aref);
  if (!asnap.exists) throw new GameError("Aliança não encontrada.");
  let a = allianceFromDoc(asnap.id, asnap.data() as DocumentData);
  const win = warWindow();
  const payout = await readAlliancePayout(tx, a);
  a = payout.next;
  const mine = payout.rows.find((row) => row.uid === player.uid);
  let baseProfile: Profile = mine ? { ...prep.profile, gold: mine.profile.gold } : prep.profile;
  const extraLedger = mine ? mine.ledger : [];
  const paired = await pairAllianceWar(tx, a);
  a = paired.next;
  const idx = await tx.get(col("condado_player_index").doc(targetId));
  if (!idx.exists) throw new GameError("Alvo não encontrado.");
  const toUid = String(idx.data()?.userId ?? "");
  const destSnap = await tx.get(profileRef(toUid));
  if (!destSnap.exists) throw new GameError("Alvo não encontrado.");
  const dest = profileFromDoc(toUid, destSnap.data() as DocumentData);
  if (payout.settled) writeAlliancePayout(tx, payout.rows, requestId, player.uid);
  if (a.sittingOut || !a.foeId) {
    tx.set(paired.queueRef, { waiting: paired.waiting, day: win.key }, { merge: true });
    tx.set(aref, {
      warDay: a.warDay,
      foeId: a.foeId,
      foeName: a.foeName,
      ourPoints: a.ourPoints,
      theirPoints: a.theirPoints,
      participants: a.participants,
      sittingOut: a.sittingOut,
      resolved: a.resolved,
      xp: a.xp,
      level: a.level,
    }, { merge: true });
    const waitingProfile: Profile = { ...baseProfile, alliance: allianceStateOf(a), war: warFromAlliance(a) };
    commitPrepared(tx, player.uid, waitingProfile, requestId, [...prep.ledger, ...extraLedger], prep.creditRefs);
    return { save: withoutMeta(waitingProfile), toast: "À espera de um rival para a guerra de hoje. Tenta de novo em instantes." };
  }
  if (dest.alliance?.id !== a.foeId) throw new GameError("Este senhor não está na aliança rival.");
  const used = baseProfile.war?.attacks[dest.player.id] ?? 0;
  if (used >= 2) throw new GameError("No máximo 2 duelos por rival neste dia.");
  const sessionId = makeId("AW");
  const war = {
    ...warFromAlliance(a),
    attacks: { ...(baseProfile.war?.attacks ?? {}), [dest.player.id]: used + 1 },
  };
  const profile: Profile = { ...baseProfile, alliance: allianceStateOf(a), war };
  tx.set(paired.queueRef, { waiting: paired.waiting, day: win.key }, { merge: true });
  tx.set(aref, {
    warDay: a.warDay,
    foeId: a.foeId,
    foeName: a.foeName,
    ourPoints: a.ourPoints,
    theirPoints: a.theirPoints,
    participants: a.participants,
    sittingOut: false,
    resolved: false,
    xp: a.xp,
    level: a.level,
  }, { merge: true });
  if (paired.foe) {
    tx.set(allianceRef(paired.foe.id), {
      warDay: win.key,
      foeId: a.id,
      foeName: a.name,
      sittingOut: false,
      resolved: false,
    }, { merge: true });
  }
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...extraLedger], prep.creditRefs);
  tx.set(col("condado_raid_sessions").doc(sessionId), {
    kind: "alliance",
    attackerUid: player.uid,
    defenderUid: toUid,
    defenderId: dest.player.id,
    defenderNick: dest.player.nick,
    allianceId: a.id,
    foeAllianceId: a.foeId,
    startedArmy: prep.profile.army,
    foeArmy: dest.army,
    foeLevels: dest.troopLevels,
    foeCamp: dest.campLevel,
    createdAt: Date.now(),
    open: true,
  });
  return {
    save: withoutMeta(profile),
    sessionId,
    nick: dest.player.nick,
    foeArmy: dest.army,
    foeLevels: dest.troopLevels,
    foeCamp: dest.campLevel,
  };
}

async function finishAllianceDuelAction(
  tx: Transaction,
  player: PlayerAuth,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<ActionResult> {
  const sessionId = String(payload.sessionId ?? "");
  const sessionRef = col("condado_raid_sessions").doc(sessionId);
  const sessionSnap = await tx.get(sessionRef);
  if (!sessionSnap.exists) throw new GameError("Duelo inválido.");
  const session = sessionSnap.data() as DocumentData;
  if (session.attackerUid !== player.uid || session.kind !== "alliance") throw new GameError("Duelo inválido.");
  if (!session.open) throw new GameError("Este duelo já foi resolvido.");
  const won = Boolean(payload.won);
  const retreated = Boolean(payload.retreated);
  const prep = await preparePlayer(tx, player.uid);
  const aref = allianceRef(String(session.allianceId));
  const asnap = await tx.get(aref);
  const foeRef = allianceRef(String(session.foeAllianceId));
  const foeSnap = await tx.get(foeRef);
  const bonus = won && !retreated ? duelGold(sessionId) : 0;
  const ourAdd = won && !retreated ? 3 : 1;
  const theirAdd = won && !retreated ? 1 : 3;
  let a = asnap.exists ? allianceFromDoc(asnap.id, asnap.data() as DocumentData) : null;
  if (a) {
    const participants = a.participants.includes(prep.profile.player.id)
      ? a.participants
      : [...a.participants, prep.profile.player.id];
    a = { ...a, ourPoints: a.ourPoints + ourAdd, theirPoints: a.theirPoints + theirAdd, participants };
    tx.set(
      aref,
      { ourPoints: a.ourPoints, theirPoints: a.theirPoints, participants },
      { merge: true },
    );
  }
  if (foeSnap.exists) {
    const foe = allianceFromDoc(foeSnap.id, foeSnap.data() as DocumentData);
    tx.set(
      foeRef,
      { ourPoints: foe.ourPoints + theirAdd, theirPoints: foe.theirPoints + ourAdd },
      { merge: true },
    );
  }
  const startedArmy = session.startedArmy as ArmyCounts;
  const survivors = (payload.survivors ?? {}) as ArmyCounts;
  const army = {
    infantry: prep.profile.army.infantry - (startedArmy.infantry ?? 0) + Math.min(startedArmy.infantry ?? 0, Math.max(0, survivors.infantry ?? 0)),
    archers: prep.profile.army.archers - (startedArmy.archers ?? 0) + Math.min(startedArmy.archers ?? 0, Math.max(0, survivors.archers ?? 0)),
    cavalry: prep.profile.army.cavalry - (startedArmy.cavalry ?? 0) + Math.min(startedArmy.cavalry ?? 0, Math.max(0, survivors.cavalry ?? 0)),
    general: Math.min(1, prep.profile.army.general - (startedArmy.general ?? 0) + Math.min(startedArmy.general ?? 0, Math.max(0, survivors.general ?? 0))),
    generaless: Math.min(1, prep.profile.army.generaless - (startedArmy.generaless ?? 0) + Math.min(startedArmy.generaless ?? 0, Math.max(0, survivors.generaless ?? 0))),
    defender: prep.profile.army.defender - (startedArmy.defender ?? 0) + Math.min(startedArmy.defender ?? 0, Math.max(0, survivors.defender ?? 0)),
  };
  const ledger: LedgerEntry[] = [];
  if (bonus) {
    ledger.push({
      type: "alliance_duel",
      currency: "gold",
      amount: bonus,
      balanceBefore: prep.profile.gold,
      balanceAfter: prep.profile.gold + bonus,
      source: String(session.defenderNick ?? "duelo"),
    });
  }
  const used = Math.max(prep.profile.war?.attacks[String(session.defenderId)] ?? 0, 1);
  const profile: Profile = {
    ...prep.profile,
    army,
    gold: prep.profile.gold + bonus,
    alliance: a ? allianceStateOf(a) : prep.profile.alliance,
    war: a
      ? {
          ...warFromAlliance(a),
          attacks: { ...(prep.profile.war?.attacks ?? {}), [String(session.defenderId)]: used },
        }
      : prep.profile.war,
  };
  commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...ledger], prep.creditRefs);
  tx.set(sessionRef, { open: false, won, bonus, resolvedAt: Date.now() }, { merge: true });
  const toast = won && !retreated
    ? `Vitória no campo. +3 pontos e ${bonus.toLocaleString("pt")} Libras.`
    : "Duelo encerrado. +1 ponto para o rival.";
  return { save: withoutMeta(profile), toast, duelGold: bonus };
}


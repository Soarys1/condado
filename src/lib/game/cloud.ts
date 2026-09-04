import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  setDoc,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { REFERRAL_GOLD, rankingWindow, weeklyPrize, type ResourceKind } from "./constants";
import { defaultSave, migrateCloud } from "./save";
import type { SaveState } from "./types";
import { botWeekBoard, findNick } from "./bots";
import { makeId } from "./world";

export type RankRow = {
  playerId: string;
  nick: string;
  stars: number;
  you?: boolean;
  bot?: boolean;
};
export type LedgerRow = {
  id: string;
  at: number;
  fromId: string;
  fromNick: string;
  toId: string;
  toNick: string;
  kind: ResourceKind;
  amount: number;
  incoming: boolean;
};
type Profile = SaveState & {
  userId: string;
  appliedTransferIds: string[];
};

const profilesCol = () => collection(db, "condado_profiles");
const transfersCol = () => collection(db, "condado_transfers");
const claimsCol = () => collection(db, "condado_week_claims");
const nickIndexCol = () => collection(db, "condado_nick_index");
const playerIndexCol = () => collection(db, "condado_player_index");

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Entre na tua conta para continuar.");
  return uid;
}

function firestoreError(error: unknown, fallback: string): Error {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "permission-denied") {
    return new Error(
      "O Firestore recusou o acesso. Confirme as regras publicadas e que está autenticado.",
    );
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return new Error("Firestore indisponível. Tente novamente em instantes.");
  }
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}

function kindField(
  kind: ResourceKind,
): keyof Pick<Profile, "gold" | "bread" | "niens" | "troopCards" | "generalCards"> {
  if (kind === "troopCards") return "troopCards";
  if (kind === "generalCards") return "generalCards";
  return kind;
}

function profileFromDoc(userId: string, data: Record<string, unknown>): Profile {
  const raw = (data.save as SaveState | undefined) ?? defaultSave(String(data.nick ?? "Senhor"));
  const save = migrateCloud({
    ...raw,
    player: {
      ...raw.player,
      id: String(data.playerId ?? raw.player.id),
      nick: String(data.nick ?? raw.player.nick),
    },
  });
  const applied = Array.isArray(data.appliedTransferIds)
    ? (data.appliedTransferIds as unknown[]).map(String)
    : [];
  return {
    ...save,
    userId,
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
    appliedTransferIds: applied,
  };
}

function profilePayload(save: SaveState, extra?: Partial<{ appliedTransferIds: string[]; accountEmail: string | null }>) {
  return {
    save: {
      ...save,
      chat: save.chat.slice(-40),
      allianceChat: save.allianceChat.slice(-40),
      raids: save.raids.slice(-12),
      ledger: save.ledger.slice(0, 40),
    },
    playerId: save.player.id,
    nick: save.player.nick,
    gold: save.gold,
    bread: save.bread,
    niens: save.niens,
    troopCards: save.troopCards,
    generalCards: save.generalCards,
    goldPending: 0,
    breadPending: 0,
    niensPending: 0,
    troopCardsPending: 0,
    generalCardsPending: 0,
    countyLevel: save.countyLevel,
    weekStars: save.weekStars,
    weekKey: save.weekKey,
    referredBy: save.referredBy ?? null,
    referralClaimed: save.referralClaimed ?? false,
    appliedTransferIds: extra?.appliedTransferIds ?? [],
    accountEmail: extra?.accountEmail ?? auth.currentUser?.email?.toLowerCase() ?? null,
    updatedAt: new Date().toISOString(),
  };
}

function withoutMeta(p: Profile): SaveState {
  const { userId: _u, appliedTransferIds: _a, ...save } = p;
  return save;
}

async function incomingTransfers(playerId: string) {
  try {
    const snap = await getDocs(query(transfersCol(), where("toPlayerId", "==", playerId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

function applyIncoming(p: Profile, incoming: Array<{ id: string } & Record<string, unknown>>): Profile {
  const seen = new Set(p.appliedTransferIds);
  let gold = p.gold;
  let bread = p.bread;
  let niens = p.niens;
  let troopCards = p.troopCards;
  let generalCards = p.generalCards;
  const applied = [...p.appliedTransferIds];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    if (String(row.fromPlayerId ?? "") === p.player.id) continue;
    const kind = row.kind as ResourceKind;
    const amount = Number(row.amount ?? 0);
    if (amount <= 0) continue;
    if (kind === "gold") gold += amount;
    else if (kind === "bread") bread += amount;
    else if (kind === "niens") niens += amount;
    else if (kind === "troopCards") troopCards += amount;
    else if (kind === "generalCards") generalCards += amount;
    applied.push(row.id);
    seen.add(row.id);
  }
  return {
    ...p,
    gold,
    bread,
    niens,
    troopCards,
    generalCards,
    appliedTransferIds: applied.slice(-200),
  };
}

export async function syncAccountEmail() {
  const uid = requireUid();
  const email = auth.currentUser?.email?.trim().toLowerCase();
  if (!email) throw new Error("Nenhum e-mail está vinculado a esta conta.");
  const ref = doc(profilesCol(), uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Crie o condado antes de vincular o e-mail.");
  await setDoc(ref, { accountEmail: email, updatedAt: new Date().toISOString() }, { merge: true });
  return { email };
}

export async function pullCloud() {
  const uid = requireUid();
  const ref = doc(profilesCol(), uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { save: null as SaveState | null };
  let profile = profileFromDoc(uid, snap.data() as Record<string, unknown>);
  const incoming = await incomingTransfers(profile.player.id);
  const next = applyIncoming(profile, incoming);
  await setDoc(ref, profilePayload(withoutMeta(next), { appliedTransferIds: next.appliedTransferIds }), {
    merge: true,
  });
  return { save: withoutMeta(next) };
}

export async function createProfile(input: { nick: string; referredBy?: string | null }) {
  const uid = requireUid();
  const nick = input.nick.trim().slice(0, 18);
  if (nick.length < 3) throw new Error("O nome do condado precisa de ao menos 3 letras.");
  const save = defaultSave(nick, input.referredBy?.trim().toUpperCase() || null);
  const ref = doc(profilesCol(), uid);
  const nickRef = doc(nickIndexCol(), nick.toLowerCase());
  const playerRef = doc(playerIndexCol(), save.player.id);
  try {
    const result = await runTransaction(db, async (tx: Transaction) => {
      const [existing, taken] = await Promise.all([tx.get(ref), tx.get(nickRef)]);
      if (existing.exists()) return withoutMeta(profileFromDoc(uid, existing.data() as Record<string, unknown>));
      if (taken.exists()) throw new Error("Este nome de condado já está em uso.");
      tx.set(ref, profilePayload(save, { appliedTransferIds: [] }));
      tx.set(nickRef, { userId: uid, playerId: save.player.id });
      tx.set(playerRef, { userId: uid, nick: save.player.nick });
      return save;
    });
    return { save: result };
  } catch (error) {
    throw firestoreError(error, "Não foi possível fundar o condado.");
  }
}

export async function pushCloud(data: SaveState) {
  const uid = requireUid();
  const ref = doc(profilesCol(), uid);
  try {
    return await runTransaction(db, async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        return {
          ok: true as const,
          gold: data.gold,
          bread: data.bread,
          niens: data.niens,
          troopCards: data.troopCards,
          generalCards: data.generalCards,
        };
      }
      const old = profileFromDoc(uid, snap.data() as Record<string, unknown>);
      const incoming = [] as Array<{ id: string } & Record<string, unknown>>;
      const next = applyIncoming(
        { ...old, ...data, player: { ...old.player, ...data.player }, appliedTransferIds: old.appliedTransferIds },
        incoming,
      );
      tx.set(ref, profilePayload(withoutMeta(next), { appliedTransferIds: next.appliedTransferIds }), { merge: true });
      return {
        ok: true as const,
        gold: next.gold,
        bread: next.bread,
        niens: next.niens,
        troopCards: next.troopCards,
        generalCards: next.generalCards,
      };
    });
  } catch (error) {
    throw firestoreError(error, "Não foi possível guardar o condado.");
  }
}

export async function renameCounty(nickRaw: string) {
  const uid = requireUid();
  const nick = nickRaw.trim().slice(0, 18);
  if (nick.length < 3) throw new Error("Nome curto demais.");
  const ref = doc(profilesCol(), uid);
  const newIndex = doc(nickIndexCol(), nick.toLowerCase());
  try {
    return await runTransaction(db, async (tx: Transaction) => {
      const current = await tx.get(ref);
      const taken = await tx.get(newIndex);
      if (!current.exists()) throw new Error("Condado não encontrado.");
      if (taken.exists() && taken.data()?.userId !== uid) throw new Error("Este nome de condado já está em uso.");
      const p = profileFromDoc(uid, current.data() as Record<string, unknown>);
      const oldIndex = doc(nickIndexCol(), p.player.nick.toLowerCase());
      tx.delete(oldIndex);
      tx.set(newIndex, { userId: uid, playerId: p.player.id });
      tx.set(doc(playerIndexCol(), p.player.id), { userId: uid, nick }, { merge: true });
      tx.set(
        ref,
        {
          nick,
          save: { ...p, player: { ...p.player, nick } },
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { nick };
    });
  } catch (error) {
    throw firestoreError(error, "Este nome já está em uso.");
  }
}

export async function peekPlayer(idRaw: string) {
  const id = idRaw.trim().toUpperCase();
  const npc = findNick(id);
  if (npc) return { id, nick: npc };
  const snap = await getDoc(doc(playerIndexCol(), id));
  return snap.exists() ? { id, nick: String(snap.data()?.nick) } : { id, nick: null as string | null };
}

export async function cloudTransfer(data: { toId: string; amount: number; kind: ResourceKind }) {
  const uid = requireUid();
  const amount = Math.floor(data.amount);
  const toId = data.toId.trim().toUpperCase();
  if (amount <= 0) throw new Error("Quantia inválida.");
  const meRef = doc(profilesCol(), uid);
  const destRef = doc(playerIndexCol(), toId);
  const txRef = doc(transfersCol(), makeId("TX"));
  try {
    return await runTransaction(db, async (tx: Transaction) => {
      const [meSnap, destIndex] = await Promise.all([tx.get(meRef), tx.get(destRef)]);
      if (!meSnap.exists()) throw new Error("Condado não encontrado.");
      const me = profileFromDoc(uid, meSnap.data() as Record<string, unknown>);
      if (toId === me.player.id) throw new Error("Não envie para si mesmo.");
      const field = kindField(data.kind);
      if (amount > Number(me[field])) throw new Error("Quantia inválida.");
      const toNick = destIndex.exists() ? String(destIndex.data()?.nick ?? "") : findNick(toId);
      if (!toNick) throw new Error("ID não encontrado. Cole e confira o nick.");
      const next = { ...me, [field]: Number(me[field]) - amount } as Profile;
      const now = new Date().toISOString();
      tx.set(meRef, profilePayload(withoutMeta(next), { appliedTransferIds: me.appliedTransferIds }), { merge: true });
      tx.set(txRef, {
        fromUserId: uid,
        fromPlayerId: me.player.id,
        fromNick: me.player.nick,
        toPlayerId: toId,
        toNick,
        kind: data.kind,
        amount,
        createdAt: now,
      });
      return {
        ok: true as const,
        toNick,
        at: Date.parse(now),
        id: txRef.id,
        gold: next.gold,
        bread: next.bread,
        niens: next.niens,
        troopCards: next.troopCards,
        generalCards: next.generalCards,
      };
    });
  } catch (error) {
    throw firestoreError(error, "Falha no envio.");
  }
}

export async function listTransfers() {
  const uid = requireUid();
  const me = await getDoc(doc(profilesCol(), uid));
  if (!me.exists()) return { rows: [] as LedgerRow[] };
  const pid = String(me.data()?.playerId ?? "");
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(query(transfersCol(), where("fromPlayerId", "==", pid))),
    getDocs(query(transfersCol(), where("toPlayerId", "==", pid))),
  ]);
  const docs = [...fromSnap.docs, ...toSnap.docs]
    .sort((a, b) => String(b.data().createdAt ?? "").localeCompare(String(a.data().createdAt ?? "")))
    .slice(0, 40);
  return {
    rows: docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        at: Date.parse(String(r.createdAt)) || Date.now(),
        fromId: String(r.fromPlayerId),
        fromNick: String(r.fromNick),
        toId: String(r.toPlayerId),
        toNick: String(r.toNick),
        kind: r.kind as ResourceKind,
        amount: Number(r.amount),
        incoming: r.toPlayerId === pid && r.fromPlayerId !== pid,
      };
    }),
  };
}

async function boardFor(uid: string, win: ReturnType<typeof rankingWindow>) {
  const me = await getDoc(doc(profilesCol(), uid));
  const you = me.exists() ? profileFromDoc(uid, me.data() as Record<string, unknown>) : null;
  let snaps: Array<Record<string, unknown> & { playerId?: string }> = [];
  try {
    const q = query(profilesCol(), where("weekKey", "==", win.key));
    const got = await getDocs(q);
    snaps = got.docs.map((d) => d.data() as Record<string, unknown>);
  } catch {
    const got = await getDocs(profilesCol());
    snaps = got.docs
      .map((d) => d.data() as Record<string, unknown>)
      .filter((r) => String(r.weekKey ?? "") === win.key);
  }
  const byId = new Map<string, RankRow>();
  for (const b of botWeekBoard(win.key)) byId.set(b.playerId, { ...b, bot: true });
  for (const r of snaps) {
    byId.set(String(r.playerId), {
      playerId: String(r.playerId),
      nick: String(r.nick),
      stars: Number(r.weekStars ?? 0),
      you: you?.player.id === r.playerId,
    });
  }
  if (you && you.weekKey === win.key && !byId.has(you.player.id)) {
    byId.set(you.player.id, {
      playerId: you.player.id,
      nick: you.player.nick,
      stars: you.weekStars,
      you: true,
    });
  }
  const board = [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, 20);
  const yourRank = board.findIndex((r) => r.you) + 1;
  const claim = await getDoc(doc(claimsCol(), `${uid}_${win.key}`));
  return { board, yourRank, claimed: claim.exists() };
}

export async function weeklyBoard() {
  const uid = requireUid();
  const win = rankingWindow();
  return { ...(await boardFor(uid, win)), week: win };
}

export async function claimWeekly() {
  const uid = requireUid();
  const win = rankingWindow();
  if (!win.claim) throw new Error("O prêmio abre domingo às 23h de Brasília.");
  const { yourRank: rank } = await boardFor(uid, win);
  const prize = weeklyPrize(rank);
  if (!prize) throw new Error("Fora do top 20 desta semana.");
  const claimRef = doc(claimsCol(), `${uid}_${win.key}`);
  const profileRef = doc(profilesCol(), uid);
  try {
    await runTransaction(db, async (tx: Transaction) => {
      const [c, p] = await Promise.all([tx.get(claimRef), tx.get(profileRef)]);
      if (c.exists()) throw new Error("Prêmio já recolhido.");
      if (!p.exists()) throw new Error("Condado não encontrado.");
      tx.set(claimRef, {
        userId: uid,
        weekKey: win.key,
        rank,
        claimedAt: new Date().toISOString(),
      });
      const cur = profileFromDoc(uid, p.data() as Record<string, unknown>);
      const next = {
        ...cur,
        gold: cur.gold + prize.gold,
        troopCards: cur.troopCards + prize.troopCards,
        generalCards: cur.generalCards + prize.generalCards,
      };
      tx.set(profileRef, profilePayload(withoutMeta(next), { appliedTransferIds: cur.appliedTransferIds }), {
        merge: true,
      });
    });
  } catch (error) {
    throw firestoreError(error, "Não foi possível recolher o prêmio.");
  }
  return { rank, prize };
}

export async function creditReferral() {
  const uid = requireUid();
  const meRef = doc(profilesCol(), uid);
  try {
    return await runTransaction(db, async (tx: Transaction) => {
      const meSnap = await tx.get(meRef);
      if (!meSnap.exists()) return { granted: false as const };
      const me = profileFromDoc(uid, meSnap.data() as Record<string, unknown>);
      if (me.referralClaimed || me.countyLevel < 3 || !me.referredBy) return { granted: false as const };
      const refIndex = await tx.get(doc(playerIndexCol(), me.referredBy));
      const next = { ...me, gold: me.gold + REFERRAL_GOLD, referralClaimed: true };
      tx.set(meRef, profilePayload(withoutMeta(next), { appliedTransferIds: me.appliedTransferIds }), { merge: true });
      if (refIndex.exists()) {
        const toPlayerId = me.referredBy;
        const toNick = String(refIndex.data()?.nick ?? "");
        const grantRef = doc(transfersCol(), makeId("RF"));
        tx.set(grantRef, {
          fromUserId: uid,
          fromPlayerId: me.player.id,
          fromNick: me.player.nick,
          toPlayerId,
          toNick,
          kind: "gold",
          amount: REFERRAL_GOLD,
          createdAt: new Date().toISOString(),
          referral: true,
        });
      }
      return { granted: true as const, gold: REFERRAL_GOLD };
    });
  } catch (error) {
    throw firestoreError(error, "Não foi possível creditar o convite.");
  }
}

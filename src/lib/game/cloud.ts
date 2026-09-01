import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getAdminFirestore } from "@/lib/firebase-admin.server";
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
  goldPending: number;
  breadPending: number;
  niensPending: number;
  troopCardsPending: number;
  generalCardsPending: number;
};

const profiles = () => getAdminFirestore().collection("condado_profiles");
const transfers = () => getAdminFirestore().collection("condado_transfers");
const claims = () => getAdminFirestore().collection("condado_week_claims");
const nickIndex = () => getAdminFirestore().collection("condado_nick_index");
const playerIndex = () => getAdminFirestore().collection("condado_player_index");

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
  return {
    ...save,
    userId,
    gold: Number(data.gold ?? save.gold),
    bread: Number(data.bread ?? save.bread),
    niens: Number(data.niens ?? save.niens),
    troopCards: Number(data.troopCards ?? save.troopCards),
    generalCards: Number(data.generalCards ?? save.generalCards),
    countyLevel: Number(data.countyLevel ?? save.countyLevel),
    weekStars: Number(data.weekStars ?? save.weekStars),
    weekKey: String(data.weekKey ?? save.weekKey),
    referredBy: (data.referredBy as string | null | undefined) ?? save.referredBy,
    referralClaimed: Boolean(data.referralClaimed ?? save.referralClaimed),
    goldPending: Number(data.goldPending ?? 0),
    breadPending: Number(data.breadPending ?? 0),
    niensPending: Number(data.niensPending ?? 0),
    troopCardsPending: Number(data.troopCardsPending ?? 0),
    generalCardsPending: Number(data.generalCardsPending ?? 0),
  };
}

function profileData(save: SaveState, pending?: Partial<Profile>) {
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
    countyLevel: save.countyLevel,
    weekStars: save.weekStars,
    weekKey: save.weekKey,
    referredBy: save.referredBy ?? null,
    referralClaimed: save.referralClaimed ?? false,
    goldPending: pending?.goldPending ?? 0,
    breadPending: pending?.breadPending ?? 0,
    niensPending: pending?.niensPending ?? 0,
    troopCardsPending: pending?.troopCardsPending ?? 0,
    generalCardsPending: pending?.generalCardsPending ?? 0,
    updatedAt: new Date().toISOString(),
  };
}

function flushPending(p: Profile): Profile {
  return {
    ...p,
    gold: p.gold + p.goldPending,
    bread: p.bread + p.breadPending,
    niens: p.niens + p.niensPending,
    troopCards: p.troopCards + p.troopCardsPending,
    generalCards: p.generalCards + p.generalCardsPending,
    goldPending: 0,
    breadPending: 0,
    niensPending: 0,
    troopCardsPending: 0,
    generalCardsPending: 0,
  };
}

function withoutMeta(p: Profile): SaveState {
  const {
    userId: _u,
    goldPending: _g,
    breadPending: _b,
    niensPending: _n,
    troopCardsPending: _t,
    generalCardsPending: _gc,
    ...save
  } = p;
  return save;
}

export const pullCloud = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = getAdminFirestore();
    const ref = profiles().doc(context.userId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const next = flushPending(profileFromDoc(context.userId, snap.data()!));
      tx.set(ref, profileData(withoutMeta(next), next), { merge: true });
      return withoutMeta(next);
    });
    return { save: result };
  });

export const createProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { nick: string; referredBy?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const nick = data.nick.trim().slice(0, 18);
    if (nick.length < 3) throw new Error("O nome do condado precisa de ao menos 3 letras.");
    const ref = profiles().doc(context.userId);
    const nickRef = nickIndex().doc(nick.toLowerCase());
    const save = defaultSave(nick, data.referredBy?.trim().toUpperCase() || null);
    const db = getAdminFirestore();
    const result = await db.runTransaction(async (tx) => {
      const [existing, taken] = await Promise.all([tx.get(ref), tx.get(nickRef)]);
      if (existing.exists) return withoutMeta(profileFromDoc(context.userId, existing.data()!));
      if (taken.exists) throw new Error("Este nome de condado já está em uso.");
      tx.set(ref, profileData(save));
      tx.set(nickRef, { userId: context.userId, playerId: save.player.id });
      tx.set(playerIndex().doc(save.player.id), { userId: context.userId, nick: save.player.nick });
      return save;
    });
    return { save: result };
  });

export const pushCloud = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: SaveState) => d)
  .handler(async ({ context, data }) => {
    const db = getAdminFirestore();
    const ref = profiles().doc(context.userId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists)
        return {
          ok: true as const,
          gold: data.gold,
          bread: data.bread,
          niens: data.niens,
          troopCards: data.troopCards,
          generalCards: data.generalCards,
        };
      const old = profileFromDoc(context.userId, snap.data()!);
      const next = flushPending({ ...old, ...data, player: { ...old.player, ...data.player } });
      tx.set(ref, profileData(withoutMeta(next), next), { merge: true });
      return {
        ok: true as const,
        gold: next.gold,
        bread: next.bread,
        niens: next.niens,
        troopCards: next.troopCards,
        generalCards: next.generalCards,
      };
    });
  });

export const renameCounty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((nick: string) => nick.trim().slice(0, 18))
  .handler(async ({ context, data: nick }) => {
    if (nick.length < 3) throw new Error("Nome curto demais.");
    const db = getAdminFirestore();
    const ref = profiles().doc(context.userId);
    const newIndex = nickIndex().doc(nick.toLowerCase());
    return db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const taken = await tx.get(newIndex);
      if (!current.exists) throw new Error("Condado não encontrado.");
      if (taken.exists && taken.data()?.userId !== context.userId)
        throw new Error("Este nome de condado já está em uso.");
      const p = profileFromDoc(context.userId, current.data()!);
      const oldIndex = nickIndex().doc(p.player.nick.toLowerCase());
      tx.delete(oldIndex);
      tx.set(newIndex, { userId: context.userId, playerId: p.player.id });
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
  });

export const peekPlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id.trim().toUpperCase())
  .handler(async ({ data: id }) => {
    const npc = findNick(id);
    if (npc) return { id, nick: npc };
    const snap = await playerIndex().doc(id).get();
    return snap.exists
      ? { id, nick: String(snap.data()?.nick) }
      : { id, nick: null as string | null };
  });

export const cloudTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { toId: string; amount: number; kind: ResourceKind }) => d)
  .handler(async ({ context, data }) => {
    const amount = Math.floor(data.amount);
    const toId = data.toId.trim().toUpperCase();
    if (amount <= 0) throw new Error("Quantia inválida.");
    const db = getAdminFirestore();
    const meRef = profiles().doc(context.userId);
    const destRef = playerIndex().doc(toId);
    const txRef = transfers().doc(makeId("TX"));
    return db.runTransaction(async (tx) => {
      const [meSnap, destIndex] = await Promise.all([tx.get(meRef), tx.get(destRef)]);
      if (!meSnap.exists) throw new Error("Condado não encontrado.");
      const me = flushPending(profileFromDoc(context.userId, meSnap.data()!));
      if (toId === me.player.id) throw new Error("Não envie para si mesmo.");
      const field = kindField(data.kind);
      if (amount > Number(me[field])) throw new Error("Quantia inválida.");
      const toNick = destIndex.exists ? String(destIndex.data()?.nick ?? "") : findNick(toId);
      if (!toNick) throw new Error("ID não encontrado. Cole e confira o nick.");
      const destUserId = destIndex.data()?.userId as string | undefined;
      const destRef2 = destUserId ? profiles().doc(destUserId) : null;
      const destSnap = destRef2 ? await tx.get(destRef2) : null;
      if (destRef2 && destSnap?.exists)
        tx.update(destRef2, {
          [`${field}Pending`]: Number(destSnap.data()?.[`${field}Pending`] ?? 0) + amount,
        });
      const next = { ...me, [field]: Number(me[field]) - amount } as Profile;
      const now = new Date().toISOString();
      tx.set(meRef, profileData(withoutMeta(next), next), { merge: true });
      tx.set(txRef, {
        fromUserId: context.userId,
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
  });

export const listTransfers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const me = await profiles().doc(context.userId).get();
    if (!me.exists) return { rows: [] as LedgerRow[] };
    const pid = String(me.data()?.playerId ?? "");
    const [from, to] = await Promise.all([
      transfers().where("fromPlayerId", "==", pid).orderBy("createdAt", "desc").limit(40).get(),
      transfers().where("toPlayerId", "==", pid).orderBy("createdAt", "desc").limit(40).get(),
    ]);
    const docs = [...from.docs, ...to.docs]
      .sort((a, b) => String(b.data().createdAt).localeCompare(String(a.data().createdAt)))
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
  });

async function boardFor(userId: string, win: ReturnType<typeof rankingWindow>) {
  const me = await profiles().doc(userId).get();
  const you = me.exists ? profileFromDoc(userId, me.data()!) : null;
  const snaps = await profiles()
    .where("weekKey", "==", win.key)
    .orderBy("weekStars", "desc")
    .limit(20)
    .get();
  const byId = new Map<string, RankRow>();
  for (const b of botWeekBoard(win.key)) byId.set(b.playerId, { ...b, bot: true });
  for (const d of snaps.docs) {
    const r = d.data();
    byId.set(String(r.playerId), {
      playerId: String(r.playerId),
      nick: String(r.nick),
      stars: Number(r.weekStars ?? 0),
      you: you?.player.id === r.playerId,
    });
  }
  if (you && you.weekKey === win.key && !byId.has(you.player.id))
    byId.set(you.player.id, {
      playerId: you.player.id,
      nick: you.player.nick,
      stars: you.weekStars,
      you: true,
    });
  const board = [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, 20);
  const yourRank = board.findIndex((r) => r.you) + 1;
  const claim = await claims().doc(`${userId}_${win.key}`).get();
  return { board, yourRank, claimed: claim.exists };
}

export const weeklyBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const win = rankingWindow();
    return { ...(await boardFor(context.userId, win)), week: win };
  });

export const claimWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const win = rankingWindow();
    if (!win.claim) throw new Error("O prêmio abre domingo às 23h de Brasília.");
    const { yourRank: rank } = await boardFor(context.userId, win);
    const prize = weeklyPrize(rank);
    if (!prize) throw new Error("Fora do top 20 desta semana.");
    const db = getAdminFirestore();
    const claimRef = claims().doc(`${context.userId}_${win.key}`);
    const profileRef = profiles().doc(context.userId);
    await db.runTransaction(async (tx) => {
      const [c, p] = await Promise.all([tx.get(claimRef), tx.get(profileRef)]);
      if (c.exists) throw new Error("Prêmio já recolhido.");
      if (!p.exists) throw new Error("Condado não encontrado.");
      tx.create(claimRef, {
        userId: context.userId,
        weekKey: win.key,
        rank,
        claimedAt: new Date().toISOString(),
      });
      tx.update(profileRef, {
        goldPending: Number(p.data()?.goldPending ?? 0) + prize.gold,
        troopCardsPending: Number(p.data()?.troopCardsPending ?? 0) + prize.troopCards,
        generalCardsPending: Number(p.data()?.generalCardsPending ?? 0) + prize.generalCards,
      });
    });
    return { rank, prize };
  });

export const creditReferral = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const db = getAdminFirestore();
    const meRef = profiles().doc(context.userId);
    return db.runTransaction(async (tx) => {
      const meSnap = await tx.get(meRef);
      if (!meSnap.exists) return { granted: false as const };
      const me = profileFromDoc(context.userId, meSnap.data()!);
      if (me.referralClaimed || me.countyLevel < 3 || !me.referredBy)
        return { granted: false as const };
      const refIndex = await tx.get(playerIndex().doc(me.referredBy));
      const refUserId = refIndex.exists ? String(refIndex.data()?.userId ?? "") : "";
      const refRef = refUserId ? profiles().doc(refUserId) : null;
      const refSnap = refRef ? await tx.get(refRef) : null;
      tx.update(meRef, { goldPending: me.goldPending + REFERRAL_GOLD, referralClaimed: true });
      if (refRef && refSnap?.exists)
        tx.update(refRef, {
          goldPending: Number(refSnap.data()?.goldPending ?? 0) + REFERRAL_GOLD,
        });
      return { granted: true as const, gold: REFERRAL_GOLD };
    });
  });

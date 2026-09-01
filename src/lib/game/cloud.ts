/**
 * Server-only Condado persistence.
 * Imported from the client as createServerFn stubs — handlers never ship
 * to the browser, and nothing here exposes database URLs or credentials.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { REFERRAL_GOLD, rankingWindow, weeklyPrize, type ResourceKind } from "./constants";
import { defaultSave, migrateCloud } from "./save";
import type { SaveState } from "./types";
import { botWeekBoard, findNick } from "./bots";
import { makeId } from "./world";

export type RankRow = { playerId: string; nick: string; stars: number; you?: boolean; bot?: boolean };

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

type SqlClient = {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

function kindCol(kind: ResourceKind): "gold" | "bread" | "niens" | "troop_cards" | "general_cards" {
  if (kind === "troopCards") return "troop_cards";
  if (kind === "generalCards") return "general_cards";
  return kind;
}

function overlaySave(
  raw: string,
  cols: {
    gold: number;
    bread: number;
    niens: number;
    troop_cards: number;
    general_cards: number;
    county_level?: number;
    week_stars?: number;
    week_key?: string;
  },
): SaveState {
  const parsed = JSON.parse(raw) as SaveState;
  const s = migrateCloud(parsed);
  s.gold = cols.gold;
  s.bread = cols.bread;
  s.niens = cols.niens;
  s.troopCards = cols.troop_cards;
  s.generalCards = cols.general_cards;
  if (cols.county_level != null) s.countyLevel = cols.county_level;
  if (cols.week_stars != null) s.weekStars = cols.week_stars;
  if (cols.week_key != null) s.weekKey = cols.week_key;
  return s;
}

function blobOf(s: SaveState): string {
  return JSON.stringify({
    ...s,
    chat: s.chat.slice(-40),
    allianceChat: s.allianceChat.slice(-40),
    raids: s.raids.slice(-12),
    ledger: s.ledger.slice(0, 40),
  });
}

async function applyPending(sql: SqlClient, userId: string) {
  await sql`
    update condado_profiles set
      gold = gold + gold_pending,
      bread = bread + bread_pending,
      niens = niens + niens_pending,
      troop_cards = troop_cards + troop_cards_pending,
      general_cards = general_cards + general_cards_pending,
      gold_pending = 0,
      bread_pending = 0,
      niens_pending = 0,
      troop_cards_pending = 0,
      general_cards_pending = 0,
      updated_at = now()
    where user_id = ${userId}
      and (gold_pending <> 0 or bread_pending <> 0 or niens_pending <> 0
        or troop_cards_pending <> 0 or general_cards_pending <> 0)
  `;
}

async function creditPending(
  sql: SqlClient,
  userId: string,
  kind: ResourceKind,
  amount: number,
) {
  const col = kindCol(kind);
  await sql.query(
    `update condado_profiles set ${col}_pending = ${col}_pending + $1, updated_at = now() where user_id = $2`,
    [amount, userId],
  );
}

async function assembleBoard(
  sql: SqlClient,
  userId: string,
  win: ReturnType<typeof rankingWindow>,
): Promise<{ board: RankRow[]; yourRank: number; claimed: boolean }> {
  const me = await sql<{ player_id: string; nick: string; week_stars: number; week_key: string }>`
    select player_id, nick, week_stars, week_key from condado_profiles where user_id = ${userId}
  `;
  const players = await sql<{ player_id: string; nick: string; week_stars: number }>`
    select player_id, nick, week_stars from condado_profiles
    where week_key = ${win.key}
    order by week_stars desc
    limit 20
  `;
  const you = me[0];
  const byId = new Map<string, RankRow>();
  for (const b of botWeekBoard(win.key)) {
    byId.set(b.playerId, { playerId: b.playerId, nick: b.nick, stars: b.stars, bot: true });
  }
  for (const p of players) {
    byId.set(p.player_id, {
      playerId: p.player_id,
      nick: p.nick,
      stars: p.week_stars,
      you: you?.player_id === p.player_id,
    });
  }
  if (you && you.week_key === win.key && !byId.has(you.player_id)) {
    byId.set(you.player_id, { playerId: you.player_id, nick: you.nick, stars: you.week_stars, you: true });
  }
  const board = [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, 20);
  const yourRank = board.findIndex((r) => r.you) + 1;
  const claimed = you
    ? (await sql<{ n: number }>`select 1 as n from condado_week_claims where user_id = ${userId} and week_key = ${win.key}`).length > 0
    : false;
  return { board, yourRank, claimed };
}

export const pullCloud = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await applyPending(sql, context.userId);
    const rows = await sql<{
      save_json: string;
      gold: number;
      bread: number;
      niens: number;
      troop_cards: number;
      general_cards: number;
      county_level: number;
      week_stars: number;
      week_key: string;
      player_id: string;
      nick: string;
      referred_by: string | null;
      referral_claimed: boolean;
    }>`
      select save_json, gold, bread, niens, troop_cards, general_cards, county_level,
             week_stars, week_key, player_id, nick, referred_by, referral_claimed
      from condado_profiles where user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return { save: null as SaveState | null };
    const save = overlaySave(row.save_json, row);
    save.player = { ...save.player, id: row.player_id, nick: row.nick };
    save.referredBy = row.referred_by;
    save.referralClaimed = row.referral_claimed;
    return { save };
  });

export const createProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { nick: string; referredBy?: string | null }) => d)
  .handler(async ({ context, data }) => {
    const nick = data.nick.trim().slice(0, 18);
    if (nick.length < 3) throw new Error("O nome do condado precisa de ao menos 3 letras.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const taken = await sql<{ n: number }>`select 1 as n from condado_profiles where lower(nick) = ${nick.toLowerCase()} limit 1`;
    if (taken.length) throw new Error("Este nome de condado já está em uso.");
    const ref = data.referredBy?.trim().toUpperCase() || null;
    const save = defaultSave(nick, ref);
    const existing = await sql<{
      player_id: string;
      save_json: string;
      gold: number;
      bread: number;
      niens: number;
      troop_cards: number;
      general_cards: number;
      county_level: number;
      week_stars: number;
      week_key: string;
      nick: string;
      referred_by: string | null;
      referral_claimed: boolean;
    }>`
      select player_id, save_json, gold, bread, niens, troop_cards, general_cards, county_level, week_stars, week_key, nick, referred_by, referral_claimed
      from condado_profiles where user_id = ${context.userId}
    `;
    if (existing[0]) {
      const row = existing[0];
      const loaded = overlaySave(row.save_json, row);
      loaded.player = { ...loaded.player, id: row.player_id, nick: row.nick };
      loaded.referredBy = row.referred_by;
      loaded.referralClaimed = row.referral_claimed;
      return { save: loaded };
    }
    try {
      await sql`
        insert into condado_profiles (
          user_id, player_id, nick, gold, bread, niens, troop_cards, general_cards,
          county_level, week_stars, week_key, referred_by, referral_claimed, save_json
        ) values (
          ${context.userId}, ${save.player.id}, ${nick}, ${save.gold}, ${save.bread}, ${save.niens},
          ${save.troopCards}, ${save.generalCards}, ${save.countyLevel}, 0, '', ${ref}, false, ${blobOf(save)}
        )
      `;
    } catch {
      throw new Error("Este nome de condado já está em uso.");
    }
    return { save };
  });

export const pushCloud = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: SaveState) => d)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const win = rankingWindow();
    const weekKey = win.key;
    const weekStars = data.weekKey === win.key ? data.weekStars : 0;
    const json = blobOf({ ...data, weekKey, weekStars });
    const updated = await sql<{
      gold: number;
      bread: number;
      niens: number;
      troop_cards: number;
      general_cards: number;
    }>`
      update condado_profiles set
        gold = ${data.gold} + gold_pending,
        bread = ${data.bread} + bread_pending,
        niens = ${data.niens} + niens_pending,
        troop_cards = ${data.troopCards} + troop_cards_pending,
        general_cards = ${data.generalCards} + general_cards_pending,
        gold_pending = 0,
        bread_pending = 0,
        niens_pending = 0,
        troop_cards_pending = 0,
        general_cards_pending = 0,
        county_level = ${data.countyLevel},
        week_stars = ${weekStars},
        week_key = ${weekKey},
        referral_claimed = ${data.referralClaimed},
        save_json = ${json},
        updated_at = now()
      where user_id = ${context.userId}
      returning gold, bread, niens, troop_cards, general_cards
    `;
    const row = updated[0];
    return {
      ok: true as const,
      gold: row?.gold ?? data.gold,
      bread: row?.bread ?? data.bread,
      niens: row?.niens ?? data.niens,
      troopCards: row?.troop_cards ?? data.troopCards,
      generalCards: row?.general_cards ?? data.generalCards,
    };
  });

export const renameCounty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((nick: string) => nick.trim().slice(0, 18))
  .handler(async ({ context, data: nick }) => {
    if (nick.length < 3) throw new Error("Nome curto demais.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const clash = await sql<{ user_id: string }>`
      select user_id from condado_profiles where lower(nick) = ${nick.toLowerCase()} and user_id <> ${context.userId} limit 1
    `;
    if (clash.length) throw new Error("Este nome de condado já está em uso.");
    await sql`update condado_profiles set nick = ${nick}, updated_at = now() where user_id = ${context.userId}`;
    return { nick };
  });

export const peekPlayer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: string) => id.trim().toUpperCase())
  .handler(async ({ data: id }) => {
    const npc = findNick(id);
    if (npc) return { id, nick: npc };
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ nick: string; player_id: string }>`
      select nick, player_id from condado_profiles where player_id = ${id} limit 1
    `;
    const row = rows[0];
    return row ? { id: row.player_id, nick: row.nick } : { id, nick: null as string | null };
  });

export const cloudTransfer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { toId: string; amount: number; kind: ResourceKind }) => d)
  .handler(async ({ context, data }) => {
    const amount = Math.floor(data.amount);
    const kind = data.kind;
    const toId = data.toId.trim().toUpperCase();
    if (amount <= 0) throw new Error("Quantia inválida.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await applyPending(sql, context.userId);
    const meRows = await sql<{
      player_id: string;
      nick: string;
      gold: number;
      bread: number;
      niens: number;
      troop_cards: number;
      general_cards: number;
      save_json: string;
    }>`
      select player_id, nick, gold, bread, niens, troop_cards, general_cards, save_json
      from condado_profiles where user_id = ${context.userId}
    `;
    const me = meRows[0];
    if (!me) throw new Error("Condado não encontrado.");
    if (toId === me.player_id) throw new Error("Não envie para si mesmo.");
    const pool =
      kind === "gold"
        ? me.gold
        : kind === "bread"
          ? me.bread
          : kind === "niens"
            ? me.niens
            : kind === "troopCards"
              ? me.troop_cards
              : me.general_cards;
    if (amount > pool) throw new Error("Quantia inválida.");

    const destRows = await sql<{
      user_id: string;
      player_id: string;
      nick: string;
    }>`select user_id, player_id, nick from condado_profiles where player_id = ${toId}`;
    const dest = destRows[0];
    const toNick = dest?.nick ?? findNick(toId);
    if (!toNick) throw new Error("ID não encontrado. Cole e confira o nick.");

    const col = kindCol(kind);
    const txId = makeId("TX");
    const now = new Date().toISOString();

    const meSave = overlaySave(me.save_json, me);
    if (kind === "gold") meSave.gold -= amount;
    else if (kind === "bread") meSave.bread -= amount;
    else if (kind === "niens") meSave.niens -= amount;
    else if (kind === "troopCards") meSave.troopCards -= amount;
    else meSave.generalCards -= amount;

    await sql.query(
      `update condado_profiles set ${col} = ${col} - $1, save_json = $2, updated_at = now() where user_id = $3`,
      [amount, blobOf(meSave), context.userId],
    );

    if (dest) {
      await creditPending(sql, dest.user_id, kind, amount);
    }

    await sql`
      insert into condado_transfers (
        id, from_user_id, from_player_id, from_nick, to_player_id, to_nick, kind, amount
      ) values (
        ${txId}, ${context.userId}, ${me.player_id}, ${me.nick}, ${toId}, ${toNick}, ${kind}, ${amount}
      )
    `;

    return {
      ok: true as const,
      toNick,
      at: now,
      id: txId,
      gold: kind === "gold" ? me.gold - amount : me.gold,
      bread: kind === "bread" ? me.bread - amount : me.bread,
      niens: kind === "niens" ? me.niens - amount : me.niens,
      troopCards: kind === "troopCards" ? me.troop_cards - amount : me.troop_cards,
      generalCards: kind === "generalCards" ? me.general_cards - amount : me.general_cards,
    };
  });

export const listTransfers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const me = await sql<{ player_id: string }>`select player_id from condado_profiles where user_id = ${context.userId}`;
    const pid = me[0]?.player_id;
    if (!pid) return { rows: [] as LedgerRow[] };
    const rows = await sql<{
      id: string;
      from_player_id: string;
      from_nick: string;
      to_player_id: string;
      to_nick: string;
      kind: string;
      amount: number;
      created_at: string;
    }>`
      select id, from_player_id, from_nick, to_player_id, to_nick, kind, amount, created_at
      from condado_transfers
      where from_player_id = ${pid} or to_player_id = ${pid}
      order by created_at desc
      limit 40
    `;
    return {
      rows: rows.map((r) => ({
        id: r.id,
        at: new Date(r.created_at).getTime() || Date.now(),
        fromId: r.from_player_id,
        fromNick: r.from_nick,
        toId: r.to_player_id,
        toNick: r.to_nick,
        kind: r.kind as ResourceKind,
        amount: r.amount,
        incoming: r.to_player_id === pid && r.from_player_id !== pid,
      })),
    };
  });

export const weeklyBoard = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const win = rankingWindow();
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { board, yourRank, claimed } = await assembleBoard(sql, context.userId, win);
    return { board, yourRank, week: win, claimed };
  });

export const claimWeekly = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const win = rankingWindow();
    if (!win.claim) throw new Error("O prêmio abre domingo às 23h de Brasília.");
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const { yourRank: rank } = await assembleBoard(sql, context.userId, win);
    const prize = weeklyPrize(rank);
    if (!prize) throw new Error("Fora do top 20 desta semana.");
    const already = await sql<{ n: number }>`select 1 as n from condado_week_claims where user_id = ${context.userId} and week_key = ${win.key}`;
    if (already.length) throw new Error("Prêmio já recolhido.");
    await sql`
      insert into condado_week_claims (user_id, week_key, rank) values (${context.userId}, ${win.key}, ${rank})
    `;
    await sql`
      update condado_profiles set
        gold_pending = gold_pending + ${prize.gold},
        troop_cards_pending = troop_cards_pending + ${prize.troopCards},
        general_cards_pending = general_cards_pending + ${prize.generalCards},
        updated_at = now()
      where user_id = ${context.userId}
    `;
    return { rank, prize };
  });

export const creditReferral = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{
      county_level: number;
      referral_claimed: boolean;
      referred_by: string | null;
      gold: number;
      player_id: string;
      nick: string;
    }>`
      select county_level, referral_claimed, referred_by, gold, player_id, nick
      from condado_profiles where user_id = ${context.userId}
    `;
    const me = rows[0];
    if (!me) return { granted: false as const };
    if (me.referral_claimed || me.county_level < 3 || !me.referred_by) return { granted: false as const };
    await sql`
      update condado_profiles set
        gold_pending = gold_pending + ${REFERRAL_GOLD},
        referral_claimed = true,
        updated_at = now()
      where user_id = ${context.userId}
    `;
    const ref = await sql<{ user_id: string }>`select user_id from condado_profiles where player_id = ${me.referred_by}`;
    if (ref[0]) {
      await sql`
        update condado_profiles set gold_pending = gold_pending + ${REFERRAL_GOLD}, updated_at = now()
        where user_id = ${ref[0].user_id}
      `;
    }
    return { granted: true as const, gold: REFERRAL_GOLD };
  });

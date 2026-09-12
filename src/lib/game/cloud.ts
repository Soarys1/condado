import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { CHAT_TTL_MS } from "./constants";
import type { ResourceKind, Tradable } from "./constants";
import type { ChatMsg, Lord, MarketOffer, SaveState } from "./types";
import { deviceFingerprint, getDeviceId } from "./device";

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

export type GameActionResult = {
  save?: SaveState;
  toast?: string;
  admin?: boolean;
  offers?: MarketOffer[];
  targets?: Lord[];
  board?: RankRow[];
  yourRank?: number;
  claimed?: boolean;
  week?: { key: string; open: boolean; claim: boolean; start: number; end: number };
  rows?: LedgerRow[];
  nick?: string | null;
  id?: string;
  buildings?: SaveState["buildings"];
  lootGold?: number;
  sessionId?: string;
  lookup?: Record<string, unknown>;
  error?: string;
  foes?: Lord[];
  foeArmy?: SaveState["army"];
  foeLevels?: SaveState["troopLevels"];
  foeCamp?: number;
};

async function playAction(action: string, payload: Record<string, unknown> = {}, requestId?: string): Promise<GameActionResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("Entre na tua conta para continuar.");
  const token = await user.getIdToken();
  const endpoint =
    typeof window !== "undefined" && window.location.hostname === "ocondado.online"
      ? "https://www.ocondado.online/api/game"
      : "/api/game";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action,
      requestId: requestId ?? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
      payload,
    }),
  });
  const text = await res.text();
  let data: GameActionResult = {};
  try {
    data = text ? (JSON.parse(text) as GameActionResult) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const raw = data as GameActionResult & { message?: string; unhandled?: boolean };
    if (
      raw.unhandled ||
      raw.message === "HTTPError" ||
      /FUNCTION_INVOCATION_FAILED|INTERNAL_SERVER_ERROR/i.test(text)
    ) {
      throw new Error("O reino ainda não está ligado ao servidor. Tenta dentro de instantes.");
    }
    throw new Error(data.error || "Não foi possível concluir a ação.");
  }
  return data;
}

export async function syncAccountEmail() {
  const r = await playAction("syncAccountEmail");
  return { email: auth.currentUser?.email ?? null, save: r.save };
}

export async function pullCloud() {
  const r = await playAction("pull");
  return { save: r.save ?? null, admin: Boolean(r.admin) };
}

export async function createProfile(input: { nick: string; referredBy?: string | null }) {
  const r = await playAction("createProfile", {
    nick: input.nick,
    referredBy: input.referredBy ?? null,
    deviceId: getDeviceId(),
    fingerprint: await deviceFingerprint(),
  });
  if (!r.save) throw new Error("Não foi possível fundar o condado.");
  return { save: r.save };
}

export async function pushCloud(_data: SaveState) {
  const r = await playAction("sync");
  const s = r.save;
  return {
    ok: true as const,
    gold: s?.gold ?? 0,
    bread: s?.bread ?? 0,
    niens: s?.niens ?? 0,
    troopCards: s?.troopCards ?? 0,
    generalCards: s?.generalCards ?? 0,
    save: s,
  };
}

export async function renameCounty(nickRaw: string) {
  const r = await playAction("rename", { nick: nickRaw });
  return { nick: r.nick ?? nickRaw, save: r.save };
}

export async function peekPlayer(idRaw: string) {
  const r = await playAction("peekPlayer", { id: idRaw });
  return { id: r.id ?? idRaw.trim().toUpperCase(), nick: r.nick ?? null };
}

export async function cloudTransfer(data: { toId: string; amount: number; kind: ResourceKind }) {
  const r = await playAction("transfer", data);
  const s = r.save;
  if (!s) throw new Error("Falha no envio.");
  return {
    ok: true as const,
    toNick: r.nick ?? "",
    at: Date.now(),
    id: r.id ?? "",
    gold: s.gold,
    bread: s.bread,
    niens: s.niens,
    troopCards: s.troopCards,
    generalCards: s.generalCards,
    save: s,
    toast: r.toast,
  };
}

export async function listTransfers() {
  const r = await playAction("listTransfers");
  return { rows: (r.rows ?? []) as LedgerRow[] };
}

export async function weeklyBoard() {
  const r = await playAction("weeklyBoard");
  return {
    board: r.board ?? [],
    yourRank: r.yourRank ?? 0,
    claimed: Boolean(r.claimed),
    week: r.week ?? { key: "", open: false, claim: false, start: 0, end: 0 },
  };
}

export async function claimWeekly() {
  const r = await playAction("claimWeekly");
  return { rank: r.yourRank ?? 0, save: r.save, toast: r.toast };
}

export async function creditReferral() {
  const r = await playAction("sync");
  return { granted: Boolean(r.save?.referralClaimed), gold: r.save?.gold ?? 0, save: r.save };
}

export async function listMarket(): Promise<{ offers: MarketOffer[] }> {
  const r = await playAction("listMarket");
  return { offers: r.offers ?? [] };
}

export async function createMarketOffer(input: {
  giveKind: Tradable;
  giveAmount: number;
  wantKind: Tradable;
  wantAmount: number;
}) {
  const r = await playAction("createMarketOffer", input);
  const s = r.save;
  if (!s) throw new Error("Não foi possível publicar a oferta.");
  return { ok: true as const, gold: s.gold, bread: s.bread, niens: s.niens, save: s, toast: r.toast };
}

export async function takeMarketOffer(offerId: string) {
  const r = await playAction("takeMarketOffer", { offerId });
  const s = r.save;
  if (!s) throw new Error("Não foi possível fechar o trato.");
  return { ok: true as const, gold: s.gold, bread: s.bread, niens: s.niens, sellerNick: r.nick ?? "", save: s, toast: r.toast };
}

export async function cancelMarketOffer(offerId: string) {
  const r = await playAction("cancelMarketOffer", { offerId });
  const s = r.save;
  if (!s) throw new Error("Não foi possível retirar a oferta.");
  return { ok: true as const, gold: s.gold, bread: s.bread, niens: s.niens, save: s, toast: r.toast };
}

export async function listRaidTargets(_myId: string, _myLevel: number): Promise<{ targets: Lord[] }> {
  const r = await playAction("listRaidTargets");
  return { targets: r.targets ?? [] };
}

export async function startRaid(targetId: string) {
  const r = await playAction("startRaid", { targetId });
  if (!r.sessionId) throw new Error("Não foi possível iniciar o ataque.");
  return r;
}

export async function finishRaid(input: {
  sessionId: string;
  stars: number;
  goldTaken: number;
  destruction: number;
  troopsLost: number;
  survivors: SaveState["army"];
}) {
  return playAction("finishRaid", input);
}

export async function submitRaidResult(_input: {
  defenderId: string;
  defenderNick: string;
  goldTaken: number;
  destruction: number;
  stars: number;
  troopsLost: number;
}) {
  /* raids reais passam por startRaid/finishRaid */
}

export async function sendGlobalChat(input: { playerId: string; nick: string; text: string }) {
  await playAction("sendChat", { text: input.text });
}

export function listenGlobalChat(onRows: (rows: ChatMsg[]) => void): Unsubscribe {
  const q = query(collection(db, "condado_chat"), orderBy("createdAt", "desc"), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const rows: ChatMsg[] = snap.docs
        .map((d) => {
          const r = d.data();
          return {
            id: d.id,
            fromId: String(r.fromId ?? r.fromPlayerId ?? ""),
            fromNick: String(r.fromNick ?? "Senhor"),
            text: String(r.text ?? ""),
            at: Number(r.at ?? (Date.parse(String(r.createdAt ?? "")) || Date.now())),
            self: r.fromUserId === auth.currentUser?.uid,
            channel: "global" as const,
            recruitAllianceId: r.recruitAllianceId ? String(r.recruitAllianceId) : undefined,
            recruitMinLevel: r.recruitMinLevel ? Number(r.recruitMinLevel) : undefined,
          };
        })
        .filter((m) => m.text && Date.now() - m.at <= CHAT_TTL_MS)
        .sort((a, b) => a.at - b.at);
      onRows(rows);
    },
    () => {
      /* offline */
    },
  );
}

export { playAction };

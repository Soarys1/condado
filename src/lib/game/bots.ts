import type { ArmyCounts, ChatMsg, Lord, MarketOffer } from "./types";

export const LORDS: Lord[] = [
  { id: "CDN-ALDRIC", nick: "Sir Aldric", title: "Escudeiro", rank: 0, lootGold: 8400, lootBread: 0, allianceId: "AL-CORVO" },
  { id: "CDN-MARELA", nick: "Marela do Vale", title: "Capitã", rank: 1, lootGold: 8400, lootBread: 0, allianceId: "AL-ROSA" },
  { id: "CDN-RODRIGO", nick: "Rodrigo Caldeira", title: "Celador", rank: 2, lootGold: 8400, lootBread: 0, allianceId: "AL-VALE" },
  { id: "CDN-ISOLDE", nick: "Dama Isolde", title: "Baronesa", rank: 3, lootGold: 8400, lootBread: 0, allianceId: "AL-TORRE" },
  { id: "CDN-FERNAN", nick: "Fernão Negro", title: "Marechal", rank: 4, lootGold: 8400, lootBread: 0, allianceId: "AL-CORVO" },
  { id: "CDN-BEATRIZ", nick: "Beatriz da Torre", title: "Duquesa", rank: 5, lootGold: 8400, lootBread: 0, allianceId: "AL-ROSA" },
];

export const ALLIANCES = [
  { id: "AL-CORVO", name: "Corvo Negro", members: ["CDN-ALDRIC", "CDN-FERNAN"] },
  { id: "AL-ROSA", name: "Rosa de Ferro", members: ["CDN-MARELA", "CDN-BEATRIZ"] },
  { id: "AL-VALE", name: "Vale Dourado", members: ["CDN-RODRIGO"] },
  { id: "AL-TORRE", name: "Torre do Norte", members: ["CDN-ISOLDE"] },
];

const CHAT_POOL = [
  "Alguém vende pão? As fazendas do norte secaram.",
  "Niens não se saqueiam. Só o tesouro as vende — 450 mil ouro.",
  "O condado de Fernão está aberto. Muros fracos no flanco leste.",
  "Uma Nien vale um cofre. Ouro, o reino gasta.",
  "Guerra de aliança é sábado, 8h às 23h de Brasília.",
  "As minas rendem pouco depois da geada.",
  "Quem atacar o meu castelo vai pagar em ouro. Gemas ficam.",
  "Mercado justo. Cola o ID, vê o nick, escolhe o envio.",
  "A torre nova segura infantaria. Cavalaria ainda passa.",
  "Pão quente, tropas leais. Assim se governa.",
  "Campo de treino evolui carta por carta.",
  "O Condado acorda. Levantem os estandartes.",
];

export function randomChat(now = Date.now()): ChatMsg {
  const lord = LORDS[Math.floor(Math.random() * LORDS.length)]!;
  const text = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]!;
  return { id: `m${now}${Math.floor(Math.random() * 999)}`, fromId: lord.id, fromNick: lord.nick, text, at: now, channel: "global" };
}

export function seedChat(now = Date.now()): ChatMsg[] {
  return [
    { id: "m0", fromId: "CDN-HERALDO", fromNick: "Heraldo", text: "Bem-vindos. Niens são gemas. Ouro se saqueia. Gemas, não.", at: now - 120000, channel: "global" },
    { id: "m1", fromId: LORDS[0]!.id, fromNick: LORDS[0]!.nick, text: "Procuro ataque honrado. Ouro alto. Niens no cofre.", at: now - 80000, channel: "global" },
    { id: "m2", fromId: LORDS[3]!.id, fromNick: LORDS[3]!.nick, text: "Guerra sábado. Pares de alianças. Ímpar espera.", at: now - 35000, channel: "global" },
  ];
}

export function marketBoard(): MarketOffer[] {
  return [
    { id: "o1", sellerId: "CDN-ALDRIC", sellerNick: "Sir Aldric", give: { kind: "gold", amount: 148000 }, wantNiens: 1 },
    { id: "o2", sellerId: "CDN-MARELA", sellerNick: "Marela do Vale", give: { kind: "gold", amount: 152000 }, wantNiens: 1 },
    { id: "o3", sellerId: "CDN-RODRIGO", sellerNick: "Rodrigo Caldeira", give: { kind: "gold", amount: 300000 }, wantNiens: 2 },
    { id: "o4", sellerId: "CDN-ISOLDE", sellerNick: "Dama Isolde", give: { kind: "gold", amount: 445000 }, wantNiens: 3 },
  ];
}

export function findLord(id: string): Lord | undefined {
  const key = id.trim().toUpperCase();
  return LORDS.find((l) => l.id === key);
}

export function findNick(id: string): string | null {
  const key = id.trim().toUpperCase();
  const lord = findLord(key);
  if (lord) return lord.nick;
  if (key.startsWith("CDN-") && key.length >= 8) return `Senhor ${key.slice(4, 8)}`;
  return null;
}

export function warChest(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const t = (h >>> 0) / 4294967296;
  return Math.round((10_000_000 + t * 40_000_000) / 1000) * 1000;
}

export function pairWar(playerAllianceId: string | null, week: string): { foeId: string | null; foeName: string; sittingOut: boolean } {
  const ids = ALLIANCES.map((a) => a.id);
  if (playerAllianceId && !ids.includes(playerAllianceId)) ids.push(playerAllianceId);
  ids.sort();
  let h = 0;
  for (const c of week) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  if (ids.length % 2 === 1) {
    const sit = ids[h % ids.length];
    if (sit === playerAllianceId) return { foeId: null, foeName: "—", sittingOut: true };
    const rest = ids.filter((x) => x !== sit);
    const idx = rest.indexOf(playerAllianceId ?? "");
    if (idx < 0) return { foeId: rest[0] ?? null, foeName: nameOf(rest[0] ?? ""), sittingOut: false };
    const foe = rest[idx ^ 1] ?? rest[0]!;
    return { foeId: foe, foeName: nameOf(foe), sittingOut: false };
  }
  const idx = ids.indexOf(playerAllianceId ?? ids[0]!);
  const foe = ids[idx ^ 1] ?? ids[0]!;
  return { foeId: foe, foeName: nameOf(foe), sittingOut: false };
}

function nameOf(id: string): string {
  return ALLIANCES.find((a) => a.id === id)?.name ?? "Aliança rival";
}

export function lordsOfAlliance(allianceId: string): Lord[] {
  return LORDS.filter((l) => l.allianceId === allianceId);
}

export function botArmy(rank: number): ArmyCounts {
  return {
    infantry: 8 + rank * 4,
    archers: 6 + rank * 3,
    cavalry: rank >= 2 ? 2 + rank : 0,
    general: rank >= 4 ? 1 : 0,
    generaless: rank >= 3 ? 1 : 0,
    defender: 0,
  };
}

export function botWeekBoard(weekKey: string): Array<{ playerId: string; nick: string; stars: number; bot: true }> {
  return LORDS.map((l, i) => {
    let h = 2166136261;
    const seed = weekKey + l.id;
    for (let c = 0; c < seed.length; c++) h = Math.imul(h ^ seed.charCodeAt(c), 16777619);
    const stars = 12 + ((h >>> 0) % 90) + i * 3;
    return { playerId: l.id, nick: l.nick, stars, bot: true as const };
  });
}

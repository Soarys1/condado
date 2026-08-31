import type { ChatMsg, Lord, MarketOffer } from "./types";

export const LORDS: Lord[] = [
  {
    id: "CDN-ALDRIC",
    nick: "Sir Aldric",
    title: "Escudeiro",
    rank: 0,
    lootGold: 420,
    lootBread: 280,
  },
  {
    id: "CDN-MARELA",
    nick: "Marela do Vale",
    title: "Capitã",
    rank: 1,
    lootGold: 780,
    lootBread: 510,
  },
  {
    id: "CDN-RODRIGO",
    nick: "Rodrigo Caldeira",
    title: "Celador",
    rank: 2,
    lootGold: 1240,
    lootBread: 860,
  },
  {
    id: "CDN-ISOLDE",
    nick: "Dama Isolde",
    title: "Baronesa",
    rank: 3,
    lootGold: 2100,
    lootBread: 1400,
  },
  {
    id: "CDN-FERNAN",
    nick: "Fernão Negro",
    title: "Marechal",
    rank: 4,
    lootGold: 3400,
    lootBread: 1900,
  },
  {
    id: "CDN-BEATRIZ",
    nick: "Beatriz da Torre",
    title: "Duquesa",
    rank: 5,
    lootGold: 5200,
    lootBread: 2600,
  },
];

const CHAT_POOL = [
  "Alguém vende pão? As fazendas do norte secaram.",
  "Troco ouro por Niens, honra de cavaleiro.",
  "O condado de Fernão está aberto. Muros fracos no flanco leste.",
  "Niens não mentem. Ouro, sim.",
  "Recrutei um general. O chão treme.",
  "As minas rendem pouco depois da geada.",
  "Quem atacar o meu castelo vai pagar em pão e sangue.",
  "Mercado justo, sem emboscada. ID na mensagem.",
  "A torre nova segura infantaria. Cavalaria ainda passa.",
  "Pão quente, tropas leais. Assim se governa.",
  "Vi catapultas no vale. Alguém está se armando.",
  "O Condado acorda. Levantem os estandartes.",
];

export function randomChat(now = Date.now()): ChatMsg {
  const lord = LORDS[Math.floor(Math.random() * LORDS.length)]!;
  const text = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)]!;
  return {
    id: `m${now}${Math.floor(Math.random() * 999)}`,
    fromId: lord.id,
    fromNick: lord.nick,
    text,
    at: now,
  };
}

export function seedChat(now = Date.now()): ChatMsg[] {
  return [
    {
      id: "m0",
      fromId: "CDN-HERALDO",
      fromNick: "Heraldo",
      text: "Bem-vindos ao chat dos senhores. Niens selam trato. Palavras, não.",
      at: now - 120000,
    },
    {
      id: "m1",
      fromId: LORDS[0]!.id,
      fromNick: LORDS[0]!.nick,
      text: "Procuro um ataque honrado. Muros baixos, ouro alto.",
      at: now - 80000,
    },
    {
      id: "m2",
      fromId: LORDS[3]!.id,
      fromNick: LORDS[3]!.nick,
      text: "Niens pela rota segura. Quem transferir para CDN-ISOLDE recebe pão no alvorecer.",
      at: now - 35000,
    },
  ];
}

export function marketBoard(): MarketOffer[] {
  return [
    {
      id: "o1",
      sellerId: "CDN-ALDRIC",
      sellerNick: "Sir Aldric",
      give: { kind: "gold", amount: 800 },
      wantNiens: 1,
    },
    {
      id: "o2",
      sellerId: "CDN-MARELA",
      sellerNick: "Marela do Vale",
      give: { kind: "bread", amount: 900 },
      wantNiens: 1,
    },
    {
      id: "o3",
      sellerId: "CDN-RODRIGO",
      sellerNick: "Rodrigo Caldeira",
      give: { kind: "gold", amount: 2200 },
      wantNiens: 2,
    },
    {
      id: "o4",
      sellerId: "CDN-ISOLDE",
      sellerNick: "Dama Isolde",
      give: { kind: "bread", amount: 2500 },
      wantNiens: 2,
    },
  ];
}

export function findLord(id: string): Lord | undefined {
  const key = id.trim().toUpperCase();
  return LORDS.find((l) => l.id === key);
}

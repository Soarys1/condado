Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let firebase_admin_app = require("firebase-admin/app");
let firebase_admin_auth = require("firebase-admin/auth");
let firebase_admin_firestore = require("firebase-admin/firestore");
//#region src/lib/firebase-admin.server.ts
const DATABASE_ID = "default";
const PROJECT_ID = "condado-dcdf5";
function env(name) {
	try {
		const value = globalThis.process?.env?.[name];
		return typeof value === "string" ? value.trim() : "";
	} catch {
		return "";
	}
}
function parseJsonObject(raw) {
	let text = raw.trim();
	if (!text) return null;
	if (text.startsWith("\"") && text.endsWith("\"") || text.startsWith("'") && text.endsWith("'")) try {
		text = JSON.parse(text);
	} catch {
		text = text.slice(1, -1);
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
function parseServiceAccount() {
	try {
		const raw = env("FIREBASE_SERVICE_ACCOUNT") || env("FIREBASE_SERVICE_ACCOUNT_BASE64");
		let json = null;
		if (raw) json = raw.startsWith("{") || raw.startsWith("\"") || raw.startsWith("'") ? parseJsonObject(raw) : parseJsonObject(Buffer.from(raw, "base64").toString("utf8"));
		const clientEmail = String(json?.clientEmail || json?.client_email || env("FIREBASE_CLIENT_EMAIL") || "");
		let privateKey = String(json?.privateKey || json?.private_key || env("FIREBASE_PRIVATE_KEY") || "");
		privateKey = privateKey.replace(/\\n/g, "\n").replace(/\r/g, "");
		const projectId = String(json?.projectId || json?.project_id || env("FIREBASE_PROJECT_ID") || PROJECT_ID);
		if (!clientEmail || !privateKey.includes("PRIVATE KEY")) return null;
		return {
			projectId,
			clientEmail,
			privateKey
		};
	} catch {
		return null;
	}
}
let app = null;
let authInstance = null;
let dbInstance = null;
function getAdminApp() {
	if (app) return app;
	const existing = (0, firebase_admin_app.getApps)()[0];
	if (existing) {
		app = existing;
		return app;
	}
	const account = parseServiceAccount();
	if (!account) throw new Error("O reino ainda não está ligado ao servidor. Tenta dentro de instantes.");
	try {
		app = (0, firebase_admin_app.initializeApp)({
			credential: (0, firebase_admin_app.cert)(account),
			projectId: account.projectId
		});
		return app;
	} catch {
		throw new Error("O reino ainda não está ligado ao servidor. Tenta dentro de instantes.");
	}
}
function adminConfigured() {
	try {
		return Boolean(parseServiceAccount() || (0, firebase_admin_app.getApps)().length);
	} catch {
		return false;
	}
}
function getAdminAuth() {
	if (!authInstance) authInstance = (0, firebase_admin_auth.getAuth)(getAdminApp());
	return authInstance;
}
function getAdminFirestore() {
	if (dbInstance) return dbInstance;
	const instance = getAdminApp();
	try {
		dbInstance = (0, firebase_admin_firestore.initializeFirestore)(instance, { preferRest: true }, DATABASE_ID);
	} catch {
		dbInstance = (0, firebase_admin_firestore.getFirestore)(instance, DATABASE_ID);
	}
	try {
		dbInstance.settings({ ignoreUndefinedProperties: true });
	} catch {}
	return dbInstance;
}
async function verifyPlayerToken(header) {
	const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
	if (!token) throw new Error("Entre na tua conta para continuar.");
	try {
		const decoded = await getAdminAuth().verifyIdToken(token);
		return {
			uid: decoded.uid,
			email: typeof decoded.email === "string" ? decoded.email.toLowerCase() : null
		};
	} catch {
		throw new Error("Sessão expirada. Entra novamente.");
	}
}
//#endregion
//#region src/lib/game/constants.ts
const PREP_MS = 12e4;
const BATTLE_MS = 24e4;
const NIEN_COST_GOLD = 55e4;
const NIEN_SELL_GOLD = 165e3;
const SPEED_TRAIN_GOLD = 2500;
const CHAT_TTL_MS = 3e5;
const LOOT_BANDS = [
	{
		at: .33,
		gold: 2700
	},
	{
		at: .66,
		gold: 2700
	},
	{
		at: .99,
		gold: 3e3
	}
];
const LOOT_CAP = 8400;
const SHIELD_MS = 36e5;
const REFERRAL_GOLD = 3e5;
const DEFENDER_COST = 5e3;
const PASS_BOOST_MULT = 1.4;
const PASS_BOOST_MS = 2592e6;
/** Display name of the gold resource. Internal field stays `gold`. */
const GOLD_NAME = "Libra";
const GOLD_NAME_PL = "Libras";
const BREAD_PACK = 1e3;
const BREAD_PACK_BUY_GOLD = 2400;
const ALLIANCE_XP_WIN = 1e3;
const ALLIANCE_XP_BASE = 2e3;
const ALLIANCE_DUEL_WIN_GOLD = 1e4;
const ALLIANCE_DUEL_LOSS_GOLD = 6e3;
const ALLIANCE_DUEL_WIN_POT = 2e4;
const ALLIANCE_DUEL_LOSS_POT = 8e3;
const ALLIANCE_CHALLENGE_MS = 9e4;
const BUILDINGS = {
	castle: {
		type: "castle",
		name: "Castelo Principal",
		costGold: 0,
		hp: 5e3,
		size: 3,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "core",
		desc: "Define o nível do condado. Niens nunca saem daqui."
	},
	wall: {
		type: "wall",
		name: "Muro",
		costGold: 100,
		hp: 800,
		size: 1,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "wall",
		desc: "Reto como I ou deitado como —. Gira com a seta. Limite sobe com o nível do condado."
	},
	watchtower: {
		type: "watchtower",
		name: "Torre de Vigia",
		costGold: 500,
		hp: 1100,
		size: 1,
		damage: 84,
		range: 5.4,
		aoe: 0,
		goldReward: 0,
		role: "defense",
		desc: "Um alvo por vez. Dois arqueiros no topo."
	},
	catapult: {
		type: "catapult",
		name: "Catapulta",
		costGold: 1500,
		hp: 900,
		size: 2,
		damage: 68,
		range: 8.2,
		aoe: 1.8,
		goldReward: 0,
		role: "defense",
		desc: "Alcance longo, dano menor, ainda em área."
	},
	mine: {
		type: "mine",
		name: "Mina",
		costGold: 200,
		hp: 600,
		size: 2,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "economy",
		desc: "Produz Libras com o tempo."
	},
	farm: {
		type: "farm",
		name: "Fazenda",
		costGold: 200,
		hp: 600,
		size: 2,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "economy",
		desc: "Produz pão com o tempo."
	},
	barracks: {
		type: "barracks",
		name: "Quartel",
		costGold: 300,
		hp: 700,
		size: 2,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "army",
		desc: "Libera o recrutamento de tropas."
	},
	camp: {
		type: "camp",
		name: "Acampamento",
		costGold: 250,
		hp: 500,
		size: 2,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "army",
		desc: "Aumenta a capacidade do exército em 40."
	},
	training: {
		type: "training",
		name: "Campo de Treino",
		costGold: 800,
		hp: 900,
		size: 2,
		damage: 0,
		range: 0,
		aoe: 0,
		goldReward: 0,
		role: "train",
		desc: "Evolui tropas, generais e defensores da guilda."
	}
};
const TROOPS = {
	infantry: {
		type: "infantry",
		name: "Infantaria",
		costBread: 50,
		costGold: 0,
		hp: 150,
		dps: 14,
		speed: 1.05,
		range: 1.05,
		trainMs: 6e3,
		prefer: "nearest",
		ignoreWalls: false,
		shootOverWalls: false,
		desc: "A pé. A mais lenta. Só rompe muro se não houver passagem."
	},
	archers: {
		type: "archers",
		name: "Arqueiros",
		costBread: 30,
		costGold: 0,
		hp: 60,
		dps: 11,
		speed: 1.32,
		range: 4.5,
		trainMs: 4e3,
		prefer: "nearest",
		ignoreWalls: false,
		shootOverWalls: true,
		desc: "Mais rápidos que a infantaria. Atiram por cima dos muros."
	},
	cavalry: {
		type: "cavalry",
		name: "Cavalaria",
		costBread: 150,
		costGold: 0,
		hp: 400,
		dps: 28,
		speed: 1.85,
		range: .85,
		trainMs: 14e3,
		prefer: "defense",
		ignoreWalls: true,
		shootOverWalls: false,
		desc: "A tropa mais veloz. Salta muros e foca defesas."
	},
	general: {
		type: "general",
		name: "General Shin",
		costBread: 1e3,
		costGold: 0,
		hp: 2e3,
		dps: 85,
		speed: 1.45,
		range: 1.05,
		trainMs: 4e4,
		prefer: "core",
		ignoreWalls: true,
		shootOverWalls: false,
		desc: "Um por condado. Evolui só com cartas a partir do Nv.8."
	},
	generaless: {
		type: "generaless",
		name: "General Leona",
		costBread: 900,
		costGold: 0,
		hp: 1100,
		dps: 62,
		speed: 1.55,
		range: 4.8,
		trainMs: 36e3,
		prefer: "core",
		ignoreWalls: true,
		shootOverWalls: true,
		desc: "À distância. Evolui só com cartas."
	},
	defender: {
		type: "defender",
		name: "Defensor da Guilda",
		costBread: 0,
		costGold: 5e3,
		hp: 220,
		dps: 16,
		speed: 1.05,
		range: 1.05,
		trainMs: 1e4,
		prefer: "nearest",
		ignoreWalls: false,
		shootOverWalls: false,
		desc: "Custa 5.000 Libras. Capacidade sobe no Campo de Treino."
	}
};
function wallCap(countyLevel) {
	return 200 + 55 * Math.max(0, countyLevel - 1);
}
function countyUpgradeCost(fromLevel) {
	if (fromLevel < 1 || fromLevel >= 15) return {
		gold: 0,
		niens: 0
	};
	if (fromLevel < 10) return {
		gold: 3e4 * 2 ** (fromLevel - 1),
		niens: 0
	};
	return {
		gold: 0,
		niens: fromLevel === 10 ? 1 : fromLevel === 11 ? 2 : fromLevel === 12 ? 4 : fromLevel === 13 ? 8 : 10
	};
}
function upgradeCost(type, level) {
	return (BUILDINGS[type].costGold || 400) * 2 ** (level - 1);
}
function productionPerSec(level, boosted = false) {
	const base = 36 * level / 60;
	return boosted ? base * PASS_BOOST_MULT : base;
}
function storageCap(level) {
	return Math.round(productionPerSec(level) * 60 * 12);
}
function armyCapacity(campCount) {
	return 30 + campCount * 40;
}
function isHero(type) {
	return type === "general" || type === "generaless";
}
function trainCostFor(type, level) {
	const mul = 2 ** (Math.max(1, Math.floor(level || 1)) - 1);
	if (type === "defender") return {
		kind: "gold",
		amount: DEFENDER_COST * mul
	};
	return {
		kind: "bread",
		amount: TROOPS[type].costBread * mul
	};
}
function troopCardsFor(nextLevel) {
	if (nextLevel < 2) return 0;
	return 3 * 2 ** (nextLevel - 2);
}
function troopUpgradeGold(nextLevel) {
	return 1500 * 2 ** (nextLevel - 2);
}
function troopUpgradeBread(nextLevel) {
	return 600 * 2 ** (nextLevel - 2);
}
function generalCardsFor(nextLevel) {
	return nextLevel;
}
function campUpgradeGold(fromLevel) {
	if (fromLevel < 1) return 0;
	return 8e4 * 2 ** (fromLevel - 1);
}
function defenderCap(campLevel) {
	return 2 + campLevel * 2;
}
function lootCapForCounty(countyLevel) {
	return Math.round(LOOT_CAP * 1.05 ** (Math.max(1, Math.min(15, Math.floor(countyLevel || 1))) - 1));
}
function lootForStars(stars, countyLevel = 1) {
	const n = Math.max(0, Math.min(3, Math.floor(stars)));
	const cap = lootCapForCounty(countyLevel);
	const scale = cap / LOOT_CAP;
	let gold = 0;
	for (let i = 0; i < n; i++) gold += Math.round((LOOT_BANDS[i]?.gold ?? 0) * scale);
	return Math.min(cap, gold);
}
function passSeasonKey(now = Date.now()) {
	const d = new Date(now);
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).formatToParts(d);
	const year = Number(parts.find((p) => p.type === "year")?.value);
	const month = Number(parts.find((p) => p.type === "month")?.value);
	return {
		year,
		month,
		key: `${year}-${String(month).padStart(2, "0")}`
	};
}
function passWindow(now = Date.now()) {
	const { year, month } = passSeasonKey(now);
	if (year < 2026 || year === 2026 && month < 9) {
		const start = (/* @__PURE__ */ new Date("2026-09-01T00:00:00-03:00")).getTime();
		return {
			active: false,
			endsAt: start,
			startsAt: start,
			wait: true
		};
	}
	const start = (/* @__PURE__ */ new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`)).getTime();
	const end = start + (month === 2 ? 27 : 30) * 24 * 36e5;
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;
	const nextStart = (/* @__PURE__ */ new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00-03:00`)).getTime();
	return {
		active: now >= start && now < end,
		endsAt: end,
		startsAt: start,
		wait: now >= end && now < nextStart
	};
}
function passCostNiens(seasonKey) {
	const [y, m] = seasonKey.split("-").map(Number);
	const idx = (y - 2026) * 12 + (m - 9);
	return 15 + Math.max(0, idx);
}
function passCostWithDiscount(seasonKey, hasScroll) {
	const base = passCostNiens(seasonKey);
	if (!hasScroll) return base;
	return Math.max(1, Math.ceil(base * .55));
}
function passReward(level) {
	if (level === 48) return {
		gold: 0,
		bread: 0,
		niens: 0,
		troopCards: 12,
		generalCards: 0,
		label: "12 cartas de tropa"
	};
	if (level === 49) return {
		gold: 0,
		bread: 0,
		niens: 0,
		troopCards: 0,
		generalCards: 6,
		label: "6 cartas de general"
	};
	if (level === 50) return {
		gold: 5e5,
		bread: 5e5,
		niens: 1,
		troopCards: 0,
		generalCards: 0,
		label: `1 Nien + 500k ${GOLD_NAME_PL} + 500k pão`
	};
	if (level % 2 === 0) return {
		gold: 0,
		bread: 4e3 + level * 600,
		niens: 0,
		troopCards: 0,
		generalCards: 0,
		label: `${4e3 + level * 600} pão`
	};
	return {
		gold: 5e3 + level * 800,
		bread: 0,
		niens: 0,
		troopCards: 0,
		generalCards: 0,
		label: `${5e3 + level * 800} ${GOLD_NAME_PL}`
	};
}
function freePassReward(level) {
	if (level === 48) return {
		gold: 0,
		bread: 0,
		niens: 0,
		troopCards: 6,
		generalCards: 0,
		label: "6 cartas de tropa"
	};
	if (level === 49) return {
		gold: 0,
		bread: 0,
		niens: 0,
		troopCards: 0,
		generalCards: 3,
		label: "3 cartas de general"
	};
	if (level === 50) return {
		gold: 1e5,
		bread: 1e5,
		niens: 0,
		troopCards: 3,
		generalCards: 0,
		label: `3 cartas de tropa + 100k ${GOLD_NAME_PL} + 100k pão`
	};
	if (level % 2 === 0) {
		const bread = Math.round((4e3 + level * 600) / 2);
		return {
			gold: 0,
			bread,
			niens: 0,
			troopCards: 0,
			generalCards: 0,
			label: `${bread} pão`
		};
	}
	const gold = Math.round((5e3 + level * 800) / 2);
	return {
		gold,
		bread: 0,
		niens: 0,
		troopCards: 0,
		generalCards: 0,
		label: `${gold} ${GOLD_NAME_PL}`
	};
}
function allianceSlots(level) {
	return 30 + 10 * (Math.max(1, Math.min(7, Math.floor(level || 1))) - 1);
}
function allianceXpToNext(level) {
	if (level < 1 || level >= 7) return 0;
	return ALLIANCE_XP_BASE * 2 ** (level - 1);
}
function applyAllianceXp(level, xp, gained) {
	let lv = Math.max(1, Math.min(7, Math.floor(level || 1)));
	let cur = Math.max(0, Math.floor(xp || 0)) + Math.max(0, Math.floor(gained));
	while (lv < 7) {
		const need = allianceXpToNext(lv);
		if (cur < need) break;
		cur -= need;
		lv += 1;
	}
	return {
		level: lv,
		xp: cur
	};
}
function warWindow(now = Date.now()) {
	const key = brtDayKey(now);
	const start = (/* @__PURE__ */ new Date(`${key}T00:00:00-03:00`)).getTime();
	const end = start + 864e5;
	return {
		open: now >= start && now < end,
		start,
		end,
		key
	};
}
/** Active same-day war: has a foe, not sitting out, not yet paid out. */
function allianceAtWarToday(a, now = Date.now()) {
	const win = warWindow(now);
	return (a.warDay ?? a.week) === win.key && !a.resolved && Boolean(a.foeId) && !a.sittingOut;
}
function pad2(n) {
	return String(n).padStart(2, "0");
}
function brtParts(now) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Sao_Paulo",
		weekday: "short",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	});
	return Object.fromEntries(fmt.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
}
/** Segunda 8h → domingo 23h, horário de Brasília. */
function rankingWindow(now = Date.now()) {
	const parts = brtParts(now);
	const wd = parts.weekday ?? "Mon";
	const y = Number(parts.year);
	const m = Number(parts.month);
	const d = Number(parts.day);
	const idx = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	}[wd] ?? 1;
	let monday = (/* @__PURE__ */ new Date(`${y}-${pad2(m)}-${pad2(d)}T00:00:00-03:00`)).getTime() + (idx === 0 ? -6 : 1 - idx) * 24 * 36e5;
	let mondayParts = brtParts(monday + 432e5);
	let key = `${mondayParts.year}-${mondayParts.month}-${mondayParts.day}`;
	let start = (/* @__PURE__ */ new Date(`${key}T08:00:00-03:00`)).getTime();
	if (now < start) {
		monday -= 6048e5;
		mondayParts = brtParts(monday + 432e5);
		key = `${mondayParts.year}-${mondayParts.month}-${mondayParts.day}`;
		start = (/* @__PURE__ */ new Date(`${key}T08:00:00-03:00`)).getTime();
	}
	const sunParts = brtParts(monday + 5184e5 + 432e5);
	const end = (/* @__PURE__ */ new Date(`${sunParts.year}-${sunParts.month}-${sunParts.day}T23:00:00-03:00`)).getTime();
	const nextStart = start + 6048e5;
	return {
		key,
		open: now >= start && now < end,
		claim: now >= end && now < nextStart,
		start,
		end
	};
}
function weeklyPrize(rank) {
	if (rank < 1 || rank > 20) return null;
	if (rank <= 3) return {
		gold: 0,
		troopCards: 4,
		generalCards: 2,
		label: "4 cartas tropa + 2 general"
	};
	if (rank <= 7) return {
		gold: 0,
		troopCards: 3,
		generalCards: 0,
		label: "3 cartas tropa"
	};
	const t = (20 - rank) / 12;
	const gold = Math.round((5e4 + t * 25e4) / 1e3) * 1e3;
	return {
		gold,
		troopCards: 0,
		generalCards: 0,
		label: `${gold.toLocaleString("pt")} ${GOLD_NAME_PL}`
	};
}
function goldWord(n = 2) {
	return n === 1 ? GOLD_NAME : GOLD_NAME_PL;
}
function brtDayKey(now = Date.now()) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(new Date(now));
}
function dailyNienSendCap(countyLevel) {
	if (countyLevel >= 11) return 20;
	if (countyLevel >= 6) return 10;
	return 5;
}
function dailyAttackCap(war) {
	return war ? 2 : 12;
}
//#endregion
//#region src/lib/game/iso.ts
function inGrid(gx, gy, size = 1) {
	return gx >= 0 && gy >= 0 && gx + size <= 44 && gy + size <= 44;
}
function cellsOf(gx, gy, size) {
	const out = [];
	for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push([gx + x, gy + y]);
	return out;
}
//#endregion
//#region src/lib/game/world.ts
let n = 1;
const nid = (p = "b") => `${p}${Date.now().toString(36)}${n++}`;
function makeId(prefix) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let s = "";
	const buf = /* @__PURE__ */ new Uint8Array(6);
	crypto.getRandomValues(buf);
	for (const b of buf) s += alphabet[b % 32];
	return `${prefix}-${s}`;
}
function starterVillage() {
	const now = Date.now();
	return [
		{
			id: nid("c"),
			type: "castle",
			gx: 20,
			gy: 20,
			level: 1
		},
		{
			id: nid("m"),
			type: "mine",
			gx: 16,
			gy: 19,
			level: 1,
			lastCollect: now
		},
		{
			id: nid("f"),
			type: "farm",
			gx: 25,
			gy: 19,
			level: 1,
			lastCollect: now
		},
		{
			id: nid("w"),
			type: "wall",
			gx: 20,
			gy: 18,
			level: 1,
			dir: "h"
		},
		{
			id: nid("w"),
			type: "wall",
			gx: 21,
			gy: 18,
			level: 1,
			dir: "h"
		},
		{
			id: nid("w"),
			type: "wall",
			gx: 22,
			gy: 18,
			level: 1,
			dir: "h"
		},
		{
			id: nid("w"),
			type: "wall",
			gx: 19,
			gy: 18,
			level: 1,
			dir: "v"
		}
	];
}
function occupancy(buildings, ignoreId) {
	const set = /* @__PURE__ */ new Set();
	for (const b of buildings) {
		if (b.id === ignoreId) continue;
		const size = BUILDINGS[b.type].size;
		for (const [x, y] of cellsOf(b.gx, b.gy, size)) set.add(`${x},${y}`);
	}
	return set;
}
function paddedOccupancy(buildings, ignoreId) {
	const set = /* @__PURE__ */ new Set();
	for (const b of buildings) {
		if (b.id === ignoreId) continue;
		if (b.type === "wall") continue;
		const size = BUILDINGS[b.type].size;
		for (let y = -1; y <= size; y++) for (let x = -1; x <= size; x++) set.add(`${b.gx + x},${b.gy + y}`);
	}
	return set;
}
function canPlace(buildings, type, gx, gy, ignoreId) {
	const size = BUILDINGS[type].size;
	if (!inGrid(gx, gy, size)) return false;
	const taken = occupancy(buildings, ignoreId);
	for (const [x, y] of cellsOf(gx, gy, size)) if (taken.has(`${x},${y}`)) return false;
	if (type !== "wall") {
		const pad = paddedOccupancy(buildings, ignoreId);
		for (const [x, y] of cellsOf(gx, gy, size)) if (pad.has(`${x},${y}`)) return false;
	}
	return true;
}
function snapPlace(buildings, type, gx, gy, ignoreId) {
	const x = Math.round(gx);
	const y = Math.round(gy);
	if (canPlace(buildings, type, x, y, ignoreId)) return {
		gx: x,
		gy: y
	};
	for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (canPlace(buildings, type, x + dx, y + dy, ignoreId)) return {
		gx: x + dx,
		gy: y + dy
	};
	return null;
}
function countType(buildings, type) {
	return buildings.filter((b) => b.type === type).length;
}
function canPlaceWall(buildings, countyLevel) {
	return countType(buildings, "wall") < wallCap(countyLevel);
}
function wallRow(buildings, start) {
	if (start.type !== "wall") return [start];
	const dir = start.dir ?? "h";
	const map = new Map(buildings.filter((b) => b.type === "wall" && (b.dir ?? "h") === dir).map((b) => [`${b.gx},${b.gy}`, b]));
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	const q = [start];
	while (q.length) {
		const cur = q.pop();
		const k = `${cur.gx},${cur.gy}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(cur);
		const nbs = dir === "h" ? [[cur.gx - 1, cur.gy], [cur.gx + 1, cur.gy]] : [[cur.gx, cur.gy - 1], [cur.gx, cur.gy + 1]];
		for (const [x, y] of nbs) {
			const hit = map.get(`${x},${y}`);
			if (hit) q.push(hit);
		}
	}
	return out;
}
//#endregion
//#region src/lib/game/bots.ts
const LORDS = [
	{
		id: "CDN-ALDRIC",
		nick: "Sir Aldric",
		title: "Escudeiro",
		rank: 0,
		lootGold: lootCapForCounty(1),
		lootBread: 0,
		allianceId: "AL-CORVO"
	},
	{
		id: "CDN-MARELA",
		nick: "Marela do Vale",
		title: "Capitã",
		rank: 1,
		lootGold: lootCapForCounty(2),
		lootBread: 0,
		allianceId: "AL-ROSA"
	},
	{
		id: "CDN-RODRIGO",
		nick: "Rodrigo Caldeira",
		title: "Celador",
		rank: 2,
		lootGold: lootCapForCounty(3),
		lootBread: 0,
		allianceId: "AL-VALE"
	},
	{
		id: "CDN-ISOLDE",
		nick: "Dama Isolde",
		title: "Baronesa",
		rank: 3,
		lootGold: lootCapForCounty(4),
		lootBread: 0,
		allianceId: "AL-TORRE"
	},
	{
		id: "CDN-FERNAN",
		nick: "Fernão Negro",
		title: "Marechal",
		rank: 4,
		lootGold: lootCapForCounty(5),
		lootBread: 0,
		allianceId: "AL-CORVO"
	},
	{
		id: "CDN-BEATRIZ",
		nick: "Beatriz da Torre",
		title: "Duquesa",
		rank: 5,
		lootGold: lootCapForCounty(6),
		lootBread: 0,
		allianceId: "AL-ROSA"
	}
];
function seedChat(now = Date.now()) {
	return [
		{
			id: "m0",
			fromId: "CDN-HERALDO",
			fromNick: "Heraldo",
			text: "Bem-vindos. Niens são gemas. Libras se saqueiam. Gemas, não.",
			at: now - 12e4,
			channel: "global"
		},
		{
			id: "m1",
			fromId: LORDS[0].id,
			fromNick: LORDS[0].nick,
			text: "Procuro ataque honrado. Libras altas. Niens no cofre.",
			at: now - 8e4,
			channel: "global"
		},
		{
			id: "m2",
			fromId: LORDS[3].id,
			fromNick: LORDS[3].nick,
			text: "Guerra de aliança dura um dia. Duelo no campo.",
			at: now - 35e3,
			channel: "global"
		}
	];
}
function findLord(id) {
	const key = id.trim().toUpperCase();
	return LORDS.find((l) => l.id === key);
}
function findNick(id) {
	const key = id.trim().toUpperCase();
	const lord = findLord(key);
	if (lord) return lord.nick;
	if (key.startsWith("CDN-") && key.length >= 8) return `Senhor ${key.slice(4, 8)}`;
	return null;
}
//#endregion
//#region src/lib/game/save.ts
const DEFAULT_LEVELS = {
	infantry: 1,
	archers: 1,
	cavalry: 1,
	general: 1,
	generaless: 1,
	defender: 1
};
const SAVE_FIELDS = [
	"version",
	"player",
	"gold",
	"bread",
	"niens",
	"troopCards",
	"generalCards",
	"countyLevel",
	"campLevel",
	"troopLevels",
	"buildings",
	"army",
	"training",
	"lastTick",
	"tutorial",
	"chat",
	"allianceChat",
	"raids",
	"stars",
	"raidsWon",
	"muted",
	"shieldUntil",
	"referredBy",
	"referralClaimed",
	"inviteCopied",
	"pass",
	"alliance",
	"war",
	"weekStars",
	"weekKey",
	"weekClaimed",
	"ledger",
	"niensSentDay",
	"niensSentToday",
	"attacksReceivedDay",
	"attacksReceived",
	"attacksByTarget",
	"boostUntil",
	"passDiscount"
];
function defaultSave(nick = "Senhor", referredBy = null) {
	const now = Date.now();
	const season = passSeasonKey(now).key;
	return {
		version: 6,
		player: {
			id: makeId("CDN"),
			nick: nick.trim() || "Senhor",
			createdAt: now
		},
		gold: 8e3,
		bread: 400,
		niens: 0,
		troopCards: 2,
		generalCards: 0,
		countyLevel: 1,
		campLevel: 1,
		troopLevels: { ...DEFAULT_LEVELS },
		buildings: starterVillage(),
		army: {
			infantry: 6,
			archers: 4,
			cavalry: 0,
			general: 0,
			generaless: 0,
			defender: 0
		},
		training: [],
		lastTick: now,
		tutorial: false,
		chat: seedChat(now),
		allianceChat: [],
		raids: [],
		stars: 0,
		raidsWon: 0,
		muted: false,
		shieldUntil: 0,
		referredBy,
		referralClaimed: false,
		inviteCopied: false,
		pass: {
			season,
			purchased: false,
			stars: 0,
			claimed: [],
			claimedFree: [],
			extrasClaimed: []
		},
		alliance: null,
		war: null,
		weekStars: 0,
		weekKey: "",
		weekClaimed: null,
		ledger: [],
		niensSentDay: "",
		niensSentToday: 0,
		attacksReceivedDay: "",
		attacksReceived: 0,
		attacksByTarget: {},
		boostUntil: 0,
		passDiscount: false
	};
}
function cleanBuilding(b, countyLevel, now) {
	const next = {
		id: String(b.id ?? ""),
		type: b.type,
		gx: Number(b.gx),
		gy: Number(b.gy),
		level: b.type === "castle" ? Math.max(1, countyLevel) : Math.max(1, Number(b.level || 1))
	};
	if (b.lastCollect != null) next.lastCollect = Number(b.lastCollect) || now;
	else if (b.type === "mine" || b.type === "farm") next.lastCollect = now;
	if (b.type === "wall") next.dir = b.dir === "v" ? "v" : "h";
	return next;
}
function migrate(s) {
	const base = defaultSave(s.player?.nick ?? "Senhor");
	const now = Date.now();
	const countyLevel = Math.max(1, Number(s.countyLevel ?? base.countyLevel ?? 1));
	const buildings = Array.isArray(s.buildings) && s.buildings.length ? s.buildings : base.buildings;
	const season = passSeasonKey(now).key;
	const passRaw = s.pass;
	const pass = passRaw?.season === season ? {
		season,
		purchased: !!passRaw.purchased,
		stars: Number(passRaw.stars ?? 0),
		claimed: Array.isArray(passRaw.claimed) ? passRaw.claimed.map(Number) : [],
		claimedFree: Array.isArray(passRaw.claimedFree) ? passRaw.claimedFree.map(Number) : [],
		extrasClaimed: Array.isArray(passRaw.extrasClaimed) ? passRaw.extrasClaimed.filter((x) => x === "boost" || x === "discount") : []
	} : {
		season,
		purchased: false,
		stars: 0,
		claimed: [],
		claimedFree: [],
		extrasClaimed: []
	};
	const alliance = s.alliance ? {
		id: String(s.alliance.id),
		name: String(s.alliance.name ?? "Aliança"),
		members: Array.isArray(s.alliance.members) ? s.alliance.members : [],
		minLevel: Math.max(1, Number(s.alliance.minLevel ?? 1)),
		level: Math.max(1, Number(s.alliance.level ?? 1)),
		xp: Math.max(0, Number(s.alliance.xp ?? 0)),
		leaderId: String(s.alliance.leaderId ?? s.player?.id ?? ""),
		slots: Math.max(30, Number(s.alliance.slots ?? 30)),
		openJoin: s.alliance.openJoin !== false,
		joinRequests: Array.isArray(s.alliance.joinRequests) ? s.alliance.joinRequests.map((r) => ({
			id: String(r.id),
			playerId: String(r.playerId),
			nick: String(r.nick ?? "Senhor"),
			uid: r.uid ? String(r.uid) : void 0,
			at: Number(r.at ?? 0)
		})) : []
	} : null;
	const war = s.war ? {
		week: String(s.war.week ?? ""),
		foeId: s.war.foeId ?? null,
		foeName: String(s.war.foeName ?? ""),
		chest: Number(s.war.chest ?? 0),
		ourStars: Number(s.war.ourStars ?? 0),
		theirStars: Number(s.war.theirStars ?? 0),
		attacks: s.war.attacks ?? {},
		sittingOut: !!s.war.sittingOut,
		resolved: !!s.war.resolved,
		participants: Array.isArray(s.war.participants) ? s.war.participants.map(String) : []
	} : null;
	return {
		...base,
		...s,
		version: 6,
		player: {
			...base.player,
			...s.player,
			id: s.player?.id || base.player.id
		},
		army: {
			...base.army,
			...s.army,
			defender: s.army?.defender ?? 0,
			general: Math.min(1, Number(s.army?.general ?? 0)),
			generaless: Math.min(1, Number(s.army?.generaless ?? 0))
		},
		troopLevels: {
			...base.troopLevels,
			...s.troopLevels
		},
		troopCards: s.troopCards ?? 2,
		generalCards: s.generalCards ?? 0,
		countyLevel,
		campLevel: s.campLevel ?? 1,
		buildings: buildings.map((b) => cleanBuilding(b, countyLevel, now)),
		training: Array.isArray(s.training) ? s.training : [],
		chat: Array.isArray(s.chat) ? s.chat.slice(-40) : base.chat,
		allianceChat: Array.isArray(s.allianceChat) ? s.allianceChat.slice(-40) : [],
		shieldUntil: s.shieldUntil ?? 0,
		referredBy: s.referredBy ?? null,
		referralClaimed: s.referralClaimed ?? false,
		inviteCopied: s.inviteCopied ?? false,
		pass,
		alliance,
		war,
		weekStars: s.weekStars ?? 0,
		weekKey: s.weekKey ?? "",
		weekClaimed: s.weekClaimed ?? null,
		ledger: Array.isArray(s.ledger) ? s.ledger.slice(0, 40) : [],
		raids: (Array.isArray(s.raids) ? s.raids.slice(-24) : []).map((r) => ({
			id: r.id,
			at: r.at,
			attacker: r.attacker,
			defender: r.defender ?? "",
			gold: r.gold ?? 0,
			bread: r.bread ?? 0,
			incoming: !!r.incoming,
			destruction: r.destruction ?? 0,
			troopsLost: r.troopsLost ?? 0,
			stars: r.stars ?? 0
		})),
		niensSentDay: s.niensSentDay ?? "",
		niensSentToday: s.niensSentToday ?? 0,
		attacksReceivedDay: s.attacksReceivedDay ?? "",
		attacksReceived: s.attacksReceived ?? 0,
		attacksByTarget: s.attacksByTarget ?? {},
		boostUntil: Number(s.boostUntil ?? 0),
		passDiscount: Boolean(s.passDiscount)
	};
}
/** Drop Zustand actions / UI fields so the cache never stores functions. */
function toSave(raw) {
	const src = raw && typeof raw === "object" ? raw : {};
	const picked = {};
	for (const key of SAVE_FIELDS) if (key in src) picked[key] = src[key];
	return migrate(picked);
}
function migrateCloud(s) {
	return migrate(s);
}
//#endregion
//#region src/lib/game/sim.ts
var GameError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "GameError";
	}
};
const EMPTY_ARMY = {
	infantry: 0,
	archers: 0,
	cavalry: 0,
	general: 0,
	generaless: 0,
	defender: 0
};
function armyCountOf(a) {
	if (!a) return 0;
	return (a.infantry || 0) + (a.archers || 0) + (a.cavalry || 0) + (a.general || 0) + (a.generaless || 0) + (a.defender || 0);
}
function normalizeArmy(raw, fallback) {
	if (!raw || typeof raw !== "object") return fallback ?? { ...EMPTY_ARMY };
	const a = raw;
	if (!("infantry" in a || "archers" in a || "cavalry" in a || "defender" in a || "general" in a || "generaless" in a)) return fallback ?? { ...EMPTY_ARMY };
	return {
		infantry: Math.max(0, Math.floor(Number(a.infantry) || 0)),
		archers: Math.max(0, Math.floor(Number(a.archers) || 0)),
		cavalry: Math.max(0, Math.floor(Number(a.cavalry) || 0)),
		general: Math.min(1, Math.max(0, Math.floor(Number(a.general) || 0))),
		generaless: Math.min(1, Math.max(0, Math.floor(Number(a.generaless) || 0))),
		defender: Math.max(0, Math.floor(Number(a.defender) || 0))
	};
}
function resolveDuelStatus(status, opts = {}) {
	const now = opts.now ?? Date.now();
	const s = String(status ?? "pending");
	if (s === "pending") {
		const until = Number(opts.until ?? opts.challengeUntil ?? 0);
		if (until && now > until) return "expired";
		return "pending";
	}
	if (s === "prep" || s === "fight") {
		const fightEndsAt = Number(opts.fightEndsAt ?? 0);
		const until = Number(opts.until ?? 0);
		const createdAt = Number(opts.createdAt ?? 0);
		const challengeUntil = Number(opts.challengeUntil ?? 0);
		const deadline = fightEndsAt || until || (createdAt ? createdAt + 51e4 : 0) || (challengeUntil ? challengeUntil + 51e4 : 0);
		if (!deadline || now > deadline) return "expired";
		return s;
	}
	if (s === "declined" || s === "expired" || s === "done") return s;
	return "expired";
}
function jobCount(j) {
	const n = Math.floor(Number(j.count ?? 1));
	return n > 0 ? n : 1;
}
function trainingQueued(jobs) {
	return jobs.reduce((n, j) => n + jobCount(j), 0);
}
function armySize(s) {
	const a = s.army;
	return a.infantry + a.archers + a.cavalry + a.general + a.generaless + a.defender + trainingQueued(s.training);
}
function producerKind(t) {
	if (t === "mine") return "gold";
	if (t === "farm") return "bread";
	return null;
}
function storedAmount(b, now = Date.now(), boosted = false) {
	if (b.type !== "mine" && b.type !== "farm") return 0;
	const t0 = b.lastCollect ?? now;
	const elapsed = Math.max(0, (now - t0) / 1e3);
	return Math.floor(Math.min(storageCap(b.level), productionPerSec(b.level, boosted) * elapsed));
}
function kindField(kind) {
	if (kind === "troopCards") return "troopCards";
	if (kind === "generalCards") return "generalCards";
	return kind;
}
function pushLedger(out, s, type, currency, amount, source) {
	if (!amount) return;
	const field = kindField(currency);
	const before = Number(s[field]);
	out.push({
		type,
		currency,
		amount,
		balanceBefore: before,
		balanceAfter: before + amount,
		source
	});
}
function coalesceJobs(jobs) {
	const map = /* @__PURE__ */ new Map();
	const order = [];
	for (const j of jobs) {
		const prev = map.get(j.type);
		if (!prev) {
			map.set(j.type, {
				...j,
				count: jobCount(j)
			});
			order.push(j.type);
		} else map.set(j.type, {
			...prev,
			count: jobCount(prev) + jobCount(j),
			remaining: Math.min(prev.remaining, j.remaining)
		});
	}
	return order.map((t) => map.get(t));
}
function applyTraining(s, dtMs) {
	const army = { ...s.army };
	const raw = [];
	for (const j of s.training) {
		let remaining = j.remaining - dtMs;
		let count = jobCount(j);
		const trainMs = Math.max(1, TROOPS[j.type]?.trainMs ?? 6e3);
		while (count > 0 && remaining <= 0) {
			army[j.type] += 1;
			count -= 1;
			if (count > 0) remaining += trainMs;
		}
		if (count > 0) raw.push({
			id: j.id,
			type: j.type,
			remaining,
			count
		});
	}
	return {
		army,
		jobs: coalesceJobs(raw)
	};
}
function settle(s, now = Date.now()) {
	const ledger = [];
	const dtMs = Math.min(288e5, Math.max(0, now - (s.lastTick || now)));
	const trained = applyTraining(s, dtMs);
	const season = passSeasonKey(now).key;
	const pass = s.pass?.season === season ? {
		season,
		purchased: !!s.pass.purchased,
		stars: Number(s.pass.stars ?? 0),
		claimed: Array.isArray(s.pass.claimed) ? s.pass.claimed : [],
		claimedFree: Array.isArray(s.pass.claimedFree) ? s.pass.claimedFree : [],
		extrasClaimed: Array.isArray(s.pass.extrasClaimed) ? s.pass.extrasClaimed : []
	} : {
		season,
		purchased: false,
		stars: 0,
		claimed: [],
		claimedFree: [],
		extrasClaimed: []
	};
	const war = s.war;
	const gold = s.gold;
	const upkeep = armySize({
		army: trained.army,
		training: trained.jobs
	}) * 20 * (dtMs / 36e5);
	let bread = s.bread;
	if (upkeep > 0) {
		const spend = Math.min(bread, upkeep);
		if (spend) {
			pushLedger(ledger, {
				...s,
				bread
			}, "upkeep", "bread", -spend, "upkeep");
			bread -= spend;
		}
	}
	const rankWin = rankingWindow(now);
	const weekStars = s.weekKey === rankWin.key ? s.weekStars : 0;
	return {
		save: {
			...s,
			army: trained.army,
			training: trained.jobs,
			lastTick: now,
			pass,
			war,
			gold,
			bread,
			weekStars,
			weekKey: rankWin.key
		},
		ledger
	};
}
function collectBuilding(s, id, now = Date.now()) {
	const b = s.buildings.find((x) => x.id === id);
	if (!b) throw new GameError("Construção não encontrada.");
	const kind = producerKind(b.type);
	if (!kind) throw new GameError("Isto não produz recursos.");
	const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
	if (amt < 1) throw new GameError("Ainda está a produzir.");
	const buildings = s.buildings.map((x) => x.id === id ? {
		...x,
		lastCollect: now
	} : x);
	const ledger = [];
	pushLedger(ledger, s, "collect", kind, amt, id);
	return {
		save: {
			...s,
			buildings,
			gold: kind === "gold" ? s.gold + amt : s.gold,
			bread: kind === "bread" ? s.bread + amt : s.bread
		},
		ledger,
		toast: kind === "gold" ? `+${amt} ${goldWord(amt)}` : `+${amt} pão`
	};
}
function collectAllBuildings(s, now = Date.now()) {
	let gold = 0;
	let bread = 0;
	const buildings = s.buildings.map((b) => {
		if (b.type === "mine") {
			const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
			gold += amt;
			return amt > 0 ? {
				...b,
				lastCollect: now
			} : b;
		}
		if (b.type === "farm") {
			const amt = storedAmount(b, now, (s.boostUntil ?? 0) > now);
			bread += amt;
			return amt > 0 ? {
				...b,
				lastCollect: now
			} : b;
		}
		return b;
	});
	if (!gold && !bread) throw new GameError("Nada pronto para recolher.");
	const ledger = [];
	const next = {
		...s,
		buildings,
		gold: s.gold + gold,
		bread: s.bread + bread
	};
	if (gold) pushLedger(ledger, s, "collect_all", "gold", gold, "collectAll");
	if (bread) pushLedger(ledger, {
		...s,
		gold: next.gold
	}, "collect_all", "bread", bread, "collectAll");
	return {
		save: next,
		ledger,
		toast: `Coletado ${gold} ${goldWord(gold)} e ${bread} pão.`
	};
}
function placeBuilding(s, input) {
	const type = input.type;
	const def = BUILDINGS[type];
	if (!def) throw new GameError("Construção inválida.");
	const ignore = input.movingId ?? void 0;
	const snapped = snapPlace(s.buildings, type, input.gx, input.gy, ignore);
	if (!snapped || !canPlace(s.buildings, type, snapped.gx, snapped.gy, ignore)) throw new GameError("Não cabe aqui. Deixe espaço entre as construções.");
	if (ignore) {
		if (!s.buildings.find((b) => b.id === ignore)) throw new GameError("Construção não encontrada.");
		return {
			save: {
				...s,
				buildings: s.buildings.map((b) => b.id === ignore ? {
					...b,
					gx: snapped.gx,
					gy: snapped.gy
				} : b)
			},
			ledger: [],
			toast: "Estrutura movida."
		};
	}
	if (s.gold < def.costGold) throw new GameError(`Faltam ${GOLD_NAME_PL}.`);
	if (type === "wall" && !canPlaceWall(s.buildings, s.countyLevel)) throw new GameError(`Limite de muros: ${wallCap(s.countyLevel)}.`);
	const b = {
		id: nid(type),
		type,
		gx: snapped.gx,
		gy: snapped.gy,
		level: 1,
		lastCollect: Date.now(),
		...type === "wall" ? { dir: input.dir ?? "h" } : {}
	};
	const ledger = [];
	pushLedger(ledger, s, "place", "gold", -def.costGold, type);
	return {
		save: {
			...s,
			buildings: [...s.buildings, b],
			gold: s.gold - def.costGold
		},
		ledger,
		toast: `${def.name} erguido.`
	};
}
function upgradeBuilding(s, id) {
	const b = s.buildings.find((x) => x.id === id);
	if (!b) throw new GameError("Construção não encontrada.");
	if (b.type === "castle") throw new GameError("O castelo avança com o nível do condado.");
	if (b.level >= s.countyLevel) throw new GameError("Limite do condado. Maximize tudo e avance o nível.");
	const cost = upgradeCost(b.type, b.level);
	if (s.gold < cost) throw new GameError(`Faltam ${GOLD_NAME_PL} para melhorar.`);
	const ledger = [];
	pushLedger(ledger, s, "upgrade", "gold", -cost, b.type);
	return {
		save: {
			...s,
			gold: s.gold - cost,
			buildings: s.buildings.map((x) => x.id === id ? {
				...x,
				level: x.level + 1
			} : x)
		},
		ledger,
		toast: `${BUILDINGS[b.type].name} nível ${b.level + 1}.`
	};
}
function upgradeAllOfType(s, type) {
	const targets = s.buildings.filter((b) => b.type === type && b.type !== "castle" && b.level < s.countyLevel);
	if (!targets.length) throw new GameError("Nada para melhorar neste tipo.");
	const cost = targets.reduce((n, b) => n + upgradeCost(b.type, b.level), 0);
	if (s.gold < cost) throw new GameError(`Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ids = new Set(targets.map((b) => b.id));
	const ledger = [];
	pushLedger(ledger, s, "upgrade_type", "gold", -cost, type);
	return {
		save: {
			...s,
			gold: s.gold - cost,
			buildings: s.buildings.map((b) => ids.has(b.id) ? {
				...b,
				level: b.level + 1
			} : b)
		},
		ledger,
		toast: `${targets.length}× ${BUILDINGS[type].name} → Nv.+1 · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`
	};
}
function upgradeWallRowSim(s, id) {
	const start = s.buildings.find((x) => x.id === id);
	if (!start || start.type !== "wall") throw new GameError("Escolhe um muro.");
	const targets = wallRow(s.buildings, start).filter((b) => b.level < s.countyLevel);
	if (!targets.length) throw new GameError("Fileira já no limite do condado.");
	const cost = targets.reduce((n, b) => n + upgradeCost("wall", b.level), 0);
	if (s.gold < cost) throw new GameError(`Fileira: ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ids = new Set(targets.map((b) => b.id));
	const ledger = [];
	pushLedger(ledger, s, "upgrade_wall_row", "gold", -cost, "wall");
	return {
		save: {
			...s,
			gold: s.gold - cost,
			buildings: s.buildings.map((b) => ids.has(b.id) ? {
				...b,
				level: b.level + 1
			} : b)
		},
		ledger,
		toast: `Fileira ${targets.length} muros · ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`
	};
}
function demolishBuilding(s, id) {
	const b = s.buildings.find((x) => x.id === id);
	if (!b || b.type === "castle") throw new GameError("Não podes demolir o castelo.");
	const refund = Math.floor(BUILDINGS[b.type].costGold * .5);
	const ledger = [];
	pushLedger(ledger, s, "demolish", "gold", refund, b.type);
	return {
		save: {
			...s,
			buildings: s.buildings.filter((x) => x.id !== id),
			gold: s.gold + refund
		},
		ledger,
		toast: `Demolido. +${refund} ${goldWord(refund)}.`
	};
}
function rotateWalls(s, id, rowIds) {
	const b = s.buildings.find((x) => x.id === id);
	if (!b || b.type !== "wall") throw new GameError("Escolhe um muro.");
	const ids = new Set(rowIds && rowIds.length ? rowIds : [id]);
	const dir = b.dir === "v" ? "h" : "v";
	return {
		save: {
			...s,
			buildings: s.buildings.map((x) => ids.has(x.id) ? {
				...x,
				dir
			} : x)
		},
		toast: dir === "v" ? "Muro em pé (I)." : "Muro deitado (—)."
	};
}
function enqueueTrain(training, type, qty, trainMs) {
	const i = training.findIndex((t) => t.type === type);
	if (i >= 0) {
		const cur = training[i];
		const next = training.slice();
		next[i] = {
			...cur,
			count: jobCount(cur) + qty
		};
		return next;
	}
	return [...training, {
		id: nid("t"),
		type,
		remaining: trainMs,
		count: qty
	}];
}
function clampTrainQty(raw) {
	const n = Math.floor(Number(raw ?? 1));
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.min(200, n);
}
function trainTroop(s, type, qtyRaw = 1) {
	const def = TROOPS[type];
	if (!def) throw new GameError("Tropa inválida.");
	if (countType(s.buildings, "barracks") < 1) throw new GameError("Construa um quartel primeiro.");
	let qty = clampTrainQty(qtyRaw);
	const ledger = [];
	if (isHero(type)) {
		if (s.army[type] + s.training.filter((t) => t.type === type).reduce((n, t) => n + jobCount(t), 0) >= 1) throw new GameError(`Só um${type === "generaless" ? "a" : ""} ${def.name.toLowerCase()} por condado.`);
		qty = 1;
	}
	if (type === "defender") {
		if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
		const used = s.army.defender + s.training.filter((t) => t.type === "defender").reduce((n, t) => n + jobCount(t), 0);
		const room = defenderCap(s.campLevel) - used;
		qty = Math.min(qty, room);
		if (qty < 1) throw new GameError("Capacidade de defensores no máximo. Melhore o campo.");
		const campRoom = armyCapacity(countType(s.buildings, "camp")) - armySize(s);
		qty = Math.min(qty, campRoom);
		if (qty < 1) throw new GameError("Acampamento lotado. Construa outro.");
		const cost = trainCostFor(type, s.troopLevels[type] ?? 1).amount * qty;
		if (s.gold < cost) throw new GameError(`Faltam ${GOLD_NAME_PL}.`);
		pushLedger(ledger, s, "train", "gold", -cost, type);
		return {
			save: {
				...s,
				gold: s.gold - cost,
				training: enqueueTrain(s.training, type, qty, def.trainMs)
			},
			ledger,
			toast: qty === 1 ? "Recrutando defensor da guilda." : `Recrutando ${qty} defensores da guilda.`
		};
	}
	const room = armyCapacity(countType(s.buildings, "camp")) - armySize(s);
	qty = Math.min(qty, room);
	if (qty < 1) throw new GameError("Acampamento lotado. Construa outro.");
	const cost = trainCostFor(type, s.troopLevels[type] ?? 1).amount * qty;
	if (s.bread < cost) throw new GameError("Pão insuficiente.");
	pushLedger(ledger, s, "train", "bread", -cost, type);
	return {
		save: {
			...s,
			bread: s.bread - cost,
			training: enqueueTrain(s.training, type, qty, def.trainMs)
		},
		ledger,
		toast: qty === 1 ? `Recrutando ${def.name}.` : `Recrutando ${qty} ${def.name}.`
	};
}
function speedTrainJob(s, id) {
	const job = s.training.find((t) => t.id === id);
	if (!job) throw new GameError("Recruta não encontrado.");
	if (s.gold < 2500) throw new GameError(`Precisa de ${SPEED_TRAIN_GOLD} ${GOLD_NAME_PL} para acelerar.`);
	const army = { ...s.army };
	army[job.type] += 1;
	const left = jobCount(job) - 1;
	const training = left > 0 ? s.training.map((t) => t.id === id ? {
		...t,
		count: left,
		remaining: TROOPS[job.type].trainMs
	} : t) : s.training.filter((t) => t.id !== id);
	const ledger = [];
	pushLedger(ledger, s, "speed_train", "gold", -2500, job.type);
	return {
		save: {
			...s,
			gold: s.gold - SPEED_TRAIN_GOLD,
			army,
			training
		},
		ledger,
		toast: `${TROOPS[job.type].name} pronto.`
	};
}
function buyNienSim(s) {
	if (s.gold < 55e4) throw new GameError(`Precisa de ${NIEN_COST_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ledger = [];
	pushLedger(ledger, s, "buy_nien", "gold", -55e4, "shop");
	const next = {
		...s,
		gold: s.gold - NIEN_COST_GOLD,
		niens: s.niens + 1
	};
	pushLedger(ledger, next, "buy_nien", "niens", 1, "shop");
	return {
		save: next,
		ledger,
		toast: "+1 Nien. Gema selada."
	};
}
function sellNienSim(s) {
	if (s.niens < 1) throw new GameError("Sem Niens para vender.");
	const ledger = [];
	pushLedger(ledger, s, "sell_nien", "niens", -1, "shop");
	const next = {
		...s,
		niens: s.niens - 1,
		gold: s.gold + NIEN_SELL_GOLD
	};
	pushLedger(ledger, {
		...s,
		niens: next.niens
	}, "sell_nien", "gold", NIEN_SELL_GOLD, "shop");
	return {
		save: next,
		ledger,
		toast: `+${NIEN_SELL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`
	};
}
function buyBreadPackSim(s) {
	if (s.gold < 2400) throw new GameError(`Precisa de ${BREAD_PACK_BUY_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ledger = [];
	pushLedger(ledger, s, "buy_bread", "gold", -2400, "shop");
	const next = {
		...s,
		gold: s.gold - BREAD_PACK_BUY_GOLD,
		bread: s.bread + BREAD_PACK
	};
	pushLedger(ledger, {
		...s,
		gold: next.gold
	}, "buy_bread", "bread", BREAD_PACK, "shop");
	return {
		save: next,
		ledger,
		toast: `+${BREAD_PACK.toLocaleString("pt")} pães.`
	};
}
function sellBreadPackSim(s) {
	if (s.bread < 1e3) throw new GameError(`Precisa de ${BREAD_PACK.toLocaleString("pt")} pães.`);
	const ledger = [];
	pushLedger(ledger, s, "sell_bread", "bread", -1e3, "shop");
	const next = {
		...s,
		bread: s.bread - BREAD_PACK,
		gold: s.gold + 900
	};
	pushLedger(ledger, {
		...s,
		bread: next.bread
	}, "sell_bread", "gold", 900, "shop");
	return {
		save: next,
		ledger,
		toast: `+${900 .toLocaleString("pt")} ${GOLD_NAME_PL}.`
	};
}
function spendForTransfer(s, amount, kind, now = Date.now()) {
	const n = Math.floor(amount);
	if (n <= 0) throw new GameError("Quantia inválida.");
	const field = kindField(kind);
	if (n > Number(s[field])) throw new GameError("Quantia inválida.");
	let next = { ...s };
	if (kind === "niens") {
		const day = brtDayKey(now);
		const sent = s.niensSentDay === day ? s.niensSentToday : 0;
		const cap = dailyNienSendCap(s.countyLevel);
		if (sent + n > cap) throw new GameError(`No nível ${s.countyLevel} podes enviar ${cap} Niens por dia. Já enviaste ${sent}.`);
		next.niensSentDay = day;
		next.niensSentToday = sent + n;
	}
	const ledger = [];
	pushLedger(ledger, next, "transfer_out", kind, -n, "transfer");
	next = {
		...next,
		[field]: Number(next[field]) - n
	};
	return {
		save: next,
		ledger
	};
}
function creditResource(s, amount, kind, type, source) {
	const n = Math.floor(amount);
	if (!n) return {
		save: s,
		ledger: []
	};
	const field = kindField(kind);
	if (n < 0 && Number(s[field]) + n < 0) throw new GameError("Recurso insuficiente.");
	const ledger = [];
	pushLedger(ledger, s, type, kind, n, source);
	return {
		save: {
			...s,
			[field]: Number(s[field]) + n
		},
		ledger
	};
}
function upgradeCountySim(s) {
	if (s.countyLevel >= 15) throw new GameError("Condado no nível máximo.");
	if (s.buildings.filter((b) => b.type !== "wall" && b.type !== "castle" && b.level < s.countyLevel).length) throw new GameError("Full construção: maximize todas as estruturas atuais.");
	const cost = countyUpgradeCost(s.countyLevel);
	if (s.gold < cost.gold || s.niens < cost.niens) throw new GameError(cost.niens ? `Precisa de ${cost.niens} Niens.` : `Precisa de ${cost.gold.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ledger = [];
	if (cost.gold) pushLedger(ledger, s, "upgrade_county", "gold", -cost.gold, "county");
	if (cost.niens) pushLedger(ledger, s, "upgrade_county", "niens", -cost.niens, "county");
	const next = s.countyLevel + 1;
	return {
		save: {
			...s,
			countyLevel: next,
			gold: s.gold - cost.gold,
			niens: s.niens - cost.niens,
			buildings: s.buildings.map((b) => b.type === "castle" ? {
				...b,
				level: next
			} : b)
		},
		ledger,
		toast: `Condado nível ${next}. Saque máximo +5%.`
	};
}
function upgradeTroopSim(s, type) {
	if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
	const cur = s.troopLevels[type];
	const ledger = [];
	if (isHero(type)) {
		if (s.countyLevel < 8) throw new GameError(`Generais só evoluem no condado 8.`);
		if (cur >= 7) throw new GameError("General no nível 7.");
		const cards = generalCardsFor(cur + 1);
		if (s.generalCards < cards) throw new GameError(`Precisa de ${cards} cartas de general.`);
		pushLedger(ledger, s, "upgrade_troop", "generalCards", -cards, type);
		return {
			save: {
				...s,
				generalCards: s.generalCards - cards,
				troopLevels: {
					...s.troopLevels,
					[type]: cur + 1
				}
			},
			ledger,
			toast: `${TROOPS[type].name} nível ${cur + 1}.`
		};
	}
	if (cur >= 15) throw new GameError("Tropa no nível 15.");
	const cards = troopCardsFor(cur + 1);
	const g = troopUpgradeGold(cur + 1);
	const br = troopUpgradeBread(cur + 1);
	if (s.troopCards < cards || s.gold < g || s.bread < br) throw new GameError(`Precisa ${cards} cartas, ${g} ${GOLD_NAME_PL}, ${br} pão.`);
	pushLedger(ledger, s, "upgrade_troop", "troopCards", -cards, type);
	pushLedger(ledger, s, "upgrade_troop", "gold", -g, type);
	pushLedger(ledger, s, "upgrade_troop", "bread", -br, type);
	return {
		save: {
			...s,
			troopCards: s.troopCards - cards,
			gold: s.gold - g,
			bread: s.bread - br,
			troopLevels: {
				...s.troopLevels,
				[type]: cur + 1
			}
		},
		ledger,
		toast: `${TROOPS[type].name} nível ${cur + 1}.`
	};
}
function upgradeCampSim(s) {
	if (countType(s.buildings, "training") < 1) throw new GameError("Construa o Campo de Treino.");
	if (s.campLevel >= s.countyLevel) throw new GameError("Campo no limite do condado.");
	const cost = campUpgradeGold(s.campLevel);
	if (s.gold < cost) throw new GameError(`Precisa de ${cost.toLocaleString("pt")} ${GOLD_NAME_PL}.`);
	const ledger = [];
	pushLedger(ledger, s, "upgrade_camp", "gold", -cost, "camp");
	return {
		save: {
			...s,
			gold: s.gold - cost,
			campLevel: s.campLevel + 1
		},
		ledger,
		toast: `Campo de treino nível ${s.campLevel + 1}.`
	};
}
function buyPassSim(s, now = Date.now()) {
	if (!passWindow(now).active) throw new GameError("O passe abre no dia 1. Fevereiro dura 27 dias.");
	if (s.pass.purchased) throw new GameError("Passe já selado nesta temporada.");
	const cost = passCostWithDiscount(s.pass.season, !!s.passDiscount);
	if (s.niens < cost) throw new GameError(`Precisa de ${cost} Niens.`);
	const ledger = [];
	pushLedger(ledger, s, "buy_pass", "niens", -cost, s.pass.season);
	return {
		save: {
			...s,
			niens: s.niens - cost,
			pass: {
				...s.pass,
				purchased: true
			},
			passDiscount: false
		},
		ledger,
		toast: s.passDiscount ? `Passe selado com 45% de desconto · ${cost} Niens.` : "Passe de Batalha selado."
	};
}
function claimPassSim(s, level) {
	if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
	if (level > Math.min(50, Math.floor(s.pass.stars / 6)) || s.pass.claimed.includes(level)) throw new GameError("Este nível ainda não está disponível.");
	const r = passReward(level);
	const ledger = [];
	if (r.gold) pushLedger(ledger, s, "claim_pass", "gold", r.gold, `pass:${level}`);
	if (r.bread) pushLedger(ledger, s, "claim_pass", "bread", r.bread, `pass:${level}`);
	if (r.niens) pushLedger(ledger, s, "claim_pass", "niens", r.niens, `pass:${level}`);
	if (r.troopCards) pushLedger(ledger, s, "claim_pass", "troopCards", r.troopCards, `pass:${level}`);
	if (r.generalCards) pushLedger(ledger, s, "claim_pass", "generalCards", r.generalCards, `pass:${level}`);
	return {
		save: {
			...s,
			gold: s.gold + r.gold,
			bread: s.bread + r.bread,
			niens: s.niens + r.niens,
			troopCards: s.troopCards + r.troopCards,
			generalCards: s.generalCards + r.generalCards,
			pass: {
				...s.pass,
				claimed: [...s.pass.claimed, level]
			}
		},
		ledger,
		toast: `Nível ${level}: ${r.label}`
	};
}
function claimFreePassSim(s, level) {
	const reached = Math.min(50, Math.floor(s.pass.stars / 6));
	const claimedFree = s.pass.claimedFree ?? [];
	if (level > reached || claimedFree.includes(level)) throw new GameError("Este nível ainda não está disponível.");
	const r = freePassReward(level);
	const ledger = [];
	if (r.gold) pushLedger(ledger, s, "claim_pass_free", "gold", r.gold, `pass-free:${level}`);
	if (r.bread) pushLedger(ledger, s, "claim_pass_free", "bread", r.bread, `pass-free:${level}`);
	if (r.troopCards) pushLedger(ledger, s, "claim_pass_free", "troopCards", r.troopCards, `pass-free:${level}`);
	if (r.generalCards) pushLedger(ledger, s, "claim_pass_free", "generalCards", r.generalCards, `pass-free:${level}`);
	return {
		save: {
			...s,
			gold: s.gold + r.gold,
			bread: s.bread + r.bread,
			troopCards: s.troopCards + r.troopCards,
			generalCards: s.generalCards + r.generalCards,
			pass: {
				...s.pass,
				claimedFree: [...claimedFree, level]
			}
		},
		ledger,
		toast: `Trilha grátis Nv.${level}: ${r.label}`
	};
}
function claimPassAllSim(s) {
	const reached = Math.min(50, Math.floor(s.pass.stars / 6));
	const claimedFree = new Set(s.pass.claimedFree ?? []);
	const claimedPaid = new Set(s.pass.claimed);
	let gold = 0;
	let bread = 0;
	let niens = 0;
	let troopCards = 0;
	let generalCards = 0;
	const nextFree = [...s.pass.claimedFree ?? []];
	const nextPaid = [...s.pass.claimed];
	let nFree = 0;
	let nPaid = 0;
	for (let lv = 1; lv <= reached; lv++) {
		if (!claimedFree.has(lv)) {
			const r = freePassReward(lv);
			gold += r.gold;
			bread += r.bread;
			troopCards += r.troopCards;
			generalCards += r.generalCards;
			nextFree.push(lv);
			nFree += 1;
		}
		if (s.pass.purchased && !claimedPaid.has(lv)) {
			const r = passReward(lv);
			gold += r.gold;
			bread += r.bread;
			niens += r.niens;
			troopCards += r.troopCards;
			generalCards += r.generalCards;
			nextPaid.push(lv);
			nPaid += 1;
		}
	}
	if (nFree + nPaid < 1) throw new GameError("Não há recompensas por recolher.");
	const ledger = [];
	let cur = s;
	if (gold) {
		pushLedger(ledger, cur, "claim_pass_all", "gold", gold, "pass");
		cur = {
			...cur,
			gold: cur.gold + gold
		};
	}
	if (bread) {
		pushLedger(ledger, cur, "claim_pass_all", "bread", bread, "pass");
		cur = {
			...cur,
			bread: cur.bread + bread
		};
	}
	if (niens) {
		pushLedger(ledger, cur, "claim_pass_all", "niens", niens, "pass");
		cur = {
			...cur,
			niens: cur.niens + niens
		};
	}
	if (troopCards) {
		pushLedger(ledger, cur, "claim_pass_all", "troopCards", troopCards, "pass");
		cur = {
			...cur,
			troopCards: cur.troopCards + troopCards
		};
	}
	if (generalCards) {
		pushLedger(ledger, cur, "claim_pass_all", "generalCards", generalCards, "pass");
		cur = {
			...cur,
			generalCards: cur.generalCards + generalCards
		};
	}
	return {
		save: {
			...cur,
			pass: {
				...s.pass,
				claimed: nextPaid,
				claimedFree: nextFree
			}
		},
		ledger,
		toast: `Recolhidas ${nFree + nPaid} recompensas do passe.`
	};
}
function claimPassExtraSim(s, extra, now = Date.now()) {
	if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
	if (Math.min(50, Math.floor(s.pass.stars / 6)) < 50 && !s.pass.claimed.includes(50)) throw new GameError("Chega ao nível 50 do passe pago para resgatar os cupons.");
	const extras = s.pass.extrasClaimed ?? [];
	if (extras.includes(extra)) throw new GameError("Este cupom já foi resgatado.");
	if (extra === "boost") return {
		save: {
			...s,
			boostUntil: now + PASS_BOOST_MS,
			pass: {
				...s.pass,
				extrasClaimed: [...extras, "boost"]
			}
		},
		ledger: [],
		toast: "Boost +40% em minas e fazendas por 30 dias. Já está ativo."
	};
	return {
		save: {
			...s,
			passDiscount: true,
			pass: {
				...s.pass,
				extrasClaimed: [...extras, "discount"]
			}
		},
		ledger: [],
		toast: "Pergaminho de 45% no próximo passe. Usa-o na compra."
	};
}
function skipPassSim(s, now = Date.now()) {
	if (!passWindow(now).active) throw new GameError("O passe abre em setembro, dia 1.");
	if (!s.pass.purchased) throw new GameError("Compre o passe primeiro.");
	if (s.niens < 1) throw new GameError("Precisa de 1 Nien.");
	const next = Math.min(50, Math.floor(s.pass.stars / 6)) + 1;
	if (next > 50) throw new GameError("Passe no máximo.");
	const r = passReward(next);
	const claimed = s.pass.claimed.includes(next) ? s.pass.claimed : [...s.pass.claimed, next];
	const ledger = [];
	pushLedger(ledger, s, "skip_pass", "niens", -1, `pass:${next}`);
	if (r.niens) pushLedger(ledger, s, "skip_pass", "niens", r.niens, `pass:${next}`);
	if (r.gold) pushLedger(ledger, s, "skip_pass", "gold", r.gold, `pass:${next}`);
	if (r.bread) pushLedger(ledger, s, "skip_pass", "bread", r.bread, `pass:${next}`);
	if (r.troopCards) pushLedger(ledger, s, "skip_pass", "troopCards", r.troopCards, `pass:${next}`);
	if (r.generalCards) pushLedger(ledger, s, "skip_pass", "generalCards", r.generalCards, `pass:${next}`);
	return {
		save: {
			...s,
			niens: s.niens - 1 + r.niens,
			gold: s.gold + r.gold,
			bread: s.bread + r.bread,
			troopCards: s.troopCards + r.troopCards,
			generalCards: s.generalCards + r.generalCards,
			pass: {
				...s.pass,
				stars: s.pass.stars + 6,
				claimed
			}
		},
		ledger,
		toast: `Nível ${next} comprado: ${r.label}`
	};
}
function grantReferralSim(s) {
	if (s.referralClaimed || s.countyLevel < 3 || !s.referredBy) return null;
	const ledger = [];
	pushLedger(ledger, s, "referral", "gold", REFERRAL_GOLD, s.referredBy);
	return {
		save: {
			...s,
			gold: s.gold + REFERRAL_GOLD,
			referralClaimed: true
		},
		ledger,
		toast: `Indique e Ganhe: tu e o amigo recebem ${REFERRAL_GOLD.toLocaleString("pt")} ${GOLD_NAME_PL}.`
	};
}
function applyWeeklyPrize(s, rank) {
	const prize = weeklyPrize(rank);
	if (!prize) throw new GameError("Fora do top 20 desta semana.");
	const ledger = [];
	if (prize.gold) pushLedger(ledger, s, "weekly_prize", "gold", prize.gold, `rank:${rank}`);
	if (prize.troopCards) pushLedger(ledger, s, "weekly_prize", "troopCards", prize.troopCards, `rank:${rank}`);
	if (prize.generalCards) pushLedger(ledger, s, "weekly_prize", "generalCards", prize.generalCards, `rank:${rank}`);
	return {
		save: {
			...s,
			gold: s.gold + prize.gold,
			troopCards: s.troopCards + prize.troopCards,
			generalCards: s.generalCards + prize.generalCards,
			weekClaimed: s.weekKey
		},
		ledger,
		prize
	};
}
function addWeekStars(s, stars, now = Date.now(), opts) {
	const n = Math.max(0, Math.min(3, Math.floor(Number(stars) || 0)));
	const win = rankingWindow(now);
	const weekStars = (s.weekKey === win.key ? s.weekStars : 0) + (win.open ? n : 0);
	return {
		...s,
		stars: s.stars + n,
		weekStars,
		weekKey: win.key,
		pass: {
			...s.pass,
			stars: s.pass.stars + n
		},
		raidsWon: s.raidsWon + (opts?.countRaid !== false && n > 0 ? 1 : 0)
	};
}
function applyRaidFinish(s, input) {
	const now = input.now ?? Date.now();
	const stars = Math.max(0, Math.min(3, Math.floor(input.stars)));
	const lv = Math.max(1, input.defenderLevel ?? s.countyLevel);
	const goldTaken = Math.max(0, Math.min(lootForStars(stars, lv), Math.floor(input.goldTaken)));
	const army = {
		infantry: clampSurvivor("infantry", input.survivors, input.startedArmy),
		archers: clampSurvivor("archers", input.survivors, input.startedArmy),
		cavalry: clampSurvivor("cavalry", input.survivors, input.startedArmy),
		general: clampSurvivor("general", input.survivors, input.startedArmy),
		generaless: clampSurvivor("generaless", input.survivors, input.startedArmy),
		defender: clampSurvivor("defender", input.survivors, input.startedArmy)
	};
	const starred = addWeekStars(s, stars, now);
	const ledger = [];
	if (goldTaken) pushLedger(ledger, starred, "raid_loot", "gold", goldTaken, input.defenderNick);
	return {
		save: {
			...starred,
			army: {
				infantry: s.army.infantry - input.startedArmy.infantry + army.infantry,
				archers: s.army.archers - input.startedArmy.archers + army.archers,
				cavalry: s.army.cavalry - input.startedArmy.cavalry + army.cavalry,
				general: s.army.general - input.startedArmy.general + army.general,
				generaless: s.army.generaless - input.startedArmy.generaless + army.generaless,
				defender: s.army.defender - input.startedArmy.defender + army.defender
			},
			gold: s.gold + goldTaken
		},
		ledger
	};
}
function clampSurvivor(type, survivors, started) {
	const sent = Math.max(0, Math.floor(started[type] ?? 0));
	const got = Math.max(0, Math.floor(survivors[type] ?? 0));
	return Math.min(sent, got);
}
function registerAttack(s, targetId, warOn, now = Date.now()) {
	const day = brtDayKey(now);
	const rec = s.attacksByTarget[targetId];
	const usedToday = rec && rec.day === day ? rec.count : 0;
	const cap = dailyAttackCap(warOn);
	if (usedToday >= cap) throw new GameError(warOn ? `Esta base já sofreu ${cap} ataques de guerra hoje.` : `Uma conta só pode ser atacada 12 vezes por dia.`);
	return {
		...s,
		attacksByTarget: {
			...s.attacksByTarget,
			[targetId]: {
				day,
				count: usedToday + 1
			}
		}
	};
}
//#endregion
//#region src/lib/game/server/engine.server.ts
const RATE = {
	default: {
		n: 24,
		windowMs: 1e4
	},
	transfer: {
		n: 8,
		windowMs: 6e4
	},
	chat: {
		n: 8,
		windowMs: 1e4
	},
	startRaid: {
		n: 6,
		windowMs: 6e4
	},
	finishRaid: {
		n: 8,
		windowMs: 6e4
	},
	finishTrainingRaid: {
		n: 8,
		windowMs: 6e4
	},
	createMarketOffer: {
		n: 8,
		windowMs: 6e4
	},
	takeMarketOffer: {
		n: 8,
		windowMs: 6e4
	},
	collect: {
		n: 16,
		windowMs: 1e4
	},
	collectAll: {
		n: 8,
		windowMs: 1e4
	},
	claimWeekly: {
		n: 4,
		windowMs: 6e4
	},
	sendChat: {
		n: 6,
		windowMs: 1e4
	},
	train: {
		n: 10,
		windowMs: 1e4
	},
	speedTrain: {
		n: 16,
		windowMs: 1e4
	},
	claimPassAll: {
		n: 6,
		windowMs: 1e4
	},
	foundAlliance: {
		n: 3,
		windowMs: 6e4
	},
	joinAlliance: {
		n: 6,
		windowMs: 6e4
	},
	acceptJoin: {
		n: 12,
		windowMs: 6e4
	},
	rejectJoin: {
		n: 12,
		windowMs: 6e4
	},
	startAllianceDuel: {
		n: 6,
		windowMs: 6e4
	},
	declareWar: {
		n: 4,
		windowMs: 6e4
	},
	respondAllianceDuel: {
		n: 12,
		windowMs: 6e4
	},
	syncAllianceDuel: {
		n: 30,
		windowMs: 1e4
	},
	finishAllianceDuel: {
		n: 8,
		windowMs: 6e4
	},
	abandonAllianceDuel: {
		n: 8,
		windowMs: 6e4
	}
};
const FAST_ACTIONS = /* @__PURE__ */ new Set([
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
	"syncAllianceDuel"
]);
function db() {
	return getAdminFirestore();
}
const col = (name) => db().collection(name);
const profileRef = (uid) => col("condado_profiles").doc(uid);
function isAdmin(email) {
	if (!email) return false;
	const extra = String(globalThis.process?.env?.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
	return (/* @__PURE__ */ new Set(["ifcorporationsu@gmail.com", ...extra])).has(email.toLowerCase());
}
function profileFromDoc(uid, data) {
	const raw = data.save ?? defaultSave(String(data.nick ?? "Senhor"));
	const save = migrateCloud({
		...raw,
		player: {
			...raw.player,
			id: String(data.playerId ?? raw.player.id),
			nick: String(data.nick ?? raw.player.nick)
		}
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
		referredBy: data.referredBy ?? save.referredBy,
		referralClaimed: Boolean(data.referralClaimed ?? save.referralClaimed),
		shieldUntil: Number(data.shieldUntil ?? save.shieldUntil ?? 0),
		appliedTransferIds: applied,
		appliedRaidIds: appliedRaids,
		accountEmail: data.accountEmail ?? null
	};
}
function withoutMeta(p) {
	const { userId: _u, appliedTransferIds: _a, appliedRaidIds: _r, accountEmail: _e, ...save } = p;
	return toSave(save);
}
function toFirestore(value) {
	return JSON.parse(JSON.stringify(value));
}
function profilePayload(save, extra) {
	const clean = toSave(save);
	return JSON.parse(JSON.stringify({
		save: {
			...clean,
			chat: [],
			allianceChat: clean.allianceChat.slice(-40),
			raids: clean.raids.slice(-24),
			ledger: clean.ledger.slice(0, 40)
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
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	}));
}
function writeProfile(tx, ref, p) {
	tx.set(ref, profilePayload(withoutMeta(p), {
		appliedTransferIds: p.appliedTransferIds,
		appliedRaidIds: p.appliedRaidIds,
		accountEmail: p.accountEmail ?? null
	}), { merge: true });
}
function writeLedger(tx, uid, playerId, requestId, entries) {
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
			timestamp: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
}
function writeAudit(tx, uid, action, requestId, ok, detail) {
	tx.set(col("condado_audit_logs").doc(), {
		userId: uid,
		action,
		requestId,
		ok,
		detail: detail ?? null,
		timestamp: (/* @__PURE__ */ new Date()).toISOString()
	});
}
function ratePatch(data, action) {
	const spec = RATE[action] ?? RATE.default;
	const now = Date.now();
	const cur = (data ?? {})[action] ?? {};
	const start = Number(cur.t ?? 0);
	let n = Number(cur.n ?? 0);
	if (now - start > spec.windowMs) n = 0;
	if (n >= spec.n) throw new GameError("Estás a agir depressa demais. Espera um momento.");
	return { [action]: {
		t: now - start > spec.windowMs ? now : start || now,
		n: n + 1
	} };
}
async function loadProfile(tx, uid) {
	const snap = await tx.get(profileRef(uid));
	if (!snap.exists) throw new GameError("Condado não encontrado.");
	return profileFromDoc(uid, snap.data());
}
function settled(p, now = Date.now()) {
	const r = settle(withoutMeta(p), now);
	return {
		profile: {
			...p,
			...r.save,
			userId: p.userId,
			appliedTransferIds: p.appliedTransferIds,
			appliedRaidIds: p.appliedRaidIds,
			accountEmail: p.accountEmail
		},
		ledger: r.ledger
	};
}
async function preparePlayer(tx, uid) {
	const loaded = await loadProfile(tx, uid);
	const incoming = await tx.get(col("condado_transfers").where("toPlayerId", "==", loaded.player.id).limit(80));
	const raids = await tx.get(col("condado_raid_inbox").where("toPlayerId", "==", loaded.player.id).limit(40));
	const ledger = [];
	let next = loaded;
	const creditRefs = [];
	const seen = new Set(loaded.appliedTransferIds);
	for (const doc of incoming.docs) {
		if (seen.has(doc.id)) continue;
		const row = doc.data();
		if (row.chat || row.raid || row.credited) continue;
		if (String(row.fromPlayerId ?? "") === loaded.player.id) continue;
		const kind = row.kind;
		const amount = Number(row.amount ?? 0);
		if (amount <= 0) continue;
		const cred = creditResource(withoutMeta(next), amount, kind, "transfer_in", String(row.fromNick ?? "envio"));
		next = {
			...next,
			...cred.save,
			appliedTransferIds: [...next.appliedTransferIds, doc.id].slice(-200)
		};
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
		if (goldTaken) ledger.push({
			type: "raid_loss",
			currency: "gold",
			amount: -goldTaken,
			balanceBefore: next.gold,
			balanceAfter: gold,
			source: String(row.fromNick ?? "raid")
		});
		next = {
			...next,
			gold,
			shieldUntil: Math.max(next.shieldUntil, Date.now() + SHIELD_MS),
			raids: [{
				id: doc.id,
				at: Date.parse(String(row.createdAt ?? "")) || Date.now(),
				attacker: String(row.fromNick ?? "Senhor"),
				defender: next.player.nick,
				gold: goldTaken,
				bread: 0,
				incoming: true,
				destruction: Number(row.destruction ?? 0),
				troopsLost: Number(row.troopsLost ?? 0),
				stars: Number(row.stars ?? 0)
			}, ...next.raids].slice(0, 24),
			appliedRaidIds: [...next.appliedRaidIds, doc.id].slice(-200)
		};
		seenR.add(doc.id);
	}
	const base = settled(next);
	return {
		profile: base.profile,
		ledger: [...ledger, ...base.ledger],
		creditRefs
	};
}
function commitPrepared(tx, uid, profile, requestId, ledger, creditRefs) {
	for (const ref of creditRefs) tx.set(ref, { credited: true }, { merge: true });
	writeProfile(tx, profileRef(uid), profile);
	writeLedger(tx, uid, profile.player.id, requestId, ledger);
}
const READ_ONLY = /* @__PURE__ */ new Set([
	"listMarket",
	"weeklyBoard",
	"listTransfers",
	"peekPlayer",
	"listRaidTargets",
	"adminLookup",
	"listAllianceFoes",
	"listAllianceHall",
	"pollAllianceDuel"
]);
async function handleGameAction(player, action, payload, requestId) {
	if (!requestId || requestId.length < 8 || requestId.length > 80) throw new GameError("Pedido inválido.");
	if (READ_ONLY.has(action)) return dispatch(null, player, action, payload, requestId);
	const reqRef = col("condado_request_ids").doc(`${player.uid}_${requestId}`);
	try {
		const result = await db().runTransaction(async (tx) => {
			const cached = await tx.get(reqRef);
			if (cached.exists) return cached.data()?.result ?? {};
			const rateRef = col("condado_rate_limits").doc(player.uid);
			const patch = ratePatch((await tx.get(rateRef)).data(), action);
			const out = await dispatch(tx, player, action, payload, requestId);
			tx.set(rateRef, patch, { merge: true });
			const stored = FAST_ACTIONS.has(action) ? slimResult(out) : out;
			tx.set(reqRef, toFirestore({
				result: stored,
				action,
				userId: player.uid,
				at: (/* @__PURE__ */ new Date()).toISOString()
			}));
			if (!FAST_ACTIONS.has(action)) writeAudit(tx, player.uid, action, requestId, true);
			return out;
		});
		if (action === "sendChat") pruneExpiredChat();
		return result;
	} catch (error) {
		const detail = error instanceof Error ? error.message : "fail";
		if (!detail.includes("depressa demais")) try {
			await col("condado_audit_logs").add({
				userId: player.uid,
				action,
				requestId,
				ok: false,
				detail,
				timestamp: (/* @__PURE__ */ new Date()).toISOString()
			});
		} catch {}
		throw error;
	}
}
async function dispatch(tx, player, action, payload, requestId) {
	const write = () => {
		if (!tx) throw new GameError("Ação inválida.");
		return tx;
	};
	switch (action) {
		case "createProfile": return createProfile(write(), player, payload, requestId);
		case "sync":
		case "pull": return syncProfile(write(), player, requestId);
		case "rename": return rename(write(), player, String(payload.nick ?? ""), requestId);
		case "collect": return mutateFast(write(), player, requestId, (p) => collectBuilding(withoutMeta(p), String(payload.id ?? "")));
		case "collectAll": return mutateFast(write(), player, requestId, (p) => collectAllBuildings(withoutMeta(p)));
		case "upgrade": return mutateFast(write(), player, requestId, (p) => upgradeBuilding(withoutMeta(p), String(payload.id ?? "")));
		case "upgradeType": return mutateFast(write(), player, requestId, (p) => upgradeAllOfType(withoutMeta(p), payload.type));
		case "upgradeWallRow": return mutateFast(write(), player, requestId, (p) => upgradeWallRowSim(withoutMeta(p), String(payload.id ?? "")));
		case "demolish": return mutateFast(write(), player, requestId, (p) => demolishBuilding(withoutMeta(p), String(payload.id ?? "")));
		case "rotateWall": return mutateFast(write(), player, requestId, (p) => rotateWalls(withoutMeta(p), String(payload.id ?? ""), Array.isArray(payload.rowIds) ? payload.rowIds.map(String) : void 0));
		case "train": return mutateFast(write(), player, requestId, (p) => trainTroop(withoutMeta(p), payload.type, payload.qty));
		case "speedTrain": return mutateFast(write(), player, requestId, (p) => speedTrainJob(withoutMeta(p), String(payload.id ?? "")));
		case "placeBuilding": return mutateFast(write(), player, requestId, (p) => placeBuilding(withoutMeta(p), {
			type: payload.type,
			gx: Number(payload.gx),
			gy: Number(payload.gy),
			dir: payload.dir,
			movingId: typeof payload.movingId === "string" ? payload.movingId : null
		}));
		case "buyNien": return mutate(write(), player, requestId, (p) => buyNienSim(withoutMeta(p)));
		case "sellNien": return mutate(write(), player, requestId, (p) => sellNienSim(withoutMeta(p)));
		case "buyBreadPack": return mutate(write(), player, requestId, (p) => buyBreadPackSim(withoutMeta(p)));
		case "sellBreadPack": return mutate(write(), player, requestId, (p) => sellBreadPackSim(withoutMeta(p)));
		case "upgradeCounty": return upgradeCountyAction(write(), player, requestId);
		case "upgradeTroop": return mutate(write(), player, requestId, (p) => upgradeTroopSim(withoutMeta(p), payload.type));
		case "upgradeCamp": return mutate(write(), player, requestId, (p) => upgradeCampSim(withoutMeta(p)));
		case "buyPass": return mutate(write(), player, requestId, (p) => buyPassSim(withoutMeta(p)));
		case "claimPass": return mutate(write(), player, requestId, (p) => claimPassSim(withoutMeta(p), Number(payload.level)));
		case "claimFreePass": return mutate(write(), player, requestId, (p) => claimFreePassSim(withoutMeta(p), Number(payload.level)));
		case "claimPassAll": return mutate(write(), player, requestId, (p) => claimPassAllSim(withoutMeta(p)));
		case "claimPassExtra": return mutate(write(), player, requestId, (p) => claimPassExtraSim(withoutMeta(p), payload.extra === "discount" ? "discount" : "boost"));
		case "skipPass": return mutate(write(), player, requestId, (p) => skipPassSim(withoutMeta(p)));
		case "foundAlliance": return foundAllianceAction(write(), player, payload, requestId);
		case "joinAlliance": return joinAllianceAction(write(), player, String(payload.allianceId ?? ""), requestId);
		case "leaveAlliance": return leaveAllianceAction(write(), player, requestId);
		case "recruitAlliance": return recruitAllianceAction(write(), player, requestId);
		case "acceptJoin": return acceptJoinAction(write(), player, String(payload.requestId ?? ""), requestId);
		case "rejectJoin": return rejectJoinAction(write(), player, String(payload.requestId ?? ""), requestId);
		case "listAllianceFoes":
		case "listAllianceHall": return listAllianceHallAction(player);
		case "declareWar": return declareWarAction(write(), player, String(payload.allianceId ?? ""), requestId);
		case "startAllianceDuel": return startAllianceDuelAction(write(), player, String(payload.targetId ?? ""), requestId);
		case "respondAllianceDuel": return respondAllianceDuelAction(write(), player, String(payload.sessionId ?? ""), payload.accept !== false, requestId);
		case "pollAllianceDuel": return pollAllianceDuelAction(player, String(payload.sessionId ?? ""));
		case "syncAllianceDuel": return syncAllianceDuelAction(write(), player, payload, requestId);
		case "finishAllianceDuel": return finishAllianceDuelAction(write(), player, payload, requestId);
		case "abandonAllianceDuel": return abandonAllianceDuelAction(write(), player, String(payload.sessionId ?? ""), requestId);
		case "sendAllianceChat": return sendAlliance(write(), player, String(payload.text ?? ""), requestId);
		case "setPrefs": return setPrefs(write(), player, payload, requestId);
		case "transfer": return transferAction(write(), player, payload, requestId);
		case "createMarketOffer": return createOffer(write(), player, payload, requestId);
		case "takeMarketOffer": return takeOffer(write(), player, String(payload.offerId ?? ""), requestId);
		case "cancelMarketOffer": return cancelOffer(write(), player, String(payload.offerId ?? ""), requestId);
		case "listMarket": return listMarketAction();
		case "claimWeekly": return claimWeeklyAction(write(), player, requestId);
		case "weeklyBoard": return weeklyBoardAction(player);
		case "listTransfers": return listTransfersAction(player);
		case "peekPlayer": return peekPlayerAction(String(payload.id ?? ""));
		case "listRaidTargets": return listTargetsAction(player);
		case "startRaid": return startRaidAction(write(), player, String(payload.targetId ?? ""), requestId);
		case "finishRaid": return finishRaidAction(write(), player, payload, requestId);
		case "finishTrainingRaid": return finishTrainingRaidAction(write(), player, payload, requestId);
		case "sendChat": return sendChatAction(write(), player, String(payload.text ?? ""), requestId);
		case "syncAccountEmail": return syncEmail(write(), player, requestId);
		case "adminLookup": return adminLookup(player, String(payload.playerId ?? ""));
		default: throw new GameError("Ação desconhecida.");
	}
}
async function mutate(tx, player, requestId, fn) {
	const prep = await preparePlayer(tx, player.uid);
	const r = fn(prep.profile);
	const profile = {
		...prep.profile,
		...r.save,
		userId: player.uid,
		appliedTransferIds: prep.profile.appliedTransferIds,
		appliedRaidIds: prep.profile.appliedRaidIds,
		accountEmail: prep.profile.accountEmail
	};
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...r.ledger ?? []], prep.creditRefs);
	return {
		save: withoutMeta(profile),
		toast: r.toast
	};
}
async function prepareFast(tx, uid) {
	const base = settled(await loadProfile(tx, uid));
	return {
		profile: base.profile,
		ledger: base.ledger,
		creditRefs: []
	};
}
async function mutateFast(tx, player, requestId, fn) {
	const prep = await prepareFast(tx, player.uid);
	const r = fn(prep.profile);
	const profile = {
		...prep.profile,
		...r.save,
		userId: player.uid,
		appliedTransferIds: prep.profile.appliedTransferIds,
		appliedRaidIds: prep.profile.appliedRaidIds,
		accountEmail: prep.profile.accountEmail
	};
	writeProfile(tx, profileRef(player.uid), profile);
	writeLedger(tx, player.uid, profile.player.id, requestId, [...prep.ledger, ...r.ledger ?? []]);
	return {
		save: slimSave(withoutMeta(profile)),
		toast: r.toast
	};
}
function slimSave(s) {
	return {
		...s,
		chat: [],
		allianceChat: [],
		ledger: [],
		raids: s.raids.slice(-6)
	};
}
function slimResult(out) {
	const extra = {
		toast: out.toast,
		sessionId: out.sessionId,
		status: out.status,
		side: out.side,
		duel: out.duel,
		challenges: out.challenges
	};
	if (!out.save) return extra;
	return {
		...extra,
		save: slimSave(out.save)
	};
}
async function createProfile(tx, player, payload, requestId) {
	const nick = String(payload.nick ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
	if (nick.length < 3) throw new GameError("O nome do condado precisa de ao menos 3 letras.");
	const email = player.email;
	if (!email) throw new GameError("A conta precisa de um e-mail.");
	const deviceId = String(payload.deviceId ?? "").slice(0, 80);
	const fingerprint = String(payload.fingerprint ?? "").slice(0, 80);
	const referredBy = String(payload.referredBy ?? "").trim().toUpperCase() || null;
	const ref = profileRef(player.uid);
	const existing = await tx.get(ref);
	if (existing.exists) return { save: withoutMeta(profileFromDoc(player.uid, existing.data())) };
	const nickRef = col("condado_nick_index").doc(nick.toLowerCase());
	const emailRef = col("condado_email_index").doc(email);
	const deviceRef = deviceId ? col("condado_devices").doc(deviceId) : null;
	const fpRef = fingerprint ? col("condado_devices").doc(`fp_${fingerprint}`) : null;
	if ((await tx.get(nickRef)).exists) throw new GameError("Este nome de condado já está em uso.");
	const emailTaken = await tx.get(emailRef);
	if (emailTaken.exists && emailTaken.data()?.userId !== player.uid) throw new GameError("Este e-mail já está ligado a outro condado.");
	if (deviceRef) {
		const deviceTaken = await tx.get(deviceRef);
		if (deviceTaken.exists && deviceTaken.data()?.userId !== player.uid) throw new GameError("Já existe um condado neste aparelho.");
	}
	if (fpRef) {
		const fpTaken = await tx.get(fpRef);
		if (fpTaken.exists && fpTaken.data()?.userId !== player.uid) throw new GameError("Já existe um condado neste aparelho.");
	}
	const save = defaultSave(nick, referredBy);
	save.weekKey = rankingWindow().key;
	save.weekStars = 0;
	writeProfile(tx, ref, {
		...save,
		userId: player.uid,
		appliedTransferIds: [],
		appliedRaidIds: [],
		accountEmail: email
	});
	tx.set(nickRef, {
		userId: player.uid,
		playerId: save.player.id
	});
	tx.set(col("condado_player_index").doc(save.player.id), {
		userId: player.uid,
		nick: save.player.nick
	});
	tx.set(emailRef, {
		userId: player.uid,
		playerId: save.player.id
	});
	if (deviceRef) tx.set(deviceRef, {
		userId: player.uid,
		playerId: save.player.id,
		kind: "device"
	});
	if (fpRef) tx.set(fpRef, {
		userId: player.uid,
		playerId: save.player.id,
		kind: "fingerprint"
	});
	writeLedger(tx, player.uid, save.player.id, requestId, []);
	return { save };
}
async function syncProfile(tx, player, requestId) {
	const ref = profileRef(player.uid);
	if (!(await tx.get(ref)).exists) return {
		save: null,
		admin: isAdmin(player.email)
	};
	const prep = await preparePlayer(tx, player.uid);
	let profile = prep.profile;
	const extra = [];
	if (profile.alliance) {
		const asnap = await tx.get(allianceRef(profile.alliance.id));
		if (asnap.exists) {
			let a = allianceFromDoc(asnap.id, asnap.data());
			const payout = await readAlliancePayout(tx, a);
			a = payout.next;
			const mine = payout.rows.find((row) => row.uid === player.uid);
			if (mine) {
				extra.push(...mine.ledger);
				profile = {
					...profile,
					gold: mine.profile.gold
				};
			}
			if (payout.settled) {
				writeAlliancePayout(tx, payout.rows, requestId, player.uid);
				tx.set(allianceRef(a.id), {
					resolved: true,
					xp: a.xp,
					level: a.level,
					warDay: a.warDay
				}, { merge: true });
			}
			profile = {
				...profile,
				alliance: allianceStateOf(a),
				war: warFromAlliance(a),
				allianceChat: a.chat.map((m) => ({
					...m,
					self: m.fromId === profile.player.id
				}))
			};
		}
	}
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...extra], prep.creditRefs);
	return {
		save: withoutMeta(profile),
		admin: isAdmin(player.email)
	};
}
async function rename(tx, player, nickRaw, requestId) {
	const nick = nickRaw.trim().slice(0, 18);
	if (nick.length < 3) throw new GameError("Nome curto demais.");
	const p0 = await loadProfile(tx, player.uid);
	const newIndex = col("condado_nick_index").doc(nick.toLowerCase());
	const taken = await tx.get(newIndex);
	if (taken.exists && taken.data()?.userId !== player.uid) throw new GameError("Este nome de condado já está em uso.");
	const oldIndex = col("condado_nick_index").doc(p0.player.nick.toLowerCase());
	tx.delete(oldIndex);
	tx.set(newIndex, {
		userId: player.uid,
		playerId: p0.player.id
	});
	tx.set(col("condado_player_index").doc(p0.player.id), {
		userId: player.uid,
		nick
	}, { merge: true });
	const profile = {
		...p0,
		player: {
			...p0.player,
			nick
		}
	};
	writeProfile(tx, profileRef(player.uid), profile);
	writeLedger(tx, player.uid, profile.player.id, requestId, []);
	return {
		save: withoutMeta(profile),
		toast: "Nome atualizado.",
		nick
	};
}
async function upgradeCountyAction(tx, player, requestId) {
	const prep = await preparePlayer(tx, player.uid);
	const r = upgradeCountySim(withoutMeta(prep.profile));
	let profile = {
		...prep.profile,
		...r.save
	};
	const grant = grantReferralSim(withoutMeta(profile));
	const ledger = [...prep.ledger, ...r.ledger];
	let toast = r.toast;
	let destUid = "";
	let destProfile = null;
	let destLedger = [];
	if (grant && profile.referredBy) {
		const idx = await tx.get(col("condado_player_index").doc(profile.referredBy));
		if (idx.exists) {
			destUid = String(idx.data()?.userId ?? "");
			if (destUid) {
				const destSnap = await tx.get(profileRef(destUid));
				if (destSnap.exists) {
					destProfile = profileFromDoc(destUid, destSnap.data());
					const cred = creditResource(withoutMeta(destProfile), 3e5, "gold", "referral", profile.player.id);
					destProfile = {
						...destProfile,
						...cred.save
					};
					destLedger = cred.ledger;
				}
			}
		}
	}
	if (grant) {
		profile = {
			...profile,
			...grant.save
		};
		ledger.push(...grant.ledger);
		toast = grant.toast;
	}
	commitPrepared(tx, player.uid, profile, requestId, ledger, prep.creditRefs);
	if (destUid && destProfile) {
		writeProfile(tx, profileRef(destUid), destProfile);
		writeLedger(tx, destUid, destProfile.player.id, requestId, destLedger);
	}
	return {
		save: withoutMeta(profile),
		toast
	};
}
async function setPrefs(tx, player, payload, requestId) {
	const p = await loadProfile(tx, player.uid);
	const profile = {
		...p,
		muted: Boolean(payload.muted ?? p.muted)
	};
	writeProfile(tx, profileRef(player.uid), profile);
	writeLedger(tx, player.uid, profile.player.id, requestId, []);
	return { save: withoutMeta(profile) };
}
async function transferAction(tx, player, payload, requestId) {
	const amount = Math.floor(Number(payload.amount));
	const kind = payload.kind;
	const toId = String(payload.toId ?? "").trim().toUpperCase();
	const prep = await preparePlayer(tx, player.uid);
	if (toId === prep.profile.player.id) throw new GameError("Não envie para si mesmo.");
	const spent = spendForTransfer(withoutMeta(prep.profile), amount, kind);
	const destIndex = await tx.get(col("condado_player_index").doc(toId));
	const toNick = destIndex.exists ? String(destIndex.data()?.nick ?? "") : findNick(toId);
	if (!toNick) throw new GameError("ID não encontrado. Cole e confira o nick.");
	let destUid = "";
	let destProfile = null;
	let destLedger = [];
	if (destIndex.exists) {
		destUid = String(destIndex.data()?.userId ?? "");
		if (destUid) {
			const destSnap = await tx.get(profileRef(destUid));
			if (destSnap.exists) {
				destProfile = profileFromDoc(destUid, destSnap.data());
				const cred = creditResource(withoutMeta(destProfile), amount, kind, "transfer_in", prep.profile.player.nick);
				destProfile = {
					...destProfile,
					...cred.save
				};
				destLedger = cred.ledger;
			}
		}
	}
	const me = {
		...prep.profile,
		...spent.save
	};
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
		createdAt: (/* @__PURE__ */ new Date()).toISOString(),
		credited: Boolean(destUid && destProfile)
	});
	return {
		save: withoutMeta(me),
		toast: `${amount} enviados a ${toNick}.`,
		id: txRef.id,
		nick: toNick
	};
}
function offerFromDoc(id, data) {
	return {
		id,
		sellerId: String(data.sellerId ?? ""),
		sellerUid: String(data.sellerUid ?? ""),
		sellerNick: String(data.sellerNick ?? ""),
		giveKind: data.giveKind,
		giveAmount: Number(data.giveAmount ?? 0),
		wantKind: data.wantKind,
		wantAmount: Number(data.wantAmount ?? 0),
		createdAt: Date.parse(String(data.createdAt ?? "")) || Date.now()
	};
}
async function createOffer(tx, player, payload, requestId) {
	const giveKind = payload.giveKind;
	const wantKind = payload.wantKind;
	const giveAmount = Math.floor(Number(payload.giveAmount));
	const wantAmount = Math.floor(Number(payload.wantAmount));
	if (giveAmount <= 0 || wantAmount <= 0) throw new GameError("Quantia inválida.");
	if (giveKind === wantKind) throw new GameError("Troca precisa de recursos diferentes.");
	const id = `${giveKind}_${giveAmount}_${wantKind}_${wantAmount}`;
	const offerRef = col("condado_market").doc(id);
	if ((await tx.get(offerRef)).exists) throw new GameError("Esta proposta já está no mercado. As ofertas são únicas.");
	const prep = await preparePlayer(tx, player.uid);
	const field = kindField(giveKind);
	if (giveAmount > Number(prep.profile[field])) throw new GameError("Não tens esse recurso para listar.");
	const ledger = [{
		type: "market_list",
		currency: giveKind,
		amount: -giveAmount,
		balanceBefore: Number(prep.profile[field]),
		balanceAfter: Number(prep.profile[field]) - giveAmount,
		source: id
	}];
	const me = {
		...prep.profile,
		[field]: Number(prep.profile[field]) - giveAmount
	};
	commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...ledger], prep.creditRefs);
	tx.set(offerRef, {
		sellerUid: player.uid,
		sellerId: me.player.id,
		sellerNick: me.player.nick,
		giveKind,
		giveAmount,
		wantKind,
		wantAmount,
		createdAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	return {
		save: withoutMeta(me),
		toast: "Oferta publicada no mercado."
	};
}
async function takeOffer(tx, player, offerId, requestId) {
	const offerRef = col("condado_market").doc(offerId);
	const offerSnap = await tx.get(offerRef);
	if (!offerSnap.exists) throw new GameError("Esta oferta já foi fechada.");
	const offer = offerFromDoc(offerSnap.id, offerSnap.data());
	if (offer.sellerUid === player.uid) throw new GameError("Não podes comprar a tua própria oferta.");
	const prep = await preparePlayer(tx, player.uid);
	const sellerSnap = await tx.get(profileRef(offer.sellerUid));
	const payField = kindField(offer.wantKind);
	if (offer.wantAmount > Number(prep.profile[payField])) throw new GameError("Recurso insuficiente para este trato.");
	const debit = creditResource(withoutMeta(prep.profile), -offer.wantAmount, offer.wantKind, "market_buy", offer.id);
	const credit = creditResource(debit.save, offer.giveAmount, offer.giveKind, "market_buy", offer.id);
	const me = {
		...prep.profile,
		...credit.save
	};
	let sellerP = null;
	let sellerLedger = [];
	if (sellerSnap.exists) {
		const seller = profileFromDoc(offer.sellerUid, sellerSnap.data());
		const pay = creditResource(withoutMeta(seller), offer.wantAmount, offer.wantKind, "market_sell", offer.id);
		sellerP = {
			...seller,
			...pay.save
		};
		sellerLedger = pay.ledger;
	}
	commitPrepared(tx, player.uid, me, requestId, [
		...prep.ledger,
		...debit.ledger,
		...credit.ledger
	], prep.creditRefs);
	if (sellerP) {
		writeProfile(tx, profileRef(offer.sellerUid), sellerP);
		writeLedger(tx, offer.sellerUid, sellerP.player.id, requestId, sellerLedger);
	}
	tx.delete(offerRef);
	return {
		save: withoutMeta(me),
		toast: `Trato fechado com ${offer.sellerNick}.`
	};
}
async function cancelOffer(tx, player, offerId, requestId) {
	const offerRef = col("condado_market").doc(offerId);
	const offerSnap = await tx.get(offerRef);
	if (!offerSnap.exists) throw new GameError("Oferta já não existe.");
	const offer = offerFromDoc(offerSnap.id, offerSnap.data());
	if (offer.sellerUid !== player.uid) throw new GameError("Só o autor pode retirar a oferta.");
	const prep = await preparePlayer(tx, player.uid);
	const cred = creditResource(withoutMeta(prep.profile), offer.giveAmount, offer.giveKind, "market_cancel", offer.id);
	const me = {
		...prep.profile,
		...cred.save
	};
	commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...cred.ledger], prep.creditRefs);
	tx.delete(offerRef);
	return {
		save: withoutMeta(me),
		toast: "Oferta retirada."
	};
}
async function listMarketAction() {
	return { offers: (await col("condado_market").limit(80).get()).docs.map((d) => offerFromDoc(d.id, d.data())).filter((o) => o.giveAmount > 0 && o.wantAmount > 0 && o.giveKind !== o.wantKind).sort((a, b) => b.createdAt - a.createdAt) };
}
async function weeklyBoardAction(player) {
	const win = rankingWindow();
	const meSnap = await profileRef(player.uid).get();
	const you = meSnap.exists ? profileFromDoc(player.uid, meSnap.data()) : null;
	const mineStars = you && you.weekKey === win.key ? you.weekStars : 0;
	const byId = /* @__PURE__ */ new Map();
	try {
		const q = await col("condado_profiles").where("weekKey", "==", win.key).limit(80).get();
		for (const d of q.docs) {
			const r = d.data();
			const playerId = String(r.playerId ?? "");
			if (!playerId) continue;
			const stars = Number(r.weekStars ?? 0);
			byId.set(playerId, {
				playerId,
				nick: String(r.nick ?? "Senhor"),
				stars,
				you: you?.player.id === playerId
			});
		}
	} catch {}
	if (you) byId.set(you.player.id, {
		playerId: you.player.id,
		nick: you.player.nick,
		stars: mineStars,
		you: true
	});
	const ranked = [...byId.values()].sort((a, b) => b.stars - a.stars || a.nick.localeCompare(b.nick, "pt"));
	const board = ranked.slice(0, 20);
	const yourRank = ranked.findIndex((r) => r.you) + 1;
	const claim = you ? await col("condado_week_claims").doc(`${player.uid}_${win.key}`).get() : null;
	return {
		board,
		yourRank,
		yourStars: mineStars,
		claimed: Boolean(claim?.exists),
		week: win
	};
}
async function claimWeeklyAction(tx, player, requestId) {
	const win = rankingWindow();
	if (!win.claim) throw new GameError("O prêmio abre domingo às 23h de Brasília.");
	const claimRef = col("condado_week_claims").doc(`${player.uid}_${win.key}`);
	if ((await tx.get(claimRef)).exists) throw new GameError("Prêmio já recolhido.");
	const boardQ = await tx.get(col("condado_profiles").where("weekKey", "==", win.key).limit(80));
	const prep = await preparePlayer(tx, player.uid);
	const byId = /* @__PURE__ */ new Map();
	for (const d of boardQ.docs) {
		const r = d.data();
		const playerId = String(r.playerId ?? "");
		if (!playerId) continue;
		byId.set(playerId, {
			playerId,
			stars: Number(r.weekStars ?? 0)
		});
	}
	const mineStars = prep.profile.weekKey === win.key ? prep.profile.weekStars : 0;
	byId.set(prep.profile.player.id, {
		playerId: prep.profile.player.id,
		stars: mineStars
	});
	const rank = [...byId.values()].sort((a, b) => b.stars - a.stars).findIndex((r) => r.playerId === prep.profile.player.id) + 1;
	if (!weeklyPrize(rank)) throw new GameError("Fora do top 20 desta semana.");
	const r = applyWeeklyPrize(withoutMeta(prep.profile), rank);
	const profile = {
		...prep.profile,
		...r.save
	};
	tx.set(claimRef, {
		userId: player.uid,
		weekKey: win.key,
		rank,
		claimedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...r.ledger], prep.creditRefs);
	return {
		save: withoutMeta(profile),
		toast: `Prêmio do ${rank}º lugar recolhido.`,
		yourRank: rank,
		yourStars: mineStars
	};
}
async function listTransfersAction(player) {
	const snap = await profileRef(player.uid).get();
	if (!snap.exists) return { rows: [] };
	const p = profileFromDoc(player.uid, snap.data());
	const fromSnap = await col("condado_transfers").where("fromPlayerId", "==", p.player.id).limit(40).get();
	const toSnap = await col("condado_transfers").where("toPlayerId", "==", p.player.id).limit(40).get();
	return { rows: [...fromSnap.docs, ...toSnap.docs].filter((d) => !d.data().chat && !d.data().raid).sort((a, b) => String(b.data().createdAt ?? "").localeCompare(String(a.data().createdAt ?? ""))).slice(0, 40).map((d) => {
		const r = d.data();
		return {
			id: d.id,
			at: Date.parse(String(r.createdAt ?? "")) || Date.now(),
			fromId: String(r.fromPlayerId),
			fromNick: String(r.fromNick),
			toId: String(r.toPlayerId),
			toNick: String(r.toNick),
			kind: r.kind,
			amount: Number(r.amount),
			incoming: r.toPlayerId === p.player.id && r.fromPlayerId !== p.player.id
		};
	}) };
}
async function peekPlayerAction(idRaw) {
	const id = idRaw.trim().toUpperCase();
	const npc = findNick(id);
	if (npc) return {
		id,
		nick: npc
	};
	const snap = await col("condado_player_index").doc(id).get();
	return snap.exists ? {
		id,
		nick: String(snap.data()?.nick)
	} : {
		id,
		nick: null
	};
}
async function listTargetsAction(player) {
	const meSnap = await profileRef(player.uid).get();
	if (!meSnap.exists) return { targets: [] };
	const me = profileFromDoc(player.uid, meSnap.data());
	const levels = [
		me.countyLevel - 1,
		me.countyLevel,
		me.countyLevel + 1
	].filter((n) => n >= 1);
	const targets = [];
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
				shieldUntil: Number(data.shieldUntil ?? 0)
			});
		}
	}
	targets.sort((a, b) => (a.shieldUntil && a.shieldUntil > now ? 1 : 0) - (b.shieldUntil && b.shieldUntil > now ? 1 : 0));
	return { targets };
}
async function startRaidAction(tx, player, targetId, requestId) {
	const prep = await preparePlayer(tx, player.uid);
	let me = prep.profile;
	if (me.army.infantry + me.army.archers + me.army.cavalry + me.army.general + me.army.generaless + me.army.defender <= 0) throw new GameError("Sem tropas no acampamento.");
	const idx = await tx.get(col("condado_player_index").doc(targetId));
	if (!idx.exists) throw new GameError("Alvo não encontrado.");
	const toUid = String(idx.data()?.userId ?? "");
	const destSnap = await tx.get(profileRef(toUid));
	if (!destSnap.exists) throw new GameError("Alvo não encontrado.");
	const dest = profileFromDoc(toUid, destSnap.data());
	if (Math.abs(dest.countyLevel - me.countyLevel) > 1) throw new GameError("Só podes atacar condados de um nível acima, igual ou abaixo.");
	if ((dest.shieldUntil ?? 0) > Date.now()) throw new GameError("Este condado está sob escudo.");
	const warOn = !!(me.war && me.war.foeId && dest.alliance?.id === me.war.foeId && !me.war.sittingOut);
	if (warOn && me.war && (me.war.attacks[dest.player.id] ?? 0) >= 2) throw new GameError("Guerra de aliança: no máximo 2 ataques por base.");
	me = {
		...me,
		...registerAttack(withoutMeta(me), dest.player.id, warOn)
	};
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
		open: true
	});
	return {
		save: withoutMeta(me),
		sessionId,
		buildings: dest.buildings,
		lootGold,
		nick: dest.player.nick
	};
}
async function finishRaidAction(tx, player, payload, requestId) {
	const sessionId = String(payload.sessionId ?? "");
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const sessionSnap = await tx.get(sessionRef);
	if (!sessionSnap.exists) throw new GameError("Ataque inválido.");
	const session = sessionSnap.data();
	if (session.attackerUid !== player.uid) throw new GameError("Ataque inválido.");
	if (!session.open) throw new GameError("Este ataque já foi resolvido.");
	const stars = Math.max(0, Math.min(3, Math.floor(Number(payload.stars ?? 0))));
	const defLevel = Number(session.defenderLevel ?? 1);
	const goldTaken = Math.min(Number(session.lootCap ?? 0), lootForStars(stars, defLevel));
	const survivors = payload.survivors ?? {};
	const startedArmy = session.startedArmy;
	const prep = await preparePlayer(tx, player.uid);
	const defRef = profileRef(String(session.defenderUid));
	const defSnap = await tx.get(defRef);
	const raid = applyRaidFinish(withoutMeta(prep.profile), {
		stars,
		survivors,
		startedArmy,
		goldTaken,
		defenderNick: String(session.defenderNick ?? "Senhor"),
		defenderLevel: defLevel
	});
	const me = {
		...prep.profile,
		...raid.save,
		raids: [{
			id: sessionId,
			at: Date.now(),
			attacker: prep.profile.player.nick,
			defender: String(session.defenderNick ?? ""),
			gold: goldTaken,
			bread: 0,
			incoming: false,
			destruction: Number(payload.destruction ?? 0),
			troopsLost: Number(payload.troopsLost ?? 0),
			stars
		}, ...prep.profile.raids].slice(0, 24)
	};
	let destP = null;
	let destLedger = [];
	if (defSnap.exists && goldTaken > 0) {
		const dest = profileFromDoc(String(session.defenderUid), defSnap.data());
		const gold = Math.max(0, dest.gold - goldTaken);
		destP = {
			...dest,
			gold,
			shieldUntil: Math.max(dest.shieldUntil, Date.now() + SHIELD_MS),
			appliedRaidIds: [...dest.appliedRaidIds, sessionId].slice(-200)
		};
		destLedger = [{
			type: "raid_loss",
			currency: "gold",
			amount: -goldTaken,
			balanceBefore: dest.gold,
			balanceAfter: gold,
			source: me.player.nick
		}];
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
		createdAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	tx.set(sessionRef, {
		open: false,
		goldTaken,
		stars,
		resolvedAt: Date.now()
	}, { merge: true });
	return { save: withoutMeta(me) };
}
async function finishTrainingRaidAction(tx, player, payload, requestId) {
	const stars = Math.max(0, Math.min(3, Math.floor(Number(payload.stars ?? 0))));
	const survivors = payload.survivors ?? {};
	const targetId = String(payload.targetId ?? "treino");
	const prep = await preparePlayer(tx, player.uid);
	const registered = registerAttack(withoutMeta(prep.profile), targetId, false);
	const startedRaw = normalizeArmy(payload.startedArmy, prep.profile.army);
	const startedArmy = {
		infantry: Math.min(startedRaw.infantry, prep.profile.army.infantry),
		archers: Math.min(startedRaw.archers, prep.profile.army.archers),
		cavalry: Math.min(startedRaw.cavalry, prep.profile.army.cavalry),
		general: Math.min(startedRaw.general, prep.profile.army.general),
		generaless: Math.min(startedRaw.generaless, prep.profile.army.generaless),
		defender: Math.min(startedRaw.defender, prep.profile.army.defender)
	};
	const goldTaken = Math.min(lootForStars(stars, registered.countyLevel), Math.max(0, Math.floor(Number(payload.goldTaken ?? 0))));
	const raid = applyRaidFinish(registered, {
		stars,
		survivors,
		startedArmy,
		goldTaken,
		defenderNick: String(payload.targetNick ?? "Treino"),
		defenderLevel: registered.countyLevel
	});
	const me = {
		...prep.profile,
		...raid.save,
		attacksByTarget: registered.attacksByTarget,
		raids: [{
			id: makeId("r"),
			at: Date.now(),
			attacker: prep.profile.player.nick,
			defender: String(payload.targetNick ?? "Treino"),
			gold: goldTaken,
			bread: 0,
			incoming: false,
			destruction: Number(payload.destruction ?? 0),
			troopsLost: Number(payload.troopsLost ?? 0),
			stars
		}, ...prep.profile.raids].slice(0, 24)
	};
	commitPrepared(tx, player.uid, me, requestId, [...prep.ledger, ...raid.ledger], prep.creditRefs);
	return {
		save: withoutMeta(me),
		toast: stars ? `${stars} estrela${stars === 1 ? "" : "s"} no ranking da semana.` : void 0
	};
}
async function sendChatAction(tx, player, textRaw, requestId) {
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
		channel: "global"
	});
	writeLedger(tx, player.uid, p.player.id, requestId, []);
	return {};
}
async function pruneExpiredChat() {
	try {
		const cutoff = (/* @__PURE__ */ new Date(Date.now() - CHAT_TTL_MS)).toISOString();
		const old = await col("condado_chat").where("createdAt", "<", cutoff).limit(40).get();
		if (old.empty) return;
		const batch = db().batch();
		for (const d of old.docs) batch.delete(d.ref);
		await batch.commit();
	} catch {}
}
async function syncEmail(tx, player, requestId) {
	if (!player.email) throw new GameError("Nenhum e-mail está vinculado a esta conta.");
	const p = await loadProfile(tx, player.uid);
	const profile = {
		...p,
		accountEmail: player.email
	};
	writeProfile(tx, profileRef(player.uid), profile);
	tx.set(col("condado_email_index").doc(player.email), {
		userId: player.uid,
		playerId: p.player.id
	}, { merge: true });
	writeLedger(tx, player.uid, p.player.id, requestId, []);
	return { save: withoutMeta(profile) };
}
async function adminLookup(player, playerIdRaw) {
	if (!isAdmin(player.email)) throw new GameError("Sem permissão.");
	const playerId = playerIdRaw.trim().toUpperCase();
	const idx = await col("condado_player_index").doc(playerId).get();
	if (!idx.exists) throw new GameError("Jogador não encontrado.");
	const uid = String(idx.data()?.userId ?? "");
	const snap = await profileRef(uid).get();
	if (!snap.exists) throw new GameError("Jogador não encontrado.");
	const p = profileFromDoc(uid, snap.data());
	const rows = (await col("condado_economy_ledger").where("userId", "==", uid).orderBy("timestamp", "desc").limit(50).get()).docs.map((d) => {
		const r = d.data();
		return {
			type: r.type,
			currency: r.currency,
			amount: r.amount,
			balanceBefore: r.balanceBefore,
			balanceAfter: r.balanceAfter,
			source: r.source,
			timestamp: r.timestamp
		};
	});
	return { lookup: {
		playerId: p.player.id,
		nick: p.player.nick,
		gold: p.gold,
		bread: p.bread,
		niens: p.niens,
		troopCards: p.troopCards,
		generalCards: p.generalCards,
		countyLevel: p.countyLevel,
		weekStars: p.weekStars,
		ledger: rows
	} };
}
function allianceRef(id) {
	return col("condado_alliances").doc(id);
}
function allianceFromDoc(id, data) {
	return {
		id,
		name: String(data.name ?? "Aliança"),
		leaderId: String(data.leaderId ?? ""),
		leaderUid: String(data.leaderUid ?? ""),
		minLevel: Math.max(1, Number(data.minLevel ?? 1)),
		level: Math.max(1, Number(data.level ?? 1)),
		xp: Math.max(0, Number(data.xp ?? 0)),
		members: Array.isArray(data.members) ? data.members.map((m) => ({
			id: String(m.id ?? ""),
			nick: String(m.nick ?? "Senhor"),
			uid: String(m.uid ?? "")
		})) : [],
		chat: Array.isArray(data.chat) ? data.chat.slice(-40) : [],
		warDay: String(data.warDay ?? ""),
		foeId: data.foeId ?? null,
		foeName: String(data.foeName ?? ""),
		ourPoints: Number(data.ourPoints ?? 0),
		theirPoints: Number(data.theirPoints ?? 0),
		participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
		sittingOut: !!data.sittingOut,
		resolved: !!data.resolved,
		openJoin: data.openJoin !== false,
		joinRequests: Array.isArray(data.joinRequests) ? data.joinRequests.map((r) => ({
			id: String(r.id ?? ""),
			playerId: String(r.playerId ?? ""),
			nick: String(r.nick ?? "Senhor"),
			uid: r.uid ? String(r.uid) : void 0,
			at: Number(r.at ?? 0)
		})) : [],
		pot: Math.max(0, Number(data.pot ?? 0))
	};
}
function allianceStateOf(a) {
	return {
		id: a.id,
		name: a.name,
		members: a.members.map((m) => ({
			id: m.id,
			nick: m.nick,
			uid: m.uid
		})),
		minLevel: a.minLevel,
		level: a.level,
		xp: a.xp,
		leaderId: a.leaderId,
		slots: allianceSlots(a.level),
		openJoin: a.openJoin,
		joinRequests: a.joinRequests
	};
}
function trimAllianceChat(chat, requests) {
	const pending = new Set(requests.map((r) => r.id));
	const sticky = chat.filter((m) => m.joinRequestId && pending.has(m.joinRequestId));
	const rest = chat.filter((m) => !(m.joinRequestId && pending.has(m.joinRequestId))).slice(-40);
	const seen = new Set(sticky.map((m) => m.id));
	const out = [...sticky];
	for (const m of rest) {
		if (seen.has(m.id)) continue;
		out.push(m);
		seen.add(m.id);
	}
	return out.sort((a, b) => a.at - b.at);
}
function warFromAlliance(a) {
	return {
		week: a.warDay,
		foeId: a.foeId,
		foeName: a.foeName,
		chest: a.pot,
		ourStars: a.ourPoints,
		theirStars: a.theirPoints,
		attacks: {},
		sittingOut: a.sittingOut,
		resolved: a.resolved,
		participants: a.participants
	};
}
async function readAlliancePayout(tx, a) {
	const win = warWindow();
	if (!a.warDay || a.warDay === win.key || a.resolved) return {
		next: a,
		rows: [],
		settled: false
	};
	const won = !a.sittingOut && a.ourPoints > a.theirPoints;
	let xp = a.xp;
	let level = a.level;
	if (won) {
		const grown = applyAllianceXp(a.level, a.xp, ALLIANCE_XP_WIN);
		xp = grown.xp;
		level = grown.level;
	}
	const rows = [];
	const parts = a.participants.filter(Boolean);
	const pot = Math.max(0, Math.floor(a.pot || 0));
	const share = parts.length ? Math.floor(pot / parts.length) : 0;
	if (share) for (const pid of parts) {
		const member = a.members.find((m) => m.id === pid);
		let uid = member?.uid ? String(member.uid) : "";
		if (!uid) {
			const idx = await tx.get(col("condado_player_index").doc(pid));
			uid = idx.exists ? String(idx.data()?.userId ?? "") : "";
		}
		if (!uid) continue;
		const snap = await tx.get(profileRef(uid));
		if (!snap.exists) continue;
		const p = profileFromDoc(uid, snap.data());
		rows.push({
			uid,
			profile: {
				...p,
				gold: p.gold + share
			},
			ledger: [{
				type: "alliance_war_pot",
				currency: "gold",
				amount: share,
				balanceBefore: p.gold,
				balanceAfter: p.gold + share,
				source: a.id
			}],
			share
		});
	}
	return {
		next: {
			...a,
			xp,
			level,
			resolved: true,
			pot: 0
		},
		rows,
		settled: true
	};
}
function writeAlliancePayout(tx, rows, requestId, exceptUid) {
	for (const row of rows) {
		if (exceptUid && row.uid === exceptUid) continue;
		writeProfile(tx, profileRef(row.uid), row.profile);
		writeLedger(tx, row.uid, row.profile.player.id, requestId, row.ledger);
	}
}
async function foundAllianceAction(tx, player, payload, requestId) {
	const name = String(payload.name ?? "").trim().replace(/\s+/g, " ").slice(0, 22);
	if (name.length < 3) throw new GameError("O nome da aliança precisa de ao menos 3 letras.");
	const openJoin = payload.openJoin !== false;
	const prep = await preparePlayer(tx, player.uid);
	if (prep.profile.alliance) throw new GameError("Já tens aliança.");
	if (prep.profile.niens < 5) throw new GameError(`Precisa de 5 Niens.`);
	const nameRef = col("condado_alliance_names").doc(name.toLowerCase());
	if ((await tx.get(nameRef)).exists) throw new GameError("Este nome de aliança já está em uso.");
	const id = makeId("AL");
	const aref = allianceRef(id);
	const member = {
		id: prep.profile.player.id,
		nick: prep.profile.player.nick,
		uid: player.uid
	};
	const doc = {
		id,
		name,
		leaderId: prep.profile.player.id,
		leaderUid: player.uid,
		minLevel: 1,
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
		openJoin,
		joinRequests: [],
		pot: 0
	};
	const niens = prep.profile.niens - 5;
	const profile = {
		...prep.profile,
		niens,
		alliance: allianceStateOf(doc),
		allianceChat: []
	};
	const ledger = [{
		type: "found_alliance",
		currency: "niens",
		amount: -5,
		balanceBefore: prep.profile.niens,
		balanceAfter: niens,
		source: id
	}];
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...ledger], prep.creditRefs);
	tx.set(nameRef, {
		allianceId: id,
		name
	});
	tx.set(aref, {
		...doc,
		createdAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	return {
		save: withoutMeta(profile),
		toast: openJoin ? `Aliança ${name} fundada. Entrada livre.` : `Aliança ${name} fundada. Pedidos no chat da aliança.`
	};
}
async function joinAllianceAction(tx, player, allianceIdRaw, requestId) {
	const allianceId = allianceIdRaw.trim();
	if (!allianceId) throw new GameError("Aliança inválida.");
	const prep = await preparePlayer(tx, player.uid);
	if (prep.profile.alliance) throw new GameError("Já tens aliança.");
	const aref = allianceRef(allianceId);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	const a = allianceFromDoc(allianceId, asnap.data());
	if (a.members.length >= allianceSlots(a.level)) throw new GameError("Aliança lotada.");
	if (a.members.some((m) => m.id === prep.profile.player.id)) throw new GameError("Já estás nesta aliança.");
	if (!a.openJoin) {
		if (a.joinRequests.some((r) => r.playerId === prep.profile.player.id || r.uid === player.uid)) throw new GameError("Pedido já enviado. Espera o líder no chat da aliança.");
		const req = {
			id: makeId("JR"),
			playerId: prep.profile.player.id,
			nick: prep.profile.player.nick,
			uid: player.uid,
			at: Date.now()
		};
		const msg = {
			id: makeId("m"),
			fromId: prep.profile.player.id,
			fromNick: prep.profile.player.nick,
			text: `${prep.profile.player.nick} pede para entrar.`,
			at: req.at,
			channel: "alliance",
			joinRequestId: req.id
		};
		a.joinRequests = [...a.joinRequests, req];
		a.chat = trimAllianceChat([...a.chat, msg], a.joinRequests);
		commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
		tx.set(aref, {
			joinRequests: a.joinRequests,
			chat: a.chat
		}, { merge: true });
		return { toast: "Pedido enviado. O líder vê no chat da aliança até aceitar ou recusar." };
	}
	a.members.push({
		id: prep.profile.player.id,
		nick: prep.profile.player.nick,
		uid: player.uid
	});
	const profile = {
		...prep.profile,
		alliance: allianceStateOf(a),
		allianceChat: a.chat,
		war: warFromAlliance(a)
	};
	commitPrepared(tx, player.uid, profile, requestId, prep.ledger, prep.creditRefs);
	tx.set(aref, { members: a.members }, { merge: true });
	return {
		save: withoutMeta(profile),
		toast: `Entraste em ${a.name}.`
	};
}
async function leaveAllianceAction(tx, player, requestId) {
	const prep = await preparePlayer(tx, player.uid);
	if (!prep.profile.alliance) throw new GameError("Sem aliança.");
	const aref = allianceRef(prep.profile.alliance.id);
	const asnap = await tx.get(aref);
	const profile = {
		...prep.profile,
		alliance: null,
		war: null,
		allianceChat: []
	};
	commitPrepared(tx, player.uid, profile, requestId, prep.ledger, prep.creditRefs);
	if (asnap.exists) {
		const a = allianceFromDoc(asnap.id, asnap.data());
		const members = a.members.filter((m) => m.id !== prep.profile.player.id);
		if (!members.length) {
			tx.delete(aref);
			tx.delete(col("condado_alliance_names").doc(a.name.toLowerCase()));
		} else {
			const leaderId = a.leaderId === prep.profile.player.id ? members[0].id : a.leaderId;
			const leaderUid = a.leaderId === prep.profile.player.id ? members[0].uid : a.leaderUid;
			tx.set(aref, {
				members,
				leaderId,
				leaderUid
			}, { merge: true });
		}
	}
	return {
		save: withoutMeta(profile),
		toast: "Saíste da aliança."
	};
}
async function recruitAllianceAction(tx, player, requestId) {
	const p = await loadProfile(tx, player.uid);
	if (!p.alliance) throw new GameError("Sem aliança.");
	if (p.alliance.leaderId !== p.player.id) throw new GameError("Só o fundador envia recrutamento.");
	const now = Date.now();
	tx.set(col("condado_chat").doc(), {
		fromUserId: player.uid,
		fromPlayerId: p.player.id,
		fromId: p.player.id,
		fromNick: p.player.nick,
		text: p.alliance.openJoin ? `Recruta: ${p.alliance.name} · entrada livre · ${p.alliance.members.length}/${p.alliance.slots} vagas` : `Recruta: ${p.alliance.name} · pede aprovação · ${p.alliance.members.length}/${p.alliance.slots} vagas`,
		at: now,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + CHAT_TTL_MS).toISOString(),
		channel: "global",
		recruitAllianceId: p.alliance.id
	});
	writeLedger(tx, player.uid, p.player.id, requestId, []);
	return {
		save: withoutMeta(p),
		toast: "Pedido de recrutamento no chat global."
	};
}
async function acceptJoinAction(tx, player, requestIdRaw, requestId) {
	const reqId = requestIdRaw.trim();
	if (!reqId) throw new GameError("Pedido inválido.");
	const prep = await preparePlayer(tx, player.uid);
	if (!prep.profile.alliance) throw new GameError("Sem aliança.");
	if (prep.profile.alliance.leaderId !== prep.profile.player.id) throw new GameError("Só o líder aceita pedidos.");
	const aref = allianceRef(prep.profile.alliance.id);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	const a = allianceFromDoc(asnap.id, asnap.data());
	const req = a.joinRequests.find((r) => r.id === reqId);
	if (!req) throw new GameError("Este pedido já foi resolvido.");
	if (a.members.length >= allianceSlots(a.level)) throw new GameError("Aliança lotada.");
	if (a.members.some((m) => m.id === req.playerId)) {
		a.joinRequests = a.joinRequests.filter((r) => r.id !== reqId);
		a.chat = trimAllianceChat(a.chat, a.joinRequests);
		tx.set(aref, {
			joinRequests: a.joinRequests,
			chat: a.chat
		}, { merge: true });
		throw new GameError("Este senhor já está na aliança.");
	}
	const uid = String(req.uid ?? "");
	if (!uid) throw new GameError("Pedido inválido.");
	const joinerSnap = await tx.get(profileRef(uid));
	if (!joinerSnap.exists) throw new GameError("Condado não encontrado.");
	const joiner = profileFromDoc(uid, joinerSnap.data());
	if (joiner.alliance) throw new GameError("Este senhor já tem aliança.");
	a.members.push({
		id: req.playerId,
		nick: req.nick,
		uid
	});
	a.joinRequests = a.joinRequests.filter((r) => r.id !== reqId);
	const note = {
		id: makeId("m"),
		fromId: prep.profile.player.id,
		fromNick: prep.profile.player.nick,
		text: `${req.nick} foi aceite na aliança.`,
		at: Date.now(),
		channel: "alliance"
	};
	a.chat = trimAllianceChat([...a.chat.filter((m) => m.joinRequestId !== reqId), note], a.joinRequests);
	const leader = {
		...prep.profile,
		alliance: allianceStateOf(a),
		allianceChat: a.chat.map((m) => ({
			...m,
			self: m.fromId === prep.profile.player.id
		}))
	};
	const guest = {
		...joiner,
		alliance: allianceStateOf(a),
		allianceChat: a.chat.map((m) => ({
			...m,
			self: m.fromId === joiner.player.id
		})),
		war: warFromAlliance(a)
	};
	commitPrepared(tx, player.uid, leader, requestId, prep.ledger, prep.creditRefs);
	writeProfile(tx, profileRef(uid), guest);
	tx.set(aref, {
		members: a.members,
		joinRequests: a.joinRequests,
		chat: a.chat
	}, { merge: true });
	return {
		save: withoutMeta(leader),
		toast: `${req.nick} entrou na aliança.`
	};
}
async function rejectJoinAction(tx, player, requestIdRaw, requestId) {
	const reqId = requestIdRaw.trim();
	if (!reqId) throw new GameError("Pedido inválido.");
	const prep = await preparePlayer(tx, player.uid);
	if (!prep.profile.alliance) throw new GameError("Sem aliança.");
	if (prep.profile.alliance.leaderId !== prep.profile.player.id) throw new GameError("Só o líder recusa pedidos.");
	const aref = allianceRef(prep.profile.alliance.id);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	const a = allianceFromDoc(asnap.id, asnap.data());
	const req = a.joinRequests.find((r) => r.id === reqId);
	if (!req) throw new GameError("Este pedido já foi resolvido.");
	a.joinRequests = a.joinRequests.filter((r) => r.id !== reqId);
	const note = {
		id: makeId("m"),
		fromId: prep.profile.player.id,
		fromNick: prep.profile.player.nick,
		text: `Pedido de ${req.nick} recusado.`,
		at: Date.now(),
		channel: "alliance"
	};
	a.chat = trimAllianceChat([...a.chat.filter((m) => m.joinRequestId !== reqId), note], a.joinRequests);
	const profile = {
		...prep.profile,
		alliance: allianceStateOf(a),
		allianceChat: a.chat.map((m) => ({
			...m,
			self: m.fromId === prep.profile.player.id
		}))
	};
	commitPrepared(tx, player.uid, profile, requestId, prep.ledger, prep.creditRefs);
	tx.set(aref, {
		joinRequests: a.joinRequests,
		chat: a.chat
	}, { merge: true });
	return {
		save: withoutMeta(profile),
		toast: `Pedido de ${req.nick} recusado.`
	};
}
async function sendAlliance(tx, player, textRaw, requestId) {
	const text = textRaw.trim().slice(0, 160);
	if (!text) throw new GameError("Mensagem vazia.");
	const p = await loadProfile(tx, player.uid);
	if (!p.alliance) throw new GameError("Sem aliança.");
	const aref = allianceRef(p.alliance.id);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	const a = allianceFromDoc(asnap.id, asnap.data());
	const msg = {
		id: makeId("m"),
		fromId: p.player.id,
		fromNick: p.player.nick,
		text,
		at: Date.now(),
		self: true,
		channel: "alliance"
	};
	const chat = trimAllianceChat([...a.chat, {
		...msg,
		self: false
	}], a.joinRequests);
	const profile = {
		...p,
		allianceChat: chat.map((m) => ({
			...m,
			self: m.fromId === p.player.id
		})),
		alliance: allianceStateOf({
			...a,
			chat
		})
	};
	writeProfile(tx, profileRef(player.uid), profile);
	tx.set(aref, { chat }, { merge: true });
	writeLedger(tx, player.uid, p.player.id, requestId, []);
	return { save: withoutMeta(profile) };
}
async function dropWarQueue(tx, winKey, ids) {
	const qref = col("condado_war_queue").doc(winKey);
	const qsnap = await tx.get(qref);
	const waiting = Array.isArray(qsnap.data()?.waiting) ? qsnap.data().waiting.map(String) : [];
	const next = waiting.filter((id) => !ids.includes(id));
	if (next.length !== waiting.length) tx.set(qref, {
		waiting: next,
		day: winKey
	}, { merge: true });
}
function warLinkFields(foeId, foeName, winKey) {
	return {
		warDay: winKey,
		foeId,
		foeName,
		ourPoints: 0,
		theirPoints: 0,
		participants: [],
		sittingOut: false,
		resolved: false,
		pot: 0
	};
}
async function loadFoeLords(foeId) {
	const foeSnap = await allianceRef(foeId).get();
	if (!foeSnap.exists) return [];
	const foe = allianceFromDoc(foeSnap.id, foeSnap.data());
	const foes = [];
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
			real: true
		});
	}
	return foes;
}
async function listAllianceHallAction(player) {
	const meSnap = await profileRef(player.uid).get();
	if (!meSnap.exists) return {
		foes: [],
		rivals: []
	};
	const me = profileFromDoc(player.uid, meSnap.data());
	if (!me.alliance) return {
		foes: [],
		rivals: []
	};
	const aSnap = await allianceRef(me.alliance.id).get();
	if (!aSnap.exists) return {
		foes: [],
		rivals: []
	};
	const a = allianceFromDoc(aSnap.id, aSnap.data());
	const allianceSave = {
		...withoutMeta(me),
		alliance: allianceStateOf(a),
		war: warFromAlliance(a),
		allianceChat: a.chat.map((m) => ({
			...m,
			self: m.fromId === me.player.id
		}))
	};
	return {
		foes: a.foeId && !a.sittingOut ? await loadFoeLords(a.foeId) : [],
		rivals: (await col("condado_alliances").limit(80).get()).docs.map((d) => allianceFromDoc(d.id, d.data())).filter((x) => x.id !== a.id && x.members.length > 0).map((x) => ({
			id: x.id,
			name: x.name,
			level: x.level,
			members: x.members.length,
			slots: allianceSlots(x.level),
			atWar: allianceAtWarToday(x),
			foeName: allianceAtWarToday(x) ? x.foeName : ""
		})).sort((p, q) => p.name.localeCompare(q.name, "pt")),
		challenges: await listInbox(player.uid),
		save: allianceSave
	};
}
async function declareWarAction(tx, player, allianceIdRaw, requestId) {
	const foeId = allianceIdRaw.trim();
	if (!foeId) throw new GameError("Escolhe a aliança inimiga.");
	const prep = await preparePlayer(tx, player.uid);
	if (!prep.profile.alliance) throw new GameError("Sem aliança.");
	if (foeId === prep.profile.alliance.id) throw new GameError("Não podes declarar guerra contra a tua aliança.");
	const aref = allianceRef(prep.profile.alliance.id);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	let a = allianceFromDoc(asnap.id, asnap.data());
	if (a.leaderId !== prep.profile.player.id && a.leaderUid !== player.uid) throw new GameError("Só o líder declara a guerra.");
	const foeRef = allianceRef(foeId);
	const foeSnap = await tx.get(foeRef);
	if (!foeSnap.exists) throw new GameError("Aliança inimiga não encontrada.");
	let foe = allianceFromDoc(foeSnap.id, foeSnap.data());
	if (!foe.members.length) throw new GameError("Essa aliança está vazia.");
	const myPay = await readAlliancePayout(tx, a);
	a = myPay.next;
	const foePay = await readAlliancePayout(tx, foe);
	foe = foePay.next;
	const mine = myPay.rows.find((row) => row.uid === player.uid);
	let baseProfile = mine ? {
		...prep.profile,
		gold: mine.profile.gold
	} : prep.profile;
	const extraLedger = mine ? mine.ledger : [];
	if (myPay.settled) writeAlliancePayout(tx, myPay.rows, requestId, player.uid);
	if (foePay.settled) writeAlliancePayout(tx, foePay.rows, requestId);
	if (allianceAtWarToday(a)) throw new GameError(`A tua aliança já está em guerra com ${a.foeName || "outra aliança"}.`);
	if (allianceAtWarToday(foe)) throw new GameError(`${foe.name} já está em guerra e não pode ser chamada.`);
	const win = warWindow();
	const ours = warLinkFields(foe.id, foe.name, win.key);
	const theirs = warLinkFields(a.id, a.name, win.key);
	const noteUs = {
		id: makeId("m"),
		fromId: prep.profile.player.id,
		fromNick: prep.profile.player.nick,
		text: `Guerra declarada contra ${foe.name}.`,
		at: Date.now(),
		channel: "alliance"
	};
	const noteThem = {
		id: makeId("m"),
		fromId: "CDN-ARAUTO",
		fromNick: "Arauto",
		text: `${a.name} declarou guerra contra nós.`,
		at: Date.now(),
		channel: "alliance"
	};
	a = {
		...a,
		...ours,
		chat: trimAllianceChat([...a.chat, noteUs], a.joinRequests)
	};
	foe = {
		...foe,
		...theirs,
		chat: trimAllianceChat([...foe.chat, noteThem], foe.joinRequests)
	};
	await dropWarQueue(tx, win.key, [a.id, foe.id]);
	tx.set(aref, {
		...ours,
		chat: a.chat
	}, { merge: true });
	tx.set(foeRef, {
		...theirs,
		chat: foe.chat
	}, { merge: true });
	const war = {
		...warFromAlliance(a),
		attacks: baseProfile.war?.week === win.key ? baseProfile.war.attacks : {}
	};
	const profile = {
		...baseProfile,
		alliance: allianceStateOf(a),
		war,
		allianceChat: a.chat.map((m) => ({
			...m,
			self: m.fromId === prep.profile.player.id
		}))
	};
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...extraLedger], prep.creditRefs);
	return {
		save: withoutMeta(profile),
		toast: `Guerra declarada contra ${foe.name}. Os duelos estão na aba Guerra.`
	};
}
function armyCount(a) {
	return armyCountOf(a);
}
function inboxRef(uid) {
	return col("condado_duel_inbox").doc(uid);
}
function parseInbox(data) {
	const raw = Array.isArray(data?.items) ? data.items : [];
	const now = Date.now();
	const out = [];
	for (const r of raw) {
		const until = Number(r.until ?? 0);
		const status = resolveDuelStatus(String(r.status ?? "pending"), {
			until,
			now
		});
		if (![
			"pending",
			"prep",
			"fight"
		].includes(status) && now - until > 12e4) continue;
		out.push({
			sessionId: String(r.sessionId ?? ""),
			fromId: String(r.fromId ?? ""),
			fromNick: String(r.fromNick ?? "Senhor"),
			fromUid: String(r.fromUid ?? ""),
			toId: String(r.toId ?? ""),
			toNick: String(r.toNick ?? "Senhor"),
			toUid: String(r.toUid ?? ""),
			until,
			status
		});
	}
	return out.slice(-12);
}
function toChallenges(uid, items) {
	return items.filter((i) => i.sessionId && (i.status === "pending" || i.status === "prep" || i.status === "fight")).map((i) => ({
		sessionId: i.sessionId,
		fromId: i.fromId,
		fromNick: i.fromNick,
		toId: i.toId,
		toNick: i.toNick,
		until: i.until,
		status: i.status,
		incoming: i.toUid === uid
	}));
}
async function listInbox(uid) {
	return toChallenges(uid, parseInbox((await inboxRef(uid).get()).data()));
}
async function readInbox(tx, uid) {
	return parseInbox((await tx.get(inboxRef(uid))).data());
}
function writeInbox(tx, uid, items) {
	tx.set(inboxRef(uid), { items: items.slice(-12) }, { merge: true });
}
function patchInbox(items, sessionId, status, extra) {
	return items.map((i) => i.sessionId === sessionId ? {
		...i,
		status,
		...extra
	} : i);
}
function sessionStatus(session, now = Date.now()) {
	return resolveDuelStatus(String(session.status ?? "pending"), {
		fightEndsAt: Number(session.fightEndsAt ?? 0),
		createdAt: Number(session.createdAt ?? 0),
		challengeUntil: Number(session.challengeUntil ?? 0),
		now
	});
}
function applySurvivors(current, started, survivors) {
	const clamp = (have, took, back) => Math.max(0, have - took + Math.min(took, Math.max(0, back)));
	return {
		infantry: clamp(current.infantry, started.infantry ?? 0, survivors.infantry ?? 0),
		archers: clamp(current.archers, started.archers ?? 0, survivors.archers ?? 0),
		cavalry: clamp(current.cavalry, started.cavalry ?? 0, survivors.cavalry ?? 0),
		general: Math.min(1, clamp(current.general, started.general ?? 0, survivors.general ?? 0)),
		generaless: Math.min(1, clamp(current.generaless, started.generaless ?? 0, survivors.generaless ?? 0)),
		defender: clamp(current.defender, started.defender ?? 0, survivors.defender ?? 0)
	};
}
async function startAllianceDuelAction(tx, player, targetId, requestId) {
	const prep = await preparePlayer(tx, player.uid);
	if (!prep.profile.alliance) throw new GameError("Sem aliança.");
	if (armyCount(prep.profile.army) <= 0) throw new GameError("Sem tropas no acampamento.");
	const aref = allianceRef(prep.profile.alliance.id);
	const asnap = await tx.get(aref);
	if (!asnap.exists) throw new GameError("Aliança não encontrada.");
	let a = allianceFromDoc(asnap.id, asnap.data());
	const payout = await readAlliancePayout(tx, a);
	a = payout.next;
	const mine = payout.rows.find((row) => row.uid === player.uid);
	const baseProfile = mine ? {
		...prep.profile,
		gold: mine.profile.gold
	} : prep.profile;
	const extraLedger = mine ? mine.ledger : [];
	if (payout.settled) {
		writeAlliancePayout(tx, payout.rows, requestId, player.uid);
		tx.set(aref, {
			xp: a.xp,
			level: a.level,
			resolved: a.resolved,
			pot: a.pot
		}, { merge: true });
	}
	if (!allianceAtWarToday(a)) {
		const waitingProfile = {
			...baseProfile,
			alliance: allianceStateOf(a),
			war: warFromAlliance(a)
		};
		commitPrepared(tx, player.uid, waitingProfile, requestId, [...prep.ledger, ...extraLedger], prep.creditRefs);
		return {
			save: withoutMeta(waitingProfile),
			toast: "O líder declara a guerra na aba Guerra."
		};
	}
	const idx = await tx.get(col("condado_player_index").doc(targetId));
	if (!idx.exists) throw new GameError("Alvo não encontrado.");
	const toUid = String(idx.data()?.userId ?? "");
	if (toUid === player.uid) throw new GameError("Não podes desafiar-te a ti mesmo.");
	const destSnap = await tx.get(profileRef(toUid));
	if (!destSnap.exists) throw new GameError("Alvo não encontrado.");
	const dest = profileFromDoc(toUid, destSnap.data());
	if (dest.alliance?.id !== a.foeId) throw new GameError("Este senhor não está na aliança rival.");
	if ((baseProfile.war?.attacks[dest.player.id] ?? 0) >= 2) throw new GameError("No máximo 2 duelos por rival neste dia.");
	const mineBox = await readInbox(tx, player.uid);
	if (mineBox.some((i) => i.status === "pending" || i.status === "prep" || i.status === "fight")) throw new GameError("Já tens um desafio a decorrer. Espera ou escolhe outro depois.");
	const theirs = await readInbox(tx, toUid);
	if (theirs.some((i) => i.status === "pending" || i.status === "prep" || i.status === "fight")) throw new GameError("Este lorde já está num desafio. Escolhe outro que aceite.");
	const sessionId = makeId("AW");
	const until = Date.now() + ALLIANCE_CHALLENGE_MS;
	const item = {
		sessionId,
		fromId: prep.profile.player.id,
		fromNick: prep.profile.player.nick,
		fromUid: player.uid,
		toId: dest.player.id,
		toNick: dest.player.nick,
		toUid,
		until,
		status: "pending"
	};
	writeInbox(tx, player.uid, [...mineBox, item]);
	writeInbox(tx, toUid, [...theirs, item]);
	tx.set(col("condado_raid_sessions").doc(sessionId), {
		kind: "alliance",
		status: "pending",
		attackerUid: player.uid,
		defenderUid: toUid,
		attackerId: prep.profile.player.id,
		attackerNick: prep.profile.player.nick,
		defenderId: dest.player.id,
		defenderNick: dest.player.nick,
		allianceId: a.id,
		foeAllianceId: a.foeId,
		attackerArmy: prep.profile.army,
		defenderArmy: dest.army,
		attackerLevels: prep.profile.troopLevels,
		defenderLevels: dest.troopLevels,
		attackerCamp: prep.profile.campLevel,
		defenderCamp: dest.campLevel,
		createdAt: Date.now(),
		challengeUntil: until,
		attackerReady: false,
		defenderReady: false,
		pendingDeploys: [],
		open: true
	});
	const profile = {
		...baseProfile,
		alliance: allianceStateOf(a),
		war: warFromAlliance(a)
	};
	commitPrepared(tx, player.uid, profile, requestId, [...prep.ledger, ...extraLedger], prep.creditRefs);
	return {
		save: withoutMeta(profile),
		sessionId,
		status: "pending",
		nick: dest.player.nick,
		challenges: toChallenges(player.uid, [...mineBox, item]),
		toast: `Desafio enviado a ${dest.player.nick}. Ele precisa de aceitar no campo.`
	};
}
async function respondAllianceDuelAction(tx, player, sessionId, accept, requestId) {
	if (!sessionId) throw new GameError("Desafio inválido.");
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const sessionSnap = await tx.get(sessionRef);
	if (!sessionSnap.exists) throw new GameError("Desafio inválido.");
	const session = sessionSnap.data();
	if (session.kind !== "alliance") throw new GameError("Desafio inválido.");
	const isDef = session.defenderUid === player.uid;
	const isAtk = session.attackerUid === player.uid;
	if (!isDef && !isAtk) throw new GameError("Este desafio não é teu.");
	if (String(session.status ?? "pending") !== "pending") throw new GameError("Este desafio já foi resolvido.");
	if (Number(session.challengeUntil ?? 0) < Date.now()) {
		tx.set(sessionRef, {
			status: "expired",
			open: false
		}, { merge: true });
		throw new GameError("O desafio expirou. Escolhe outro lorde.");
	}
	const atkBox = await readInbox(tx, String(session.attackerUid));
	const defBox = await readInbox(tx, String(session.defenderUid));
	if (!accept) {
		writeInbox(tx, String(session.attackerUid), patchInbox(atkBox, sessionId, "declined"));
		writeInbox(tx, String(session.defenderUid), patchInbox(defBox, sessionId, "declined"));
		tx.set(sessionRef, {
			status: "declined",
			open: false
		}, { merge: true });
		const prep = await preparePlayer(tx, player.uid);
		commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
		return {
			save: withoutMeta(prep.profile),
			status: "declined",
			sessionId,
			toast: isAtk ? "Desafio cancelado. Escolhe outro lorde." : "Recusaste o duelo.",
			challenges: toChallenges(player.uid, patchInbox(isDef ? defBox : atkBox, sessionId, "declined"))
		};
	}
	if (!isDef) throw new GameError("Só o lorde desafiado pode aceitar.");
	const prep = await preparePlayer(tx, player.uid);
	if (armyCount(prep.profile.army) <= 0) throw new GameError("Sem tropas no acampamento.");
	const prepEndsAt = Date.now() + PREP_MS;
	const fightEndsAt = prepEndsAt + BATTLE_MS;
	writeInbox(tx, String(session.attackerUid), patchInbox(atkBox, sessionId, "prep", { until: fightEndsAt }));
	writeInbox(tx, String(session.defenderUid), patchInbox(defBox, sessionId, "prep", { until: fightEndsAt }));
	tx.set(sessionRef, {
		status: "prep",
		phase: "prep",
		prepEndsAt,
		fightEndsAt,
		defenderArmy: prep.profile.army,
		defenderLevels: prep.profile.troopLevels,
		defenderCamp: prep.profile.campLevel,
		attackerStarted: session.attackerArmy,
		defenderStarted: prep.profile.army,
		open: true
	}, { merge: true });
	commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
	return {
		save: withoutMeta(prep.profile),
		sessionId,
		status: "prep",
		side: "def",
		atkArmy: normalizeArmy(session.attackerArmy),
		atkLevels: session.attackerLevels ?? {},
		atkCamp: Number(session.attackerCamp ?? 1),
		foeArmy: normalizeArmy(prep.profile.army),
		foeLevels: prep.profile.troopLevels,
		foeCamp: prep.profile.campLevel,
		nick: String(session.attackerNick ?? "Rival"),
		toast: "Desafio aceite. Posiciona as tropas na borda leste.",
		challenges: toChallenges(player.uid, patchInbox(defBox, sessionId, "prep")),
		duel: {
			phase: "prep",
			prepEndsAt,
			fightEndsAt,
			attackerReady: false,
			defenderReady: false
		}
	};
}
async function pollAllianceDuelAction(player, sessionId) {
	if (!sessionId) return { status: "expired" };
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const snap = await sessionRef.get();
	if (!snap.exists) return { status: "expired" };
	const session = snap.data();
	if (session.attackerUid !== player.uid && session.defenderUid !== player.uid) throw new GameError("Este duelo não é teu.");
	let status = sessionStatus(session);
	if (status === "expired" && String(session.status) !== "expired" && String(session.status) !== "done") {
		await sessionRef.set({
			status: "expired",
			open: false
		}, { merge: true });
		const atkUid = String(session.attackerUid);
		const defUid = String(session.defenderUid);
		const [atkBox, defBox] = await Promise.all([inboxRef(atkUid).get(), inboxRef(defUid).get()]);
		await Promise.all([inboxRef(atkUid).set({ items: patchInbox(parseInbox(atkBox.data()), sessionId, "expired") }, { merge: true }), inboxRef(defUid).set({ items: patchInbox(parseInbox(defBox.data()), sessionId, "expired") }, { merge: true })]);
	}
	const side = session.attackerUid === player.uid ? "atk" : "def";
	return {
		sessionId,
		status,
		side,
		nick: side === "atk" ? String(session.defenderNick ?? "") : String(session.attackerNick ?? ""),
		atkArmy: normalizeArmy(session.attackerArmy),
		atkLevels: session.attackerLevels ?? {},
		atkCamp: Number(session.attackerCamp ?? 1),
		foeArmy: normalizeArmy(session.defenderArmy),
		foeLevels: session.defenderLevels ?? {},
		foeCamp: Number(session.defenderCamp ?? 1),
		duel: {
			phase: status === "expired" ? "expired" : session.phase ?? status,
			snapshot: session.snapshot ?? null,
			pendingDeploys: session.pendingDeploys ?? [],
			attackerReady: !!session.attackerReady,
			defenderReady: !!session.defenderReady,
			attackerRetreated: !!session.attackerRetreated,
			defenderRetreated: !!session.defenderRetreated,
			prepEndsAt: session.prepEndsAt ?? 0,
			fightEndsAt: session.fightEndsAt ?? 0,
			winner: session.winner ?? null
		}
	};
}
async function syncAllianceDuelAction(tx, player, payload, requestId) {
	const sessionId = String(payload.sessionId ?? "");
	if (!sessionId) throw new GameError("Duelo inválido.");
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const sessionSnap = await tx.get(sessionRef);
	if (!sessionSnap.exists) throw new GameError("Duelo inválido.");
	const session = sessionSnap.data();
	if (session.attackerUid !== player.uid && session.defenderUid !== player.uid) throw new GameError("Este duelo não é teu.");
	const isAtk = session.attackerUid === player.uid;
	const side = isAtk ? "atk" : "def";
	const live = sessionStatus(session);
	if (live === "expired" || live === "done" || live === "declined") {
		if (live === "expired" && String(session.status) !== "expired") {
			const atkBox = await readInbox(tx, String(session.attackerUid));
			const defBox = await readInbox(tx, String(session.defenderUid));
			tx.set(sessionRef, {
				status: "expired",
				open: false
			}, { merge: true });
			writeInbox(tx, String(session.attackerUid), patchInbox(atkBox, sessionId, "expired"));
			writeInbox(tx, String(session.defenderUid), patchInbox(defBox, sessionId, "expired"));
		}
		return {
			sessionId,
			status: live,
			side,
			duel: { phase: live }
		};
	}
	const patch = {};
	let status = String(session.status ?? "pending");
	let phase = String(session.phase ?? status);
	if (payload.ready === true) {
		if (isAtk) patch.attackerReady = true;
		else patch.defenderReady = true;
	}
	if (payload.retreat === true) {
		if (isAtk) patch.attackerRetreated = true;
		else patch.defenderRetreated = true;
	}
	const deploys = Array.isArray(payload.deploys) ? payload.deploys : [];
	if (deploys.length) patch.pendingDeploys = [...Array.isArray(session.pendingDeploys) ? session.pendingDeploys : [], ...deploys.slice(0, 40).map((d) => ({
		type: String(d.type ?? "infantry"),
		gx: Number(d.gx ?? 0),
		gy: Number(d.gy ?? 0),
		side
	}))].slice(-80);
	if (isAtk && payload.snapshot && typeof payload.snapshot === "object") {
		patch.snapshot = payload.snapshot;
		patch.pendingDeploys = [];
		if (payload.snapshot.phase === "fight") {
			patch.phase = "fight";
			patch.status = "fight";
			phase = "fight";
			status = "fight";
		}
	}
	const attackerReady = payload.ready === true && isAtk ? true : !!session.attackerReady || !!patch.attackerReady;
	const defenderReady = payload.ready === true && !isAtk ? true : !!session.defenderReady || !!patch.defenderReady;
	const prepEndsAt = Number(session.prepEndsAt ?? 0);
	if (status === "prep" && (attackerReady && defenderReady || prepEndsAt && Date.now() >= prepEndsAt)) {
		patch.status = "fight";
		patch.phase = "fight";
		status = "fight";
		phase = "fight";
	}
	if (Object.keys(patch).length) tx.set(sessionRef, patch, { merge: true });
	return {
		sessionId,
		status,
		side,
		duel: {
			phase,
			snapshot: patch.snapshot ?? session.snapshot ?? null,
			pendingDeploys: isAtk ? patch.pendingDeploys ?? session.pendingDeploys ?? [] : [],
			attackerReady,
			defenderReady,
			attackerRetreated: !!session.attackerRetreated || !!patch.attackerRetreated,
			defenderRetreated: !!session.defenderRetreated || !!patch.defenderRetreated,
			prepEndsAt: session.prepEndsAt ?? 0,
			fightEndsAt: session.fightEndsAt ?? 0,
			winner: session.winner ?? null
		}
	};
}
async function abandonAllianceDuelAction(tx, player, sessionId, requestId) {
	if (!sessionId) throw new GameError("Duelo inválido.");
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const sessionSnap = await tx.get(sessionRef);
	const prep = await preparePlayer(tx, player.uid);
	if (!sessionSnap.exists) {
		const next = (await readInbox(tx, player.uid)).filter((i) => i.sessionId !== sessionId);
		writeInbox(tx, player.uid, next);
		commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
		return {
			save: withoutMeta(prep.profile),
			status: "expired",
			sessionId,
			challenges: toChallenges(player.uid, next),
			toast: "O duelo já tinha acabado. Já podes jogar."
		};
	}
	const session = sessionSnap.data();
	if (session.attackerUid !== player.uid && session.defenderUid !== player.uid) throw new GameError("Este duelo não é teu.");
	const live = sessionStatus(session);
	const atkUid = String(session.attackerUid);
	const defUid = String(session.defenderUid);
	const atkBox = await readInbox(tx, atkUid);
	const defBox = await readInbox(tx, defUid);
	if (live === "fight") return finishAllianceDuelAction(tx, player, {
		sessionId,
		retreated: true,
		winner: session.attackerUid === player.uid ? "def" : "atk"
	}, requestId);
	writeInbox(tx, atkUid, patchInbox(atkBox, sessionId, "expired"));
	writeInbox(tx, defUid, patchInbox(defBox, sessionId, "expired"));
	tx.set(sessionRef, {
		status: "expired",
		open: false,
		abandonedBy: player.uid
	}, { merge: true });
	commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
	return {
		save: withoutMeta(prep.profile),
		status: "expired",
		sessionId,
		challenges: toChallenges(player.uid, patchInbox(player.uid === atkUid ? atkBox : defBox, sessionId, "expired")),
		toast: live === "pending" ? "Desafio cancelado." : "Saíste do campo. O duelo foi anulado."
	};
}
async function finishAllianceDuelAction(tx, player, payload, requestId) {
	const sessionId = String(payload.sessionId ?? "");
	const sessionRef = col("condado_raid_sessions").doc(sessionId);
	const sessionSnap = await tx.get(sessionRef);
	if (!sessionSnap.exists) throw new GameError("Duelo inválido.");
	const session = sessionSnap.data();
	if (session.kind !== "alliance") throw new GameError("Duelo inválido.");
	const isAtk = session.attackerUid === player.uid;
	const isDef = session.defenderUid === player.uid;
	if (!isAtk && !isDef) throw new GameError("Duelo inválido.");
	const prep = await preparePlayer(tx, player.uid);
	if (!session.open) {
		commitPrepared(tx, player.uid, prep.profile, requestId, prep.ledger, prep.creditRefs);
		return {
			save: withoutMeta(prep.profile),
			toast: "Este duelo já foi resolvido.",
			sessionId,
			status: "done"
		};
	}
	const rawWinner = String(payload.winner ?? "");
	const retreated = Boolean(payload.retreated);
	let winner = "draw";
	if (rawWinner === "atk" || rawWinner === "def" || rawWinner === "draw") winner = rawWinner;
	else if (retreated) winner = isAtk ? "def" : "atk";
	else if (payload.won === true) winner = isAtk ? "atk" : "def";
	else if (payload.won === false) winner = isAtk ? "def" : "atk";
	const atkUid = String(session.attackerUid);
	const defUid = String(session.defenderUid);
	const aref = allianceRef(String(session.allianceId));
	const foeRef = allianceRef(String(session.foeAllianceId));
	const asnap = await tx.get(aref);
	const foeSnap = await tx.get(foeRef);
	const atkSnap = isAtk ? null : await tx.get(profileRef(atkUid));
	const defPSnap = isDef ? null : await tx.get(profileRef(defUid));
	const atkBox = await readInbox(tx, atkUid);
	const defBox = await readInbox(tx, defUid);
	let a = asnap.exists ? allianceFromDoc(asnap.id, asnap.data()) : null;
	let foe = foeSnap.exists ? allianceFromDoc(foeSnap.id, foeSnap.data()) : null;
	const atkPts = winner === "atk" ? 3 : winner === "def" ? 1 : 1;
	const defPts = winner === "def" ? 3 : winner === "atk" ? 1 : 1;
	const atkGold = winner === "atk" ? ALLIANCE_DUEL_WIN_GOLD : ALLIANCE_DUEL_LOSS_GOLD;
	const defGold = winner === "def" ? ALLIANCE_DUEL_WIN_GOLD : ALLIANCE_DUEL_LOSS_GOLD;
	const atkPot = winner === "atk" ? ALLIANCE_DUEL_WIN_POT : ALLIANCE_DUEL_LOSS_POT;
	const defPot = winner === "def" ? ALLIANCE_DUEL_WIN_POT : ALLIANCE_DUEL_LOSS_POT;
	const atkId = String(session.attackerId ?? "");
	const defId = String(session.defenderId ?? "");
	if (a) {
		const participants = a.participants.includes(atkId) ? a.participants : [...a.participants, atkId];
		a = {
			...a,
			ourPoints: a.ourPoints + atkPts,
			theirPoints: a.theirPoints + defPts,
			participants,
			pot: a.pot + atkPot
		};
		tx.set(aref, {
			ourPoints: a.ourPoints,
			theirPoints: a.theirPoints,
			participants,
			pot: a.pot
		}, { merge: true });
	}
	if (foe) {
		const participants = foe.participants.includes(defId) ? foe.participants : [...foe.participants, defId];
		foe = {
			...foe,
			ourPoints: foe.ourPoints + defPts,
			theirPoints: foe.theirPoints + atkPts,
			participants,
			pot: foe.pot + defPot
		};
		tx.set(foeRef, {
			ourPoints: foe.ourPoints,
			theirPoints: foe.theirPoints,
			participants,
			pot: foe.pot
		}, { merge: true });
	}
	const atkProf = isAtk ? prep.profile : atkSnap?.exists ? profileFromDoc(atkUid, atkSnap.data()) : null;
	const defProf = isDef ? prep.profile : defPSnap?.exists ? profileFromDoc(defUid, defPSnap.data()) : null;
	const atkStarted = session.attackerStarted ?? session.attackerArmy ?? {};
	const defStarted = session.defenderStarted ?? session.defenderArmy ?? {};
	const atkSurv = payload.atkSurvivors ?? (isAtk ? payload.survivors : payload.foeSurvivors) ?? {};
	const defSurv = payload.defSurvivors ?? (isDef ? payload.survivors : payload.foeSurvivors) ?? {};
	const payOne = (p, gold, started, surv, alliance, foePlayerId) => {
		const army = applySurvivors(p.army, started, surv);
		const ledger = [{
			type: "alliance_duel",
			currency: "gold",
			amount: gold,
			balanceBefore: p.gold,
			balanceAfter: p.gold + gold,
			source: String(session.defenderNick ?? "duelo")
		}];
		const used = (p.war?.attacks[foePlayerId] ?? 0) + (p.userId === atkUid ? 1 : 0);
		const won = p.userId === atkUid && winner === "atk" || p.userId === defUid && winner === "def";
		const starred = addWeekStars(withoutMeta({
			...p,
			army,
			gold: p.gold + gold
		}), won ? 3 : 0, Date.now(), { countRaid: false });
		return {
			profile: {
				...p,
				...starred,
				army,
				gold: p.gold + gold,
				alliance: alliance ? allianceStateOf(alliance) : p.alliance,
				war: alliance ? {
					...warFromAlliance(alliance),
					attacks: {
						...p.war?.attacks ?? {},
						...p.userId === atkUid ? { [foePlayerId]: Math.max(used, 1) } : {}
					}
				} : p.war
			},
			ledger
		};
	};
	let caller = prep.profile;
	if (atkProf) {
		const paid = payOne(atkProf, atkGold, atkStarted, atkSurv, a, defId);
		if (isAtk) caller = paid.profile;
		else {
			writeProfile(tx, profileRef(atkUid), paid.profile);
			writeLedger(tx, atkUid, paid.profile.player.id, requestId, paid.ledger);
		}
		if (isAtk) {
			commitPrepared(tx, player.uid, paid.profile, requestId, [...prep.ledger, ...paid.ledger], prep.creditRefs);
			caller = paid.profile;
		}
	}
	if (defProf) {
		const paid = payOne(defProf, defGold, defStarted, defSurv, foe, atkId);
		if (isDef) {
			commitPrepared(tx, player.uid, paid.profile, requestId, [...prep.ledger, ...paid.ledger], prep.creditRefs);
			caller = paid.profile;
		} else {
			writeProfile(tx, profileRef(defUid), paid.profile);
			writeLedger(tx, defUid, paid.profile.player.id, requestId, paid.ledger);
		}
	}
	writeInbox(tx, atkUid, patchInbox(atkBox, sessionId, "done"));
	writeInbox(tx, defUid, patchInbox(defBox, sessionId, "done"));
	tx.set(sessionRef, {
		open: false,
		status: "done",
		winner,
		resolvedAt: Date.now()
	}, { merge: true });
	const myWin = isAtk && winner === "atk" || isDef && winner === "def";
	const gold = isAtk ? atkGold : defGold;
	const toast = winner === "draw" ? `Empate no campo. +1 ponto e ${gold.toLocaleString("pt")} Libras.` : myWin ? `Vitória no campo. +3 pontos, ${gold.toLocaleString("pt")} Libras e ${ALLIANCE_DUEL_WIN_POT.toLocaleString("pt")} no pote.` : `Derrota no campo. +1 ponto, ${gold.toLocaleString("pt")} Libras e ${ALLIANCE_DUEL_LOSS_POT.toLocaleString("pt")} no pote.`;
	return {
		save: withoutMeta(caller),
		toast,
		sessionId,
		status: "done",
		duelGold: gold
	};
}
//#endregion
//#region src/lib/game/server/http.server.ts
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
}
function statusFor(error) {
	const message = error instanceof Error ? error.message : "";
	if (message.includes("reino ainda não está ligado") || message.includes("credential") || message.includes("private") || message.includes("Cannot find module") || message.includes("firebase-admin")) return 503;
	if (message.includes("Entre na tua conta") || message.includes("Sessão expirada")) return 401;
	if (message.includes("depressa demais")) return 429;
	if (error instanceof GameError) return 400;
	return 500;
}
function safeMessage(error) {
	const message = error instanceof Error ? error.message : "Não foi possível concluir a ação.";
	if (message.includes("FIREBASE") || message.includes("Firestore") || message.includes("undefined") || message.includes("credential") || message.includes("private") || message.includes("Cannot find module") || message.includes("service account") || /at\s+\S+\s+\(/.test(message)) return "Não foi possível concluir a ação.";
	return message;
}
async function handleGamePost(request) {
	try {
		if (!adminConfigured()) return json({ error: "O reino ainda não está ligado ao servidor. Tenta dentro de instantes." }, 503);
		const player = await verifyPlayerToken(request.headers.get("authorization"));
		const body = await request.json();
		const action = String(body.action ?? "");
		const requestId = String(body.requestId ?? "");
		const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
		if (!action) return json({ error: "Pedido inválido." }, 400);
		return json(await handleGameAction(player, action, payload, requestId));
	} catch (error) {
		console.error("[condado] /api/game", error instanceof Error ? error.message : error);
		return json({ error: safeMessage(error) }, statusFor(error));
	}
}
//#endregion
exports.handleGamePost = handleGamePost;

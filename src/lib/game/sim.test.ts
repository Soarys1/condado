import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSave, toSave } from "./save";
import {
  GameError,
  applyRaidFinish,
  buyNienSim,
  claimPassAllSim,
  collectBuilding,
  creditResource,
  EMPTY_ARMY,
  lootForStars,
  normalizeArmy,
  pickDeployType,
  resolveDuelStatus,
  sellNienSim,
  spendForTransfer,
  storedAmount,
  trainTroop,
  foundAllianceSim,
  upgradeBuilding,
  upgradeCountySim,
  settle,
} from "./sim";
import { NIEN_COST_GOLD, NIEN_SELL_GOLD, LOOT_CAP, lootCapForCounty, freePassReward, passCostNiens, passCostWithDiscount, productionPerSec, PASS_BOOST_MULT, trainCostFor, ALLIANCE_FOUND_NIENS, allianceAtWarToday, allianceXpToNext, applyAllianceXp, warWindow, GRID } from "./constants";
import { isFieldDeployTile } from "./iso";

describe("economia pura", () => {
  it("recolha de mina usa timestamp, não tick", () => {
    const save = defaultSave("Teste");
    const mine = save.buildings.find((b) => b.type === "mine");
    assert.ok(mine);
    mine.lastCollect = Date.now() - 60 * 60 * 1000;
    mine.level = 1;
    const amt = storedAmount(mine);
    assert.ok(amt > 0);
    const r = collectBuilding(save, mine.id);
    assert.equal(r.save.gold, save.gold + amt);
    assert.equal(r.ledger[0]?.amount, amt);
    assert.throws(() => collectBuilding(r.save, mine.id), GameError);
  });

  it("não deixa comprar Nien sem libras", () => {
    const save = defaultSave("Teste");
    save.gold = NIEN_COST_GOLD - 1;
    assert.throws(() => buyNienSim(save), GameError);
    save.gold = NIEN_COST_GOLD;
    const r = buyNienSim(save);
    assert.equal(r.save.niens, 1);
    assert.equal(r.save.gold, 0);
  });

  it("venda de Nien não inventa gemas", () => {
    const save = defaultSave("Teste");
    save.niens = 0;
    assert.throws(() => sellNienSim(save), GameError);
    save.niens = 2;
    const r = sellNienSim(save);
    assert.equal(r.save.niens, 1);
    assert.equal(r.save.gold, save.gold + NIEN_SELL_GOLD);
  });

  it("transferência recusa saldo insuficiente e cap diário de Niens", () => {
    const save = defaultSave("Teste");
    save.gold = 10;
    assert.throws(() => spendForTransfer(save, 11, "gold"), GameError);
    save.niens = 40;
    save.countyLevel = 1;
    assert.throws(() => spendForTransfer(save, 6, "niens"), GameError);
    const r = spendForTransfer(save, 5, "niens");
    assert.equal(r.save.niens, 35);
    assert.equal(r.save.niensSentToday, 5);
  });

  it("upgrade recusa se faltar ouro", () => {
    const save = defaultSave("Teste");
    const mine = save.buildings.find((b) => b.type === "mine")!;
    save.gold = 0;
    assert.throws(() => upgradeBuilding(save, mine.id), GameError);
  });

  it("saque de raid é tetado pelas faixas, nunca pelo cliente", () => {
    assert.equal(lootForStars(0), 0);
    assert.equal(lootForStars(1), 2700);
    assert.equal(lootForStars(2), 5400);
    assert.equal(lootForStars(3), 8400);
    assert.equal(lootForStars(99), LOOT_CAP);
    assert.equal(lootForStars(-4), 0);
    assert.equal(lootForStars(3, 2), lootCapForCounty(2));
    assert.ok(lootCapForCounty(2) > LOOT_CAP);
    assert.equal(lootCapForCounty(1), LOOT_CAP);
  });

  it("finish raid ignora ouro pedido acima do teto das estrelas", () => {
    const save = defaultSave("Teste");
    save.gold = 100;
    const started = { ...save.army };
    const r = applyRaidFinish(save, {
      stars: 1,
      survivors: started,
      startedArmy: started,
      goldTaken: 999_999,
      defenderNick: "Alvo",
    });
    assert.equal(r.save.gold, 100 + lootForStars(1));
    assert.ok(r.ledger.some((e) => e.type === "raid_loot" && e.amount === lootForStars(1)));
  });

  it("sobreviventes não podem nascer acima do que saiu", () => {
    const save = defaultSave("Teste");
    save.army = { infantry: 10, archers: 4, cavalry: 0, general: 0, generaless: 0, defender: 0 };
    const started = { infantry: 6, archers: 0, cavalry: 0, general: 0, generaless: 0, defender: 0 };
    const r = applyRaidFinish(save, {
      stars: 0,
      survivors: { infantry: 99, archers: 99, cavalry: 0, general: 1, generaless: 1, defender: 4 },
      startedArmy: started,
      goldTaken: 0,
      defenderNick: "Alvo",
    });
    assert.equal(r.save.army.infantry, 10 - 6 + 6);
    assert.equal(r.save.army.archers, 4);
    assert.equal(r.save.army.general, 0);
  });

  it("tropas mortas não voltam ao condado", () => {
    const save = defaultSave("Teste");
    save.army = { infantry: 10, archers: 4, cavalry: 2, general: 0, generaless: 0, defender: 0 };
    const started = { ...save.army };
    const r = applyRaidFinish(save, {
      stars: 1,
      survivors: { infantry: 3, archers: 1, cavalry: 0, general: 0, generaless: 0, defender: 0 },
      startedArmy: started,
      goldTaken: 0,
      defenderNick: "Alvo",
    });
    assert.equal(r.save.army.infantry, 3);
    assert.equal(r.save.army.archers, 1);
    assert.equal(r.save.army.cavalry, 0);
  });

  it("custo de recruta dobra a cada nível", () => {
    assert.equal(trainCostFor("cavalry", 1).amount, 150);
    assert.equal(trainCostFor("cavalry", 3).amount, 600);
    assert.equal(trainCostFor("infantry", 3).amount, 200);
    assert.equal(trainCostFor("archers", 3).amount, 120);
    assert.equal(trainCostFor("general", 3).amount, 4000);
    assert.equal(trainCostFor("generaless", 3).amount, 3600);
    const save = defaultSave("Teste");
    save.buildings.push({ id: "b-bar", type: "barracks", gx: 8, gy: 8, level: 1 });
    save.troopLevels.cavalry = 3;
    save.bread = 600;
    const r = trainTroop(save, "cavalry", 1);
    assert.equal(r.save.bread, 0);
  });

  it("fundar aliança custa 5 Niens", () => {
    const save = defaultSave("Teste");
    save.niens = 4;
    assert.throws(() => foundAllianceSim(save, "Lobos"), GameError);
    save.niens = ALLIANCE_FOUND_NIENS;
    const r = foundAllianceSim(save, "Lobos", false);
    assert.equal(r.save.niens, 0);
    assert.equal(r.save.alliance?.openJoin, false);
    assert.equal(r.save.alliance?.members.length, 1);
  });

  it("aliança em guerra não pode ser chamada para outra", () => {
    const win = warWindow();
    assert.equal(allianceAtWarToday({ warDay: win.key, foeId: "AL-X", sittingOut: false, resolved: false }), true);
    assert.equal(allianceAtWarToday({ week: win.key, foeId: "AL-X", sittingOut: false, resolved: false }), true);
    assert.equal(allianceAtWarToday({ warDay: win.key, foeId: null, sittingOut: true, resolved: false }), false);
    assert.equal(allianceAtWarToday({ warDay: win.key, foeId: "AL-X", sittingOut: false, resolved: true }), false);
    assert.equal(allianceAtWarToday({ warDay: "1999-01-01", foeId: "AL-X", sittingOut: false, resolved: false }), false);
  });

  it("xp de aliança: nv.2 pede 2000 e depois dobra", () => {
    assert.equal(allianceXpToNext(1), 2000);
    assert.equal(allianceXpToNext(2), 4000);
    assert.equal(allianceXpToNext(3), 8000);
    assert.equal(allianceXpToNext(6), 64000);
    const g = applyAllianceXp(1, 0, 2000);
    assert.equal(g.level, 2);
    assert.equal(g.xp, 0);
  });

  it("débito recusa saldo negativo", () => {
    const save = defaultSave("Teste");
    save.gold = 50;
    assert.throws(() => creditResource(save, -51, "gold", "market_buy", "x"), GameError);
    const r = creditResource(save, -50, "gold", "market_buy", "x");
    assert.equal(r.save.gold, 0);
  });

  it("treino recusa sem quartel", () => {
    const save = defaultSave("Teste");
    save.buildings = save.buildings.filter((b) => b.type !== "barracks");
    assert.throws(() => trainTroop(save, "infantry"), GameError);
  });

  it("construções sem muro não levam dir indefinido para a nuvem", () => {
    const save = toSave(defaultSave("Teste"));
    const castle = save.buildings.find((b) => b.type === "castle");
    const mine = save.buildings.find((b) => b.type === "mine");
    const wall = save.buildings.find((b) => b.type === "wall");
    assert.ok(castle);
    assert.ok(mine);
    assert.ok(wall);
    assert.equal(Object.prototype.hasOwnProperty.call(castle, "dir"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(mine, "dir"), false);
    assert.equal(wall.dir, "h");
    const round = JSON.parse(JSON.stringify(save)) as typeof save;
    assert.doesNotMatch(JSON.stringify(round.buildings[0]), /undefined/);
  });

  it("avançar o condado sobe o castelo e não o trata como construção normal", () => {
    const save = defaultSave("Teste");
    const castle = save.buildings.find((b) => b.type === "castle")!;
    assert.throws(() => upgradeBuilding(save, castle.id), GameError);
    save.gold = 30_000;
    const r = upgradeCountySim(save);
    assert.equal(r.save.countyLevel, 2);
    assert.equal(r.save.buildings.find((b) => b.type === "castle")?.level, 2);
    r.save.gold = 60_000;
    r.save.buildings = r.save.buildings.map((b) =>
      b.type === "castle" || b.type === "wall" ? b : { ...b, level: 2 },
    );
    const r2 = upgradeCountySim(r.save);
    assert.equal(r2.save.countyLevel, 3);
    assert.equal(r2.save.buildings.find((b) => b.type === "castle")?.level, 3);
  });

  it("treino recusa segundo general", () => {
    const save = defaultSave("Teste");
    save.buildings.push({ id: "b-bar", type: "barracks", gx: 8, gy: 8, level: 1 });
    save.army.general = 1;
    save.bread = 5000;
    assert.throws(() => trainTroop(save, "general"), GameError);
  });

  it("recruta em lote, mostra custo e junta a fila", () => {
    const save = defaultSave("Teste");
    save.buildings.push({ id: "b-bar", type: "barracks", gx: 8, gy: 8, level: 1 });
    save.bread = 5000;
    const r = trainTroop(save, "infantry", 10);
    assert.equal(r.save.training.length, 1);
    assert.equal(r.save.training[0]!.count, 10);
    assert.equal(r.save.bread, 5000 - 50 * 10);
    const r2 = trainTroop(r.save, "infantry", 5);
    assert.equal(r2.save.training.length, 1);
    assert.equal(r2.save.training[0]!.count, 15);
    assert.equal(r2.save.bread, 5000 - 50 * 15);
  });

  it("settle conclui várias tropas da mesma fila", () => {
    const save = defaultSave("Teste");
    save.training = [{ id: "t1", type: "infantry", remaining: 1000, count: 3 }];
    const now = Date.now();
    save.lastTick = now - 7000;
    const r = settle(save, now);
    assert.equal(r.save.army.infantry, save.army.infantry + 2);
    assert.equal(r.save.training.length, 1);
    assert.equal(r.save.training[0]!.count, 1);
  });

  it("Nien custa 550 mil Libras e vende por 165 mil", () => {
    assert.equal(NIEN_COST_GOLD, 550_000);
    assert.equal(NIEN_SELL_GOLD, 165_000);
  });

  it("recolhe todas as recompensas desbloqueadas do passe", () => {
    const save = defaultSave("Teste");
    save.pass.purchased = true;
    save.pass.stars = 18;
    const r = claimPassAllSim(save);
    assert.deepEqual([...r.save.pass.claimed].sort((a, b) => a - b), [1, 2, 3]);
    assert.deepEqual([...(r.save.pass.claimedFree ?? [])].sort((a, b) => a - b), [1, 2, 3]);
    assert.ok(r.save.gold > save.gold);
    assert.throws(() => claimPassAllSim(r.save), GameError);
  });

  it("trilha grátis do passe 50 não dá Nien", () => {
    const r = freePassReward(50);
    assert.equal(r.niens, 0);
    assert.equal(r.troopCards, 3);
    assert.equal(r.gold, 100_000);
    assert.equal(r.bread, 100_000);
  });

  it("passe sobe 1 Nien por mês a partir de setembro 2026", () => {
    assert.equal(passCostNiens("2026-09"), 15);
    assert.equal(passCostNiens("2026-10"), 16);
    assert.equal(passCostNiens("2026-11"), 17);
    assert.equal(passCostWithDiscount("2026-09", true), Math.ceil(15 * 0.55));
  });

  it("boost de passe só aumenta mina e fazenda", () => {
    assert.equal(productionPerSec(1, true), productionPerSec(1) * PASS_BOOST_MULT);
  });

  it("settle da nuvem não paga cofre de guerra", () => {
    const save = defaultSave("Teste");
    save.alliance = {
      id: "AL-X",
      name: "X",
      members: [{ id: save.player.id, nick: save.player.nick }],
      minLevel: 3,
      level: 1,
      xp: 0,
      leaderId: save.player.id,
      slots: 30,
      openJoin: true,
      joinRequests: [],
    };
    save.war = {
      week: "2000-01-01",
      foeId: "AL-Y",
      foeName: "Y",
      chest: 50_000_000,
      ourStars: 9,
      theirStars: 1,
      attacks: {},
      sittingOut: false,
      resolved: false,
      participants: [save.player.id],
    };
    save.lastTick = Date.now();
    const r = settle(save, Date.now());
    assert.equal(r.save.gold, save.gold);
    assert.equal(r.save.war?.resolved, false);
  });

  it("duelo preso de guerra expira e o exército vazio cai no fallback", () => {
    const now = 1_000_000;
    assert.equal(resolveDuelStatus("pending", { until: now - 1, now }), "expired");
    assert.equal(resolveDuelStatus("pending", { until: now + 10_000, now }), "pending");
    assert.equal(resolveDuelStatus("prep", { until: now - 1, now }), "expired");
    assert.equal(resolveDuelStatus("fight", { fightEndsAt: now + 5_000, now }), "fight");
    assert.equal(resolveDuelStatus("fight", { fightEndsAt: now - 1, now }), "expired");
    assert.equal(resolveDuelStatus("prep", { now }), "expired");
    const fallback = { ...EMPTY_ARMY, infantry: 8, archers: 2 };
    assert.deepEqual(normalizeArmy({}, fallback), fallback);
    assert.deepEqual(normalizeArmy(undefined, fallback), fallback);
    assert.equal(normalizeArmy({ infantry: 0, archers: 0, cavalry: 0, general: 0, generaless: 0, defender: 0 }).infantry, 0);
    assert.equal(pickDeployType(fallback), "infantry");
    assert.equal(isFieldDeployTile(1, 20, "atk"), true);
    assert.equal(isFieldDeployTile(GRID - 2, 20, "atk"), false);
    assert.equal(isFieldDeployTile(GRID - 2, 20, "def"), true);
    assert.equal(isFieldDeployTile(1, 20, "def"), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSave, toSave } from "./save";
import {
  GameError,
  applyRaidFinish,
  buyNienSim,
  collectBuilding,
  creditResource,
  lootForStars,
  sellNienSim,
  spendForTransfer,
  storedAmount,
  trainTroop,
  upgradeBuilding,
  upgradeCountySim,
} from "./sim";
import { NIEN_COST_GOLD, NIEN_SELL_GOLD, LOOT_CAP } from "./constants";

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
});

import { describe, expect, it } from "vitest";
import {
  validateConfig,
  validateGameData,
  validateItems,
  validateOrigins,
  validateRealms,
  validateSchedules,
  validateSpiritRoots,
  validateText,
} from "../src/data/validate";
import { gameData } from "../src/data/load";

describe("資料檢查：錯誤訊息指出哪一筆的哪個欄位", () => {
  it("config", () => {
    expect(() => validateConfig({ msPerMonth: -1 })).toThrow("msPerMonth");
    expect(() => validateConfig({ ...gameData.config, speeds: [] })).toThrow("speeds");
    expect(() => validateConfig({ ...gameData.config, attributeMax: 0 })).toThrow("attributeMax");
  });

  it("realms", () => {
    const r = gameData.realms[1];
    expect(() => validateRealms([r, { ...r, id: "x", lifespan: 0 }])).toThrow("第 2 筆（x）：欄位 lifespan");
    expect(() => validateRealms([r, { ...r }])).toThrow("重複");
    expect(() => validateRealms([{ ...r, breakthrough: "later" }])).toThrow("breakthrough");
    expect(() => validateRealms([{ ...r, need: { base: 1 } }])).toThrow("need");
  });

  it("spiritRoots", () => {
    expect(() => validateSpiritRoots([{ id: "a", name: "甲", mult: 1, weight: 0 }])).toThrow("第 1 筆（a）：欄位 weight");
  });

  it("origins", () => {
    const o = gameData.origins[0];
    expect(() => validateOrigins([{ ...o, attributes: { luck: 1 } }])).toThrow("attributes.luck");
    expect(() => validateOrigins([{ ...o, items: { juqi_dan: -1 } }])).toThrow("juqi_dan");
  });

  it("text", () => {
    const t = gameData.text;
    expect(() => validateText({ ...t, log: { ...t.log, stageUp: [] } })).toThrow("stageUp");
    expect(() => validateText({ ...t, log: { ...t.log, buy: [] } })).toThrow("buy");
    expect(() => validateText({ log: t.log })).toThrow("cleared");
  });

  it("schedules", () => {
    const s = gameData.schedules[1];
    expect(() => validateSchedules([{ ...s, stones: { chance: 2, min: 1, max: 3 } }])).toThrow("chance");
    expect(() => validateSchedules([{ ...s, stones: { chance: 1, min: 3, max: 1 } }])).toThrow("max");
    expect(() => validateSchedules([{ ...s, deathChance: -1 }])).toThrow("deathChance");
    expect(() => validateSchedules([{ ...s, finds: [{ itemId: "a", chance: 5 }] }])).toThrow("finds[0]");
  });

  it("items", () => {
    const i = gameData.items[0];
    expect(() => validateItems([{ ...i, price: 0 }])).toThrow("第 1 筆（juqi_dan）：欄位 price");
    expect(() => validateItems([{ ...i, effect: { kind: "boom" } }])).toThrow("kind");
    expect(() => validateItems([{ ...i, effect: { kind: "lifespan", years: 10 } }])).toThrow("maxPerLife");
  });

  it("跨檔案檢查：引用不存在的物品或境界", () => {
    const bad = (patch: Partial<typeof gameData>) => () => validateGameData({ ...gameData, ...patch });
    expect(bad({ schedules: [{ ...gameData.schedules[1], finds: [{ itemId: "ghost", chance: 0.1 }] }] })).toThrow(
      "ghost",
    );
    expect(bad({ origins: [{ ...gameData.origins[0], items: { ghost: 1 } }] })).toThrow("ghost");
    const realms = gameData.realms.map((r, i) =>
      i === 1 ? { ...r, breakthroughRule: { ...r.breakthroughRule!, pillId: "ghost" } } : r,
    );
    expect(bad({ realms })).toThrow("ghost");
    const noRule = gameData.realms.map((r, i) => (i === 1 ? { ...r, breakthroughRule: undefined } : r));
    expect(bad({ realms: noRule })).toThrow("breakthroughRule");
    const text = { ...gameData.text, log: { ...gameData.text.log, breakthroughSuccess: {} } };
    expect(bad({ text })).toThrow("breakthroughSuccess");
  });

  it("實際資料檔皆通過檢查", () => {
    expect(gameData.realms.length).toBeGreaterThan(0);
    expect(gameData.origins.map((o) => o.id)).toEqual(["farmer", "merchant", "noble", "orphan"]);
  });
});

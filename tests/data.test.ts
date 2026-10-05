import { describe, expect, it } from "vitest";
import {
  validateConfig,
  validateOrigins,
  validateRealms,
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
    expect(() => validateText({ log: { stageUp: [], realmUp: {}, bottleneck: "a", death: "b" } })).toThrow("stageUp");
  });

  it("實際資料檔皆通過檢查", () => {
    expect(gameData.realms.length).toBeGreaterThan(0);
    expect(gameData.origins.map((o) => o.id)).toEqual(["farmer", "merchant", "noble", "orphan"]);
  });
});

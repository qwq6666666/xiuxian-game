import { describe, expect, it } from "vitest";
import { createInitialState, startLife } from "../src/core/life";
import { deserialize, serialize } from "../src/core/save";
import { SAVE_VERSION } from "../src/core/state";
import { tick } from "../src/core/tick";

describe("save", () => {
  it("序列化後再讀取結果相同（含日誌）", () => {
    const s = tick(startLife(createInitialState(99)), 600);
    expect(s.log.length).toBeGreaterThan(0);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("格式錯誤時指出欄位", () => {
    const good = JSON.parse(serialize(createInitialState(1)));
    expect(() => deserialize("{")).toThrow("JSON");
    expect(() => deserialize(JSON.stringify({ ...good, ageMonths: "x" }))).toThrow("ageMonths");
    expect(() => deserialize(JSON.stringify({ ...good, phase: "zzz" }))).toThrow("phase");
    expect(() => deserialize(JSON.stringify({ ...good, realmId: "nope" }))).toThrow("realmId");
    expect(() => deserialize(JSON.stringify({ ...good, stage: 99 }))).toThrow("stage");
    expect(() => deserialize(JSON.stringify({ ...good, attributes: { ...good.attributes, bone: "a" } }))).toThrow(
      "attributes.bone",
    );
    expect(() => deserialize(JSON.stringify({ ...good, log: [{ month: 1, kind: "x", realmId: "mortal", stage: 0 }] }))).toThrow(
      "log[0].kind",
    );
  });

  it("拒絕比遊戲新的版本", () => {
    expect(() => deserialize(JSON.stringify({ version: SAVE_VERSION + 1 }))).toThrow("版本");
  });

  it("新欄位錯誤時指出欄位", () => {
    const good = JSON.parse(serialize(createInitialState(1)));
    expect(() => deserialize(JSON.stringify({ ...good, schedule: "nope" }))).toThrow("schedule");
    expect(() => deserialize(JSON.stringify({ ...good, lifespanBonus: -1 }))).toThrow("lifespanBonus");
    expect(() => deserialize(JSON.stringify({ ...good, itemsUsed: { yanshou_dan: "x" } }))).toThrow(
      "itemsUsed.yanshou_dan",
    );
    expect(() => deserialize(JSON.stringify({ ...good, breakthroughs: 1.5 }))).toThrow("breakthroughs");
  });

  it("日誌的物品欄位會保留", () => {
    const s = {
      ...startLife(createInitialState(2)),
      log: [{ month: 130, kind: "buy" as const, realmId: "mortal", stage: 0, itemId: "juqi_dan" }],
    };
    expect(deserialize(serialize(s)).log[0].itemId).toBe("juqi_dan");
  });

  it("通關狀態可存可讀", () => {
    const s = { ...startLife(createInitialState(2)), phase: "cleared" as const };
    expect(deserialize(serialize(s)).phase).toBe("cleared");
  });

  it("v1 存檔遷移：回到擲骰階段並保留速度", () => {
    const v1 = JSON.stringify({ version: 1, rngSeed: 195033993, ageMonths: 161, speed: 4 });
    const s = deserialize(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.phase).toBe("rolling");
    expect(s.speed).toBe(4);
    expect(s.ageMonths).toBe(120);
  });

  it("v2 存檔遷移：補上安排、丹藥紀錄、突破次數，其餘原樣保留", () => {
    const current = tick(startLife(createInitialState(8)), 300);
    const { schedule, itemsUsed, lifespanBonus, breakthroughs, ...rest } = current;
    void schedule, itemsUsed, lifespanBonus, breakthroughs;
    const v2 = JSON.stringify({ ...rest, version: 2 });
    const s = deserialize(v2);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.schedule).toBe("retreat");
    expect(s.itemsUsed).toEqual({});
    expect(s.lifespanBonus).toBe(0);
    expect(s.breakthroughs).toBe(0);
    expect(s).toEqual(current);
  });
});

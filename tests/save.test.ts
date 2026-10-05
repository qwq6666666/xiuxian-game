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

  it("v1 存檔遷移成 v2：回到擲骰階段並保留速度", () => {
    const v1 = JSON.stringify({ version: 1, rngSeed: 195033993, ageMonths: 161, speed: 4 });
    const s = deserialize(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.phase).toBe("rolling");
    expect(s.speed).toBe(4);
    expect(s.ageMonths).toBe(120);
  });
});

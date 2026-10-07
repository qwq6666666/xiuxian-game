import { describe, expect, it } from "vitest";
import { createInitialState, startLife } from "../src/core/life";
import { deserialize, importSave, serialize } from "../src/core/save";
import { gameData } from "../src/data/load";
import { SAVE_VERSION } from "../src/core/state";
import { tick } from "../src/core/tick";

describe("save", () => {
  it("v31 的舊檔補上空的事件冷卻紀錄（M61）", () => {
    const s = tick({ ...startLife(createInitialState(99)), autoChoice: true }, 120);
    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    old.version = 31;
    delete old.eventLastMonth;
    expect(deserialize(JSON.stringify(old)).eventLastMonth).toEqual({});
    expect(Object.keys(s.eventLastMonth).length).toBeGreaterThan(0);
  });

  it("序列化後再讀取結果相同（含日誌）", () => {
    // 開啟自動抉擇，tick 才不會停在等待抉擇
    const s = tick({ ...startLife(createInitialState(99)), autoChoice: true }, 600);
    expect(s.log.length).toBeGreaterThan(0);
    expect(s.log.some((e) => e.kind === "event")).toBe(true);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("閉關見聞日誌可存讀，缺欄位或原因不合法時指出欄位", () => {
    const base = createInitialState(1);
    const entry = { month: 200, kind: "retreat", realmId: "mortal", stage: 0, retreatMonths: 60, stop: "elapsed" };
    const text = serialize({ ...base, log: [entry as never] });
    expect(deserialize(text).log[0]).toMatchObject({ retreatMonths: 60, stop: "elapsed" });
    const good = JSON.parse(serialize(base));
    const withLog = (e: object) => JSON.stringify({ ...good, log: [e] });
    expect(() => deserialize(withLog({ ...entry, stop: "zzz" }))).toThrow("log[0].stop");
    expect(() => deserialize(withLog({ ...entry, retreatMonths: 0 }))).toThrow("log[0].retreatMonths");
    expect(() => deserialize(withLog({ month: 1, kind: "retreat", realmId: "mortal", stage: 0 }))).toThrow("log[0]");
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
    expect(() => deserialize(JSON.stringify({ ...good, lifespanBonus: 1.5 }))).toThrow("lifespanBonus");
    // 事件可能減少壽元上限，所以負數是合法的
    expect(deserialize(JSON.stringify({ ...good, lifespanBonus: -5 })).lifespanBonus).toBe(-5);
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

  it("v2 存檔遷移：補上安排、丹藥紀錄、突破次數與事件欄位，其餘原樣保留", () => {
    const current = tick({ ...startLife(createInitialState(8)), autoChoice: true }, 300);
    const added = [
      "schedule", "itemsUsed", "lifespanBonus", "breakthroughs",
      "flags", "eventCounts", "eventClock", "eventThreshold", "pendingEvent", "autoChoice",
    ] as const;
    const rest: Record<string, unknown> = { ...current, version: 2 };
    for (const k of added) delete rest[k];
    // v2 沒有事件日誌，舊日誌只含升級類型
    rest.log = current.log.filter((e) => e.kind !== "event");
    const s = deserialize(JSON.stringify(rest));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.schedule).toBe("retreat");
    expect(s.itemsUsed).toEqual({});
    expect(s.lifespanBonus).toBe(0);
    expect(s.breakthroughs).toBe(0);
    expect(s.flags).toEqual([]);
    expect(s.eventCounts).toEqual({});
    expect(s.pendingEvent).toBeNull();
    expect(s.autoChoice).toBe(false);
    expect(s.eventThreshold).toBe(Math.round((gameData.config.eventIntervalMin + gameData.config.eventIntervalMax) / 2));
    expect(s.ageMonths).toBe(current.ageMonths);
    expect(s.cultivation).toBe(current.cultivation);
    expect(s.attributes).toEqual(current.attributes);
  });

  it("v3 存檔遷移：事件計時用區間中點，不動亂數種子", () => {
    const current = startLife(createInitialState(4));
    const rest: Record<string, unknown> = { ...current, version: 3 };
    for (const k of ["flags", "eventCounts", "eventClock", "eventThreshold", "pendingEvent", "autoChoice"]) {
      delete rest[k];
    }
    const s = deserialize(JSON.stringify(rest));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.rngSeed).toBe(current.rngSeed);
    expect(s.eventThreshold).toBe(Math.round((gameData.config.eventIntervalMin + gameData.config.eventIntervalMax) / 2));
    expect(s.flags).toEqual([]);
  });

  it("事件欄位錯誤時指出欄位", () => {
    const good = JSON.parse(serialize(createInitialState(1)));
    expect(() => deserialize(JSON.stringify({ ...good, pendingEvent: "ghost" }))).toThrow("pendingEvent");
    expect(() => deserialize(JSON.stringify({ ...good, autoChoice: "yes" }))).toThrow("autoChoice");
    expect(() => deserialize(JSON.stringify({ ...good, flags: [1] }))).toThrow("flags");
    expect(() => deserialize(JSON.stringify({ ...good, eventCounts: { a: -1 } }))).toThrow("eventCounts.a");
    const badLog = [{ month: 1, kind: "event", realmId: "mortal", stage: 0, eventId: "ghost" }];
    expect(() => deserialize(JSON.stringify({ ...good, log: badLog }))).toThrow("log[0].eventId");
    const noId = [{ month: 1, kind: "event", realmId: "mortal", stage: 0 }];
    expect(() => deserialize(JSON.stringify({ ...good, log: noId }))).toThrow("eventId");
  });

  it("v10 存檔遷移：補上丹毒計數", () => {
    const cur: Record<string, unknown> = { ...JSON.parse(serialize(startLife(createInitialState(4)))), version: 10 };
    delete cur.pillStage;
    delete cur.pillCount;
    const s = deserialize(JSON.stringify(cur));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.pillStage).toBe("");
    expect(s.pillCount).toBe(0);
  });

  it("匯入：容忍頭尾空白與 BOM，內容壞掉時丟出錯誤", () => {
    const s = tick({ ...startLife(createInitialState(5)), autoChoice: true }, 120);
    expect(importSave(`﻿  
${serialize(s)}
 `)).toEqual(s);
    expect(() => importSave("不是存檔")).toThrow("JSON");
    expect(() => importSave(JSON.stringify({ ...JSON.parse(serialize(s)), phase: "zzz" }))).toThrow("phase");
  });
});

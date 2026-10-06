import { describe, expect, it } from "vitest";
import {
  validateConfig,
  validateEventFiles,
  validateEvents,
  validateGameData,
  validateItems,
  validateOrigins,
  validateRealms,
  validateSchedules,
  validateSpiritRoots,
  validateTalents,
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
    expect(() => validateText({ log: t.log })).toThrow("review");
    expect(() => validateText({ ...t, review: { ...t.review, cleared: [{ text: "a", ifItem: "juqi_dan" }] } })).toThrow(
      "review.cleared：至少要有一句沒有任何條件",
    );
    expect(() => validateText({ ...t, review: { ...t.review, event: [] } })).toThrow("review.event");
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
    expect(() => validateItems([{ ...i, effect: { kind: "cultivationFraction", value: 0.25 } }])).toThrow("falloff");
    expect(() => validateItems([{ ...i, effect: { kind: "cultivationFraction", value: 0.25, falloff: [1, 0] } }])).toThrow("falloff");
    expect(() => validateItems([{ ...i, effect: { kind: "lifespan", years: 10 } }])).toThrow("maxPerLife");
  });

  it("talents", () => {
    const t = gameData.talents.find((x) => x.id === "suhui")!;
    expect(() => validateTalents([{ ...t, effect: "luck" }])).toThrow("第 1 筆（suhui）：欄位 effect");
    expect(() => validateTalents([{ ...t, maxLevel: 0 }])).toThrow("maxLevel");
    expect(() => validateTalents([{ ...t, perLevel: 0 }])).toThrow("perLevel");
    expect(() => validateTalents([{ ...t, cost: { base: 0, growth: 1.5 } }])).toThrow("cost");
    expect(() => validateTalents([t, { ...t }])).toThrow("重複");
  });

  it("道韻與一生回顧的資料欄位", () => {
    const r = gameData.realms[1];
    expect(() => validateRealms([{ ...r, daoYun: -1 }])).toThrow("daoYun");
    expect(() => validateEvents([{ ...gameData.events[0], highlight: -1 }])).toThrow("highlight");
    expect(() => validateConfig({ ...gameData.config, daoYunFirstTimeMult: 0.5 })).toThrow("daoYunFirstTimeMult");
    const bad = { ...gameData, text: { ...gameData.text, review: { ...gameData.text.review, lifespan: [{ text: "a", ifItem: "ghost" }, { text: "b" }] } } };
    expect(() => validateGameData(bad)).toThrow("ghost");
  });

  it("events：指出哪一筆事件的哪個欄位", () => {
    const choice = gameData.events[0];
    const anec = gameData.events.find((e) => e.type === "anecdote")!;
    const bad = (e: unknown) => () => validateEvents([e]);
    expect(bad({ ...choice, type: "story" })).toThrow("第 1 筆（cave_001）：欄位 type");
    expect(bad({ ...choice, tone: "great" })).toThrow("tone");
    expect(bad({ ...choice, weight: 0 })).toThrow("weight");
    expect(bad({ ...choice, maxPerLife: 0 })).toThrow("maxPerLife");
    expect(bad({ ...choice, conditions: { realmMin: 5 } })).toThrow("realmMin");
    expect(bad({ ...choice, conditions: { flagz: ["a"] } })).toThrow("flagz");
    expect(bad({ ...anec, choices: choice.choices })).toThrow("見聞不能有選項");
    expect(bad({ ...choice, effects: {} })).toThrow("抉擇的效果要寫在各選項的結果裡");
    expect(bad({ ...choice, choices: [choice.choices![0]] })).toThrow("2–4 個選項");
    expect(bad({ ...anec, effects: { gold: 5 } })).toThrow("gold");
    expect(bad({ ...anec, effects: { attributes: { luck: 1 } } })).toThrow("attributes.luck");
    expect(bad({ ...anec, effects: { cultivation: "x" } })).toThrow("cultivation");
  });

  it("events：選項與結果的錯誤指出是第幾個", () => {
    const e = gameData.events[0];
    const withChoices = (choices: unknown) => () => validateEvents([{ ...e, choices }]);
    const c = e.choices!;
    expect(withChoices([{ ...c[0], text: "" }, c[1]])).toThrow("選項 1：欄位 text");
    expect(withChoices([c[0], { ...c[1], outcomes: [{ weight: 0, text: "a", effects: {} }] }])).toThrow("選項 2 結果 1：欄位 weight");
    expect(withChoices([c[0], { ...c[1], outcomes: [] }])).toThrow("outcomes");
    expect(withChoices([c[0], { ...c[1], requires: { spiritStones: -1 } }])).toThrow("spiritStones");
  });

  it("events：requires 的屬性鍵與殘卷 id 要合法", () => {
    const e = gameData.events[0];
    const c = e.choices!;
    const withReq = (requires: unknown) => () => validateEvents([{ ...e, choices: [c[0], { ...c[1], requires }] }]);
    expect(withReq({ attributes: { luck: 3 } })).toThrow("luck");
    expect(withReq({ fragments: [] })).toThrow("fragments");
    expect(withReq({ attributes: { bone: 5 }, fragments: ["f01"] })).not.toThrow();
    const gated = { ...c[1], requires: { fragments: ["ghost"] } };
    expect(() => validateGameData({ ...gameData, events: [{ ...e, choices: [c[0], gated] }] })).toThrow("ghost");
  });

  it("events：每個抉擇至少要有一個沒有前提的選項", () => {
    const e = gameData.events.find((x) => x.id === "senior_001")!;
    const locked = e.choices!.map((c) => ({ ...c, requires: { spiritStones: 5 } }));
    expect(() => validateEvents([{ ...e, choices: locked }])).toThrow("沒有前提");
  });

  it("events：權重可全由屬性加成提供", () => {
    const e = gameData.events.find((x) => x.id === "demon_001")!;
    const outcome = { weight: 0, text: "a", effects: {}, weightPerAttribute: { mind: 5 } };
    const ok = { ...e, choices: [{ text: "x", outcomes: [outcome] }, e.choices![1]] };
    expect(validateEvents([ok])[0].id).toBe("demon_001");
  });

  it("跨檔案檢查：事件的旗標、物品、境界、安排", () => {
    // 連鎖的前段（會設定旗標）一起帶上，避免先觸發「旗標沒人設定」的錯誤
    const cave1 = gameData.events.find((e) => e.id === "cave_001")!;
    const cave2 = gameData.events.find((e) => e.id === "cave_002")!;
    const bad = (patch: Partial<typeof cave2>) => () => validateGameData({ ...gameData, events: [cave1, { ...cave2, ...patch }] });
    // 要求的旗標沒有任何結果會設定（拼字錯誤）
    expect(bad({ conditions: { flags: ["cave_001_mraked"] } })).toThrow("cave_001_mraked");
    expect(bad({ conditions: { flags: ["cave_001_marked"], realmMin: "ghost" } })).toThrow("ghost");
    expect(bad({ conditions: { flags: ["cave_001_marked"], schedules: ["ghost"] } })).toThrow("ghost");
    expect(bad({ scheduleWeights: { ghost: 2 } })).toThrow("ghost");
    const outcome = { weight: 1, text: "a", effects: { items: { ghost: 1 } } };
    expect(bad({ choices: [{ text: "a", outcomes: [outcome] }, cave2.choices![1]] })).toThrow("ghost");
    const req = { text: "a", requires: { items: { ghost: 1 } }, outcomes: [outcome] };
    expect(bad({ choices: [req, cave2.choices![1]] })).toThrow("ghost");
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

describe("階段 3 資料格式", () => {
  it("安排提示、效果 mapRef 與參考物品的錯誤訊息指出位置", async () => {
    const { validateSchedules, validateWorldEffects } = await import("../src/data/validate");
    const sched = JSON.parse(JSON.stringify(gameData.schedules));
    sched[3].worldHints[0].when = {};
    expect(() => validateSchedules(sched)).toThrow("worldHints[0]");
    const eff = JSON.parse(JSON.stringify(gameData.worldEffects));
    eff[0].mapRef = "sky";
    expect(() => validateWorldEffects(eff)).toThrow("mapRef");
    expect(() => validateConfig({ ...gameData.config, priceRefItemId: undefined })).toThrow("priceRefItemId");
  });
});

describe("事件分檔載入", () => {
  const first = gameData.events[0];
  it("擴充檔可以是空陣列，主檔不行", () => {
    expect(validateEventFiles([{ file: "events.json", raw: [first] }, { file: "events/x.json", raw: [] }])).toHaveLength(1);
    expect(() => validateEventFiles([{ file: "events.json", raw: [] }])).toThrow("非空");
  });
  it("跨檔案 id 重複時報錯", () => {
    expect(() => validateEventFiles([{ file: "events.json", raw: [first] }, { file: "events/x.json", raw: [first] }])).toThrow("重複");
  });
  it("擴充檔的格式錯誤以該檔檔名回報", () => {
    expect(() => validateEventFiles([{ file: "events.json", raw: [first] }, { file: "events/x.json", raw: [{ ...first, id: "other", type: "?" }] }])).toThrow("events/x.json");
  });
});

import { describe, expect, it } from "vitest";
import { eventAvailable, pickEvent } from "../../src/core/events";
import { createInitialState, startLife } from "../../src/core/life";
import { tick } from "../../src/core/tick";
import { gameData as data } from "../../src/data/load";
import { validateEvents, validateGameData, validateText } from "../../src/data/validate";
import { formatLogEntry } from "../../src/ui/format";
import { emptyMeta } from "../../src/core/state";
import { living } from "../helpers";

const base = data.events.find((e) => e.type === "anecdote")!;
const intro = { ...base, id: "intro_test", weight: 1, maxPerLife: 1, guaranteed: true, conditions: { ageMax: 14, livesMax: 0 } };

describe("前期體驗（M32）", () => {
  it("livesMax：只在已走完的世數不超過上限時出現", () => {
    expect(eventAvailable(living(1), intro, data)).toBe(true);
    expect(eventAvailable(living(1, { meta: { ...emptyMeta(), lives: 1 } }), intro, data)).toBe(false);
  });
  it("必出的事件先於其他事件，不耗亂數", () => {
    const withIntro = { ...data, events: [...data.events.filter((e) => !e.guaranteed), intro] };
    const s = living(5);
    const [ev, seed] = pickEvent(s, withIntro);
    expect(ev?.id).toBe("intro_test");
    expect(seed).toBe(s.rngSeed);
    // 超過年齡就不再硬出
    expect(eventAvailable(living(5, { ageMonths: 20 * 12 }), intro, withIntro)).toBe(false);
  });
  it("guaranteed 的資料檢查：必須 maxPerLife 為 1 並設 ageMax", () => {
    const raw = (patch: object) => [{ ...base, ...patch }];
    expect(() => validateEvents(raw({ guaranteed: true, maxPerLife: 2, conditions: { ageMax: 14 } }))).toThrow("maxPerLife");
    expect(() => validateEvents(raw({ guaranteed: true, maxPerLife: 1, conditions: {} }))).toThrow("ageMax");
    expect(() => validateEvents(raw({ guaranteed: "yes" }))).toThrow("guaranteed");
    expect(validateEvents(raw({ guaranteed: true, maxPerLife: 1, conditions: { ageMax: 14 } }))[0].guaranteed).toBe(true);
  });
  it("里程碑日誌句：練氣三、六、九層有專屬文字，其他層用一般升級句", () => {
    const line = (stage: number) => formatLogEntry({ month: 600, kind: "stageUp", realmId: "lianqi", stage }, data);
    expect(line(2)).toContain("入了門");
    expect(line(5)).toContain("一半");
    expect(line(8)).toContain("一口氣");
    expect(line(3)).not.toContain("入了門");
  });
  it("stageMilestone 的鍵必須是存在的境界與階段", () => {
    const text = JSON.parse(JSON.stringify(data.text));
    text.log.stageMilestone["lianqi:99"] = "x";
    expect(() => validateGameData({ ...data, text: validateText(text) })).toThrow("stageMilestone");
    text.log.stageMilestone = {};
    expect(() => validateGameData({ ...data, text: validateText(text) })).not.toThrow();
  });
  it("練氣需求放緩：九層合計明顯少於舊的 3302，且仍逐層遞增", () => {
    const lianqi = data.realms.find((r) => r.id === "lianqi")!;
    const needs = lianqi.stageNames.map((_, i) => Math.round(lianqi.need.base * lianqi.need.growth ** i));
    expect(needs.reduce((a, b) => a + b, 0)).toBeLessThan(2200);
    for (let i = 1; i < needs.length; i++) expect(needs[i]).toBeGreaterThan(needs[i - 1]);
  });
});

describe("正式的開場引路事件", () => {
  const real = data.events.find((e) => e.id === "intro_guide_001")!;
  it("只在第一世、前幾年、一定先出", () => {
    expect(real.guaranteed).toBe(true);
    expect(real.conditions).toEqual({ ageMax: 19, livesMax: 0 });
    expect(pickEvent(living(9), data)[0]?.id).toBe("intro_guide_001");
    expect(eventAvailable(living(9, { meta: { ...emptyMeta(), lives: 1 } }), real, data)).toBe(false);
  });
  it("預設閉關（事件頻率 ×0.5）下，第一世的第一個事件也一定是它", () => {
    // 事件門檻最長 48 個月、閉關每月只累計 0.5，所以最慢要 8 年才輪到第一件事；ageMax 必須蓋得住
    for (let seed = 1; seed <= 60; seed++) {
      const s = tick(startLife(createInitialState(seed, data), data), 12 * 10, data);
      expect(s.eventCounts.intro_guide_001, `seed ${seed}`).toBe(1);
    }
  });
  it("每個選項都有一個固定結果，且都是小獎勵", () => {
    expect(real.choices).toHaveLength(3);
    for (const c of real.choices!) expect(c.outcomes).toHaveLength(1);
  });
});

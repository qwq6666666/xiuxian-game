import { describe, expect, it } from "vitest";
import { advanceEvents } from "../../src/core/events";
import { monthlyGain } from "../../src/core/gain";
import { applyOffline } from "../../src/core/offline";
import { scheduleOf } from "../../src/core/progress";
import { deserialize, serialize } from "../../src/core/save";
import { canSetStance, setStance, stanceMonthsLeft, stanceMult, stepStance } from "../../src/core/character/stance";
import { tick } from "../../src/core/tick";
import { gameData } from "../../src/data/load";
import { validateStances } from "../../src/data/validate";
import { formatLogEntry } from "../../src/ui/format";
import { living, noHunt } from "../helpers";

const data = gameData;
const raw = () => JSON.parse(JSON.stringify({ rules: data.stances.rules, stances: data.stances.stances }));
const years = data.stances.rules.intervalYears;
const base = () => living(1, { realmId: "lianqi", stage: 2, cultivation: 0 });
const def = (id: string) => data.stances.stances.find((s) => s.id === id)!;

describe("年度行止資料", () => {
  it("四個行止，id 不重複；有風險的必須寫 hitText", () => {
    expect(data.stances.stances.map((s) => s.id)).toEqual(["steady", "seek", "toil", "push"]);
    const r = raw();
    delete r.stances[3].hitText;
    expect(() => validateStances(r)).toThrow("hitText");
    const r2 = raw();
    delete r2.stances[2].endText;
    expect(() => validateStances(r2)).toThrow("endText");
    r.stances[0].cultivationMult = 0;
    expect(() => validateStances(r)).toThrow("cultivationMult");
    expect(() => validateStances({ ...raw(), stances: [raw().stances[0], raw().stances[0]] })).toThrow("重複");
  });
});

describe("選行止", () => {
  it("沒選就是順其自然，倍率為 1，修為不變", () => {
    const s = base();
    expect(stanceMult(s, "cultivationMult", data)).toBe(1);
    expect(stanceMult(s, "eventRateMult", data)).toBe(1);
  });

  it("只能在沒有行止在身時選；選了月份記在 since", () => {
    const s = base();
    expect(canSetStance(s, "steady", data)).toBe(true);
    expect(canSetStance(s, "nope", data)).toBe(false);
    const picked = setStance(s, "steady", data);
    expect(picked.stance).toEqual({ id: "steady", since: s.ageMonths });
    expect(canSetStance(picked, "seek", data)).toBe(false);
    expect(setStance(picked, "seek", data)).toBe(picked);
    expect(canSetStance({ ...s, phase: "dead" }, "steady", data)).toBe(false);
    expect(stanceMonthsLeft(picked, data)).toBe(years * 12);
  });

  it("修為增量與事件計時照倍率走", () => {
    const s = base();
    const sched = scheduleOf(s, data);
    for (const st of data.stances.stances) {
      const t = setStance(s, st.id, data);
      expect(monthlyGain(t, sched, data)).toBeCloseTo(monthlyGain(s, sched, data) * st.cultivationMult, 8);
    }
    const ev = { ...s, eventClock: 0, eventThreshold: 1e9 };
    const clock = (st: typeof ev) => advanceEvents(st, st.ageMonths, noHunt()).eventClock;
    expect(clock(setStance(ev, "seek", data))).toBeCloseTo(clock(ev) * def("seek").eventRateMult, 8);
  });
});

describe("滿年結算", () => {
  it("未滿不結算；滿了清掉行止並寫日誌", () => {
    const s = setStance(base(), "steady", data);
    expect(stepStance({ ...s, ageMonths: s.ageMonths + years * 12 - 1 }, s.ageMonths + years * 12 - 1, data).stance).not.toBeNull();
    const done = stepStance({ ...s, ageMonths: s.ageMonths + years * 12 }, s.ageMonths + years * 12, data);
    expect(done.stance).toBeNull();
    expect(done.log.some((e) => e.kind === "stance")).toBe(false); // 沒有變化就不寫日誌
    const t = setStance(base(), "toil", data);
    const tDone = stepStance({ ...t, ageMonths: t.ageMonths + years * 12 }, t.ageMonths + years * 12, data);
    expect(tDone.log.at(-1)).toMatchObject({ kind: "stance", choice: 2 });
    expect(formatLogEntry(tDone.log.at(-1)!, data, "我")).toContain(def("toil").endText!);
  });

  it("經營生計：年底固定給靈石", () => {
    const s = setStance(base(), "toil", data);
    const end = s.ageMonths + years * 12;
    const done = stepStance({ ...s, ageMonths: end }, end, data);
    expect(done.spiritStones).toBe(s.spiritStones + def("toil").yearEnd!.stones!);
    expect(done.log.at(-1)!.changes).toEqual({ spiritStones: def("toil").yearEnd!.stones });
  });

  it("冒險叩關：風險由衍生種子決定，可重現、不動 rngSeed，中了損失修為並用 hitText", () => {
    const outcomes = new Set<number>();
    for (let seed = 1; seed < 60; seed++) {
      const s0 = living(seed, { realmId: "lianqi", stage: 2, cultivation: 100 });
      const s = setStance(s0, "push", data);
      const end = s.ageMonths + years * 12;
      const a = stepStance({ ...s, ageMonths: end }, end, data);
      const b = stepStance({ ...s, ageMonths: end }, end, data);
      expect(a).toEqual(b);
      expect(a.rngSeed).toBe(s.rngSeed);
      const hit = a.log.at(-1)?.kind === "stance" && a.log.at(-1)!.outcome === 1;
      outcomes.add(hit ? 1 : 0);
      if (hit) {
        const month = monthlyGain({ ...s, stance: null }, scheduleOf(s, data), data);
        expect(a.cultivation).toBeCloseTo(100 - Math.min(100, month * def("push").yearEnd!.risk!.lossMonths));
        expect(formatLogEntry(a.log.at(-1)!, data, "我")).toContain(def("push").hitText!);
      } else {
        expect(a.cultivation).toBe(100);
        expect(a.log.some((e) => e.kind === "stance")).toBe(false);
      }
    }
    expect(outcomes.size).toBe(2);
  });

  it("整合：tick 跑滿一年後自動結算；離線閉關也會滿期", () => {
    const s = setStance(living(2, { realmId: "lianqi", stage: 2, cultivation: 0, autoChoice: true }), "toil", data);
    const after = tick(s, years * 12 + 1, noHunt());
    expect(after.stance).toBeNull();
    expect(after.log.some((e) => e.kind === "stance")).toBe(true);
    const off = applyOffline(setStance(base(), "steady", data), 3 * 3_600_000, data, { minSeconds: 0, speed: 4 });
    expect(off.state.stance === null || off.summary.months < years * 12).toBe(true);
  });
});

describe("存檔", () => {
  it("往返相同；v32 舊檔補上沒選；不認識的行止會報錯", () => {
    const s = setStance(base(), "push", data);
    expect(deserialize(serialize(s)).stance).toEqual(s.stance);
    const old = JSON.parse(serialize(base())) as Record<string, unknown>;
    old.version = 32;
    delete old.stance;
    expect(deserialize(JSON.stringify(old)).stance).toBeNull();
    const bad = JSON.parse(serialize(s)) as { stance: { id: string } };
    bad.stance.id = "zzz";
    expect(() => deserialize(JSON.stringify(bad))).toThrow("stance.id");
  });
});

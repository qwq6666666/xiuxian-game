import { describe, expect, it } from "vitest";
import { chooseEvent, eventAvailable, eventOf, pickEvent } from "../src/core/events";
import { selectHighlights } from "../src/core/review";
import { lifespanMonths } from "../src/core/formulas";
import { gameData as data } from "../src/data/load";
import { validateEvents } from "../src/data/validate";
import { living } from "./helpers";

const ID = "lianqi_last_push";
const ev = eventOf(ID, data);
const lianqi = data.realms.find((r) => r.id === "lianqi")!;
// 練氣七層以上、壽元只剩 5 年、跨世沒築基過
const nearEnd = (patch = {}) =>
  living(3, { realmId: "lianqi", stage: 7, ageMonths: lifespanMonths(lianqi, 0) - 60, cultivation: 10, ...patch });

describe("最後一次叩關（強行衝關事件）", () => {
  it("條件：階段、剩餘壽元、跨世築基紀錄、瓶頸", () => {
    expect(eventAvailable(nearEnd(), ev, data)).toBe(true);
    expect(eventAvailable(nearEnd({ stage: 5 }), ev, data)).toBe(false);
    expect(eventAvailable(nearEnd({ ageMonths: lifespanMonths(lianqi, 0) - 130 }), ev, data)).toBe(false);
    const s = nearEnd();
    expect(eventAvailable({ ...s, meta: { ...s.meta, reached: ["zhuji:0"] } }, ev, data)).toBe(false);
    expect(eventAvailable(nearEnd({ realmId: "zhuji", stage: 0 }), ev, data)).toBe(false);
    // 延壽會把「剩不到十年」往後推
    expect(eventAvailable(nearEnd({ lifespanBonus: 20 }), ev, data)).toBe(false);
    // 卡在瓶頸時已有突破鈕，不出現
    expect(eventAvailable(nearEnd({ stage: 8, cultivation: 1e9 }), ev, data)).toBe(false);
  });

  it("必出：符合條件時抽事件一定先出它", () => {
    expect(pickEvent(nearEnd(), data)[0]?.id).toBe(ID);
  });

  it("強行衝關成功就築基，失敗扣修為但留在練氣；放下什麼都不變", () => {
    const outs = ev.choices![0].outcomes;
    const win = { ...ev, choices: [{ ...ev.choices![0], outcomes: [{ ...outs[0], weight: 1 }, { ...outs[1], weight: 0 }] }, ev.choices![1]] };
    const lose = { ...ev, choices: [{ ...ev.choices![0], outcomes: [{ ...outs[0], weight: 0 }, { ...outs[1], weight: 1 }] }, ev.choices![1]] };
    const withEv = (e: typeof ev) => ({ ...data, events: data.events.map((x) => (x.id === ID ? e : x)) });
    const pending = nearEnd({ pendingEvent: ID, cultivation: 500 });

    const w = chooseEvent(pending, 0, withEv(win));
    expect(w.realmId).toBe("zhuji");
    expect(w.stage).toBe(0);
    expect(w.phase).toBe("living");
    expect(w.ageMonths).toBe(pending.ageMonths);

    const l = chooseEvent(pending, 0, withEv(lose));
    expect(l.realmId).toBe("lianqi");
    expect(l.cultivation).toBeLessThan(500);
    expect(l.phase).toBe("living");

    const calm = chooseEvent(pending, 1, data);
    expect(calm.realmId).toBe("lianqi");
    expect(calm.cultivation).toBe(500);
  });

  it("成功率放在資料裡，且在一生回顧的「此生所記」排第一", () => {
    const outs = ev.choices![0].outcomes;
    const rate = outs[0].weight / (outs[0].weight + outs[1].weight);
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.3);
    const pending = nearEnd({ pendingEvent: ID });
    const done = chooseEvent(pending, 1, data);
    const hl = selectHighlights(done.log, data, 1);
    expect(hl[0]?.eventId).toBe(ID);
  });

  it("格式錯誤指出欄位", () => {
    const bad = (patch: object) => JSON.parse(JSON.stringify({ ...ev, ...patch }));
    expect(() => validateEvents([bad({ conditions: { ...ev.conditions, stageMin: -1 } })])).toThrow("stageMin");
    expect(() => validateEvents([bad({ conditions: { ...ev.conditions, lifespanLeftMax: "x" } })])).toThrow("lifespanLeftMax");
    expect(() => validateEvents([bad({ conditions: { ...ev.conditions, reachedNot: "zhuji:0" } })])).toThrow("reachedNot");
    const e = bad({});
    e.choices[0].outcomes[0].effects = { advanceRealm: "yes" };
    expect(() => validateEvents([e])).toThrow("advanceRealm");
  });
});

import { describe, expect, it } from "vitest";
import { chooseEvent, eventAvailable } from "../src/core/events";
import { slotsFor, leaveSect } from "../src/core/sect";
import { snapshotOf } from "../src/core/worldeffects";
import type { GameState } from "../src/core/state";
import { gameData as data } from "../src/data/load";
import { fillSlots } from "../src/data/slots";
import { living } from "./helpers";

// 12 則宗門事件；M24 的 sect_vein_001（山門靈脈）是另一回事
const sectEvents = data.events.filter((e) => e.id.startsWith("sect_") && e.id !== "sect_vein_001");

function member(rank = 0, patch: Partial<GameState> = {}): GameState {
  for (let seed = 1; seed < 200; seed++) {
    const base = living(seed, { realmId: "lianqi", stage: 3, ageMonths: 40 * 12 });
    const sect = snapshotOf(base, data).sects.find((s) => s.rank === "great" && s.state !== "closed" && s.state !== "fallen");
    if (sect) return { ...base, sect: { id: sect.id, rank, contribution: 100, joinedAge: base.ageMonths }, sectPeak: rank + 1, ...patch };
  }
  throw new Error("找不到世界");
}

describe("宗門事件（M27）", () => {
  it("12 則，id 唯一，都需要入宗或與離宗有關", () => {
    expect(sectEvents).toHaveLength(12);
    expect(new Set(sectEvents.map((e) => e.id)).size).toBe(12);
    for (const e of sectEvents) expect(e.conditions.sect, e.id).toBeDefined();
  });
  it("沒入宗時只有離宗後的那一則會出現", () => {
    const s = living(3, { realmId: "lianqi", stage: 3, ageMonths: 40 * 12 });
    expect(sectEvents.filter((e) => eventAvailable(s, e, data)).map((e) => e.id)).toEqual([]);
    const collapsed = { ...s, flags: ["sect_collapse"] };
    expect(sectEvents.filter((e) => eventAvailable(collapsed, e, data)).map((e) => e.id)).toEqual(["sect_collapse_001"]);
  });
  it("入宗後出現的事件依位階與安排過濾", () => {
    const ids = (s: GameState) => sectEvents.filter((e) => eventAvailable(s, e, data)).map((e) => e.id);
    expect(ids(member(0))).not.toContain("sect_scripture_001");
    expect(ids(member(1))).toContain("sect_scripture_001");
    expect(ids(member(1))).not.toContain("sect_elder_ask_001");
    expect(ids(member(2))).toContain("sect_elder_ask_001");
    expect(ids(member(0))).not.toContain("sect_duty_night_001");
    expect(ids(member(0, { schedule: data.sects.dutySchedule }))).toContain("sect_duty_night_001");
    expect(ids(member(0))).not.toContain("sect_collapse_001");
  });
  it("離宗那一刻後，旗標 sect_collapse 只來自閉山或覆滅，主動離宗不加", () => {
    expect(leaveSect(member(0)).flags).not.toContain("sect_collapse");
    expect(leaveSect(member(0), data, true).flags).toContain("sect_collapse");
  });
  it("每個選項的結果都能跑完並寫出文字，貢獻有加有減", () => {
    let plus = 0;
    let minus = 0;
    for (const ev of sectEvents.filter((e) => e.type === "choice")) {
      ev.choices!.forEach((c, i) => {
        const s = member(2, { pendingEvent: ev.id, spiritStones: 100 });
        const after = chooseEvent(s, i, data);
        expect(after.pendingEvent, ev.id).toBeNull();
        const slots = slotsFor(s, data);
        for (const o of c.outcomes) {
          expect(() => fillSlots(o.text, slots), ev.id).not.toThrow();
          const d = o.effects.contribution ?? 0;
          if (d > 0) plus++;
          if (d < 0) minus++;
        }
      });
    }
    expect(plus).toBeGreaterThan(5);
    expect(minus).toBeGreaterThan(2);
  });
  it("貢獻不會被扣到負數，也不能把貢獻加給沒入宗的人", () => {
    const sweep = data.events.find((e) => e.id === "sect_sweep_001")!;
    const low = { ...member(0), sect: { ...member(0).sect!, contribution: 2 }, pendingEvent: sweep.id };
    expect(chooseEvent(low, 1, data).sect!.contribution).toBe(0);
  });
  it("文字不洩漏來源：沒有天光、梯、絕通，也沒有直接寫死的參考名", () => {
    const all = JSON.stringify(sectEvents);
    for (const w of ["天光", "絕通", "太衡宗", "通濟行", "野渡", "垣下", "渡頭集", "青垣山"]) expect(all.includes(w), w).toBe(false);
  });
  it("每段不超過三句", () => {
    const sentences = (t: string): number => t.split(/[。！？]/).filter((x) => x.trim().length > 0).length;
    for (const e of sectEvents) {
      expect(sentences(e.text), e.id).toBeLessThanOrEqual(3);
      for (const c of e.choices ?? []) for (const o of c.outcomes) expect(sentences(o.text), `${e.id}:${c.text}`).toBeLessThanOrEqual(3);
    }
  });
});

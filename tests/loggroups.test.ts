import { describe, expect, it } from "vitest";
import type { LogEntry } from "../src/core/state";
import { gameData as data } from "../src/data/load";
import { decadeLabel, groupByDecade, logMarks } from "../src/ui/logGroups";

const entry = (years: number, patch: Partial<LogEntry> = {}): LogEntry => ({ month: years * 12 + 3, kind: "stageUp", realmId: "lianqi", stage: 1, ...patch });

describe("日誌分段與加強顯示", () => {
  it("每十年一段，年紀當小標；十歲以下合併", () => {
    expect(decadeLabel(20)).toBe("二十至二十九歲");
    expect(decadeLabel(100)).toBe("一百至一百零九歲");
    expect(decadeLabel(0)).toBe("九歲以前");
    // 由新到舊的日誌：同一段連續的併在一起
    const groups = groupByDecade([entry(35), entry(31), entry(29), entry(20), entry(9), entry(3)]);
    expect(groups.map((g) => g.label)).toEqual(["三十至三十九歲", "二十至二十九歲", "九歲以前"]);
    expect(groups.map((g) => g.entries.length)).toEqual([2, 2, 2]);
    expect(groupByDecade([])).toEqual([]);
  });

  it("有代價：突破失敗、遇怪敗北，或實際損失修為、靈石、壽元、屬性", () => {
    expect(logMarks(entry(30, { kind: "breakthroughFail" }), data)).toEqual(["cost"]);
    expect(logMarks(entry(30, { kind: "huntLose" }), data)).toEqual(["cost"]);
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { cultivation: -5 } }), data)).toEqual(["cost"]);
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { spiritStones: -30 } }), data)).toEqual(["cost"]);
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { lifespan: -1 } }), data)).toEqual(["cost"]);
    // 小額損失不標
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { spiritStones: -3, cultivation: -0.3 } }), data)).toEqual([]);
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { attributes: { mind: -1 } } }), data)).toEqual(["cost"]);
    expect(logMarks(entry(30, { kind: "event", eventId: "x", changes: { cultivation: 5, spiritStones: 2 } }), data)).toEqual([]);
    expect(logMarks(entry(30), data)).toEqual([]);
  });

  it("有後續：選到的結果立了旗標，而且另有事件要求那面旗標", () => {
    const start = data.events.find((ev) => ev.type === "choice" && ev.choices!.some((c) => c.outcomes.some((o) => (o.effects.flags ?? []).some((f) => data.events.some((other) => other.id !== ev.id && (other.conditions.flags ?? []).includes(f))))));
    expect(start, "資料裡至少有一個事件鏈的前段").toBeDefined();
    let found = false;
    start!.choices!.forEach((c, ci) =>
      c.outcomes.forEach((o, oi) => {
        const marks = logMarks(entry(30, { kind: "event", eventId: start!.id, choice: ci, outcome: oi }), data);
        if ((o.effects.flags ?? []).some((f) => data.events.some((other) => other.id !== start!.id && (other.conditions.flags ?? []).includes(f)))) {
          found = true;
          expect(marks).toContain("follow");
        } else expect(marks).not.toContain("follow");
      }),
    );
    expect(found).toBe(true);
    // 沒有選擇資訊的抉擇紀錄、不存在的事件，都不標
    expect(logMarks(entry(30, { kind: "event", eventId: "no_such_event" }), data)).toEqual([]);
  });
});

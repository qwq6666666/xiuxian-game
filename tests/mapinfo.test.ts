import { describe, expect, it } from "vitest";
import { generateWorld, worldAt } from "../src/core/world";
import { gameData as data } from "../src/data/load";
import { validateMap } from "../src/data/validate";
import { describeTarget, fillBlurb, legendOf, mapAgeYears, sectMarker, type MapTarget } from "../src/ui/mapinfo";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function everyTarget(seed: number, age: number): MapTarget[] {
  const world = generateWorld(seed, data);
  const snap = worldAt(world, age);
  return [
    ...snap.polities.map((p): MapTarget => ({ kind: "capital", polity: p.id })),
    ...snap.polities.map((p): MapTarget => ({ kind: "territory", id: "cell:0", region: "north", polity: p.id })),
    ...snap.sects.map((s): MapTarget => ({ kind: "sect", id: s.id })),
    ...snap.ferries.map((f): MapTarget => ({ kind: "ferry", id: f.id })),
    ...snap.merchantBranches.filter((r) => r !== "center").map((region): MapTarget => ({ kind: "branch", region })),
    { kind: "stairs" },
    { kind: "village" },
    { kind: "market" },
    { kind: "mountain" },
    { kind: "merchantHq" },
  ];
}

describe("天下圖：標記樣式", () => {
  it("位階決定大小，狀態決定樣式，守梯大宗多一圈", () => {
    expect(sectMarker({ kind: "school", rank: "school", state: "stable" })).toMatchObject({ radius: 5, fill: "hollow", ring: false });
    expect(sectMarker({ kind: "greatSect", rank: "great", state: "decline" })).toMatchObject({ radius: 7, fill: "dashed" });
    expect(sectMarker({ kind: "guard", rank: "great", state: "prosper" })).toMatchObject({ fill: "solid", ring: true });
    expect(sectMarker({ kind: "school", rank: "school", state: "closed" }).fill).toBe("gray");
    expect(sectMarker({ kind: "school", rank: "school", state: "fallen" }).fill).toBe("fallen");
    // 門派升為大宗後標記變大
    expect(sectMarker({ kind: "school", rank: "great", state: "prosper" }).radius).toBe(7);
  });
});

describe("天下圖：簡介", () => {
  it("每種標記在任何世界、任何年齡都有標題與不超過兩句的簡介，沒有殘留欄位", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const world = generateWorld(seed * 29, data);
      for (const age of [10, 50, 110, 200]) {
        const snap = worldAt(world, age);
        for (const target of everyTarget(seed * 29, age)) {
          const info = describeTarget(target, world, snap, data);
          expect(info.title.length, JSON.stringify(target)).toBeGreaterThan(0);
          expect(info.lines.length).toBeGreaterThan(0);
          for (const line of info.lines) {
            expect(line, JSON.stringify(target)).not.toMatch(/[{}]/);
            expect(line.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("出生地寫出村名與所屬國；殘階只有一句傳聞", () => {
    const world = generateWorld(5, data);
    const snap = worldAt(world, 20);
    const v = describeTarget({ kind: "village" }, world, snap, data);
    expect(v.title).toContain(world.birth.village);
    expect(v.title).toContain("出生地");
    expect(v.lines[0]).toContain(world.birth.village);
    expect(describeTarget({ kind: "stairs" }, world, snap, data).lines).toEqual([data.map.stairs.text]);
  });

  it("宗門簡介隨狀態與位階改變：覆滅的寫遺址，守梯大宗寫奉天命", () => {
    const world = generateWorld(8, data);
    const snap = worldAt(world, 20);
    const guard = snap.sects.find((s) => s.kind === "guard")!;
    expect(describeTarget({ kind: "sect", id: guard.id }, world, snap, data).lines[0]).toContain("奉天命");
    const school = snap.sects.find((s) => s.kind === "school")!;
    school.state = "fallen";
    expect(describeTarget({ kind: "sect", id: school.id }, world, snap, data).lines[0]).toContain("遺址");
  });

  it("毀壞的渡口簡介不同；亡國的名字不再出現在圖例", () => {
    let sawBroken = false;
    let sawMerge = false;
    for (let seed = 1; seed <= 400 && !(sawBroken && sawMerge); seed++) {
      const world = generateWorld(seed * 7, data);
      const end = worldAt(world, 200);
      const broken = end.ferries.find((f) => f.broken);
      if (broken) {
        sawBroken = true;
        expect(describeTarget({ kind: "ferry", id: broken.id }, world, end, data).lines[0]).toContain("如今已毀");
      }
      const before = worldAt(world, 10);
      const gone = before.polities.filter((p) => !end.polities.some((q) => q.id === p.id));
      if (gone.length > 0) {
        sawMerge = true;
        const names = legendOf(end).map((l) => l.name);
        for (const p of gone) expect(names.some((n) => n === p.name || n === `${p.name}諸部`)).toBe(false);
      }
    }
    expect(sawBroken).toBe(true);
    expect(sawMerge).toBe(true);
  });

  it("fillBlurb：缺值的欄位直接丟錯", () => {
    expect(fillBlurb("{name}在{region}。", { name: "甲", region: "乙" })).toBe("甲在乙。");
    expect(() => fillBlurb("{name}在{nowhere}。", { name: "甲" })).toThrow("nowhere");
  });

  it("mapAgeYears 以歲計", () => {
    expect(mapAgeYears(120)).toBe(10);
    expect(mapAgeYears(1439)).toBe(119);
  });
});

describe("天下圖：簡介模板格式", () => {
  const bad = (patch: (m: ReturnType<typeof clone<typeof data.map>>) => void) => () => {
    const m = clone(data.map);
    patch(m);
    validateMap(m);
  };

  it("模板缺漏、欄位不認得、超過兩句時指出欄位", () => {
    expect(bad((m) => delete (m as unknown as Record<string, unknown>).blurbs)).toThrow("blurbs");
    expect(bad((m) => (m.blurbs.polity = "{ghost}的國度。"))).toThrow("ghost");
    expect(bad((m) => (m.blurbs.village = "一。二。三。"))).toThrow("village");
    expect(bad((m) => (m.blurbs.state.fallen = ""))).toThrow("fallen");
    expect(bad((m) => (m.blurbs.sect.great = ""))).toThrow("great");
  });
});

import { activeEffectsAt, describeEffect, effectsForTarget } from "../src/ui/mapinfo";

describe("天下圖：世局影響", () => {
  it("每條生效效果都有 mapRef，點對應標記時會標出，點不相干的標記不會", () => {
    let withEffects = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const world = generateWorld(seed * 31, data);
      for (const age of [10, 50, 90]) {
        const snap = worldAt(world, age);
        const active = activeEffectsAt(snap, data);
        if (active.length > 0) withEffects++;
        for (const e of active) {
          const d = describeEffect(e, world, data);
          expect(d.reason).not.toMatch(/[{}]/);
          expect(d.impact).toContain("價格 ×");
        }
        expect(effectsForTarget({ kind: "stairs" }, snap, data)).toEqual([]);
        for (const e of effectsForTarget({ kind: "market" }, snap, data)) expect(e.mapRef).toBe("ferry");
        const guard = snap.sects.find((s) => s.kind === "guard")!;
        const onGuard = effectsForTarget({ kind: "sect", id: guard.id }, snap, data);
        expect(onGuard.map((e) => e.id).sort()).toEqual(active.filter((e) => e.mapRef === "guard").map((e) => e.id).sort());
      }
    }
    expect(withEffects).toBeGreaterThan(0);
  });
});

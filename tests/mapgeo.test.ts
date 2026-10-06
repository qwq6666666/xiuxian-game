import { describe, expect, it } from "vitest";
import { alignStart, brushLine, brushOffset, compassNames, placeLabels, polyTween, resample, zoomView, clampView } from "../src/ui/mapgeo";
import { placeHistory, progressWords, targetKindLabel, territoryLines, timelineEntries } from "../src/ui/mapinfo";
import { generateWorld, worldAt } from "../src/core/world";
import { territoryGeometryAt } from "../src/core/frontier";
import { gameData } from "../src/data/load";
import type { Point } from "../src/data/types";

const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe("天下圖繪製輔助", () => {
  it("筆刷抖動對同一點永遠相同，相接的線段端點不會斷開", () => {
    expect(brushOffset(12, 34, 5, 0.7)).toEqual(brushOffset(12, 34, 5, 0.7));
    const a = brushLine([0, 0], [30, 0], 7);
    const b = brushLine([30, 0], [30, 30], 7);
    expect(a.at(-1)).toEqual(b[0]);
    expect(a.length).toBeGreaterThan(3);
    expect(Math.max(...a.map((p) => Math.abs(p[1])))).toBeLessThan(3);
  });

  it("重新取樣得到指定頂點數，內插端點分別是舊形與新形", () => {
    expect(resample(square, 16)).toHaveLength(16);
    const to: Point[] = [[0, 0], [20, 0], [20, 20], [0, 20]];
    const tween = polyTween(square, to);
    expect(tween(1)).toBe(to);
    const mid = tween(0.5);
    expect(Math.max(...mid.map((p) => p[0]))).toBeCloseTo(15, 0);
    // 起點錯位的同一個形狀，對齊後內插不會扭轉
    const shifted = [square[2], square[3], square[0], square[1]];
    const aligned = alignStart(resample(square, 8), resample(shifted, 8));
    expect(aligned[0]).toEqual(resample(square, 8)[0]);
    expect(polyTween(undefined, to)(0.3)).toBe(to);
  });

  it("標籤避讓：重疊的依優先度隱藏，被選取的（優先 0）一定留下", () => {
    const items = [
      { key: "a", x: 100, y: 100, text: "栖梧閣", anchor: "start" as const, priority: 4 },
      { key: "b", x: 104, y: 102, text: "梅塘", anchor: "start" as const, priority: 3 },
      { key: "c", x: 300, y: 300, text: "遠方", anchor: "start" as const, priority: 6 },
    ];
    const r = placeLabels(items);
    expect(r.shown.map((l) => l.key)).toEqual(["b", "c"]);
    expect(r.hidden.map((l) => l.key)).toEqual(["a"]);
    expect(placeLabels([{ ...items[0], priority: 0 }, items[1]]).shown[0].key).toBe("a");
  });

  it("方位名：不重複，同名加序號", () => {
    const nodes = gameData.map.regions.find((r) => r.id === "north")!.nodes!;
    const names = compassNames(nodes);
    expect(names).toHaveLength(nodes.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((n) => n.includes("北"))).toBe(true);
  });

  it("縮放限制在 1 到 4 倍，且不會移出地圖", () => {
    const box: Point = [400, 520];
    const full = { x: 0, y: 0, w: 400, h: 520 };
    const zoomed = zoomView(full, box, 390, 510, 10);
    expect(zoomed.w).toBeCloseTo(100, 6);
    expect(zoomed.x + zoomed.w).toBeLessThanOrEqual(400.0001);
    expect(zoomView(zoomed, box, 200, 200, 0.001)).toEqual(full);
    expect(clampView({ x: -50, y: 900, w: 100, h: 130 }, box)).toEqual({ x: 0, y: 390, w: 100, h: 130 });
  });
});

describe("天下圖資訊卡與時間軸", () => {
  const world = generateWorld(17);
  const merge = world.changes.find((c) => c.kind === "merge")!;

  it("時間軸只列到目前年齡為止的變化，並帶牽涉的地域", () => {
    const early = timelineEntries(world, gameData, merge.age - 1);
    expect(early.every((e) => e.age < merge.age)).toBe(true);
    const all = timelineEntries(world, gameData, merge.age + 1);
    const hit = all.find((e) => e.age === merge.age && e.note === merge.note)!;
    expect(hit.regions.length).toBeGreaterThan(0);
  });

  it("領土資訊：交戰中說明進攻方、進度與預計底定，安定時說明起算年", () => {
    const during = territoryGeometryAt(world, (merge.age + 2) * 4, gameData);
    const fighting = during.find((c) => c.fight)!;
    const lines = territoryLines(world, during, fighting.id, gameData, merge.age + 2);
    expect(lines.join("")).toMatch(/推進/);
    expect(lines.join("")).toMatch(/年後底定/);
    expect(lines.join("")).toMatch(/國勢/);
    const calm = territoryGeometryAt(world, (merge.age + 20) * 4, gameData);
    const settled = territoryLines(world, calm, calm.find((c) => c.region === fighting.region)!.id, gameData, merge.age + 20);
    expect(settled[0]).toMatch(/自 \d+ 歲起/);
  });

  it("推進程度口語、類型與地點大事", () => {
    expect(progressWords(0.43)).toBe("約四成");
    expect(progressWords(0.99)).toBe("近乎底定");
    const snap = worldAt(world, 50);
    expect(targetKindLabel({ kind: "ferry", id: "x" }, snap)).toBe("渡口");
    expect(targetKindLabel({ kind: "sect", id: snap.sects[0].id }, snap)).toMatch(/宗門山門/);
    const sect = world.changes.find((c) => c.kind === "sectState");
    if (sect) {
      const name = world.sects.find((s) => s.id === (sect as { sect: string }).sect)!.name;
      expect(placeHistory(world, [name], 200).length).toBeGreaterThan(0);
    }
    expect(placeHistory(world, ["x"], 200)).toEqual([]);
  });
});

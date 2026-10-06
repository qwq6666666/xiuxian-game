import { describe, expect, it } from "vitest";
import { placeLabels } from "../src/ui/mapgeo";
import { clampZoom, zoomAt, MAX_ZOOM, IDENTITY } from "../src/ui/mapart/zoom";
import { mixRgb, parseHex, tint } from "../src/ui/mapart/color";
import { placeHistory, progressWords, relationEdges, relationLines, targetKindLabel, terrainLine, territoryLines, timelineEntries } from "../src/ui/mapinfo";
import { generateWorld, worldAt } from "../src/core/world";
import { cellFiefs, territoryMapAt } from "../src/core/frontier";
import { fiefsFor } from "../src/core/fiefs";
import { terrainFor } from "../src/core/terrain";
import { gameData } from "../src/data/load";

describe("天下圖繪製輔助", () => {
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

  it("縮放限制在 1 到 4 倍，平移不會露出地圖外", () => {
    const z = zoomAt(IDENTITY, 600, 460, 590, 450, 10);
    expect(z.scale).toBe(MAX_ZOOM);
    expect(z.x).toBeGreaterThanOrEqual(600 - 600 * MAX_ZOOM);
    expect(z.x).toBeLessThanOrEqual(0);
    expect(zoomAt(z, 600, 460, 300, 200, 0.001)).toEqual(IDENTITY);
    expect(clampZoom({ scale: 2, x: 50, y: -9999 }, 600, 460)).toEqual({ scale: 2, x: 0, y: 460 - 920 });
  });

  it("顏色格式化：來自資料的色值轉成 canvas 字串", () => {
    expect(parseHex("#c0715a")).toEqual([192, 113, 90]);
    expect(parseHex("壞值")).toEqual([128, 128, 128]);
    expect(tint([1, 2, 3], 0.5)).toBe("rgba(1,2,3,0.5)");
    expect(mixRgb([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });
});

describe("天下圖資訊卡與時間軸", () => {
  const world = generateWorld(17);
  const merge = world.changes.find((c) => c.kind === "merge")!;
  const terrain = terrainFor(world.seed, gameData);

  it("時間軸只列到目前年齡為止的變化，並帶牽涉的位置", () => {
    const early = timelineEntries(world, gameData, merge.age - 1);
    expect(early.every((e) => e.age < merge.age)).toBe(true);
    const all = timelineEntries(world, gameData, merge.age + 1);
    const hit = all.find((e) => e.age === merge.age && e.note === merge.note)!;
    expect(hit.spots.length).toBeGreaterThan(0);
  });

  it("領土資訊：交戰中說明進攻方、進度與預計底定，安定時說明起算年", () => {
    const during = territoryMapAt(world, (merge.age + 2) * 4, gameData, terrain);
    const fight = during.fights[0];
    const cf = cellFiefs(terrain, gameData, fiefsFor(world.seed, gameData));
    const cell = terrain.grid.cells.find((c) => terrain.land[c.id] && fight.fiefs.includes(cf[c.id]))!;
    const lines = territoryLines(world, during, terrain, cell.id, gameData, merge.age + 2);
    expect(lines.join("")).toMatch(/推進/);
    expect(lines.join("")).toMatch(/年後底定/);
    expect(lines.join("")).toMatch(/國勢/);
    const calm = territoryMapAt(world, (merge.age + 20) * 4, gameData, terrain);
    const settled = territoryLines(world, calm, terrain, cell.id, gameData, merge.age + 20);
    expect(settled[0]).toMatch(/自 \d+ 歲起/);
    // 海沒有領土資訊
    const sea = terrain.grid.cells.find((c) => !terrain.land[c.id])!;
    expect(territoryLines(world, calm, terrain, sea.id, gameData, merge.age + 20)).toEqual([]);
  });

  it("地形一行字：生態區、寒暖乾濕、海拔", () => {
    const land = terrain.grid.cells.find((c) => terrain.land[c.id] && !terrain.lake[c.id])!;
    expect(terrainLine(terrain, gameData, land.id)).toMatch(/・.*海拔約 \d+ 公尺/);
    const sea = terrain.grid.cells.find((c) => !terrain.land[c.id])!;
    expect(terrainLine(terrain, gameData, sea.id)).toBe("海域。");
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

describe("天下圖的宗門與國家關係", () => {
  const world = generateWorld(17);
  const snap = worldAt(world, 0);
  const withAlly = snap.sects.find((s) => snap.relations[s.id]?.ally);

  it("選取宗門：只列它自己的盟與仇；選取國家：列與該國相關的宗門", () => {
    const s = withAlly ?? snap.sects[0];
    const edges = relationEdges(snap, { sect: s.id });
    expect(edges.every((e) => e.sect === s.id)).toBe(true);
    expect(edges.length).toBe([snap.relations[s.id]?.ally, snap.relations[s.id]?.feud].filter(Boolean).length);
    const lines = relationLines(snap, { sect: s.id });
    expect(lines.length).toBeGreaterThan(0);
    if (snap.relations[s.id]?.ally) {
      const polity = snap.relations[s.id].ally!;
      expect(relationEdges(snap, { polity }).some((e) => e.sect === s.id && e.kind === "ally")).toBe(true);
      expect(relationLines(snap, { polity }).join("")).toContain(s.name);
    }
  });

  it("沒有選取時不產生連線，閉山的宗門沒有關係線", () => {
    const closed = { ...snap, sects: snap.sects.map((s) => ({ ...s, state: "closed" as const })) };
    expect(relationEdges(closed, { sect: snap.sects[0].id })).toEqual([]);
    expect(relationLines(closed, { sect: snap.sects[0].id })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { createInitialState, newLife, setNationCount, startLife } from "../src/core/life";
import { endLife } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { generateWorld, worldAt, worldFor } from "../src/core/world";
import { gameData as data } from "../src/data/load";
import { fiefsFor } from "../src/core/fiefs";
import { SAVE_VERSION } from "../src/core/state";

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);
const { min, max } = data.map.nations;

describe("國家數可調（M51）", () => {
  it("3 到 9 國都生成得出：國家數正確、每國有領、國都領仍屬於自己", () => {
    for (let n = min; n <= max; n++) {
      for (const seed of SEEDS) {
        const w = generateWorld(seed, data, n);
        expect(w.polities.length, `${seed}/${n}`).toBe(n);
        for (const age of [0, 40, 80, 150, 220]) {
          const snap = worldAt(w, age);
          const owned = new Set(Object.values(snap.owners));
          for (const p of snap.polities) {
            expect(owned.has(p.id), `${seed}/${n}@${age} ${p.id} 沒有領`).toBe(true);
            expect(snap.owners[p.seat], `${seed}/${n}@${age} ${p.id} 的國都領易主`).toBe(p.id);
          }
        }
      }
    }
  });

  it("同樣的種子、不同國家數得到不同的世界；超出範圍會被限制", () => {
    expect(generateWorld(7, data, 3).polities.length).toBe(3);
    expect(generateWorld(7, data, 9).polities.length).toBe(9);
    expect(generateWorld(7, data, 1).polities.length).toBe(min);
    expect(generateWorld(7, data, 99).polities.length).toBe(max);
    expect(generateWorld(7, data, 3).owners).not.toEqual(generateWorld(7, data, 9).owners);
    // 領本身只看種子，與國家數無關
    expect(fiefsFor(7, data).points).toEqual(fiefsFor(7, data).points);
  });

  it("worldFor 依國家數記住不同的世界", () => {
    expect(worldFor(11, data, 4).polities.length).toBe(4);
    expect(worldFor(11, data, 6).polities.length).toBe(6);
    expect(worldFor(11, data, 6)).toBe(worldFor(11, data, 6));
  });

  it("擲骰畫面選國家數：只在擲骰階段、限制範圍、存在 meta、轉世沿用", () => {
    const rolling = createInitialState(5);
    expect(rolling.nationCount).toBe(data.map.nations.default);
    const picked = setNationCount(rolling, 8, data);
    expect([picked.nationCount, picked.meta.nationCount]).toEqual([8, 8]);
    expect(setNationCount(rolling, 100, data).nationCount).toBe(max);
    expect(setNationCount(rolling, 0, data).nationCount).toBe(min);
    const living = startLife(picked);
    expect(setNationCount(living, 3, data)).toBe(living);
    const next = newLife(endLife(living, "lifespan", data), data);
    expect([next.nationCount, next.meta.nationCount]).toEqual([8, 8]);
  });

  it("存檔往返保留；v28 的舊檔補上 5 國，旅行位置在舊都的退回出生村", () => {
    const s = setNationCount(createInitialState(5), 7, data);
    expect(deserialize(serialize(s)).nationCount).toBe(7);
    expect(SAVE_VERSION).toBe(32);
    const old = JSON.parse(serialize(startLife(createInitialState(5))));
    old.version = 28;
    delete old.nationCount;
    delete old.meta.nationCount;
    old.travel = { locationId: "capital:north", targetId: "capital:east", totalMonths: 4, remainingMonths: 2, trail: ["village", "capital:north"] };
    const m = deserialize(JSON.stringify(old));
    expect([m.nationCount, m.meta.nationCount]).toEqual([5, 5]);
    expect(m.travel).toEqual({ locationId: "village", targetId: null, totalMonths: 0, remainingMonths: 0, trail: ["village"] });
  });
});

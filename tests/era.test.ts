import { describe, expect, it } from "vitest";
import { eraName, lifeIndex } from "../src/core/era";
import { createInitialState, newLife, reroll, startLife } from "../src/core/life";
import { endLife } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { gameData } from "../src/data/load";
import { validateEras, validateText } from "../src/data/validate";
import { eraBorn, eraTransition, formatLogEntry } from "../src/ui/format";
import { living } from "./helpers";

const names = gameData.eras;

describe("年號", () => {
  it("第 n 世用清單第 n 項，用完後循環並加「後」", () => {
    expect(eraName(0)).toBe(names[0]);
    expect(eraName(names.length - 1)).toBe(names[names.length - 1]);
    expect(eraName(names.length)).toBe(`後${names[0]}`);
    expect(eraName(names.length * 2 + 1)).toBe(`後後${names[1]}`);
  });

  it("世數取自已走完的世數；回顧中的這一世要減一", () => {
    const s = living(1, { meta: { ...createInitialState(1).meta, lives: 3 } });
    expect(lifeIndex(s)).toBe(3);
    const ended = endLife(s, "lifespan");
    expect(ended.meta.lives).toBe(4);
    expect(lifeIndex(ended)).toBe(3);
    expect(lifeIndex(newLife(ended))).toBe(4);
  });

  it("連續轉世年號依清單遞增，重擲不變", () => {
    let s = createInitialState(7);
    const seen: number[] = [];
    for (let i = 0; i < 3; i++) {
      s = reroll(s);
      seen.push(lifeIndex(s));
      s = newLife(endLife(startLife(s), "lifespan"));
    }
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe("年號：開場日誌", () => {
  it("開始修行時寫入一筆開場日誌，記下世數", () => {
    const s = startLife(createInitialState(1));
    expect(s.log).toHaveLength(1);
    expect(s.log[0]).toMatchObject({ kind: "era", eraIndex: 0, month: s.ageMonths });
    const later = startLife(createInitialState(1, gameData, { ...createInitialState(1).meta, lives: 2 }));
    expect(later.log[0].eraIndex).toBe(2);
  });

  it("文字帶年號與歲數，不加年齡前綴，且同輸入同輸出", () => {
    const s = startLife(createInitialState(1));
    const text = formatLogEntry(s.log[0], gameData);
    expect(text).toContain(`${names[0]}年間`);
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toMatch(/^.{1,3}歲[春夏秋冬]，/);
    expect(formatLogEntry(s.log[0], gameData)).toBe(text);
  });

  it("不同世挑到不同句，且每句不超過三句話", () => {
    const opening = gameData.text.era.opening;
    for (const t of opening) expect((t.match(/[。！？]/g) ?? []).length).toBeLessThanOrEqual(3);
    const a = formatLogEntry({ month: 120, kind: "era", realmId: "mortal", stage: 0, eraIndex: 0 }, gameData);
    const b = formatLogEntry({ month: 120, kind: "era", realmId: "mortal", stage: 0, eraIndex: 1 }, gameData);
    expect(a).not.toBe(b);
  });
});

describe("年號：顯示文字與規則", () => {
  it("第一世沒有換世句，之後寫上一世與這一世的年號，不出現年數", () => {
    expect(eraTransition(0, gameData)).toBe("");
    const t = eraTransition(2, gameData);
    expect(t).toContain(names[1]);
    expect(t).toContain(names[2]);
    expect(t).toContain("不知多少年");
    expect(t).not.toMatch(/[0-9]|[一二三四五六七八九十百千]+年(?!間)/);
    expect(eraBorn(1, gameData)).toBe(`生於${names[1]}年間`);
  });

  it("文字資料沒有寫死參考名，也沒有第 14.3 節的真相用語", () => {
    const all = JSON.stringify([gameData.text.era, names]);
    expect(all).not.toMatch(/絕通後|絕通前|梯/);
  });
});

describe("年號：存檔與資料檢查", () => {
  it("開場日誌可存讀；缺 eraIndex 時指出欄位", () => {
    const s = startLife(createInitialState(1));
    expect(deserialize(serialize(s)).log[0].eraIndex).toBe(0);
    const good = JSON.parse(serialize(createInitialState(1)));
    const entry = { month: 120, kind: "era", realmId: "mortal", stage: 0 };
    expect(() => deserialize(JSON.stringify({ ...good, log: [entry] }))).toThrow("log[0]");
    expect(() => deserialize(JSON.stringify({ ...good, log: [{ ...entry, eraIndex: -1 }] }))).toThrow("log[0].eraIndex");
  });

  it("eras.json 重複或字數不對時指出是哪一筆", () => {
    expect(() => validateEras({ names: ["永寧", "永寧"] })).toThrow("names[1]");
    expect(() => validateEras({ names: ["永"] })).toThrow("names[0]");
    expect(() => validateEras({ names: [] })).toThrow("names");
  });

  it("text.json 缺 era 欄位時指出欄位", () => {
    const t = { ...gameData.text } as Record<string, unknown>;
    delete t.era;
    expect(() => validateText(t)).toThrow("era");
  });
});

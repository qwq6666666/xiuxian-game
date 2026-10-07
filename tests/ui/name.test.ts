import { describe, expect, it } from "vitest";
import { renameCharacter } from "../../src/core/actions";
import { createInitialState, newLife, reroll, startLife } from "../../src/core/life";
import { deserialize, serialize } from "../../src/core/save";
import { SAVE_VERSION } from "../../src/core/state";
import { gameData as data } from "../../src/data/load";
import { validateNames } from "../../src/data/validate";
import { formatLogEntry } from "../../src/ui/format";

const isGenerated = (name: string): boolean =>
  data.names.surnames.some((s) => data.names.given.some((g) => name === s + g));

describe("姓名", () => {
  it("開局隨機抽姓名，同種子結果相同、重擲會換", () => {
    const a = createInitialState(7);
    expect(isGenerated(a.name)).toBe(true);
    expect(createInitialState(7).name).toBe(a.name);
    const names = new Set(Array.from({ length: 30 }, (_, i) => createInitialState(i + 1).name));
    expect(names.size).toBeGreaterThan(10);
    const b = reroll({ ...a, rerolls: 5 });
    expect(isGenerated(b.name)).toBe(true);
  });

  it("擲骰階段可改名：去頭尾空白、限制長度，改過之後重擲不再換", () => {
    const s = createInitialState(3);
    const t = renameCharacter(s, "  風清揚 ");
    expect(t.name).toBe("風清揚");
    expect(t.nameCustom).toBe(true);
    expect(reroll({ ...t, rerolls: 3 }).name).toBe("風清揚");
    expect(renameCharacter(s, "   ")).toBe(s);
    expect(renameCharacter(s, "一二三四五六七")).toBe(s);
    expect(renameCharacter(s, "一二三四五六").name).toBe("一二三四五六");
  });

  it("開始修行後不能改名", () => {
    const s = startLife(createInitialState(3));
    expect(renameCharacter(s, "別人")).toBe(s);
  });

  it("轉世換新名字，不沿用自訂的名字", () => {
    const dead = { ...startLife(renameCharacter(createInitialState(3), "風清揚")), phase: "dead" as const };
    const next = newLife(dead);
    expect(next.nameCustom).toBe(false);
    expect(isGenerated(next.name)).toBe(true);
  });

  it("存檔保留姓名；缺姓名或格式錯誤時指出欄位", () => {
    const s = renameCharacter(createInitialState(3), "風清揚");
    expect(deserialize(serialize(s)).name).toBe("風清揚");
    const good = JSON.parse(serialize(s));
    expect(() => deserialize(JSON.stringify({ ...good, name: "" }))).toThrow("name");
    expect(() => deserialize(JSON.stringify({ ...good, nameCustom: "x" }))).toThrow("nameCustom");
  });

  it("v5 存檔遷移：補上隨機姓名，亂數種子不變", () => {
    const cur = startLife(createInitialState(4));
    const rest: Record<string, unknown> = { ...cur, version: 5 };
    delete rest.name;
    delete rest.nameCustom;
    const s = deserialize(JSON.stringify(rest));
    expect(s.version).toBe(SAVE_VERSION);
    expect(isGenerated(s.name)).toBe(true);
    expect(s.nameCustom).toBe(false);
    expect(s.rngSeed).toBe(cur.rngSeed);
  });

  it("資料檔格式錯誤時指出欄位", () => {
    expect(() => validateNames({ surnames: [], given: ["a"] })).toThrow("surnames");
    expect(() => validateNames({ surnames: ["a"], given: [1] })).toThrow("given[0]");
  });

  it("死亡日誌用姓名，沒給名字時用「我」", () => {
    const entry = { month: 1000, kind: "death" as const, realmId: "lianqi", stage: 5 };
    expect(formatLogEntry(entry, data, "風清揚")).toBe("風清揚的這一世，至此落幕。");
    expect(formatLogEntry(entry, data)).toBe("我的這一世，至此落幕。");
  });
});

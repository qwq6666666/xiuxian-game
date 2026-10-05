import { describe, expect, it } from "vitest";
import { newLife } from "../src/core/life";
import { endLife } from "../src/core/review";
import { deserialize, importSave, serialize } from "../src/core/save";
import { emptyMeta, SAVE_VERSION } from "../src/core/state";
import { gameData } from "../src/data/load";
import { collectionSummary } from "../src/ui/format";
import { living } from "./helpers";

const origins = gameData.origins.map((o) => o.id);

describe("通關收藏：計數", () => {
  it("通關時該出身加一，其他出身不變", () => {
    const s = endLife(living(1, { originId: origins[1] }), "cleared");
    expect(s.meta.clears).toEqual({ [origins[1]]: 1 });
    const again = endLife(
      living(2, { originId: origins[1], meta: s.meta }),
      "cleared",
    );
    expect(again.meta.clears).toEqual({ [origins[1]]: 2 });
    const other = endLife(living(3, { originId: origins[0], meta: again.meta }), "cleared");
    expect(other.meta.clears).toEqual({ [origins[1]]: 2, [origins[0]]: 1 });
  });

  it("死亡不計入，也不會動到既有紀錄", () => {
    const meta = { ...emptyMeta(), clears: { [origins[0]]: 1 } };
    for (const cause of ["lifespan", "adventure", "event"] as const) {
      expect(endLife(living(1, { originId: origins[0], meta }), cause).meta.clears).toEqual({ [origins[0]]: 1 });
    }
  });

  it("已結算過的狀態不會重複計數", () => {
    const once = endLife(living(1, { originId: origins[0] }), "cleared");
    expect(endLife(once, "cleared").meta.clears).toEqual({ [origins[0]]: 1 });
  });

  it("轉世後保留", () => {
    const won = endLife(living(1, { originId: origins[2] }), "cleared");
    expect(newLife(won).meta.clears).toEqual({ [origins[2]]: 1 });
  });
});

describe("通關收藏：摘要", () => {
  it("名單讀資料檔，沒通關過的次數為 0", () => {
    const sum = collectionSummary({ ...emptyMeta(), clears: { [origins[0]]: 2 } }, gameData);
    expect(sum.rows.map((r) => r.id)).toEqual(origins);
    expect(sum.rows[0].count).toBe(2);
    expect(sum.rows[1].count).toBe(0);
    expect(sum.total).toBe(2);
    expect(sum.allCleared).toBe(false);
  });

  it("每種出身都通關過才算全收", () => {
    const clears = Object.fromEntries(origins.map((id) => [id, 1]));
    const sum = collectionSummary({ ...emptyMeta(), clears }, gameData);
    expect(sum.allCleared).toBe(true);
    expect(sum.total).toBe(origins.length);
    expect(collectionSummary(emptyMeta(), gameData).total).toBe(0);
  });
});

describe("通關收藏：存檔", () => {
  it("存讀與匯入匯出保留紀錄", () => {
    const s = living(1, { meta: { ...emptyMeta(), clears: { [origins[0]]: 3 } } });
    expect(deserialize(serialize(s)).meta.clears).toEqual({ [origins[0]]: 3 });
    expect(importSave(` ${serialize(s)} `).meta.clears).toEqual({ [origins[0]]: 3 });
  });

  it("未知出身、非整數、次數不是正整數時指出欄位", () => {
    const good = JSON.parse(serialize(living(1)));
    const bad = (clears: unknown) => () => deserialize(JSON.stringify({ ...good, meta: { ...good.meta, clears } }));
    expect(bad({ ghost: 1 })).toThrow("meta.clears.ghost");
    expect(bad({ [origins[0]]: 0 })).toThrow(`meta.clears.${origins[0]}`);
    expect(bad({ [origins[0]]: 1.5 })).toThrow(`meta.clears.${origins[0]}`);
    expect(bad([])).toThrow("meta.clears");
  });

  it("v8 存檔遷移：通關紀錄為空，其餘跨世資料原樣保留", () => {
    const cur = living(3, { meta: { ...emptyMeta(), daoYun: 9, lives: 2, fragments: ["f01"] } });
    const meta: Record<string, unknown> = { ...cur.meta };
    delete meta.clears;
    const s = deserialize(JSON.stringify({ ...cur, version: 8, meta }));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.clears).toEqual({});
    expect(s.meta.daoYun).toBe(9);
    expect(s.meta.fragments).toEqual(["f01"]);
  });
});

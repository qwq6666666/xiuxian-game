import { describe, expect, it } from "vitest";
import { compareLives, goalProgress, goalStatuses, pickGoals, realmRank } from "../src/core/goals";
import { createInitialState, newLife, startLife } from "../src/core/life";
import { endLife } from "../src/core/review";
import { deserialize, serialize } from "../src/core/save";
import { emptyMeta, SAVE_VERSION } from "../src/core/state";
import { gameData as data } from "../src/data/load";
import { validateGoals } from "../src/data/validate";
import { formatVersus } from "../src/ui/format";
import { living } from "./helpers";

const goal = (id: string) => data.goals.find((g) => g.id === id)!;

describe("每世目標：抽取", () => {
  it("同種子得到同樣的目標，每個群組至多一個，不超過上限", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const a = pickGoals(seed, 5, data);
      expect(pickGoals(seed, 5, data)).toEqual(a);
      expect(a.length).toBeLessThanOrEqual(3);
      const groups = a.map((id) => goal(id).group);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });

  it("世數不夠時抽不到門檻較高的目標", () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const id of pickGoals(seed, 0, data)) expect(goal(id).minLives).toBe(0);
    }
    const all = new Set(Array.from({ length: 300 }, (_, i) => pickGoals(i + 1, 9, data)).flat());
    expect(all.has("reach_jindan")).toBe(true);
  });

  it("擲骰時就帶著目標，重擲後跟著命盤更換", () => {
    const s = createInitialState(7);
    expect(s.goalIds.length).toBeGreaterThan(0);
    expect(startLife(s).goalIds).toEqual(s.goalIds);
  });
});

describe("每世目標：進度", () => {
  it("境界目標：到達才算，之前不算", () => {
    const g = goal("lianqi_full");
    expect(goalProgress(living(1, { realmId: "lianqi", stage: 7 }), g, data).done).toBe(false);
    expect(goalProgress(living(1, { realmId: "lianqi", stage: 8 }), g, data).done).toBe(true);
    expect(goalProgress(living(1, { realmId: "zhuji", stage: 0 }), g, data).done).toBe(true);
  });

  it("年歲、見聞、旗標與本世殘卷", () => {
    expect(goalProgress(living(1, { ageMonths: 59 * 12 }), goal("age_60"), data)).toMatchObject({ current: 59, target: 60, done: false });
    expect(goalProgress(living(1, { ageMonths: 60 * 12 }), goal("age_60"), data).done).toBe(true);
    const ev = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`e${i}`, 1]));
    expect(goalProgress(living(1, { eventCounts: ev }), goal("ten_events"), data).done).toBe(true);
    expect(goalProgress(living(1, { flags: ["child_grown"] }), goal("raise_child"), data).done).toBe(true);
    // 上一世留下的殘卷不算本世
    const s = living(1, { meta: { ...emptyMeta(), fragments: ["f01"] }, startFragments: 1 });
    expect(goalProgress(s, goal("one_fragment"), data)).toMatchObject({ current: 0, done: false });
    expect(goalProgress({ ...s, meta: { ...s.meta, fragments: ["f01", "f02"] } }, goal("one_fragment"), data).done).toBe(true);
  });

  it("realmRank 沿境界與階段單調遞增", () => {
    expect(realmRank("lianqi", 0, data)).toBeGreaterThan(realmRank("mortal", 0, data));
    expect(realmRank("zhuji", 0, data)).toBe(realmRank("lianqi", 8, data) + 1);
  });
});

describe("每世目標：結算與回顧", () => {
  it("結束時記下達成次數與上一世，下一世的回顧帶上差別", () => {
    const first = living(1, { goalIds: ["age_60", "lianqi_full"], ageMonths: 61 * 12, realmId: "lianqi", stage: 2 });
    const dead = endLife(first, "lifespan", data);
    expect(dead.review!.goals).toEqual([
      { id: "age_60", done: true },
      { id: "lianqi_full", done: false },
    ]);
    expect(dead.review!.prev).toBeNull();
    expect(dead.meta.goals).toEqual({ age_60: 1 });
    expect(dead.meta.lastLife).toMatchObject({ realmId: "lianqi", stage: 2 });
    expect(compareLives(dead.review!, data)).toEqual([]);

    const next = newLife(dead, data);
    const second = endLife({ ...startLife(next), ageMonths: 70 * 12, realmId: "lianqi", stage: 5 }, "lifespan", data);
    expect(second.review!.prev).toEqual(dead.meta.lastLife);
    const lines = compareLives(second.review!, data);
    expect(lines[0]).toMatchObject({ kind: "age", cmp: "more", years: 9 });
    expect(lines[1]).toMatchObject({ kind: "progress", cmp: "far" });
    for (const l of lines) expect(formatVersus(l, data)).not.toMatch(/[{}]/);
  });

  it("結算不影響道韻：同樣的一生有沒有目標道韻都一樣", () => {
    const a = endLife(living(1, { goalIds: [], realmId: "lianqi", stage: 3 }), "lifespan", data);
    const b = endLife(living(1, { goalIds: ["lianqi_full"], realmId: "lianqi", stage: 3 }), "lifespan", data);
    expect(b.meta.daoYun).toBe(a.meta.daoYun);
  });

  it("目前狀態的目標清單依抽出順序", () => {
    const s = living(1, { goalIds: ["age_60", "raise_child"] });
    expect(goalStatuses(s, data).map((g) => g.def.id)).toEqual(["age_60", "raise_child"]);
  });
});

describe("每世目標：存檔 v12", () => {
  it("存檔往返相同，保留本世目標", () => {
    expect(SAVE_VERSION).toBe(15);
    const s = endLife(living(2, { goalIds: ["age_60"] }), "lifespan", data);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("v11 擲骰中的存檔會補上目標，進行中的存檔目標為空，並補上空的收藏欄位", () => {
    const strip = (state: object): Record<string, unknown> => {
      const o = JSON.parse(JSON.stringify(state)) as Record<string, any>;
      o.version = 11;
      delete o.goalIds;
      delete o.startFragments;
      delete o.meta.goals;
      delete o.meta.lastLife;
      return o;
    };
    const rolling = deserialize(JSON.stringify(strip(createInitialState(3))));
    expect(rolling.version).toBe(SAVE_VERSION);
    expect(rolling.goalIds.length).toBeGreaterThan(0);
    const livingState = deserialize(JSON.stringify(strip(living(3))));
    expect(livingState.goalIds).toEqual([]);
    expect(livingState.meta.goals).toEqual({});
    expect(livingState.meta.lastLife).toBeNull();
    // 舊回顧補上空的目標結果
    const dead = strip(endLife(living(3), "lifespan", data));
    delete (dead.review as Record<string, unknown>).goals;
    delete (dead.review as Record<string, unknown>).prev;
    const migrated = deserialize(JSON.stringify(dead));
    expect(migrated.review!.goals).toEqual([]);
    expect(migrated.review!.prev).toBeNull();
  });

  it("壞掉的目標欄位會指出位置", () => {
    const good = JSON.parse(serialize(living(4))) as Record<string, any>;
    expect(() => deserialize(JSON.stringify({ ...good, goalIds: ["ghost"] }))).toThrow("goalIds[0]");
    expect(() => deserialize(JSON.stringify({ ...good, meta: { ...good.meta, goals: { ghost: 1 } } }))).toThrow("meta.goals.ghost");
    expect(() => deserialize(JSON.stringify({ ...good, startFragments: -1 }))).toThrow("startFragments");
  });
});

describe("goals.json 格式檢查", () => {
  it("錯誤訊息指出哪一筆的哪個欄位", () => {
    const bad = (patch: object) => () => validateGoals([{ ...data.goals[0], ...patch }]);
    expect(bad({ condition: { kind: "teleport" } })).toThrow("condition");
    expect(bad({ condition: { kind: "age", years: 0 } })).toThrow("years");
    expect(bad({ minLives: -1 })).toThrow("minLives");
    expect(() => validateGoals([data.goals[0], data.goals[0]])).toThrow("重複");
  });
});

import { describe, expect, it } from "vitest";

import { chooseEvent, eventAvailable } from "../src/core/events";
import { availableFragments, CLEAR_FRAGMENT_ID, drawFragment, fragmentUnlocked, grantFragment } from "../src/core/fragments";
import { newLife } from "../src/core/life";
import { deserialize, importSave, serialize } from "../src/core/save";
import { emptyMeta, SAVE_VERSION, type GameState } from "../src/core/state";
import { gameData } from "../src/data/load";
import type { Effects, EventDef, GameData } from "../src/data/types";
import { validateEvents, validateFragments } from "../src/data/validate";
import { formatChanges } from "../src/ui/format";
import { living, seedWhere, attemptBreakthrough } from "./helpers";

const frags = gameData.fragments.items;
const tierOf = (id: string): number => frags.find((f) => f.id === id)!.tier;
const withMeta = (fragments: string[], reached: string[] = []) => ({ ...emptyMeta(), fragments, reached });

function fixedEvent(effects: Effects, patch: Partial<EventDef> = {}): EventDef {
  return {
    id: "fx",
    type: "choice",
    title: "fx",
    text: "測試。",
    weight: 10,
    tone: "neutral",
    maxPerLife: 1,
    conditions: {},
    choices: [{ text: "選", outcomes: [{ weight: 1, text: "結果。", effects }] }],
    ...patch,
  };
}
const dataWith = (events: EventDef[]): GameData => ({ ...gameData, events });
const pendingFx = (patch: Partial<GameState> = {}): GameState => ({
  ...living(1, patch),
  pendingEvent: "fx",
  ageMonths: 400,
});

describe("殘卷資料", () => {
  it("十四份，f14 是 fixed，「絕通」主題有立場相反的記載", () => {
    expect(frags).toHaveLength(14);
    expect(frags.filter((f) => f.fixed).map((f) => f.id)).toEqual([CLEAR_FRAGMENT_ID]);
    const stances = new Set(frags.filter((f) => f.topic === "juetong").map((f) => f.stance));
    expect(stances.size).toBeGreaterThanOrEqual(4);
    // 第一組互相矛盾的說法
    expect(frags.find((f) => f.id === "f01")!.stance).toBe("taiheng");
    expect(frags.find((f) => f.id === "f02")!.stance).toBe("yedu");
  });

  it("文字規則：每份不超過四行，不含阿拉伯數字", () => {
    for (const f of frags) {
      expect(f.text.split("\n").length, f.id).toBeLessThanOrEqual(4);
      expect(f.text, f.id).not.toMatch(/[0-9]/);
    }
  });

  it("格式錯誤時指出是哪一份的哪個欄位", () => {
    const good = JSON.parse(JSON.stringify(gameData.fragments));
    const bad = (patch: object) => () =>
      validateFragments({ ...good, items: [{ ...good.items[0], ...patch }, ...good.items.slice(1)] });
    expect(bad({ tier: 4 })).toThrow("f01");
    expect(bad({ tier: 4 })).toThrow("tier");
    expect(bad({ stance: "ghost" })).toThrow("stance");
    expect(bad({ topic: "ghost" })).toThrow("topic");
    expect(bad({ text: "" })).toThrow("text");
    expect(() => validateFragments({ ...good, items: [good.items[0], good.items[0]] })).toThrow("重複");
  });

  it("事件的殘卷效果與條件格式錯誤時指出欄位", () => {
    const withEffect = (fragment: unknown) => {
      const e = JSON.parse(JSON.stringify(gameData.events.find((x) => x.type === "choice")));
      e.choices[0].outcomes[0].effects.fragment = fragment;
      return e;
    };
    expect(() => validateEvents([withEffect({ id: "f01", maxTier: 1 })])).toThrow("fragment");
    expect(() => validateEvents([withEffect({ maxTier: 4 })])).toThrow("maxTier");
    const base = JSON.parse(JSON.stringify(gameData.events[0]));
    expect(() => validateEvents([{ ...base, conditions: { fragmentAvailable: 0 } }])).toThrow("fragmentAvailable");
  });
});

describe("事件擴充", () => {
  it("事件數 40 個，至少 10 個的某個結果會給殘卷，且每份殘卷都有取得的途徑", () => {
    expect(gameData.events.length).toBeGreaterThanOrEqual(70);
    const effectsOf = (e: EventDef): Effects[] => [
      ...(e.effects ? [e.effects] : []),
      ...(e.choices ?? []).flatMap((c) => c.outcomes.map((o) => o.effects)),
    ];
    const giving = gameData.events.filter((e) => effectsOf(e).some((x) => x.fragment));
    expect(giving.length).toBeGreaterThanOrEqual(10);
    // 指定 id 的殘卷固定可得；其餘靠 maxTier 抽取，只要有任何事件可抽三層就能涵蓋所有非 fixed 的殘卷
    const draws = giving.some((e) => effectsOf(e).some((x) => x.fragment && "maxTier" in x.fragment && x.fragment.maxTier === 3));
    expect(draws).toBe(true);
    // 給殘卷的事件都帶 fragmentAvailable，抽完之後不會再出現而白白占掉一次機會
    for (const e of giving.filter((x) => effectsOf(x).some((f) => f.fragment && "maxTier" in f.fragment))) {
      expect(e.conditions.fragmentAvailable, e.id).toBeDefined();
    }
  });

  it("chance：機率為 1 以下時只在亂數命中才給", () => {
    const rolls = (chance: number) => {
      const data = dataWith([fixedEvent({ fragment: { maxTier: 1, chance } })]);
      let hits = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const t = chooseEvent({ ...pendingFx({ rngSeed: seed }) }, 0, data);
        if (t.meta.fragments.length > 0) hits++;
      }
      return hits / 400;
    };
    expect(rolls(0.25)).toBeGreaterThan(0.18);
    expect(rolls(0.25)).toBeLessThan(0.32);
    expect(rolls(1)).toBe(1);
  });

  it("chance 格式：必須在 0 到 1 之間，且不能搭配指定 id", () => {
    const withEffect = (fragment: unknown) => {
      const e = JSON.parse(JSON.stringify(gameData.events.find((x) => x.type === "choice")));
      e.choices[0].outcomes[0].effects.fragment = fragment;
      return e;
    };
    expect(() => validateEvents([withEffect({ maxTier: 1, chance: 0 })])).toThrow("chance");
    expect(() => validateEvents([withEffect({ maxTier: 1, chance: 1.5 })])).toThrow("chance");
    expect(() => validateEvents([withEffect({ id: "f01", chance: 0.5 })])).toThrow("chance");
    expect(validateEvents([withEffect({ maxTier: 1, chance: 0.5 })])).toHaveLength(1);
  });
});

describe("解鎖與抽取", () => {
  it("一層隨時可得；二層需築基，三層需築基後期（本世進度也算）", () => {
    const s = living(1);
    expect(fragmentUnlocked(1, s)).toBe(true);
    expect(fragmentUnlocked(2, s)).toBe(false);
    expect(fragmentUnlocked(3, s)).toBe(false);
    expect(fragmentUnlocked(2, { ...s, realmId: "zhuji", stage: 0 })).toBe(true);
    expect(fragmentUnlocked(3, { ...s, realmId: "zhuji", stage: 1 })).toBe(false);
    expect(fragmentUnlocked(3, { ...s, realmId: "zhuji", stage: 2 })).toBe(true);
    // 之前的世達成過也算
    const old = living(1, { meta: withMeta([], ["zhuji:0", "zhuji:1", "zhuji:2"]) });
    expect(fragmentUnlocked(3, old)).toBe(true);
  });

  it("抽取池：未持有、已解鎖、非 fixed、層級不超過上限", () => {
    const s = living(1, { meta: withMeta(["f01"]) });
    const ids = availableFragments(s, 3).map((f) => f.id);
    expect(ids).not.toContain("f01");
    expect(ids).not.toContain(CLEAR_FRAGMENT_ID);
    expect(ids.every((id) => tierOf(id) === 1)).toBe(true);
    const zhuji = living(1, { realmId: "zhuji", stage: 2, meta: withMeta([]) });
    expect(availableFragments(zhuji, 2).every((f) => f.tier <= 2)).toBe(true);
    expect(availableFragments(zhuji, 3).some((f) => f.tier === 3)).toBe(true);
  });

  it("drawFragment：沒有可抽的就回傳 null 且不動亂數；同種子結果固定", () => {
    const all = frags.filter((f) => f.tier === 1).map((f) => f.id);
    const empty = living(1, { meta: withMeta(all) });
    expect(drawFragment(empty, 1)).toEqual([null, empty.rngSeed]);
    const s = living(7);
    expect(drawFragment(s, 1)[0]).toBe(drawFragment(s, 1)[0]);
    expect(drawFragment(s, 1)[1]).not.toBe(s.rngSeed);
  });

  it("grantFragment 不重複記入", () => {
    const s = grantFragment(living(1), "f03");
    expect(s.meta.fragments).toEqual(["f03"]);
    expect(grantFragment(s, "f03")).toBe(s);
  });
});

describe("事件給殘卷", () => {
  it("指定 id：入帳並在日誌標出變化；重複取得不記變化", () => {
    const data = dataWith([fixedEvent({ fragment: { id: "f02" } })]);
    const t = chooseEvent(pendingFx(), 0, data);
    expect(t.meta.fragments).toEqual(["f02"]);
    const entry = t.log[t.log.length - 1];
    expect(entry.changes?.fragment).toBe("f02");
    expect(formatChanges(entry.changes, gameData)).toEqual(["得殘卷《野渡口訣》"]);
    const again = chooseEvent(pendingFx({ meta: withMeta(["f02"]) }), 0, data);
    expect(again.meta.fragments).toEqual(["f02"]);
    expect(again.log[again.log.length - 1].changes).toBeUndefined();
  });

  it("maxTier：只抽已解鎖、未持有的，抽完之後再抽也不出錯", () => {
    const data = dataWith([fixedEvent({ fragment: { maxTier: 3 } })]);
    let s = pendingFx();
    for (let i = 0; i < 5; i++) s = chooseEvent({ ...s, pendingEvent: "fx" }, 0, data);
    expect(s.meta.fragments).toHaveLength(5);
    expect(s.meta.fragments.every((id) => tierOf(id) === 1)).toBe(true);
    expect(new Set(s.meta.fragments).size).toBe(5);
    const done = chooseEvent({ ...s, pendingEvent: "fx" }, 0, data);
    expect(done.meta.fragments).toHaveLength(5);
  });

  it("fragmentAvailable：抽得到才會出現", () => {
    const ev = fixedEvent({}, { conditions: { fragmentAvailable: 1 } });
    expect(eventAvailable(living(1), ev)).toBe(true);
    const tier1 = frags.filter((f) => f.tier === 1).map((f) => f.id);
    expect(eventAvailable(living(1, { meta: withMeta(tier1) }), ev)).toBe(false);
  });
});

describe("通關與保存", () => {
  it("首次通關固定得到 f14，轉世後仍保留", () => {
    const attrs = { bone: 5, insight: 50, fortune: 5, mind: 5 };
    const top = living(1, {
      realmId: "zhuji",
      stage: 2,
      cultivation: 1e6,
      attributes: attrs,
      rngSeed: seedWhere((v) => v < 0.25),
    });
    const won = attemptBreakthrough(top, false);
    expect(won.phase).toBe("cleared");
    expect(won.meta.fragments).toContain(CLEAR_FRAGMENT_ID);
    expect(newLife(won).meta.fragments).toEqual(won.meta.fragments);
  });

  it("殘卷跨世保留（死亡後轉世仍在）", () => {
    const dead = { ...living(1, { meta: withMeta(["f01", "f02"]) }), phase: "dead" as const };
    expect(newLife(dead).meta.fragments).toEqual(["f01", "f02"]);
  });

  it("存檔：保留殘卷；未知 id、重複、型別錯誤會指出欄位", () => {
    const s = living(1, { meta: withMeta(["f01", "f09"]) });
    expect(deserialize(serialize(s)).meta.fragments).toEqual(["f01", "f09"]);
    const good = JSON.parse(serialize(s));
    const bad = (fragments: unknown) => () =>
      deserialize(JSON.stringify({ ...good, meta: { ...good.meta, fragments } }));
    expect(bad(["ghost"])).toThrow("meta.fragments[0]");
    expect(bad(["f01", "f01"])).toThrow("重複");
    expect(bad("x")).toThrow("meta.fragments");
    expect(bad([1])).toThrow("meta.fragments[0]");
    expect(importSave(` ${serialize(s)} `).meta.fragments).toEqual(["f01", "f09"]);
  });

  it("v6 存檔遷移：殘卷為空，其餘跨世資料原樣保留", () => {
    const cur = living(3, { meta: { ...emptyMeta(), daoYun: 9, lives: 2 } });
    const meta: Record<string, unknown> = { ...cur.meta };
    delete meta.fragments;
    const s = deserialize(JSON.stringify({ ...cur, version: 6, meta }));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.fragments).toEqual([]);
    expect(s.meta.daoYun).toBe(9);
    expect(s.meta.lives).toBe(2);
  });

  it("日誌的殘卷變化可存可讀", () => {
    const s = living(1, {
      log: [{ month: 130, kind: "event", realmId: "lianqi", stage: 0, eventId: "rain_001", changes: { fragment: "f03" } }],
    });
    expect(deserialize(serialize(s)).log[0].changes?.fragment).toBe("f03");
  });
});

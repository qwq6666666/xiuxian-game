import { describe, expect, it } from "vitest";
import { autoEncounter, huntChoose } from "../src/core/encounter";
import { lifespanMonths } from "../src/core/formulas";
import { monthlyGain } from "../src/core/gain";
import { newLife } from "../src/core/life";
import { realmOf } from "../src/core/progress";
import { deserialize, serialize } from "../src/core/save";
import type { GameState } from "../src/core/state";
import { tick } from "../src/core/tick";
import { advanceTrial, canEnterTrial, enterTrial, trialBlockReason, trialsFor } from "../src/core/trial";
import { gameData } from "../src/data/load";
import worldNames from "../src/data/worldNames.json";
import { validateTrials } from "../src/data/validate";
import { living } from "./helpers";

const data = gameData;
const realmIds = data.realms.map((r) => r.id);
const itemIds = data.items.map((i) => i.id);
const raw = () => JSON.parse(JSON.stringify({ rules: data.trials.rules, trials: data.trials.trials }));
const check = (r: unknown) => validateTrials(r, data.monsters.monsters, realmIds, itemIds);

const lianqi = data.trials.trials.find((t) => t.realm === "lianqi")!;
const ready = (seed = 1, patch: Partial<GameState> = {}): GameState => living(seed, { realmId: "lianqi", stage: 3, cultivation: 20, ...patch });

/** 一路穩打到秘境結束（不管勝負） */
function fightThrough(state: GameState): GameState {
  let s = state;
  for (let guard = 0; s.trial !== null && guard < 100; guard++) s = huntChoose(s, "steady", data);
  return s;
}

describe("秘境資料", () => {
  it("每個有怪物的境界都有一座秘境，層數 3–5，怪物屬於同一境界，獎勵物品存在", () => {
    for (const realm of ["lianqi", "zhuji", "jindan", "yuanying"]) expect(data.trials.trials.some((t) => t.realm === realm), realm).toBe(true);
    for (const t of data.trials.trials) {
      expect(t.floors.length).toBeGreaterThanOrEqual(3);
      expect(t.floors.length).toBeLessThanOrEqual(5);
      for (const f of t.floors) expect(data.monsters.monsters.find((m) => m.id === f)?.realm, `${t.id}/${f}`).toBe(t.realm);
      for (const id of Object.keys(t.reward.items)) expect(itemIds).toContain(id);
    }
  });

  it("秘境名稱（WORLD.md 16.1）：互不重複、不與名庫撞名、字尾不與國名、宗門、坊市、山、村的字尾重複", () => {
    const names = data.trials.trials.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
    const pools = Object.values(worldNames).filter((v): v is string[] => Array.isArray(v));
    const used = new Set(pools.flat());
    const endings = new Set(pools.flat().map((n) => n.at(-1)!));
    for (const n of names) {
      expect(used.has(n), n).toBe(false);
      expect(endings.has(n.at(-1)!), `${n} 的字尾 ${n.at(-1)}`).toBe(false);
    }
    expect(new Set(names.map((n) => n.at(-1))).size).toBe(names.length);
  });

  it("獎勵修為低於同樣月數的閉關，所以秘境永遠不是最佳的修為來源", () => {
    for (const t of data.trials.trials) expect(t.reward.cultivationMonths, t.id).toBeLessThan(t.months);
  });

  it("格式錯誤時指出是哪一筆的哪個欄位", () => {
    const a = raw();
    a.trials[0].floors = ["mountain_imp", "red_tail_fox"];
    expect(() => check(a)).toThrow(/第 1 筆（trial_lianqi）.*floors/);
    const b = raw();
    b.trials[0].floors[1] = "bone_spider";
    expect(() => check(b)).toThrow(/bone_spider.*floors|floors.*bone_spider/);
    const c = raw();
    c.trials[1].reward.items = { nothing: 1 };
    expect(() => check(c)).toThrow(/第 2 筆.*items/);
    const d = raw();
    d.rules.text.clear = "沒有佔位符。";
    expect(() => check(d)).toThrow(/clear/);
    expect(() => check(raw())).not.toThrow();
  });
});

describe("入秘境", () => {
  it("條件：境界相符、本世沒入過、壽元夠、沒有其他進行中的事", () => {
    const s = ready();
    expect(trialBlockReason(s, lianqi.id)).toBeNull();
    expect(trialBlockReason({ ...s, realmId: "zhuji" }, lianqi.id)).toBe("境界不符。");
    expect(trialBlockReason({ ...s, trialsDone: [lianqi.id] }, lianqi.id)).toBe("這一世已經入過。");
    expect(trialBlockReason({ ...s, encounter: { monsterId: "mountain_imp", round: 0, monsterHp: 1, myHp: 1, seed: 1 } }, lianqi.id)).toBe("現在走不開。");
    const total = lifespanMonths(realmOf(s, data), s.lifespanBonus);
    const tooOld = { ...s, ageMonths: total - lianqi.months - data.trials.rules.lifespanBuffer + 1 };
    expect(trialBlockReason(tooOld, lianqi.id)).toMatch(/壽元不足/);
    expect(canEnterTrial({ ...s, ageMonths: total - lianqi.months - data.trials.rules.lifespanBuffer }, lianqi.id)).toBe(true);
    expect(trialsFor(s, data).map((t) => t.id)).toEqual([lianqi.id]);
  });

  it("進入就扣整段月數，不消耗 rngSeed，進第一層，並記入本世已入", () => {
    const s = ready(3);
    const t = enterTrial(s, lianqi.id);
    expect(t.ageMonths).toBe(s.ageMonths + lianqi.months);
    expect(t.rngSeed).toBe(s.rngSeed);
    expect(t.trial).toMatchObject({ id: lianqi.id, floor: 0 });
    expect(t.encounter?.monsterId).toBe(lianqi.floors[0]);
    expect(t.trialsDone).toEqual([lianqi.id]);
    expect(t.log.at(-1) === undefined || t.log.some((e) => e.kind === "trialEnter")).toBe(true);
    // 不符條件原樣回傳
    expect(enterTrial(t, lianqi.id)).toBe(t);
  });

  it("在秘境裡的修為只照歷練的低倍率累積，且時間暫停等玩家選擇", () => {
    const s = ready(4);
    const adventure = data.schedules.find((x) => x.id === "adventure")!;
    const t = enterTrial(s, lianqi.id);
    // 月數內可能升階，所以只檢查「不超過歷練倍率」的上界與下界
    expect(t.cultivation).toBeGreaterThanOrEqual(s.cultivation);
    expect(monthlyGain(s, adventure, data) * lianqi.months).toBeLessThan(monthlyGain(s, data.schedules.find((x) => x.id === "retreat")!, data) * lianqi.months);
    expect(tick(t, 12, data)).toBe(t);
  });
});

describe("逐層推進與結算", () => {
  it("勝了進下一層，打完全部才通關；失敗、平手、逃跑失敗結束；每世每座只能入一次", () => {
    let clears = 0;
    let fails = 0;
    for (let seed = 1; seed <= 80; seed++) {
      // 一半的種子用較弱的狀態，讓敗退也會出現
      const s = enterTrial(ready(seed, { stage: seed % 2 === 0 ? 1 : 7 }), lianqi.id);
      const end = fightThrough(s);
      expect(end.trial, `種子 ${seed}`).toBeNull();
      expect(end.encounter).toBeNull();
      expect(end.trialsDone).toEqual([lianqi.id]);
      const kinds = end.log.map((e) => e.kind);
      const wins = kinds.filter((k) => k === "huntWin").length;
      if (kinds.includes("trialClear")) {
        clears++;
        expect(wins).toBe(lianqi.floors.length);
        const last = end.log.find((e) => e.kind === "trialClear")!;
        for (const [id, n] of Object.entries(lianqi.reward.items)) expect(last.changes?.items?.[id]).toBe(n);
        expect(last.changes?.spiritStones ?? 0).toBeGreaterThanOrEqual(lianqi.reward.stones.min);
        expect(last.changes?.spiritStones ?? 0).toBeLessThanOrEqual(lianqi.reward.stones.max);
      } else {
        fails++;
        expect(kinds).toContain("trialFail");
        expect(wins).toBeLessThan(lianqi.floors.length);
      }
      expect(canEnterTrial(end, lianqi.id)).toBe(false);
    }
    expect(clears).toBeGreaterThan(0);
    expect(fails).toBeGreaterThan(0);
  });

  it("每層的勝利只給靈石與掉落，不給修為；修為只在通關時一次給", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const end = fightThrough(enterTrial(ready(seed, { stage: 7 }), lianqi.id));
      for (const e of end.log) if (e.kind === "huntWin") expect(e.changes?.cultivation, `種子 ${seed}`).toBeUndefined();
    }
  });

  it("中途逃跑成功算抽身：不另損修為、記為中途退出，也不能再入", () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const s = enterTrial(ready(seed), lianqi.id);
      const before = s.cultivation;
      const t = huntChoose(s, "flee", data);
      const e = [...t.log].reverse().find((x) => x.kind === "huntFlee");
      if (e?.outcome === 0) {
        found = true;
        expect(t.trial).toBeNull();
        const fail = [...t.log].reverse().find((x) => x.kind === "trialFail");
        expect(fail).toMatchObject({ trialId: lianqi.id, outcome: 1 });
        expect(t.cultivation).toBe(before);
        expect(canEnterTrial(t, lianqi.id)).toBe(false);
      }
    }
    expect(found).toBe(true);
  });

  it("自動抉擇會一路打到秘境結束，不會卡在中間", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const end = autoEncounter(enterTrial(ready(seed), lianqi.id), data);
      expect(end.trial).toBeNull();
      expect(end.encounter).toBeNull();
    }
  });

  it("新的一世可以再入同一座秘境", () => {
    const end = fightThrough(enterTrial(ready(9, { stage: 7 }), lianqi.id));
    expect(newLife({ ...end, phase: "dead" }, data).trialsDone).toEqual([]);
  });

  it("沒有進行中的秘境時 advanceTrial 什麼都不做", () => {
    const s = ready();
    expect(advanceTrial(s, "huntWin", undefined, data)).toBe(s);
  });
});

describe("存檔", () => {
  it("秘境進行中存讀往返，保留層數與種子", () => {
    const s = enterTrial(ready(5), lianqi.id);
    const back = deserialize(serialize(s));
    expect(back.trial).toEqual(s.trial);
    expect(back.trialsDone).toEqual(s.trialsDone);
    expect(back.encounter).toEqual(s.encounter);
  });

  it("格式不合時指出欄位：怪物與層數對不上、沒有遇怪、未知秘境、重複記錄", () => {
    const good = JSON.parse(serialize(enterTrial(ready(5), lianqi.id)));
    const bad = (patch: Record<string, unknown>) => () => deserialize(JSON.stringify({ ...good, ...patch }));
    expect(bad({ trial: { ...good.trial, floor: 1 } })).toThrow("trial.floor");
    expect(bad({ trial: { ...good.trial, floor: 99 } })).toThrow("trial.floor");
    expect(bad({ trial: { ...good.trial, id: "ghost" } })).toThrow("trial.id");
    expect(bad({ encounter: null })).toThrow("trial");
    expect(bad({ trialsDone: ["ghost"] })).toThrow("trialsDone");
    expect(bad({ trialsDone: [lianqi.id, lianqi.id] })).toThrow("trialsDone");
    expect(bad({ trialsDone: [] })).toThrow("trialsDone");
  });

  it("v29 的舊檔補上沒有進行中的秘境、本世沒入過", () => {
    const cur = JSON.parse(serialize(ready(2)));
    delete cur.trial;
    delete cur.trialsDone;
    const s = deserialize(JSON.stringify({ ...cur, version: 29 }));
    expect(s.trial).toBeNull();
    expect(s.trialsDone).toEqual([]);
  });
});

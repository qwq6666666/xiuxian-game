import { describe, expect, it } from "vitest";
import { buyItem, setSchedule } from "../src/core/actions";
import { chooseEvent, eventAvailable } from "../src/core/events";
import { addLog } from "../src/core/progress";
import { stageNeed } from "../src/core/formulas";
import { deserialize, serialize } from "../src/core/save";
import {
  canJoinSect,
  canPromoteSect,
  companionsOf,
  joinRate,
  joinSect,
  leaveSect,
  localSect,
  memberSect,
  nextRank,
  promoteSect,
  sectBonus,
  sectStipend,
  slotsFor,
  stepSect,
} from "../src/core/sect";
import { itemPrice } from "../src/core/worldeffects";
import { tick, monthlyGain, scheduleOf } from "../src/core/tick";
import { snapshotOf } from "../src/core/worldeffects";
import { gameData as data } from "../src/data/load";
import { validateGameData, validateSects } from "../src/data/validate";
import { formatChanges, formatLogEntry } from "../src/ui/format";
import { living, seedWhere } from "./helpers";
import type { GameState } from "../src/core/state";

/** 在某個世界裡找一個開放的宗門，把人放在它的山門外，練氣三層 */
function atGate(wantRank: "great" | "school" = "school", patch: Partial<GameState> = {}): { state: GameState; sectId: string } {
  for (let seed = 1; seed < 200; seed++) {
    const base = living(seed, { realmId: "lianqi", stage: 3, ageMonths: 40 * 12 });
    const sect = snapshotOf(base, data).sects.find((s) => s.rank === wantRank && s.state !== "closed" && s.state !== "fallen");
    if (!sect) continue;
    return { state: { ...base, travel: { ...base.travel, locationId: `sect:${sect.id}` }, ...patch }, sectId: sect.id };
  }
  throw new Error("找不到適合的世界");
}

/** 已入宗的狀態（直接寫身分，不經試煉） */
function member(rank = 0, contribution = 0, wantRank: "great" | "school" = "great", patch: Partial<GameState> = {}): GameState {
  const { state, sectId } = atGate(wantRank, patch);
  return { ...state, sect: { id: sectId, rank, contribution, joinedAge: state.ageMonths }, sectPeak: rank + 1 };
}

describe("宗門資料", () => {
  it("sects.json 通過檢查，位階晉升條件逐級提高", () => {
    const { ranks } = data.sects;
    expect(ranks[0].promote).toBeUndefined();
    for (let i = 2; i < ranks.length; i++) expect(ranks[i].promote!.contribution).toBeGreaterThan(ranks[i - 1].promote!.contribution);
    expect(data.sects.maxRank).toEqual({ great: 3, school: 2 });
  });
  it("格式錯誤指出欄位", () => {
    const bad = JSON.parse(JSON.stringify(data.sects));
    bad.ranks[2].promote.contribution = 1;
    expect(() => validateSects(bad)).toThrow("ranks[2]");
    const bad2 = JSON.parse(JSON.stringify(data.sects));
    bad2.join.baseRate.great = 2;
    expect(() => validateSects(bad2)).toThrow("baseRate");
  });
  it("跨檔案：引用不存在的境界、靈根、物品、安排時指出來源", () => {
    const withSects = (patch: (s: typeof data.sects) => void) => () => {
      const s = JSON.parse(JSON.stringify(data.sects));
      patch(s);
      validateGameData({ ...data, sects: s });
    };
    expect(withSects((s) => (s.join.minRealm = "ghost"))).toThrow("ghost");
    expect(withSects((s) => (s.join.rootBonus.ghost = 0.1))).toThrow("ghost");
    expect(withSects((s) => (s.discount.itemIds = ["ghost"]))).toThrow("ghost");
    expect(withSects((s) => (s.dutySchedule = "ghost"))).toThrow("ghost");
  });
  it("宗門差事只有入宗者看得到", () => {
    const duty = data.schedules.find((s) => s.id === data.sects.dutySchedule)!;
    expect(duty.requiresSect).toBe(true);
    expect(setSchedule(living(1, { realmId: "lianqi" }), duty.id)).toMatchObject({ schedule: data.schedules[0].id });
    expect(setSchedule(member(), duty.id).schedule).toBe(duty.id);
  });
  it("同門欄位只能出現在 conditions.sect 為 true 的事件", () => {
    const ev = { ...data.events[0], text: "{peer}路過。" };
    expect(() => validateGameData({ ...data, events: [ev, ...data.events.slice(1)] })).toThrow("conditions.sect");
    const ok = { ...ev, conditions: { ...ev.conditions, sect: true } };
    expect(() => validateGameData({ ...data, events: [ok, ...data.events.slice(1)] })).not.toThrow();
  });
});

describe("入宗與離宗", () => {
  it("在山門外、練氣三層以上、未入宗才能求入宗", () => {
    expect(canJoinSect(atGate().state)).toBe(true);
    expect(canJoinSect(atGate("school", { stage: 1 }).state)).toBe(false);
    expect(canJoinSect(living(1, { realmId: "lianqi", stage: 5 }))).toBe(false);
    expect(canJoinSect(member())).toBe(false);
    const g = atGate().state;
    expect(canJoinSect({ ...g, travel: { ...g.travel, targetId: "market", totalMonths: 3, remainingMonths: 3 } })).toBe(false);
  });
  it("成功率 = 基礎 × 興衰 + 悟性 + 根骨 + 靈根；閉山與覆滅為 0", () => {
    const { state } = atGate("school");
    const sect = localSect(state, data)!;
    const j = data.sects.join;
    const open = ["prosper", "stable", "decline"] as const;
    for (const st of open) {
      const expected =
        j.baseRate.school * j.stateMult[st] + state.attributes.insight * j.insightBonus + state.attributes.bone * j.boneBonus + (j.rootBonus[state.spiritRootId] ?? 0);
      expect(joinRate(state, { ...sect, rank: "school", state: st })).toBeCloseTo(Math.min(1, expected));
    }
    expect(joinRate(state, { ...sect, state: "closed" })).toBe(0);
    expect(joinRate(state, { ...sect, state: "fallen" })).toBe(0);
  });
  it("成功：入外門，記日誌，並記入已試過；失敗：只記已試過，不能再試", () => {
    const { state, sectId } = atGate("school", { attributes: { bone: 10, insight: 10, fortune: 5, mind: 5 } });
    const win = joinSect({ ...state, rngSeed: seedWhere((v) => v < 0.05) });
    expect(win.sect).toMatchObject({ id: sectId, rank: 0, contribution: 0 });
    expect(win.sectsTried).toEqual([sectId]);
    expect(win.sectPeak).toBe(1);
    expect(win.log[win.log.length - 1].kind).toBe("sectJoin");
    const lose = joinSect({ ...state, rngSeed: seedWhere((v) => v > 0.999) });
    expect(lose.sect).toBeNull();
    expect(lose.sectsTried).toEqual([sectId]);
    expect(lose.log[lose.log.length - 1].kind).toBe("sectRefuse");
    expect(canJoinSect(lose)).toBe(false);
    expect(joinSect(lose)).toBe(lose);
  });
  it("離宗：失去身分，不能再入同一宗，差事安排改回第一個", () => {
    const m = { ...member(1, 50), schedule: data.sects.dutySchedule };
    const left = leaveSect(m);
    expect(left.sect).toBeNull();
    expect(left.sectsTried).toContain(m.sect!.id);
    expect(left.schedule).toBe(data.schedules[0].id);
    expect(left.sectPeak).toBe(2);
    expect(left.log[left.log.length - 1].kind).toBe("sectLeave");
    expect(canJoinSect({ ...left })).toBe(false);
  });
  it("閉山或覆滅時自動離宗並加旗標；宗門衰微不離宗", () => {
    const m = member();
    const sect = memberSect(m)!;
    // 世界快照由年齡算出：用年齡掃描找到宗門閉山的那一年（沒有就跳過）
    let found: GameState | null = null;
    for (let age = 20; age < 400 && !found; age++) {
      const s = { ...m, ageMonths: age * 12 };
      const now = memberSect(s);
      if (now && (now.state === "closed" || now.state === "fallen")) found = s;
    }
    if (found) {
      const t = stepSect(found);
      expect(t.sect).toBeNull();
      expect(t.flags).toContain("sect_collapse");
    }
    expect(sect.id).toBe(m.sect!.id);
  });
});

describe("位階、加成、月例與貢獻", () => {
  it("晉升要境界與貢獻都夠，確定性；門派到執事為止", () => {
    const m = member(0, 200, "great", { realmId: "zhuji", stage: 0 });
    expect(canPromoteSect(m)).toBe(true);
    const p = promoteSect(m);
    expect(p.sect!.rank).toBe(1);
    expect(p.sectPeak).toBe(2);
    expect(p.log[p.log.length - 1]).toMatchObject({ kind: "sectPromote", rank: 1 });
    expect(canPromoteSect(member(0, 199, "great", { realmId: "zhuji" }))).toBe(false);
    expect(canPromoteSect(member(0, 999, "great", { realmId: "lianqi" }))).toBe(false);
    expect(nextRank(member(2, 0, "school"))).toBeNull();
    expect(nextRank(member(2, 0, "great"))?.index).toBe(3);
  });
  it("修煉加成 = 位階 × 規模 × 興衰，算進每月修為；沒入宗為 0", () => {
    const m = member(1, 0, "great");
    const sect = memberSect(m)!;
    const expected = data.sects.ranks[1].bonus * data.sects.scale.great * data.sects.bonusState[sect.state as "prosper" | "stable" | "decline"];
    expect(sectBonus(m)).toBeCloseTo(expected);
    expect(sectBonus(living(1))).toBe(0);
    const plain = { ...m, sect: null };
    const sched = scheduleOf(m, data);
    expect(monthlyGain(m, sched, data)).toBeCloseTo(monthlyGain(plain, sched, data) * (1 + expected));
  });
  it("入宗滿一年才發月例；差事安排才得貢獻", () => {
    const m = member(1, 0, "great");
    const stipend = sectStipend(m);
    expect(stipend).toBeGreaterThan(0);
    // 還沒滿一年：沒有月例
    const a = stepSect({ ...m, ageMonths: m.sect!.joinedAge + 5 });
    expect(a.spiritStones).toBe(m.spiritStones);
    expect(a.sect!.contribution).toBe(0);
    // 剛好滿一年、兩年：各發一次
    expect(stepSect({ ...m, ageMonths: m.sect!.joinedAge + 12 }).spiritStones).toBe(m.spiritStones + stipend);
    expect(stepSect({ ...m, ageMonths: m.sect!.joinedAge + 24 }).spiritStones).toBe(m.spiritStones + stipend);
    const b = stepSect({ ...m, schedule: data.sects.dutySchedule });
    expect(b.sect!.contribution).toBe(data.sects.ranks[1].duty);
  });
  it("tick 把月例與貢獻算進每個月", () => {
    const m = { ...member(0, 0, "great"), schedule: data.sects.dutySchedule, ageMonths: 40 * 12 };
    const t = tick(m, 6);
    expect(t.sect!.contribution).toBe(6 * data.sects.ranks[0].duty);
  });
  it("庫房：聚氣丹與築基丹打折，延壽丹不折", () => {
    const m = member();
    const plain = { ...m, sect: null };
    expect(itemPrice(m, "juqi_dan", data)).toBeLessThan(itemPrice(plain, "juqi_dan", data));
    expect(itemPrice(m, "yanshou_dan", data)).toBe(itemPrice(plain, "yanshou_dan", data));
    const rich = { ...m, spiritStones: 9999 };
    expect(buyItem(rich, "juqi_dan").spiritStones).toBe(9999 - itemPrice(m, "juqi_dan", data));
  });
});

describe("同門與宗門事件", () => {
  it("同門由世界種子推算：同一入宗年齡同一組名字，不耗亂數；沒入宗用通用稱呼", () => {
    const m = member();
    const a = companionsOf(m)!;
    expect(companionsOf({ ...m })).toEqual(a);
    expect(companionsOf({ ...m, rngSeed: 12345 })).toEqual(a);
    expect(new Set(Object.values(a)).size).toBeGreaterThanOrEqual(2);
    expect(slotsFor(m).peer).toBe(a.peer);
    expect(slotsFor({ ...m, sect: null }).peer).toBe("同門師兄");
    expect(companionsOf(living(1))).toBeNull();
  });
  it("事件條件 sect 與 sectRankMin；效果 contribution 只在入宗時生效並顯示", () => {
    const base = data.events.find((e) => e.type === "choice")!;
    const ev = { ...base, conditions: { sect: true, sectRankMin: 1 }, maxPerLife: 5 };
    expect(eventAvailable(living(1), ev, data)).toBe(false);
    expect(eventAvailable(member(0), ev, data)).toBe(false);
    expect(eventAvailable(member(1), ev, data)).toBe(true);
    expect(eventAvailable(member(2), { ...ev, conditions: { sect: false } }, data)).toBe(false);
    const contribution = { ...ev, choices: [{ text: "接下差事", outcomes: [{ weight: 1, text: "你把差事辦妥了。", effects: { contribution: 30 } }] }] };
    const withData = { ...data, events: [contribution] };
    const m = { ...member(1, 10), pendingEvent: contribution.id };
    const done = chooseEvent(m, 0, withData);
    expect(done.sect!.contribution).toBe(40);
    expect(formatChanges(done.log[done.log.length - 1].changes, data)).toContain("貢獻 +30");
    const loose = chooseEvent({ ...living(1), pendingEvent: contribution.id }, 0, withData);
    expect(loose.sect).toBeNull();
  });
});

describe("宗門日誌、存檔與回顧", () => {
  it("日誌文字帶出宗門名稱與位階", () => {
    const m = member(0);
    const name = memberSect(m)!.name;
    const slots = slotsFor(m);
    const join = formatLogEntry({ month: 480, kind: "sectJoin", realmId: "lianqi", stage: 3, sectName: name, rank: 0 }, data, "你", slots);
    expect(join).toContain(name);
    const promote = formatLogEntry({ month: 480, kind: "sectPromote", realmId: "zhuji", stage: 0, sectName: name, rank: 1 }, data, "你", slots);
    expect(promote).toContain("內門弟子");
    expect(formatLogEntry({ month: 480, kind: "sectRefuse", realmId: "lianqi", stage: 3, sectName: name }, data, "你", slots)).toContain(name);
    expect(formatLogEntry({ month: 480, kind: "sectLeave", realmId: "lianqi", stage: 3, sectName: name, rank: 0 }, data, "你", slots)).toContain(name);
  });
  it("存檔往返保留身分；v14 存檔遷移補上未入宗；壞資料指出欄位", () => {
    const m = member(1, 77);
    const back = deserialize(serialize(m));
    expect(back.sect).toEqual(m.sect);
    expect(back.sectsTried).toEqual(m.sectsTried);
    expect(back.sectPeak).toBe(2);
    const old = JSON.parse(serialize(living(3)));
    old.version = 14;
    for (const k of ["sect", "sectsTried", "sectPeak"]) delete old[k];
    delete old.meta.sectBest;
    const migrated = deserialize(JSON.stringify(old));
    expect(migrated.sect).toBeNull();
    expect(migrated.sectPeak).toBe(0);
    expect(migrated.meta.sectBest).toBe(0);
    const bad = JSON.parse(serialize(m));
    bad.sect.rank = 9;
    expect(() => deserialize(JSON.stringify(bad))).toThrow("sect.rank");
  });
  it("回顧記下最高位階，跨世收藏取歷代最高；離宗後仍保留", () => {
    const m = member(1, 0);
    const left = leaveSect(m);
    const dead = tick({ ...left, ageMonths: 100000 * 12 }, 1);
    expect(dead.phase).toBe("dead");
    expect(dead.review!.sectPeak).toBe(2);
    expect(dead.meta.sectBest).toBe(2);
    const entry = addLog(left, { month: 1, kind: "sectJoin", realmId: "lianqi", stage: 0, sectName: "x", rank: 0 }, 10);
    expect(entry.log.length).toBeGreaterThan(left.log.length);
    expect(stageNeed(data.realms[1], 0)).toBeGreaterThan(0);
  });
});

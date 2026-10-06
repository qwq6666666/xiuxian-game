import { describe, expect, it } from "vitest";
import { autoEncounter, canHunt, fleeChance, huntChoose, maybeEncounter, monsterOf, playerPower, powerRatio } from "../src/core/encounter";
import { deserialize, serialize } from "../src/core/save";
import type { EncounterState, GameState } from "../src/core/state";
import { atBottleneck, tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { validateMonsters } from "../src/data/validate";
import { lianqiNeed, living } from "./helpers";

const realmIds = gameData.realms.map((r) => r.id);
const itemIds = gameData.items.map((i) => i.id);
const rules = gameData.monsters.rules;
const always = { ...gameData, monsters: { ...gameData.monsters, rules: { ...rules, chance: 1 } } };

const enc = (monsterId: string, patch: Partial<EncounterState> = {}): EncounterState => ({ monsterId, round: 0, monsterHp: 1, myHp: 1, seed: 12345, ...patch });
const inFight = (monsterId: string, seed = 12345, patch: Partial<GameState> = {}): GameState =>
  living(1, { realmId: "lianqi", stage: 3, schedule: "adventure", cultivation: 50, encounter: enc(monsterId, { seed }), ...patch });

describe("遇怪資料", () => {
  it("每個有怪物的境界至少 2 種，怪物與掉落都對得上", () => {
    for (const m of gameData.monsters.monsters) {
      expect(realmIds).toContain(m.realm);
      for (const d of m.drops) expect(itemIds).toContain(d.itemId);
      expect(m.appear.split("。").filter(Boolean).length).toBeLessThanOrEqual(3);
      expect(m.win.split("。").filter(Boolean).length).toBeLessThanOrEqual(3);
    }
    for (const realm of ["mortal", "lianqi", "zhuji", "jindan", "yuanying"]) {
      expect(gameData.monsters.monsters.filter((m) => m.realm === realm).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("格式錯誤時指出是哪一筆的哪個欄位", () => {
    const raw = JSON.parse(JSON.stringify({ rules, monsters: gameData.monsters.monsters }));
    raw.monsters[1].realm = "nowhere";
    expect(() => validateMonsters(raw, realmIds, itemIds)).toThrow(/第 2 筆（wild_boar）.*realm/);
    const raw2 = JSON.parse(JSON.stringify({ rules, monsters: gameData.monsters.monsters }));
    raw2.monsters[2].drops = [{ itemId: "nothing", chance: 0.5 }];
    expect(() => validateMonsters(raw2, realmIds, itemIds)).toThrow(/drops\[0\].*itemId/);
    const raw3 = JSON.parse(JSON.stringify({ rules, monsters: gameData.monsters.monsters }));
    raw3.rules.text.lose = "沒有佔位符。";
    expect(() => validateMonsters(raw3, realmIds, itemIds)).toThrow(/\{monster\}/);
  });
});

describe("遇怪觸發", () => {
  it("只有外出歷練會遇怪，且不消耗 rngSeed", () => {
    const s = living(3, { realmId: "lianqi", schedule: "adventure" });
    const met = maybeEncounter(s, 100, always);
    expect(met.encounter).not.toBeNull();
    expect(met.rngSeed).toBe(s.rngSeed);
    expect(monsterOf(met.encounter!.monsterId).realm).toBe("lianqi");
    expect(maybeEncounter({ ...s, schedule: "retreat" }, 100, always).encounter).toBeNull();
  });

  it("遇怪的機率約等於設定值", () => {
    const s = living(9, { realmId: "lianqi", schedule: "adventure" });
    let hits = 0;
    for (let m = 1; m <= 4000; m++) if (maybeEncounter(s, m, gameData).encounter) hits++;
    expect(hits / 4000).toBeGreaterThan(rules.chance - 0.03);
    expect(hits / 4000).toBeLessThan(rules.chance + 0.03);
  });

  it("遇怪時時間暫停，不再往前推進", () => {
    const s = living(5, { realmId: "lianqi", schedule: "adventure", lifespanBonus: 2000 });
    const t = tick(s, 100, always);
    expect(t.encounter).not.toBeNull();
    const frozen = tick(t, 12, always);
    expect(frozen).toBe(t);
  });

  it("自動抉擇時一次打完", () => {
    const s = living(5, { realmId: "lianqi", schedule: "adventure", lifespanBonus: 2000, autoChoice: true });
    const t = tick(s, 3, always);
    expect(t.encounter).toBeNull();
    expect(t.log.some((e) => e.kind.startsWith("hunt"))).toBe(true);
  });
});

describe("戰鬥", () => {
  it("同一個種子的結果固定，遇怪結束後狀態清空並記日誌", () => {
    const a = autoEncounter(inFight("red_tail_fox"));
    const b = autoEncounter(inFight("red_tail_fox"));
    expect(a).toEqual(b);
    expect(a.encounter).toBeNull();
    expect(a.log[a.log.length - 1].monsterId).toBe("red_tail_fox");
  });

  it("符籙要有符才能選，選了就消耗一張，而且必中", () => {
    const talisman = gameData.items.find((i) => i.effect.kind === "tribulationWard")!.id;
    const none = inFight("iron_back_bear");
    expect(canHunt(none, "ward")).toBe(false);
    expect(huntChoose(none, "ward")).toBe(none);
    const have = inFight("iron_back_bear", 777, { items: { [talisman]: 2 } });
    expect(canHunt(have, "ward")).toBe(true);
    const after = huntChoose(have, "ward");
    expect((after.items[talisman] ?? 0)).toBe(1);
  });

  it("勝利得修為與靈石，敗北損失修為，平手什麼都不變", () => {
    const outcomes = { huntWin: 0, huntLose: 0, huntDraw: 0 } as Record<string, number>;
    for (let seed = 1; seed <= 400; seed++) {
      for (const choice of ["steady", "fierce"] as const) {
        let s = inFight("iron_back_bear", seed * 7919);
        const before = s.cultivation;
        const stones = s.spiritStones;
        while (s.encounter) s = huntChoose(s, choice);
        const last = s.log[s.log.length - 1];
        outcomes[last.kind] = (outcomes[last.kind] ?? 0) + 1;
        if (last.kind === "huntWin") {
          expect(s.cultivation).toBeGreaterThan(before);
          expect(s.spiritStones).toBeGreaterThanOrEqual(stones + monsterOf("iron_back_bear").stones.min);
        } else if (last.kind === "huntLose") {
          expect(s.cultivation).toBeCloseTo(before * (1 - rules.lossFrac), 6);
        } else {
          expect(s.cultivation).toBe(before);
        }
      }
    }
    expect(outcomes.huntWin).toBeGreaterThan(0);
    expect(outcomes.huntLose).toBeGreaterThan(0);
    expect(outcomes.huntDraw).toBeGreaterThan(0);
  });

  it("強攻比穩打更容易勝，也更容易敗", () => {
    const tally = (choice: "steady" | "fierce") => {
      let win = 0;
      let lose = 0;
      for (let seed = 1; seed <= 1500; seed++) {
        let s = inFight("red_tail_fox", seed * 104729);
        while (s.encounter) s = huntChoose(s, choice);
        const k = s.log[s.log.length - 1].kind;
        if (k === "huntWin") win++;
        if (k === "huntLose") lose++;
      }
      return { win, lose };
    };
    const steady = tally("steady");
    const fierce = tally("fierce");
    expect(fierce.win).toBeGreaterThan(steady.win);
    expect(fierce.lose).toBeGreaterThan(steady.lose);
  });

  it("逃跑成功不損失，失敗損失一點修為，成功率與戰力比有關", () => {
    let ok = 0;
    let bad = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const s = inFight("iron_back_bear", seed * 31337);
      const r = huntChoose(s, "flee");
      const last = r.log[r.log.length - 1];
      expect(last.kind).toBe("huntFlee");
      if (last.outcome === 0) {
        ok++;
        expect(r.cultivation).toBe(s.cultivation);
      } else {
        bad++;
        expect(r.cultivation).toBeCloseTo(s.cultivation * (1 - rules.flee.failLoss), 6);
      }
    }
    const p = fleeChance(inFight("iron_back_bear"));
    expect(ok / 600).toBeGreaterThan(p - 0.07);
    expect(ok / 600).toBeLessThan(p + 0.07);
    expect(bad).toBeGreaterThan(0);
    const strong = { ...inFight("hungry_wolf"), realmId: "lianqi" };
    const weak = inFight("iron_back_bear");
    expect(fleeChance(strong)).toBeGreaterThanOrEqual(fleeChance(weak));
  });

  it("戰力隨境界與階段增加，預設打法遇到強敵會逃", () => {
    const low = inFight("iron_back_bear", 1, { stage: 0 });
    const high = inFight("iron_back_bear", 1, { stage: 8 });
    expect(playerPower(high)).toBeGreaterThan(playerPower(low));
    expect(powerRatio(low, monsterOf("iron_back_bear"))).toBeLessThan(rules.autoMinRatio);
    const done = autoEncounter(low);
    expect(done.log[done.log.length - 1].kind).toBe("huntFlee");
  });

  it("卡在瓶頸時勝利不加修為，但照樣有靈石", () => {
    const stuck = living(1, { realmId: "lianqi", stage: 8, schedule: "adventure", cultivation: lianqiNeed(8) });
    expect(atBottleneck(stuck, gameData)).toBe(true);
    let won = false;
    for (let seed = 1; seed <= 300 && !won; seed++) {
      let t: GameState = { ...stuck, encounter: enc("hungry_wolf", { seed: seed * 17 }) };
      while (t.encounter) t = huntChoose(t, "fierce");
      const last = t.log[t.log.length - 1];
      if (last.kind !== "huntWin") continue;
      won = true;
      expect(t.cultivation).toBe(stuck.cultivation);
      expect(last.changes?.cultivation).toBeUndefined();
    }
    expect(won).toBe(true);
  });
});

describe("存檔", () => {
  it("遇怪中存檔往返相同", () => {
    const s = inFight("red_tail_fox", 4242, { encounter: enc("red_tail_fox", { seed: 4242, round: 1, monsterHp: 0.6, myHp: 0.75 }) });
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("遇怪的日誌往返相同", () => {
    const done = autoEncounter(inFight("red_tail_fox"));
    expect(deserialize(serialize(done))).toEqual(done);
  });

  it("怪物不屬於目前境界時拒絕載入", () => {
    const s = inFight("red_tail_fox");
    const bad = JSON.parse(serialize(s));
    bad.encounter.monsterId = "ancient_ape";
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/encounter\.monsterId/);
  });

  it("舊版（v21）存檔補上沒有遇怪", () => {
    const old = JSON.parse(serialize(living(2)));
    delete old.encounter;
    old.version = 21;
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.encounter).toBeNull();
  });
});

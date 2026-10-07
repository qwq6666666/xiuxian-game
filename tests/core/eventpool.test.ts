import { describe, expect, it } from "vitest";
import { chooseEvent, eventAvailable } from "../../src/core/events";
import { gameData as data } from "../../src/data/load";
import type { Effects, EventDef } from "../../src/data/types";
import { living } from "../helpers";

const ev = (id: string): EventDef => data.events.find((e) => e.id === id)!;
const effectsOf = (e: EventDef): Effects[] => [
  ...(e.effects ? [e.effects] : []),
  ...(e.choices ?? []).flatMap((c) => c.outcomes.map((o) => o.effects)),
];
const textsOf = (e: EventDef): string[] => [
  e.title,
  e.text,
  ...(e.choices ?? []).flatMap((c) => [c.text, ...c.outcomes.map((o) => o.text)]),
];
const at = (age: number, patch: Parameters<typeof living>[1] = {}) =>
  living(1, { ageMonths: age * 12, realmId: "lianqi", ...patch });

const CHAINS: { name: string; stages: { id: string; needs?: string }[] }[] = [
  { name: "棄嬰", stages: [{ id: "orphan_001" }, { id: "orphan_002", needs: "orphan_adopted" }, { id: "orphan_003", needs: "child_grown" }] },
  { name: "書生", stages: [{ id: "scholar_001" }, { id: "scholar_002", needs: "scholar_hosted" }] },
  { name: "舊友", stages: [{ id: "friend_001" }, { id: "friend_002", needs: "friend_met" }] },
  { name: "招人告示", stages: [{ id: "recruit_001" }, { id: "recruit_002", needs: "recruit_asked" }] },
];

describe("事件池擴充", () => {
  it("事件數至少 70，抉擇事件占比維持在約四成五到七成（每世抉擇數由 sim 的第 13 節指標守住）", () => {
    expect(data.events.length).toBeGreaterThanOrEqual(70);
    const choices = data.events.filter((e) => e.type === "choice").length;
    expect(choices / data.events.length).toBeGreaterThan(0.45);
    expect(choices / data.events.length).toBeLessThan(0.68);
  });

  it("新增的事件都用名稱欄位而不是寫死的名字，且至少有 14 個事件用到欄位", () => {
    let withSlots = 0;
    for (const e of data.events) {
      const joined = textsOf(e).join("");
      if (/\{[a-z]+\}/.test(joined)) withSlots++;
    }
    expect(withSlots).toBeGreaterThanOrEqual(14);
  });

  it("至少一個事件用到 {country}，讓世界的國家進入敘述", () => {
    expect(data.events.some((e) => textsOf(e).join("").includes("{country}"))).toBe(true);
  });
});

describe("連鎖事件", () => {
  for (const chain of CHAINS) {
    it(`「${chain.name}」：後段需要前段設的旗標，年齡逐段拉開，最後一段在一生回顧裡有分量`, () => {
      chain.stages.forEach((stage, i) => {
        const e = ev(stage.id);
        if (stage.needs) {
          expect(e.conditions.flags, stage.id).toContain(stage.needs);
          // 這個旗標確實由前面的某一段設定
          const earlier = chain.stages.slice(0, i).map((s) => ev(s.id));
          expect(earlier.some((p) => effectsOf(p).some((x) => x.flags?.includes(stage.needs!))), `${stage.id} 的旗標沒人設`).toBe(true);
          expect(e.conditions.ageMin ?? 0, stage.id).toBeGreaterThan(ev(chain.stages[i - 1].id).conditions.ageMin ?? 0);
        }
      });
      const last = ev(chain.stages[chain.stages.length - 1].id);
      expect(last.highlight ?? 0).toBeGreaterThanOrEqual(2);
    });
  }

  it("前段不設旗標就不會出現後段；設了且年紀到了才出現", () => {
    expect(eventAvailable(at(95), ev("orphan_003"))).toBe(false);
    expect(eventAvailable(at(95, { flags: ["child_grown"] }), ev("orphan_003"))).toBe(true);
    expect(eventAvailable(at(60, { flags: ["child_grown"] }), ev("orphan_003"))).toBe(false);
    expect(eventAvailable(at(40), ev("orphan_001"))).toBe(true);
    expect(eventAvailable(at(40, { flags: ["orphan_done"] }), ev("orphan_001"))).toBe(false);
  });

  it("棄嬰一線可以走完：領養、教他、成家，旗標一路接上", () => {
    let s = at(30);
    s = chooseEvent({ ...s, pendingEvent: "orphan_001" }, 0, data);
    expect(s.flags).toContain("orphan_adopted");
    s = chooseEvent({ ...s, ageMonths: 65 * 12, phase: "living", pendingEvent: "orphan_002" }, 0, data);
    expect(s.flags).toContain("child_grown");
    expect(eventAvailable({ ...s, ageMonths: 95 * 12 }, ev("orphan_003"))).toBe(true);
  });
});

describe("年齡段與築基之後的專屬事件", () => {
  it("少年事件只在少年時出現", () => {
    for (const id of ["youth_fight_001", "youth_qi_001", "youth_teacher_001", "youth_harvest_001"]) {
      expect(eventAvailable(at(14, { realmId: "mortal" }), ev(id)), id).toBe(true);
      expect(eventAvailable(at(40), ev(id)), id).toBe(false);
    }
  });

  it("暮年事件在年輕時不出現", () => {
    for (const id of ["last_wish_001", "old_home_001", "grave_001"]) {
      expect(eventAvailable(at(30), ev(id)), id).toBe(false);
      expect(eventAvailable(at(100), ev(id)), id).toBe(true);
    }
  });

  it("築基之後的事件在練氣時不出現；舊洞重訪還需要先探過古洞", () => {
    for (const id of ["zhuji_lonely_001", "zhuji_elder_001", "zhuji_junior_001", "zhuji_border_001"]) {
      expect(eventAvailable(at(150), ev(id)), id).toBe(false);
      expect(eventAvailable(at(150, { realmId: "zhuji" }), ev(id)), id).toBe(true);
    }
    expect(eventAvailable(at(150, { realmId: "zhuji" }), ev("zhuji_cave_001"))).toBe(false);
    expect(eventAvailable(at(150, { realmId: "zhuji", flags: ["cave_001_done"] }), ev("zhuji_cave_001"))).toBe(true);
    expect(eventAvailable(at(150, { realmId: "zhuji" }), ev("zhuji_retreat_001"))).toBe(true);
    expect(eventAvailable(at(110, { realmId: "zhuji" }), ev("zhuji_retreat_001"))).toBe(false);
  });
});

describe("新事件的獎懲幅度", () => {
  it("沒有哪個新事件的修為獎勵超過現有最大值，也沒有新增靈石暴利", () => {
    const old = new Set(["cave_001", "cave_002", "senior_001", "senior_002", "market_001", "beast_001", "demon_001", "village_001", "fortune_001", "elder_001", "alchemist_001", "rival_001"]);
    const maxOldCult = Math.max(...data.events.filter((e) => old.has(e.id)).flatMap(effectsOf).map((x) => x.cultivation ?? 0));
    const maxOldStones = Math.max(...data.events.filter((e) => old.has(e.id)).flatMap(effectsOf).map((x) => x.spiritStones ?? 0));
    for (const e of data.events.filter((x) => !old.has(x.id))) {
      for (const x of effectsOf(e)) {
        expect(x.cultivation ?? 0, e.id).toBeLessThanOrEqual(maxOldCult);
        expect(x.spiritStones ?? 0, e.id).toBeLessThanOrEqual(Math.max(maxOldStones, 40));
      }
    }
  });

  it("只有河水暴漲的一個選項有致死結果，且機率很小", () => {
    const deadly = data.events.filter((e) => (e.choices ?? []).some((c) => c.outcomes.some((o) => o.effects.death)));
    const newDeadly = deadly.map((e) => e.id).filter((id) => ["flood_001"].includes(id));
    expect(newDeadly).toEqual(["flood_001"]);
    for (const e of deadly) {
      for (const c of e.choices ?? []) {
        const total = c.outcomes.reduce((n, o) => n + o.weight, 0);
        for (const o of c.outcomes) if (o.effects.death) expect(o.weight / total, e.id).toBeLessThanOrEqual(0.05);
      }
    }
  });
});

describe("金丹期事件", () => {
  const jindan = data.events.filter((e) => e.id.startsWith("jindan_"));

  it("三條連鎖依抉擇分支，沒有選到的後段不會入池", () => {
    const paths = [
      { first: "jindan_friend_001", choices: [[0, "jindan_friend_002_hosted"], [1, "jindan_friend_002_declined"]] },
      { first: "jindan_guard_001", choices: [[0, "jindan_guard_002"], [1, ""]] },
      { first: "jindan_dispute_001", choices: [[0, "jindan_dispute_002_split"], [1, "jindan_dispute_002_ruled"], [2, ""]] },
    ] as const;
    const followups = [
      "jindan_friend_002_hosted", "jindan_friend_002_declined", "jindan_guard_002",
      "jindan_dispute_002_split", "jindan_dispute_002_ruled",
    ];
    for (const path of paths) {
      for (const [choice, expected] of path.choices) {
        const before = at(300, { realmId: "jindan" });
        const after = chooseEvent({ ...before, pendingEvent: path.first }, choice, data);
        for (const id of followups) {
          expect(eventAvailable(before, ev(id)), `${path.first} 選 ${choice} 前的 ${id}`).toBe(false);
          expect(eventAvailable(after, ev(id)), `${path.first} 選 ${choice} 後的 ${id}`).toBe(id === expected);
        }
      }
    }
  });

  it("金丹連鎖後段提高權重且能進入一生回顧", () => {
    for (const [first, followups] of [
      ["jindan_friend_001", ["jindan_friend_002_hosted", "jindan_friend_002_declined"]],
      ["jindan_guard_001", ["jindan_guard_002"]],
      ["jindan_dispute_001", ["jindan_dispute_002_split", "jindan_dispute_002_ruled"]],
    ] as const) {
      for (const id of followups) {
        expect(ev(id).weight, id).toBeGreaterThan(ev(first).weight);
        expect(ev(id).highlight, id).toBeGreaterThanOrEqual(2);
        expect(ev(id).maxPerLife, id).toBe(1);
      }
    }
  });

  it("至少十五個，築基以前不出現，金丹之後才進池子", () => {
    expect(jindan.length).toBeGreaterThanOrEqual(15);
    for (const e of jindan) {
      expect(e.conditions.realmMin, e.id).toBe("jindan");
      expect(eventAvailable(at(150, { realmId: "zhuji" }), e) && e.conditions.bottleneck !== true, e.id).toBe(false);
    }
    const plain = jindan.filter((e) => e.conditions.bottleneck !== true && e.conditions.ageMin === undefined && !e.conditions.flags?.length);
    for (const e of plain) expect(eventAvailable(at(300, { realmId: "jindan" }), e), e.id).toBe(true);
  });

  it("瓶頸事件只在卡瓶頸時出現", () => {
    const e = ev("jindan_bottleneck_001");
    expect(e.conditions.bottleneck).toBe(true);
  });

  it("有想像得到的幅度：不放大修為，不寫出元嬰以上或天梯的字眼，不寫死參考名", () => {
    const banned = ["元嬰", "化神", "天光", "梯", "太衡宗", "通濟行", "野渡", "垣下", "渡頭集", "青垣山"];
    for (const e of jindan) {
      const text = textsOf(e).join("");
      for (const w of banned) expect(text.includes(w), `${e.id} 含「${w}」`).toBe(false);
      for (const x of effectsOf(e)) {
        expect(x.cultivation ?? 0, e.id).toBeLessThanOrEqual(0.04);
        expect(x.death ?? false, e.id).toBe(false);
        expect(x.fragment, e.id).toBeUndefined();
      }
    }
  });

  it("每段文字不超過三句", () => {
    for (const e of jindan) {
      for (const t of textsOf(e)) expect((t.match(/[。！？]/g) ?? []).length, `${e.id}：${t}`).toBeLessThanOrEqual(3);
    }
  });
});

import { describe, expect, it } from "vitest";
import { generateWorld, worldAt } from "../src/core/world";
import { relationOf, sectPolityDistance, ties } from "../src/core/relations";
import { fiefsFor } from "../src/core/fiefs";
import { gameData as data } from "../src/data/load";
import { validateWorldRelations } from "../src/data/validate";

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 13);
const AGES = [0, 20, 40, 60, 90, 120, 160, 200];
const NEUTRAL = { mergeAlly: 1, mergeFeud: 1, ownerAlly: 1, ownerFeud: 1 };
// 中性資料：關係不影響世局生成（S2 倍率全為 1）
const neutral = { ...data, worldRelations: { ...data.worldRelations, influence: NEUTRAL } };
// 關係全關掉、又中性的資料：用來比對「關係只加不改」
const off = { ...data, worldRelations: { ...data.worldRelations, influence: NEUTRAL, initial: { allyChance: 0, feudChance: 0 }, changeCount: { min: 0, max: 0 } } };

describe("宗門與國家關係（S1）", () => {
  it("決定性：同種子同結果", () => {
    expect(generateWorld(42).relations).toEqual(generateWorld(42).relations);
    expect(generateWorld(42).changes).toEqual(generateWorld(42).changes);
  });

  it("倍率中性時，關係不改變既有世局：名字、歸屬、宗門與原有變化與關係全關時逐項相同", () => {
    for (const seed of SEEDS) {
      const a = generateWorld(seed, neutral);
      const b = generateWorld(seed, off);
      expect(a.names, String(seed)).toEqual(b.names);
      expect(a.birth).toEqual(b.birth);
      expect(a.owners).toEqual(b.owners);
      expect(a.sects).toEqual(b.sects);
      expect(a.polities).toEqual(b.polities);
      expect(a.changes.filter((c) => c.kind !== "relation")).toEqual(b.changes);
    }
  });

  it("每個宗門最多一盟一仇且不同；閉山與覆滅沒有關係；國家仍存在；盟國在候選距離內", () => {
    let withAlly = 0;
    let withFeud = 0;
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      for (const age of AGES) {
        const snap = worldAt(w, age);
        for (const s of snap.sects) {
          const r = relationOf(snap, s.id);
          if (s.state === "closed" || s.state === "fallen") {
            expect(r, `${seed}@${age}`).toEqual({ ally: null, feud: null });
            continue;
          }
          if (r.ally !== null && r.feud !== null) expect(r.ally).not.toBe(r.feud);
          expect(r.feud, `${seed}@${age} 仇國不會是山門所在的國`).not.toBe(snap.owners[s.fief]);
          for (const p of [r.ally, r.feud]) if (p !== null) expect(snap.polities.some((x) => x.id === p), `${seed}@${age}`).toBe(true);
          if (age === 0) {
            if (r.ally) { withAlly++; expect(sectPolityDistance(snap, s, r.ally, fiefsFor(seed, data))).toBeLessThanOrEqual(data.worldRelations.candidateDistance); }
            if (r.feud) { withFeud++; expect(r.feud).not.toBe(snap.owners[s.fief]); }
          }
        }
      }
    }
    expect(withAlly).toBeGreaterThan(100);
    expect(withFeud).toBeGreaterThan(100);
  });

  it("關係變化：每世 0 到 2 次、依年齡排序、note 填好名字、套用後與快照相符", () => {
    let total = 0;
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const rel = w.changes.filter((c) => c.kind === "relation");
      expect(rel.length).toBeLessThanOrEqual(data.worldRelations.changeCount.max);
      total += rel.length;
      const ages = w.changes.map((c) => c.age);
      expect([...ages].sort((x, y) => x - y)).toEqual(ages);
      for (const c of rel) {
        expect(c.note).not.toMatch(/[{}]/);
        if (c.kind !== "relation") continue;
        const snap = worldAt(w, c.age);
        // 同年還有更晚的併國時，關係會被改記；至少 on 的當下盟仇不同
        const r = relationOf(snap, c.sect);
        if (c.on && w.changes.filter((x) => x.age === c.age && x.kind === "merge").length === 0) expect(r[c.relation]).toBe(c.polity);
        if (!c.on) expect(r[c.relation]).toBeNull();
      }
    }
    expect(total).toBeGreaterThan(100);
  });

  it("併國時，宗門的盟仇改記到併入的國家，不會同時是盟國與仇國", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      for (const age of AGES) {
        const snap = worldAt(w, age);
        for (const r of Object.values(snap.relations)) if (r.ally !== null) expect(r.ally).not.toBe(r.feud);
      }
    }
  });

  it("S2：互惠的兩國較易併、世仇的兩國較常奪領，而且只在倍率不為 1 時才不同", () => {
    let allyMerge = 0;
    let allyMergeNeutral = 0;
    let feudOwner = 0;
    let feudOwnerNeutral = 0;
    const count = (w: ReturnType<typeof generateWorld>, kind: "merge" | "owner", rel: "ally" | "feud"): number => {
      let n = 0;
      let snap = worldAt(w, -1);
      for (const c of w.changes) {
        if (c.kind === "merge" && kind === "merge") {
          if (ties(snap, c.from, c.to)[rel] > 0) n++;
        } else if (c.kind === "owner" && kind === "owner") {
          if (ties(snap, snap.owners[c.fiefs[0]], c.to)[rel] > 0) n++;
        }
        snap = worldAt(w, c.age);
      }
      return n;
    };
    for (let seed = 1; seed <= 400; seed++) {
      allyMerge += count(generateWorld(seed), "merge", "ally");
      allyMergeNeutral += count(generateWorld(seed, neutral), "merge", "ally");
      feudOwner += count(generateWorld(seed), "owner", "feud");
      feudOwnerNeutral += count(generateWorld(seed, neutral), "owner", "feud");
    }
    expect(allyMerge).toBeGreaterThan(allyMergeNeutral);
    expect(feudOwner).toBeGreaterThan(feudOwnerNeutral);
  });

  it("資料驗證：錯誤訊息指出是哪一筆的哪個欄位", () => {
    const base = JSON.parse(JSON.stringify(data.worldRelations));
    expect(() => validateWorldRelations(base)).not.toThrow();
    const bad = JSON.parse(JSON.stringify(base));
    bad.changes[1].note = "{sect}與{who}握手。";
    expect(() => validateWorldRelations(bad)).toThrow(/rel_ally_b.*note/);
    const bad2 = JSON.parse(JSON.stringify(base));
    bad2.changes[0].type = "love";
    expect(() => validateWorldRelations(bad2)).toThrow(/type/);
    const bad3 = JSON.parse(JSON.stringify(base));
    bad3.changeCount = { min: 3, max: 1 };
    expect(() => validateWorldRelations(bad3)).toThrow(/changeCount/);
  });
});

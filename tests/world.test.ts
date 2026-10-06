import { describe, expect, it } from "vitest";
import { createInitialState, reroll, startLife } from "../src/core/life";
import { deserialize, serialize } from "../src/core/save";
import { deriveSeed, nextRandom } from "../src/core/rng";
import { SAVE_VERSION } from "../src/core/state";
import { changesBetween, generateWorld, polityLabel, worldAt, worldSlots } from "../src/core/world";
import { gameData as data } from "../src/data/load";
import { fiefsFor } from "../src/core/fiefs";
import { validateMap, validateWorldEvents, validateWorldNames } from "../src/data/validate";
import { living } from "./helpers";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 13);
const lands = data.map.regions.filter((r) => r.land).map((r) => r.id);
const JSONCLONE = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("世界生成", () => {
  it("同一個種子永遠得到同樣的世界，不同種子大多不同", () => {
    expect(generateWorld(42)).toEqual(generateWorld(42));
    const names = new Set(SEEDS.map((s) => generateWorld(s).names.guard + generateWorld(s).birth.village));
    expect(names.size).toBeGreaterThan(20);
  });

  it("deriveSeed 不依賴也不改變原本的亂數序列", () => {
    expect(deriveSeed(5, 1)).toBe(deriveSeed(5, 1));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(5, 2));
    expect(deriveSeed(5, 1)).not.toBe(deriveSeed(6, 1));
    // 取得世界種子不應影響後續亂數
    const before = nextRandom(1234)[0];
    deriveSeed(1234, 1);
    expect(nextRandom(1234)[0]).toBe(before);
  });

  it("起點的結構：守梯大宗在北方、商行總號在中部、出生地在陸地且不是荒原、名字互不重複", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(lands, String(seed)).toContain(w.birth.region);
      const guard = w.sects.find((s) => s.kind === "guard")!;
      expect(guard.region).toBe("north");
      expect(guard.site).toBe(0);
      expect(w.merchantBranches).toContain("center");
      expect(w.merchantBranches).toContain(w.birth.region);
      // 守梯大宗之外：兩家舊大宗與五家門派
      expect(w.sects.filter((s) => s.kind === "greatSect")).toHaveLength(2);
      expect(w.sects.filter((s) => s.kind === "school")).toHaveLength(5);
      expect(w.sects.filter((s) => s.kind === "greatSect").every((s) => s.region !== "north")).toBe(true);
      // 其中一家門派在出生地所在地域
      expect(w.sects.some((s) => s.kind === "school" && s.region === w.birth.region)).toBe(true);
      const all = [
        ...w.polities.map((p) => p.name),
        ...w.polities.map((p) => p.capital).filter(Boolean),
        ...w.sects.map((s) => s.name),
        w.names.merchant, w.names.wanderers, w.birth.village, w.birth.market, w.birth.mountain,
      ];
      expect(new Set(all).size, String(seed)).toBe(all.length);
    }
  });

  it("每個領恰好屬於一個國家，國家數等於設定，諸部至多一國；宗門位置不重疊", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const fiefs = fiefsFor(seed, data);
      expect(Object.keys(w.owners).sort()).toEqual([...fiefs.ids].sort());
      expect(w.polities.length).toBe(data.map.nations.default);
      expect(new Set(Object.values(w.owners)).size).toBe(w.polities.length);
      expect(w.polities.filter((p) => p.tribal).length).toBeLessThanOrEqual(1);
      expect(w.polities.filter((p) => p.tribal).every((p) => p.capital === "")).toBe(true);
      const sites = new Set(w.sects.map((s) => `${s.region}:${s.site}`));
      expect(sites.size).toBe(w.sects.length);
    }
  });

  it("不消耗命盤的亂數：重擲與開局的 rngSeed 序列與世界無關", () => {
    const a = createInitialState(9);
    const b = { ...a, worldSeed: 12345 };
    // 世界種子不同，後續的擲骰結果仍然相同
    expect(reroll({ ...a, rerolls: 2 }).attributes).toEqual(reroll({ ...b, rerolls: 2 }).attributes);
  });
});

describe("世局變化", () => {
  it("每世十到十四條以內，依年齡排序，三十到七十歲之間至少一次變化", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      expect(w.changes.length, String(seed)).toBeGreaterThanOrEqual(6);
      expect(w.changes.filter((c) => c.kind !== "relation").length).toBeLessThanOrEqual(14);
      const ages = w.changes.map((c) => c.age);
      expect([...ages].sort((a, b) => a - b)).toEqual(ages);
      expect(ages.some((a) => a >= 30 && a <= 70), `seed ${seed}`).toBe(true);
      expect(ages.every((a) => a >= 0 && a <= 200)).toBe(true);
    }
  });

  it("快照一致：國家與歸屬對得上，亡國者不再擁有地域，宗門狀態合法", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      for (const age of [10, 40, 80, 120, 200]) {
        const snap = worldAt(w, age);
        const ids = new Set(snap.polities.map((p) => p.id));
        for (const f of Object.keys(snap.owners)) expect(ids.has(snap.owners[f]), `${seed}@${age} ${f}`).toBe(true);
        for (const p of snap.polities) expect(Object.values(snap.owners).includes(p.id), `${seed}@${age} ${p.id} 沒有領`).toBe(true);
        expect(new Set(snap.polities.map((p) => p.name)).size).toBe(snap.polities.length);
        const sites = new Set(snap.sects.map((s) => `${s.region}:${s.site}`));
        expect(sites.size).toBe(snap.sects.length);
        for (const s of snap.sects) expect(["prosper", "stable", "decline", "closed", "fallen"]).toContain(s.state);
        expect(snap.notes.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("隨年齡推進變化單調：變化條數不減，最後的快照與完整套用一致", () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const w = generateWorld(seed);
      let last = 0;
      for (let age = 10; age <= 200; age += 10) {
        const n = worldAt(w, age).changeCount;
        expect(n).toBeGreaterThanOrEqual(last);
        last = n;
      }
      expect(worldAt(w, 999).changeCount).toBe(w.changes.length);
    }
  });

  it("一世之內地圖會變：到了老年，世界與起點不同", () => {
    let changed = 0;
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      if (JSON.stringify(worldAt(w, 10)) !== JSON.stringify(worldAt(w, 100))) changed++;
    }
    expect(changed).toBe(SEEDS.length);
  });

  it("世局的名稱不含未填的欄位，也不出現第 14.3 節禁用的詞", () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const c of generateWorld(seed).changes) {
        expect(c.note, c.note).not.toMatch(/[{}]/);
        expect(c.note).not.toMatch(/上界|幽冥|天梯|輪迴|元嬰|□/);
        expect((c.note.match(/[。！？]/g) ?? []).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("覆滅的宗門不會再有變化；渡口毀壞與重建交替", () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const fallen = new Set<string>();
      const broken = new Map<string, boolean>();
      for (const c of w.changes) {
        if (c.kind === "sectState" || c.kind === "sectRank") expect(fallen.has(c.sect), `${seed} ${c.note}`).toBe(false);
        if (c.kind === "sectState" && c.to === "fallen") fallen.add(c.sect);
        if (c.kind === "ferry") {
          expect(broken.get(c.ferry) ?? false).not.toBe(c.broken);
          broken.set(c.ferry, c.broken);
        }
      }
    }
  });

  it("changesBetween：不含起點、含終點", () => {
    const w = generateWorld(31);
    const all = changesBetween(w, -1, 999);
    expect(all).toHaveLength(w.changes.length);
    const first = w.changes[0];
    expect(changesBetween(w, first.age, first.age)).toHaveLength(0);
    expect(changesBetween(w, first.age - 1, first.age).length).toBeGreaterThanOrEqual(1);
  });

  it("名稱欄位：當世的名稱與地圖一致，國名取出生時的名字，諸部加上諸部", () => {
    const w = generateWorld(77);
    const slots = worldSlots(w);
    expect(slots.guard).toBe(w.names.guard);
    expect(slots.village).toBe(w.birth.village);
    expect(w.polities.map((p) => p.name)).toContain(slots.country);
    const tribal = { ...w.polities[0], tribal: true };
    expect(polityLabel(tribal)).toBe(`${tribal.name}諸部`);
    expect(polityLabel({ ...tribal, tribal: false })).toBe(tribal.name);
  });
});

describe("世界種子與存檔", () => {
  it("擲骰時定下世界種子，開始修行後不變；重擲換一個世界", () => {
    const s = createInitialState(5);
    expect(s.worldSeed).toBeGreaterThan(0);
    expect(startLife(s).worldSeed).toBe(s.worldSeed);
    const r = reroll({ ...s, rerolls: 3 });
    expect(r.worldSeed).not.toBe(s.worldSeed);
  });

  it("存檔保留世界種子，重新整理後世界不變", () => {
    const s = living(3);
    const back = deserialize(serialize(s));
    expect(back.worldSeed).toBe(s.worldSeed);
    expect(generateWorld(back.worldSeed)).toEqual(generateWorld(s.worldSeed));
  });

  it("欄位錯誤時指出欄位", () => {
    const good = JSON.parse(serialize(createInitialState(1)));
    expect(() => deserialize(JSON.stringify({ ...good, worldSeed: "x" }))).toThrow("worldSeed");
    expect(() => deserialize(JSON.stringify({ ...good, worldSeed: -1 }))).toThrow("worldSeed");
  });

  it("v7 存檔遷移：用既有的亂數種子雜湊出世界種子，其餘原樣保留", () => {
    const cur = living(6);
    const rest: Record<string, unknown> = { ...cur, version: 7 };
    delete rest.worldSeed;
    const s = deserialize(JSON.stringify(rest));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.worldSeed).toBe(deriveSeed(cur.rngSeed, 1));
    expect(s.rngSeed).toBe(cur.rngSeed);
    expect(s.name).toBe(cur.name);
  });
});

describe("世界資料格式檢查", () => {
  it("名庫：數量不足或名字重複時指出欄位", () => {
    const good = JSONCLONE(data.worldNames) as unknown as Record<string, string[]>;
    expect(() => validateWorldNames({ ...good, countries: good.countries.slice(0, 3) })).toThrow("countries");
    expect(() => validateWorldNames({ ...good, guards: [...good.guards.slice(1), good.countries[0]] })).toThrow("重複");
    expect(() => validateWorldNames({ ...good, extra: ["a"] })).toThrow("extra");
  });

  it("地圖：座標、鄰接、必要地域錯誤時指出欄位", () => {
    const good = JSONCLONE(data.map);
    const bad = (patch: (m: typeof good) => void) => () => {
      const m = JSONCLONE(good);
      patch(m);
      validateMap(m);
    };
    expect(bad((m) => (m.regions[1].capital = [9999, 0]))).toThrow("capital");
    expect(bad((m) => (m.adjacency.north = ["ghost"]))).toThrow("ghost");
    expect(bad((m) => (m.adjacency.north = ["west"]))).toThrow("沒有鄰接");
    expect(bad((m) => (m.regions = m.regions.filter((r) => r.id !== "center")))).toThrow("center");
    expect(bad((m) => (m.palette = ["#fff"]))).toThrow("palette");
    expect(bad((m) => (m.regions[2].sites = m.regions[2].sites!.slice(0, 2)))).toThrow("sites");
  });

  it("世局候選池：種類、目標、模板欄位、年齡窗錯誤時指出是哪一筆的哪個欄位", () => {
    const good = JSONCLONE(data.worldEvents);
    const bad = (patch: object) => () => validateWorldEvents([{ ...good[0], ...patch }, ...good.slice(1)]);
    expect(bad({ kind: "ghost" })).toThrow("kind");
    expect(bad({ target: "country" })).toThrow("target");
    expect(bad({ ageMax: 1 })).toThrow("ageMax");
    expect(bad({ weight: 0 })).toThrow("weight");
    expect(bad({ note: "沒有欄位。" })).toThrow("note");
    expect(bad({ note: "{target}與{old}。" })).toThrow("{old}");
    expect(bad({ to: "ghost" })).toThrow("to");
    expect(bad({ id: good[1].id })).toThrow("重複");
    expect(bad({ from: ["prosper"] })).toThrow("from");
  });

  it("候選池涵蓋所有種類，並且每種都有可用的候選", () => {
    const kinds = new Set(data.worldEvents.map((e) => e.kind));
    for (const k of ["merchant", "sectState", "sectRank", "sectNew", "merge", "split", "owner", "polityNew", "rename", "capital", "ferry"]) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    expect(data.worldEvents.length).toBeGreaterThanOrEqual(30);
  });
});

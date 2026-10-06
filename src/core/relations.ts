// 宗門與國家的關係（M50 S1）：互惠（盟）與世仇（仇）。
// 世界層級、只影響顯示，玩家不能操作；用 deriveSeed(world.seed, 47) 另開亂數線，
// 在既有世局生成完之後才插入，所以既有的名字、國家、宗門與變化一個字都不位移。
import type { GameData, WorldRelationChangeDef } from "../data/types";
import { deriveSeed } from "./rng";
import {
  applyChange, fill, initialSnapshot, makeRng, pickOne, weightedIndex,
  type World, type WorldChange, type WorldSect, type WorldSnapshot,
} from "./world";

export interface SectRelation {
  /** 互惠的國家 id */
  ally: string | null;
  /** 世仇的國家 id */
  feud: string | null;
}

export type RelationKind = "ally" | "feud";

const alive = (s: WorldSect): boolean => s.state !== "closed" && s.state !== "fallen";

/** 宗門在邏輯座標上的位置 */
function sectPoint(s: WorldSect, data: GameData): [number, number] {
  return data.map.regions.find((r) => r.id === s.region)!.sites![s.site];
}

/** 宗門到某國的距離：到該國現有各地域的領土中心與都城的最近距離（邏輯座標） */
export function sectPolityDistance(snap: WorldSnapshot, s: WorldSect, polity: string, data: GameData): number {
  const [x, y] = sectPoint(s, data);
  let best = Infinity;
  for (const r of data.map.regions) {
    if (!r.land || snap.owners[r.id] !== polity) continue;
    for (const p of [...(r.territories ?? []), ...(r.capital ? [r.capital] : [])]) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y));
  }
  return best;
}

/** 候選國家：在距離內、仍存在，且不是排除的那幾個 */
function candidates(snap: WorldSnapshot, s: WorldSect, data: GameData, exclude: (string | null)[]): string[] {
  const max = data.worldRelations.candidateDistance;
  return snap.polities
    .filter((p) => !exclude.includes(p.id) && sectPolityDistance(snap, s, p.id, data) <= max)
    .map((p) => p.id);
}

/** 一個宗門在快照上的關係（沒有紀錄就是都沒有） */
export const relationOf = (snap: WorldSnapshot, sectId: string): SectRelation => snap.relations[sectId] ?? { ally: null, feud: null };

function bindRelation(snap: WorldSnapshot, def: WorldRelationChangeDef, age: number, rng: () => number, data: GameData): WorldChange | null {
  const polName = (id: string): string => snap.polities.find((p) => p.id === id)!.name;
  const make = (s: WorldSect, polity: string, relation: RelationKind, on: boolean): WorldChange => ({
    age, kind: "relation", sect: s.id, polity, relation, on,
    note: fill(def.note, { sect: s.name, polity: polName(polity) }),
  });
  const living = snap.sects.filter(alive);
  if (def.type === "ally" || def.type === "feud") {
    const rel: RelationKind = def.type;
    const other: RelationKind = rel === "ally" ? "feud" : "ally";
    const free = living.filter((s) => relationOf(snap, s.id)[rel] === null);
    const options = free.flatMap((s) => {
      const exclude = [relationOf(snap, s.id)[other], ...(rel === "feud" ? [snap.owners[s.region]] : [])];
      return candidates(snap, s, data, exclude).map((p) => ({ s, p }));
    });
    if (options.length === 0) return null;
    const { s, p } = pickOne(rng, options);
    return make(s, p, rel, true);
  }
  const rel: RelationKind = def.type === "allyEnd" ? "ally" : "feud";
  const held = living.filter((s) => relationOf(snap, s.id)[rel] !== null);
  if (held.length === 0) return null;
  const s = pickOne(rng, held);
  return make(s, relationOf(snap, s.id)[rel]!, rel, false);
}

/** 在既有世局之後加上關係：設定 world.relations，並把關係變化依年齡插進 world.changes */
export function addRelations(world: World, data: GameData): void {
  const rules = data.worldRelations;
  const rng = makeRng(deriveSeed(world.seed, 47));
  const snap0 = initialSnapshot(world);
  world.relations = world.sects.map((s) => {
    const rel: SectRelation = { ally: null, feud: null };
    if (!alive(s)) return { sect: s.id, ...rel };
    if (rng() < rules.initial.allyChance) {
      const c = candidates(snap0, s, data, []);
      if (c.length) rel.ally = pickOne(rng, c);
    }
    if (rng() < rules.initial.feudChance) {
      const c = candidates(snap0, s, data, [rel.ally, snap0.owners[s.region]]);
      if (c.length) rel.feud = pickOne(rng, c);
    }
    return { sect: s.id, ...rel };
  });

  const count = rules.changeCount.min + Math.floor(rng() * (rules.changeCount.max - rules.changeCount.min + 1));
  const picks: { def: WorldRelationChangeDef; age: number }[] = [];
  for (let i = 0; i < count; i++) {
    const def = rules.changes[weightedIndex(rng, rules.changes.map((c) => c.weight))];
    picks.push({ def, age: def.ageMin + Math.floor(rng() * (def.ageMax - def.ageMin + 1)) });
  }
  picks.sort((a, b) => a.age - b.age || a.def.id.localeCompare(b.def.id));

  const snap = initialSnapshot(world);
  const existing = world.changes;
  let next = 0;
  const added: WorldChange[] = [];
  for (const pick of picks) {
    while (next < existing.length && existing[next].age <= pick.age) applyChange(snap, existing[next++]);
    const change = bindRelation(snap, pick.def, pick.age, rng, data);
    if (!change) continue;
    applyChange(snap, change);
    added.push(change);
  }
  // 穩定排序：同年齡時既有變化在前
  world.changes = [...existing, ...added].sort((a, b) => a.age - b.age);
}

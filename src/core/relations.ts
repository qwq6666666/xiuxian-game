// 宗門與國家的關係（M50 S1）：互惠（盟）與世仇（仇）。
// 世界層級、只影響顯示，玩家不能操作；用 deriveSeed(world.seed, 47) 另開亂數線，
// 在既有世局生成完之後才插入，所以既有的名字、國家、宗門與變化一個字都不位移。
import type { GameData, WorldRelationChangeDef } from "../data/types";
import { fiefsFor, type Fiefs } from "./fiefs";
import { deriveSeed } from "./rng";
import {
  fill, initialSnapshot, makeRng, pickOne, weightedIndex,
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

/** 宗門到某國的距離：山門到該國現有各領中心的最近距離（邏輯座標） */
export function sectPolityDistance(snap: WorldSnapshot, s: WorldSect, polity: string, fiefs: Fiefs): number {
  const [x, y] = fiefs.points[fiefs.ids.indexOf(s.fief)];
  let best = Infinity;
  for (let i = 0; i < fiefs.count; i++) {
    if (snap.owners[fiefs.ids[i]] !== polity) continue;
    best = Math.min(best, Math.hypot(fiefs.points[i][0] - x, fiefs.points[i][1] - y));
  }
  return best;
}

/** 候選國家：在距離內、仍存在，且不是排除的那幾個 */
function candidates(snap: WorldSnapshot, s: WorldSect, data: GameData, fiefs: Fiefs, exclude: (string | null)[]): string[] {
  const max = data.worldRelations.candidateDistance;
  return snap.polities
    .filter((p) => !exclude.includes(p.id) && sectPolityDistance(snap, s, p.id, fiefs) <= max)
    .map((p) => p.id);
}

/** 一個宗門在快照上的關係（沒有紀錄就是都沒有） */
export const relationOf = (snap: WorldSnapshot, sectId: string): SectRelation => snap.relations[sectId] ?? { ally: null, feud: null };

export function bindRelation(snap: WorldSnapshot, def: WorldRelationChangeDef, age: number, rng: () => number, data: GameData, fiefs: Fiefs): WorldChange | null {
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
      const exclude = [relationOf(snap, s.id)[other], ...(rel === "feud" ? [snap.owners[s.fief]] : [])];
      return candidates(snap, s, data, fiefs, exclude).map((p) => ({ s, p }));
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

/** 初始關係：生成世界時在世局變化之前決定（S2 要讓世局變化看得到關係） */
export function initialRelations(world: World, data: GameData): { sect: string; ally: string | null; feud: string | null }[] {
  const rules = data.worldRelations;
  const rng = makeRng(deriveSeed(world.seed, 47));
  const snap0 = initialSnapshot(world);
  const fiefs = fiefsFor(world.seed, data);
  return world.sects.map((s) => {
    const rel: SectRelation = { ally: null, feud: null };
    if (!alive(s)) return { sect: s.id, ...rel };
    if (rng() < rules.initial.allyChance) {
      const c = candidates(snap0, s, data, fiefs, []);
      if (c.length) rel.ally = pickOne(rng, c);
    }
    if (rng() < rules.initial.feudChance) {
      const c = candidates(snap0, s, data, fiefs, [rel.ally, snap0.owners[s.fief]]);
      if (c.length) rel.feud = pickOne(rng, c);
    }
    return { sect: s.id, ...rel };
  });
}

export interface RelationPick {
  def: WorldRelationChangeDef;
  age: number;
}

/** 這一世的關係變化候選（種類與年齡），依年齡排序；綁定到具體對象在世局模擬時才做 */
export function relationPicks(seed: number, data: GameData): RelationPick[] {
  const rules = data.worldRelations;
  const rng = makeRng(deriveSeed(seed, 48));
  const count = rules.changeCount.min + Math.floor(rng() * (rules.changeCount.max - rules.changeCount.min + 1));
  const picks: RelationPick[] = [];
  for (let i = 0; i < count; i++) {
    const def = rules.changes[weightedIndex(rng, rules.changes.map((c) => c.weight))];
    picks.push({ def, age: def.ageMin + Math.floor(rng() * (def.ageMax - def.ageMin + 1)) });
  }
  return picks.sort((a, b) => a.age - b.age || a.def.id.localeCompare(b.def.id));
}

/** 兩國之間的牽連：互惠宗門與世仇宗門的數量（任一方境內的宗門與對方互惠或世仇都算） */
export function ties(snap: WorldSnapshot, a: string, b: string): { ally: number; feud: number } {
  let ally = 0;
  let feud = 0;
  for (const s of snap.sects) {
    if (!alive(s)) continue;
    const owner = snap.owners[s.fief];
    const rel = snap.relations[s.id];
    if (!rel || (owner !== a && owner !== b)) continue;
    const other = owner === a ? b : a;
    if (rel.ally === other) ally++;
    if (rel.feud === other) feud++;
  }
  return { ally, feud };
}

/** S2：併國與易手時，對象國的權重倍率（互惠的兩國較易併、世仇的兩國較常奪領） */
export function relationWeight(snap: WorldSnapshot, data: GameData, kind: "merge" | "owner", a: string, b: string): number {
  const inf = data.worldRelations.influence;
  const t = ties(snap, a, b);
  const ally = kind === "merge" ? inf.mergeAlly : inf.ownerAlly;
  const feud = kind === "merge" ? inf.mergeFeud : inf.ownerFeud;
  return (t.ally > 0 ? ally : 1) * (t.feud > 0 ? feud : 1);
}

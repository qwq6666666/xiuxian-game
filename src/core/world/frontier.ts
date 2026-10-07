// 疆界流變：以維諾格為單位的領土歸屬。只管顯示用的歸屬與進度；
// 「這一處是否交戰、路程延遲、物價」仍由 territory.ts 的整數歲判定，兩者互不影響。
// 國家由「領」組成（M51）：格的所屬領＝格心（邏輯座標）加低頻雜訊位移後最近的領，
// 所以國界不貼任何地域線。純函式：由世界種子與年齡決定，不進存檔、不消耗 rngSeed。
import type { GameData, Point } from "../../data/types";
import { fiefsFor, type Fiefs } from "./fiefs";
import { MinHeap } from "../util/heap";
import { fromView, toView } from "./mapview";
import { clamp, fbm, hash2 } from "../util/noise";
import { deriveSeed } from "../rng";
import { changeFiefs, changeTarget } from "./territory";
import type { Terrain } from "./terrain";
import { worldAt, type World, type WorldChange, type WorldSnapshot } from "./world";

/** 以季為單位的年齡；歸屬每季才重算一次 */
export function ageQuarters(ageMonths: number): number {
  return Math.floor(ageMonths / 3);
}

/** 一次推進中的領土變化 */
export interface Fight {
  /** 在 world.changes 裡的索引 */
  change: number;
  /** 牽涉的領（索引） */
  fiefs: number[];
  attacker: string;
  defender: string;
  /** 推進進度 0..1 */
  progress: number;
  /** 被攻處的中心（顯示座標） */
  focus: Point;
  /** 進攻方最近的領中心（顯示座標）；分裂沒有 */
  source: Point | null;
}

export interface TerritoryMap {
  quarter: number;
  /** 索引對應的國家 id（含分裂出的新國） */
  polityIds: string[];
  /** 每格的擁有者（polityIds 的索引），海是 -1 */
  owner: Int16Array;
  /** 每格屬於哪一場推進（fights 的索引），沒有是 -1 */
  fightAt: Int16Array;
  fights: Fight[];
}

export interface TerritoryOptions {
  /** 和平時期交界格的微小拉鋸，預設開 */
  drift?: boolean;
}

const WARP_AMPLITUDE = 11;
const WARP_SCALE = 0.03;
const cellFiefCache = new WeakMap<Terrain, Map<number, Int16Array>>();

/** 每個陸地格所屬的領；海是 -1 */
export function cellFiefs(terrain: Terrain, data: GameData, fiefs: Fiefs): Int16Array {
  let byFief = cellFiefCache.get(terrain);
  if (!byFief) cellFiefCache.set(terrain, (byFief = new Map()));
  const hit = byFief.get(fiefs.seed);
  if (hit) return hit;
  const seed = deriveSeed(fiefs.seed, 0x51f1);
  const out = new Int16Array(terrain.grid.cells.length).fill(-1);
  for (const c of terrain.grid.cells) {
    if (!terrain.land[c.id]) continue;
    const [lx, ly] = fromView(data.map, [c.x, c.y]);
    const wx = lx + (fbm(lx * WARP_SCALE, ly * WARP_SCALE, seed, 3) - 0.5) * 2 * WARP_AMPLITUDE;
    const wy = ly + (fbm(lx * WARP_SCALE + 31.7, ly * WARP_SCALE + 17.3, seed, 3) - 0.5) * 2 * WARP_AMPLITUDE;
    out[c.id] = fiefs.indexAt([wx, wy]);
  }
  byFief.set(fiefs.seed, out);
  return out;
}

/** 推進順序（格 id）：離進攻方交界最近的先換；分裂從新國的國都向外。同一個世界的同一次變化只算一次。 */
const orderCache = new WeakMap<Terrain, WeakMap<WorldChange, Int32Array>>();

function changeCellOrder(world: World, index: number, terrain: Terrain, data: GameData, fiefs: Fiefs, cf: Int16Array, set: number[], fiefOwners: Record<string, string>, to: string): Int32Array {
  const change = world.changes[index];
  let cache = orderCache.get(terrain);
  if (!cache) orderCache.set(terrain, (cache = new WeakMap()));
  const hit = cache.get(change);
  if (hit) return hit;
  const { cells } = terrain.grid;
  const inSet = new Set(set);
  const ids: number[] = [];
  for (const c of cells) if (terrain.land[c.id] && inSet.has(cf[c.id])) ids.push(c.id);
  const member = new Set(ids);
  let sources: number[] = [];
  if (change.kind !== "split") {
    for (const id of ids) if (cells[id].nb.some((n) => terrain.land[n] && !member.has(n) && fiefOwners[fiefs.ids[cf[n]]] === to)) sources.push(id);
  }
  if (sources.length === 0 && ids.length > 0) {
    // 分裂從新國國都領的中心向外；沒有相鄰的進攻方時也從第一個領的中心開始
    const ref = toView(data.map, fiefs.points[change.kind === "split" ? fiefs.ids.indexOf(change.created.seat) : set[0]]);
    let best = ids[0];
    let bd = Infinity;
    for (const id of ids) {
      const q = (cells[id].x - ref[0]) ** 2 + (cells[id].y - ref[1]) ** 2;
      if (q < bd) {
        bd = q;
        best = id;
      }
    }
    sources = [best];
  }
  const dist = new Map<number, number>();
  const heap = new MinHeap();
  for (const s of sources) {
    dist.set(s, 0);
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const [d, a] = heap.pop();
    if (d > (dist.get(a) ?? Infinity)) continue;
    for (const b of cells[a].nb) {
      if (!member.has(b)) continue;
      const nd = d + Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
      if (nd < (dist.get(b) ?? Infinity)) {
        dist.set(b, nd);
        heap.push(nd, b);
      }
    }
  }
  const far = (id: number): number => 1e6 + Math.min(...sources.map((s) => Math.hypot(cells[s].x - cells[id].x, cells[s].y - cells[id].y)));
  const out = Int32Array.from(ids.map((id) => ({ id, d: dist.get(id) ?? far(id) })).sort((x, y) => x.d - y.d || x.id - y.id).map((r) => r.id));
  cache.set(change, out);
  return out;
}

const mapMemo: { world: World; terrain: Terrain; key: string; value: TerritoryMap }[] = [];
const MEMO_SIZE = 8;

/** 某個季的領土歸屬。同種子同季結果相同。 */
export function territoryMapAt(world: World, quarters: number, data: GameData, terrain: Terrain, opts: TerritoryOptions = {}): TerritoryMap {
  const drift = opts.drift !== false;
  const key = `${quarters}|${drift ? 1 : 0}`;
  const hit = mapMemo.findIndex((m) => m.world === world && m.terrain === terrain && m.key === key);
  if (hit >= 0) {
    const [entry] = mapMemo.splice(hit, 1);
    mapMemo.push(entry);
    return entry.value;
  }
  const years = quarters / 4;
  const rules = data.map.territoryRules;
  const fiefs = fiefsFor(world.seed, data);
  const cf = cellFiefs(terrain, data, fiefs);
  const polityIds = [...world.polities.map((p) => p.id)];
  for (const c of world.changes) if (c.kind === "split" && !polityIds.includes(c.created.id)) polityIds.push(c.created.id);
  const index = (id: string): number => polityIds.indexOf(id);
  const { cells } = terrain.grid;
  const owners = { ...world.owners };
  const owner = new Int16Array(cells.length).fill(-1);
  for (const c of cells) if (cf[c.id] >= 0) owner[c.id] = index(owners[fiefs.ids[cf[c.id]]]);
  const fightAt = new Int16Array(cells.length).fill(-1);
  const fights: Fight[] = [];

  world.changes.forEach((change, ci) => {
    if (change.age > years) return;
    const to = changeTarget(change);
    if (to === null) return;
    const set = changeFiefs(fiefs, change, owners);
    if (set.length === 0) return;
    const defender = owners[fiefs.ids[set[0]]];
    const toIdx = index(to);
    const order = changeCellOrder(world, ci, terrain, data, fiefs, cf, set, owners, to);
    const progress = clamp((years - change.age) / rules.transitionYears, 0, 1);
    const flips = progress >= 1 ? order.length : Math.floor(progress * order.length);
    for (let k = 0; k < flips; k++) owner[order[k]] = toIdx;
    if (progress < 1 && order.length > 0) {
      let sx = 0;
      let sy = 0;
      for (const id of order) {
        sx += cells[id].x;
        sy += cells[id].y;
      }
      const focus: Point = [sx / order.length, sy / order.length];
      const focusLogical = fromView(data.map, focus);
      let source: Point | null = null;
      let bd = Infinity;
      if (change.kind !== "split") {
        for (let i = 0; i < fiefs.count; i++) {
          if (owners[fiefs.ids[i]] !== to || set.includes(i)) continue;
          const d = (fiefs.points[i][0] - focusLogical[0]) ** 2 + (fiefs.points[i][1] - focusLogical[1]) ** 2;
          if (d < bd) {
            bd = d;
            source = toView(data.map, fiefs.points[i]);
          }
        }
      }
      const fightIndex = fights.push({ change: ci, fiefs: set, attacker: to, defender, progress, focus, source }) - 1;
      for (const id of order) fightAt[id] = fightIndex;
    }
    for (const f of set) owners[fiefs.ids[f]] = to;
  });

  // 和平拉鋸：只動交界上一格深，由雜湊決定，不改判定
  if (drift) {
    const snap = worldAt(world, Math.floor(years));
    const strength = polityStrength(world, Math.floor(years), data, snap);
    const copy = owner.slice();
    const period = rules.driftPeriodYears;
    const u = years / period;
    const k0 = Math.floor(u);
    const f = u - k0;
    const smooth = f * f * (3 - 2 * f);
    for (const c of cells) {
      if (copy[c.id] < 0 || fightAt[c.id] >= 0) continue;
      const mine = polityIds[copy[c.id]];
      let rival = -1;
      for (const n of c.nb) {
        if (copy[n] >= 0 && copy[n] !== copy[c.id] && fightAt[n] < 0) {
          rival = copy[n];
          break;
        }
      }
      if (rival < 0) continue;
      const diff = (strength[mine]?.score ?? 0) - (strength[polityIds[rival]]?.score ?? 0);
      const bias = clamp(diff / 4, -1, 1) * 0.5;
      const a = hash2(c.id, k0, world.seed ^ 0x7d1f) * 2 - 1;
      const b = hash2(c.id, k0 + 1, world.seed ^ 0x7d1f) * 2 - 1;
      const wobble = a + (b - a) * smooth;
      // 弱的一方、又碰上這個週期的低谷，邊上的這一格暫時被對面佔去
      if (bias + wobble * 0.5 < -rules.driftThreshold) owner[c.id] = rival;
    }
  }
  const value: TerritoryMap = { quarter: quarters, polityIds, owner, fightAt, fights };
  mapMemo.push({ world, terrain, key, value });
  if (mapMemo.length > MEMO_SIZE) mapMemo.shift();
  return value;
}

/** 某格所在的推進，沒有回傳 null */
export function fightOfCell(map: TerritoryMap, cellId: number): Fight | null {
  const i = map.fightAt[cellId];
  return i >= 0 ? map.fights[i] : null;
}

export interface PolityStrength {
  /** 持有的領數 */
  fiefs: number;
  prosperSects: number;
  openSects: number;
  /** 與該國互惠、但山門在別國境內的宗門數 */
  allySects: number;
  /** 近年淨得失的領數 */
  recent: number;
  score: number;
}

/** 國勢：持有的領、興盛／開放宗門、互惠宗門、近年得失地。給拉鋸偏向與資訊卡用。 */
export function polityStrength(world: World, ageYears: number, data: GameData, snap: WorldSnapshot = worldAt(world, ageYears)): Record<string, PolityStrength> {
  const out: Record<string, PolityStrength> = {};
  const get = (id: string) => (out[id] ??= { fiefs: 0, prosperSects: 0, openSects: 0, allySects: 0, recent: 0, score: 0 });
  const fiefs = fiefsFor(world.seed, data);
  for (const p of snap.polities) get(p.id);
  for (const id of fiefs.ids) get(snap.owners[id]).fiefs++;
  for (const s of snap.sects) {
    const owner = snap.owners[s.fief];
    if (s.state === "prosper") get(owner).prosperSects++;
    if (s.state !== "closed" && s.state !== "fallen") get(owner).openSects++;
    const ally = snap.relations[s.id]?.ally;
    if (ally && ally !== owner) get(ally).allySects++;
  }
  const recentYears = data.map.territoryRules.strengthWindowYears;
  const owners = { ...world.owners };
  for (const c of world.changes) {
    if (c.age > ageYears) break;
    const to = changeTarget(c);
    if (to === null) continue;
    for (const f of changeFiefs(fiefs, c, owners)) {
      if (ageYears - c.age <= recentYears) {
        get(to).recent++;
        get(owners[fiefs.ids[f]]).recent--;
      }
      owners[fiefs.ids[f]] = to;
    }
  }
  // 一個國平均五份之一的領約等於舊制的一處地域（計 2 分），所以每個領 10 / 總領數 分
  const unit = 10 / fiefs.count;
  for (const v of Object.values(out)) v.score = v.fiefs * unit + v.prosperSects + v.openSects * 0.5 + v.allySects * 0.5 + v.recent * unit;
  return out;
}

export interface BorderEvent {
  age: number;
  kind: "owner" | "merge" | "split";
  from: string;
  to: string;
  note: string;
  /** 牽涉的領數 */
  fiefs: number;
  /** 牽涉的領（索引） */
  fiefList: number[];
  /** 牽涉的領的中心（邏輯座標），時間軸點選後在地圖上標出 */
  spot: Point;
}

/** 本世到 uptoAge 為止的國界變化，供時間軸與大事記使用 */
export function territoryHistory(world: World, data: GameData, uptoAge: number): BorderEvent[] {
  const fiefs = fiefsFor(world.seed, data);
  const owners = { ...world.owners };
  const out: BorderEvent[] = [];
  for (const c of world.changes) {
    if (c.age > uptoAge) break;
    const to = changeTarget(c);
    if (to === null) continue;
    const set = changeFiefs(fiefs, c, owners);
    if (set.length === 0) continue;
    const spot: Point = [set.reduce((a, i) => a + fiefs.points[i][0], 0) / set.length, set.reduce((a, i) => a + fiefs.points[i][1], 0) / set.length];
    out.push({ age: c.age, kind: c.kind as BorderEvent["kind"], from: owners[fiefs.ids[set[0]]], to, note: c.note, fiefs: set.length, fiefList: set, spot });
    for (const f of set) owners[fiefs.ids[f]] = to;
  }
  return out;
}

// 疆界流變：以維諾格為單位的領土歸屬。只管顯示用的歸屬與進度；
// 「這一處是否交戰、路程延遲、物價」仍由 territory.ts 的整數歲判定，兩者互不影響。
// 純函式：由世界種子與年齡決定，不進存檔、不消耗 rngSeed。
import type { GameData } from "../data/types";
import { MinHeap } from "./heap";
import { clamp, hash2 } from "./noise";
import type { Terrain } from "./terrain";
import { worldAt, type World, type WorldChange, type WorldSnapshot } from "./world";

/** 以季為單位的年齡；歸屬每季才重算一次 */
export function ageQuarters(ageMonths: number): number {
  return Math.floor(ageMonths / 3);
}

function changedRegions(change: WorldChange, owners: Record<string, string>): string[] {
  if (change.kind === "owner" || change.kind === "split") return [change.region];
  if (change.kind === "merge") return Object.keys(owners).filter((r) => owners[r] === change.from);
  return [];
}

function changeTarget(change: WorldChange): string | null {
  if (change.kind === "owner" || change.kind === "merge") return change.to;
  if (change.kind === "split") return change.created.id;
  return null;
}

export interface RegionFight {
  /** 對應 Terrain.regionIds 的索引 */
  regionIndex: number;
  region: string;
  attacker: string;
  defender: string;
  /** 整處地域的推進進度 0..1 */
  progress: number;
}

export interface TerritoryMap {
  quarter: number;
  /** 索引對應的國家 id（含分裂出的新國） */
  polityIds: string[];
  /** 每格的擁有者（polityIds 的索引），海是 -1 */
  owner: Int16Array;
  fights: RegionFight[];
}

export interface TerritoryOptions {
  /** 和平時期交界格的微小拉鋸，預設開 */
  drift?: boolean;
}

/** 推進順序：離進攻方最近的格先換；沒有相鄰的進攻方地域（分裂）就從都城向外 */
const orderCache = new WeakMap<Terrain, Map<string, Int32Array>>();

function regionOrder(terrain: Terrain, data: GameData, regionIndex: number, attacker: string, owners: Record<string, string>): Int32Array {
  const regionId = terrain.regionIds[regionIndex];
  const key = `${regionId}:${attacker}:${data.map.adjacency[regionId]?.filter((n) => owners[n] === attacker).join(",")}`;
  let cache = orderCache.get(terrain);
  if (!cache) orderCache.set(terrain, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const { cells } = terrain.grid;
  const ids: number[] = [];
  for (const c of cells) if (terrain.land[c.id] && terrain.region[c.id] === regionIndex) ids.push(c.id);
  const inRegion = new Set(ids);
  const attackerRegions = new Set((data.map.adjacency[regionId] ?? []).filter((n) => owners[n] === attacker).map((n) => terrain.regionIds.indexOf(n)));
  const sources: number[] = [];
  for (const id of ids) if (cells[id].nb.some((n) => terrain.land[n] && attackerRegions.has(terrain.region[n]))) sources.push(id);
  if (sources.length === 0) {
    // 從都城向外：取離都城最近的格
    const capital = data.map.regions.find((r) => r.id === regionId)!.capital!;
    const [cx, cy] = [capital[0] * data.map.view.scale[0], capital[1] * data.map.view.scale[1]];
    let best = ids[0];
    let bd = Infinity;
    for (const id of ids) {
      const q = (cells[id].x - cx) ** 2 + (cells[id].y - cy) ** 2;
      if (q < bd) {
        bd = q;
        best = id;
      }
    }
    sources.push(best);
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
      if (!inRegion.has(b)) continue;
      const nd = d + Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y);
      if (nd < (dist.get(b) ?? Infinity)) {
        dist.set(b, nd);
        heap.push(nd, b);
      }
    }
  }
  // 沒連到來源的格（孤島）排在最後，依離最近來源的直線距離
  const far = (id: number): number => 1e6 + Math.min(...sources.map((s) => Math.hypot(cells[s].x - cells[id].x, cells[s].y - cells[id].y)));
  const ranked = ids.map((id) => ({ id, d: dist.get(id) ?? far(id) })).sort((x, y) => x.d - y.d || x.id - y.id);
  const out = Int32Array.from(ranked.map((r) => r.id));
  cache.set(key, out);
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
  const polityIds = [...world.polities.map((p) => p.id)];
  for (const c of world.changes) if (c.kind === "split" && !polityIds.includes(c.created.id)) polityIds.push(c.created.id);
  const index = (id: string): number => polityIds.indexOf(id);
  const { cells } = terrain.grid;
  const owners = { ...world.owners };
  const owner = new Int16Array(cells.length).fill(-1);
  for (const c of cells) if (terrain.land[c.id]) owner[c.id] = index(owners[terrain.regionIds[terrain.region[c.id]]]);
  const fights = new Map<number, RegionFight>();

  for (const change of world.changes) {
    if (change.age > years) break;
    const to = changeTarget(change);
    if (to === null) continue;
    for (const region of changedRegions(change, owners)) {
      const ri = terrain.regionIds.indexOf(region);
      if (ri < 0) continue;
      const before = owners[region];
      const order = regionOrder(terrain, data, ri, to, owners);
      const progress = clamp((years - change.age) / rules.transitionYears, 0, 1);
      const flips = progress >= 1 ? order.length : Math.floor(progress * order.length);
      for (let k = 0; k < order.length; k++) owner[order[k]] = index(k < flips ? to : before);
      if (progress < 1) fights.set(ri, { regionIndex: ri, region, attacker: to, defender: before, progress });
      else fights.delete(ri);
      owners[region] = to;
    }
  }

  // 和平拉鋸：只動交界上一格深，由 deriveSeed 的雜湊決定，不改判定
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
      if (copy[c.id] < 0 || fights.has(terrain.region[c.id])) continue;
      const mine = polityIds[copy[c.id]];
      let rival = -1;
      for (const n of c.nb) {
        if (copy[n] >= 0 && copy[n] !== copy[c.id] && !fights.has(terrain.region[n])) {
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
  const value: TerritoryMap = { quarter: quarters, polityIds, owner, fights: [...fights.values()] };
  mapMemo.push({ world, terrain, key, value });
  if (mapMemo.length > MEMO_SIZE) mapMemo.shift();
  return value;
}

/** 某處易手的進度，回傳 null 表示不在推進中 */
export function regionFight(map: TerritoryMap, region: string): RegionFight | null {
  return map.fights.find((f) => f.region === region) ?? null;
}

export interface PolityStrength {
  regions: number;
  prosperSects: number;
  openSects: number;
  /** 與該國互惠、但山門在別國境內的宗門數 */
  allySects: number;
  /** 近年淨得失地域數 */
  recent: number;
  score: number;
}

/** 國勢：持有地域、興盛／開放宗門、近年得失地。給拉鋸偏向與資訊卡用。 */
export function polityStrength(world: World, ageYears: number, data: GameData, snap: WorldSnapshot = worldAt(world, ageYears)): Record<string, PolityStrength> {
  const out: Record<string, PolityStrength> = {};
  const get = (id: string) => (out[id] ??= { regions: 0, prosperSects: 0, openSects: 0, allySects: 0, recent: 0, score: 0 });
  for (const p of snap.polities) get(p.id);
  for (const r of data.map.regions.filter((x) => x.land)) get(snap.owners[r.id]).regions++;
  for (const s of snap.sects) {
    const owner = snap.owners[s.region];
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
    for (const r of changedRegions(c, owners)) {
      if (ageYears - c.age <= recentYears) {
        get(to).recent++;
        get(owners[r]).recent--;
      }
      owners[r] = to;
    }
  }
  for (const v of Object.values(out)) v.score = v.regions * 2 + v.prosperSects + v.openSects * 0.5 + v.allySects * 0.5 + v.recent;
  return out;
}

export interface BorderEvent {
  age: number;
  region: string;
  regionName: string;
  from: string;
  to: string;
  kind: "owner" | "merge" | "split";
  note: string;
}

/** 本世到 uptoAge 為止的國界變化，供時間軸與大事記使用 */
export function territoryHistory(world: World, data: GameData, uptoAge: number): BorderEvent[] {
  const owners = { ...world.owners };
  const out: BorderEvent[] = [];
  for (const c of world.changes) {
    if (c.age > uptoAge) break;
    const to = changeTarget(c);
    if (to === null) continue;
    for (const region of changedRegions(c, owners)) {
      out.push({ age: c.age, region, regionName: data.map.regions.find((r) => r.id === region)!.name, from: owners[region], to, kind: c.kind as BorderEvent["kind"], note: c.note });
      owners[region] = to;
    }
  }
  return out;
}

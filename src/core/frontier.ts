// 疆界流變：用加權 Voronoi（power diagram）算出會連續移動的國界。
// 只管繪製幾何；「誰在交戰、路程延遲、物價」仍由 territory.ts 的整數歲判定，兩者互不影響。
// 純函式：由世界種子與年齡決定，不進存檔、不消耗 rngSeed。
import type { GameData, Point } from "../data/types";
import { deriveSeed, nextRandom } from "./rng";
import { worldAt, type World, type WorldChange, type WorldSnapshot } from "./world";

export interface WeightedSite {
  center: Point;
  weight: number;
}

/** 多邊形的一個頂點；label 是「從這個頂點到下一個頂點」那條邊的鄰格索引（-1 是地圖外框） */
interface Vertex {
  x: number;
  y: number;
  label: number;
}

/**
 * 加權半平面裁切：點 p 屬於 c 的條件是 |p−c|² − w_c ≤ |p−o|² − w_o。
 * 權重全等時與 territoryPolygon 的一般 Voronoi 完全相同。others 的 index 用來標記邊的鄰格。
 */
export function powerCell(site: WeightedSite, others: { site: WeightedSite; index: number }[], box: Point): { polygon: Point[]; neighbors: number[] } {
  let poly: Vertex[] = [
    { x: 0, y: 0, label: -1 }, { x: box[0], y: 0, label: -1 },
    { x: box[0], y: box[1], label: -1 }, { x: 0, y: box[1], label: -1 },
  ];
  const [cx, cy] = site.center;
  for (const { site: other, index } of others) {
    const a = 2 * (other.center[0] - cx);
    const b = 2 * (other.center[1] - cy);
    const c = other.center[0] ** 2 + other.center[1] ** 2 - cx ** 2 - cy ** 2 + site.weight - other.weight;
    const next: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const from = poly[i];
      const to = poly[(i + 1) % poly.length];
      const f = a * from.x + b * from.y - c;
      const t = a * to.x + b * to.y - c;
      if (f <= 0) {
        next.push({ x: from.x, y: from.y, label: f === 0 && t > 0 ? index : from.label });
        if (f < 0 && t > 0) {
          const r = f / (f - t);
          next.push({ x: from.x + (to.x - from.x) * r, y: from.y + (to.y - from.y) * r, label: index });
        }
      } else if (t < 0) {
        const r = f / (f - t);
        next.push({ x: from.x + (to.x - from.x) * r, y: from.y + (to.y - from.y) * r, label: from.label });
      }
    }
    poly = next;
    if (poly.length === 0) break;
  }
  return { polygon: poly.map((v): Point => [v.x, v.y]), neighbors: poly.map((v) => v.label) };
}

export interface CellFight {
  attacker: string;
  defender: string;
  /** 整處地域的推進進度 0..1 */
  progress: number;
}

export interface GeoCell {
  id: string;
  region: string;
  nodeIndex: number;
  center: Point;
  ownerId: string;
  polygon: Point[];
  /** 與 polygon 每條邊對應的鄰格 id；空字串是地圖外框 */
  neighbors: string[];
  fight?: CellFight;
}

export interface FrontLine {
  a: Point;
  b: Point;
  ownerA: string;
  ownerB: string;
  fighting: boolean;
}

export interface GeometryOptions {
  /** 和平時期的微小拉鋸，預設開 */
  drift?: boolean;
}

/** 以季為單位的年齡；幾何每季才重算一次 */
export function ageQuarters(ageMonths: number): number {
  return Math.floor(ageMonths / 3);
}

const MEMO_SIZE = 8;
const memo: { world: World; data: GameData; key: string; value: GeoCell[] }[] = [];

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

/** 推進順序：離進攻方最近的節點先換；找不到相鄰的進攻方地域就從都城向外 */
function nodeOrder(region: string, attacker: string, owners: Record<string, string>, data: GameData): number[] {
  const def = data.map.regions.find((r) => r.id === region)!;
  const nodes = def.nodes!;
  const anchors: Point[] = [];
  for (const n of data.map.adjacency[region] ?? []) {
    if (owners[n] === attacker) anchors.push(...data.map.regions.find((r) => r.id === n)!.nodes!);
  }
  if (anchors.length === 0) anchors.push(def.capital!);
  const dist = nodes.map((p, i) => ({ i, d: Math.min(...anchors.map((a) => Math.hypot(a[0] - p[0], a[1] - p[1]))) }));
  return dist.sort((x, y) => x.d - y.d || x.i - y.i).map((x) => x.i);
}

export interface PolityStrength {
  regions: number;
  prosperSects: number;
  openSects: number;
  /** 近年淨得失地域數 */
  recent: number;
  score: number;
}

/** 國勢：持有地域、興盛／開放宗門、近年得失地。給拉鋸振幅與資訊卡用。 */
export function polityStrength(world: World, ageYears: number, data: GameData, snap: WorldSnapshot = worldAt(world, ageYears)): Record<string, PolityStrength> {
  const out: Record<string, PolityStrength> = {};
  const get = (id: string) => (out[id] ??= { regions: 0, prosperSects: 0, openSects: 0, recent: 0, score: 0 });
  for (const p of snap.polities) get(p.id);
  for (const r of data.map.regions.filter((x) => x.land)) get(snap.owners[r.id]).regions++;
  for (const s of snap.sects) {
    const owner = snap.owners[s.region];
    if (s.state === "prosper") get(owner).prosperSects++;
    if (s.state !== "closed" && s.state !== "fallen") get(owner).openSects++;
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
  for (const v of Object.values(out)) v.score = v.regions * 2 + v.prosperSects + v.openSects * 0.5 + v.recent;
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** 節點隨時間的擺動值，-1..1，週期之間平滑插值；只用 deriveSeed，不碰 rngSeed */
function driftAt(worldSeed: number, nodeSalt: number, years: number, period: number): number {
  const u = years / period;
  const k = Math.floor(u);
  const val = (n: number) => nextRandom(deriveSeed(deriveSeed(worldSeed, 0x7d1f), nodeSalt * 977 + n))[0] * 2 - 1;
  return val(k) + (val(k + 1) - val(k)) * smooth(u - k);
}

/** 某個季的國界幾何。同種子同季結果相同。 */
export function territoryGeometryAt(world: World, quarters: number, data: GameData, opts: GeometryOptions = {}): GeoCell[] {
  const drift = opts.drift !== false;
  const key = `${quarters}|${drift ? 1 : 0}`;
  const hit = memo.findIndex((m) => m.world === world && m.data === data && m.key === key);
  if (hit >= 0) {
    const [entry] = memo.splice(hit, 1);
    memo.push(entry);
    return entry.value;
  }
  const rules = data.map.territoryRules;
  const years = quarters / 4;
  const lands = data.map.regions.filter((r) => r.land);

  // 一、逐筆重播易手：每個節點的所屬與權重位移
  const owners = { ...world.owners };
  const nodeOwner = new Map<string, string>();
  const offset = new Map<string, number>();
  const fights = new Map<string, CellFight>();
  for (const r of lands) r.nodes!.forEach((_, i) => nodeOwner.set(`${r.id}:${i}`, owners[r.id]));
  for (const change of world.changes) {
    if (change.age > years) break;
    const to = changeTarget(change);
    if (to === null) continue;
    for (const region of changedRegions(change, owners)) {
      const def = data.map.regions.find((r) => r.id === region)!;
      const n = def.nodes!.length;
      const order = nodeOrder(region, to, owners, data);
      const progress = Math.min(1, Math.max(0, (years - change.age) / rules.transitionYears));
      const span = n + rules.frontOverlap;
      const before = owners[region];
      order.forEach((nodeIndex, k) => {
        const p = Math.min(1, Math.max(0, (progress * span - k) / (rules.frontOverlap + 1)));
        const id = `${region}:${nodeIndex}`;
        nodeOwner.set(id, p >= 0.5 ? to : before);
        offset.set(id, p > 0 && p < 1 ? -4 * p * (1 - p) * rules.frontWeight : 0);
        if (progress < 1) fights.set(id, { attacker: to, defender: before, progress });
        else fights.delete(id);
      });
      owners[region] = to;
    }
  }

  // 二、第一輪（不含擺動）找出國界上的節點，第二輪才加擺動
  const sites = lands.flatMap((r) => r.nodes!.map((p, i) => ({ id: `${r.id}:${i}`, region: r.id, index: i, p })));
  const build = (extra: Map<string, number>) => {
    const ws: WeightedSite[] = sites.map((s) => ({ center: s.p, weight: (offset.get(s.id) ?? 0) + (extra.get(s.id) ?? 0) }));
    return sites.map((_, i) => powerCell(ws[i], ws.map((site, index) => ({ site, index })).filter((o) => o.index !== i), data.map.viewBox));
  };
  let cells = build(new Map());
  if (drift && rules.driftAmplitude > 0) {
    const whole = Math.floor(years);
    const strength = polityStrength(world, whole, data);
    const extra = new Map<string, number>();
    sites.forEach((s, i) => {
      const mine = nodeOwner.get(s.id)!;
      const rivals = new Set(cells[i].neighbors.filter((n) => n >= 0).map((n) => nodeOwner.get(sites[n].id)!).filter((o) => o !== mine));
      if (rivals.size === 0) return;
      const diff = Math.max(...[...rivals].map((o) => (strength[mine]?.score ?? 0) - (strength[o]?.score ?? 0)));
      const bias = Math.max(-1, Math.min(1, diff / 4)) * 0.5;
      extra.set(s.id, rules.driftAmplitude * (bias + driftAt(world.seed, i + 1, years, rules.driftPeriodYears) * 0.5));
    });
    cells = build(extra);
  }

  const value = sites.map((s, i): GeoCell => ({
    id: s.id, region: s.region, nodeIndex: s.index, center: s.p,
    ownerId: nodeOwner.get(s.id)!,
    polygon: cells[i].polygon,
    neighbors: cells[i].neighbors.map((n) => (n < 0 ? "" : sites[n].id)),
    ...(fights.has(s.id) ? { fight: fights.get(s.id) } : {}),
  }));
  memo.push({ world, data, key, value });
  if (memo.length > MEMO_SIZE) memo.shift();
  return value;
}

/** 不同國家相鄰的邊；同國格之間的內線不回傳 */
export function frontLines(cells: GeoCell[]): FrontLine[] {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const out: FrontLine[] = [];
  for (const cell of cells) {
    cell.polygon.forEach((a, i) => {
      const nid = cell.neighbors[i];
      if (nid === "" || nid <= cell.id) return;
      const other = byId.get(nid);
      if (!other || other.ownerId === cell.ownerId) return;
      const b = cell.polygon[(i + 1) % cell.polygon.length];
      const f = cell.fight ?? other.fight;
      const fighting = f !== undefined && [cell.ownerId, other.ownerId].every((o) => o === f.attacker || o === f.defender);
      out.push({ a, b, ownerA: cell.ownerId, ownerB: other.ownerId, fighting });
    });
  }
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

/** 某處易手的進度，回傳 null 表示不在推進中 */
export function regionFight(cells: GeoCell[], region: string): CellFight | null {
  return cells.find((c) => c.region === region && c.fight)?.fight ?? null;
}

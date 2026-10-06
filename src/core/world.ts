// 世界生成與快照：每一世由世界種子生成一份世界，一世之內隨年齡推進而變化。
// 全是純函式，不讀時間、不碰 state 的亂數；世界本身不進存檔，由種子重算。
import { gameData } from "../data/load";
import { DEFAULT_SLOTS, type SlotValues } from "../data/slots";
import type { GameData, SectState, WorldEventDef } from "../data/types";
import { deriveSeed, nextRandom } from "./rng";
import { bindRelation, initialRelations, relationPicks, relationWeight, type SectRelation } from "./relations";
import { fiefsFor, partitionNations, seatOf, fiefDistance, type Fiefs } from "./fiefs";

export type SectKind = "guard" | "greatSect" | "school";
export type SectRank = "great" | "school";

export interface WorldSect {
  id: string;
  name: string;
  kind: SectKind;
  rank: SectRank;
  region: string;
  /** 在該地域 sites 中的索引 */
  site: number;
  /** 山門所在的領（離山門座標最近的領），決定它在哪一國境內 */
  fief: string;
  state: SectState;
}

export interface WorldPolity {
  id: string;
  name: string;
  /** 諸部：尚未立國 */
  tribal: boolean;
  color: string;
  capital: string;
  /** 國都所在的領 id；被併入後這裡就是舊都 */
  seat: string;
}

export interface WorldFerry {
  id: string;
  region: string;
  /** 在該地域 ferries 中的索引 */
  index: number;
  broken: boolean;
}

/** 世局的一次變化。note 是生成時就填好名字的一句話。 */
export type WorldChange = { age: number; note: string } & (
  | { kind: "sectState"; sect: string; to: SectState }
  | { kind: "sectRank"; sect: string; to: SectRank }
  | { kind: "sectNew"; sect: WorldSect }
  | { kind: "merge"; from: string; to: string }
  | { kind: "split"; polity: string; fiefs: string[]; created: WorldPolity }
  | { kind: "owner"; fiefs: string[]; to: string }
  | { kind: "polityNew"; polity: string; capital: string }
  | { kind: "rename"; polity: string; name: string }
  | { kind: "capital"; polity: string; capital: string }
  | { kind: "ferry"; ferry: string; broken: boolean }
  | { kind: "merchant"; region: string }
  | { kind: "relation"; sect: string; polity: string; relation: "ally" | "feud"; on: boolean }
);

/** 地圖、文字與擲骰畫面用到的當世名稱（就是名稱欄位的值） */
export type WorldSlots = SlotValues;

export interface World {
  seed: number;
  birth: { region: string; village: string; market: string; mountain: string; fief: string };
  names: { guard: string; merchant: string; wanderers: string };
  /** 這個世界的初始國家數 */
  nations: number;
  polities: WorldPolity[];
  /** 領 id → 國家 id */
  owners: Record<string, string>;
  sects: WorldSect[];
  ferries: WorldFerry[];
  merchantBranches: string[];
  changes: WorldChange[];
  /** 各宗門的初始關係（互惠與世仇的國家） */
  relations: ({ sect: string } & SectRelation)[];
}

/** 某個年齡時的世界 */
export interface WorldSnapshot {
  owners: Record<string, string>;
  /** 仍存在的國家 */
  polities: WorldPolity[];
  sects: WorldSect[];
  ferries: WorldFerry[];
  merchantBranches: string[];
  /** 宗門 id → 互惠與世仇的國家；沒有關係的宗門不在其中 */
  relations: Record<string, SectRelation>;
  /** 到這個年齡為止最近的幾條變化（由舊到新） */
  notes: string[];
  changeCount: number;
}

/** 擲骰時不得更動的設計：每世抽十到十四條變化，三十到七十歲之間至少一條 */
const CHANGE_MIN = 10;
const CHANGE_SPREAD = 4;
const GUARANTEE_WINDOW: [number, number] = [30, 70];
const RECENT_NOTES = 2;

const SECT_BAD: SectState[] = ["fallen"];

/** 國家至少要有這麼多領，才會分裂或讓出領 */
const SPLIT_MIN_FIEFS = 4;
const OWNER_MIN_FIEFS = 3;

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    const [v, n] = nextRandom(s);
    s = n;
    return v;
  };
}

export const pickOne = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

function takeName(rng: Rng, pool: string[], used: Set<string>): string | null {
  const free = pool.filter((n) => !used.has(n));
  if (free.length === 0) return null;
  const name = pickOne(rng, free);
  used.add(name);
  return name;
}

export function weightedIndex(rng: Rng, weights: number[]): number {
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const landIds = (data: GameData): string[] => data.map.regions.filter((r) => r.land).map((r) => r.id);
const regionName = (data: GameData, id: string): string => data.map.regions.find((r) => r.id === id)?.name ?? id;

/** 套用一次變化到快照上（生成與快照共用） */
export function applyChange(snap: WorldSnapshot, c: WorldChange): void {
  switch (c.kind) {
    case "sectState":
      snap.sects.find((s) => s.id === c.sect)!.state = c.to;
      // 閉山與覆滅的宗門不再有關係
      if (c.to === "closed" || c.to === "fallen") delete snap.relations[c.sect];
      break;
    case "sectRank":
      snap.sects.find((s) => s.id === c.sect)!.rank = c.to;
      break;
    case "sectNew":
      snap.sects.push({ ...c.sect });
      break;
    case "merge":
      for (const f of Object.keys(snap.owners)) if (snap.owners[f] === c.from) snap.owners[f] = c.to;
      // 被併的國家，宗門的關係改記到併入的國家；盟仇同國時盟約優先
      for (const rel of Object.values(snap.relations)) {
        if (rel.ally === c.from) rel.ally = c.to;
        if (rel.feud === c.from) rel.feud = c.to;
        if (rel.ally !== null && rel.ally === rel.feud) rel.feud = null;
      }
      snap.polities = snap.polities.filter((p) => p.id !== c.from);
      break;
    case "split":
      snap.polities.push({ ...c.created });
      for (const f of c.fiefs) snap.owners[f] = c.created.id;
      break;
    case "owner":
      for (const f of c.fiefs) snap.owners[f] = c.to;
      break;
    case "polityNew": {
      const p = snap.polities.find((x) => x.id === c.polity)!;
      p.tribal = false;
      p.capital = c.capital;
      break;
    }
    case "rename":
      snap.polities.find((p) => p.id === c.polity)!.name = c.name;
      break;
    case "capital":
      snap.polities.find((p) => p.id === c.polity)!.capital = c.capital;
      break;
    case "ferry":
      snap.ferries.find((f) => f.id === c.ferry)!.broken = c.broken;
      break;
    case "merchant":
      if (!snap.merchantBranches.includes(c.region)) snap.merchantBranches.push(c.region);
      break;
    case "relation": {
      const rel = (snap.relations[c.sect] ??= { ally: null, feud: null });
      rel[c.relation] = c.on ? c.polity : null;
      break;
    }
  }
  // 國界變動後，宗門的山門若落進仇國境內，世仇就此作罷（互惠不受影響）
  if (c.kind === "merge" || c.kind === "owner" || c.kind === "split") {
    for (const sect of snap.sects) {
      const rel = snap.relations[sect.id];
      if (rel && rel.feud !== null && rel.feud === snap.owners[sect.fief]) rel.feud = null;
    }
  }
  snap.notes.push(c.note);
  snap.changeCount++;
}

export const fill = (note: string, vars: Record<string, string>): string =>
  note.replace(/\{([^}]*)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

interface BindContext {
  data: GameData;
  snap: WorldSnapshot;
  used: Set<string>;
  rng: Rng;
  /** 新宗門與新國家的編號，用來產生穩定的 id 與顏色 */
  counters: { sect: number; polity: number };
  merchant: string;
  fiefs: Fiefs;
  /** 初始國家數，分裂出的新國顏色接在後面 */
  nations: number;
}

/** 某國現有的領（索引，由小到大） */
export function fiefsOf(snap: WorldSnapshot, fiefs: Fiefs, polity: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < fiefs.count; i++) if (snap.owners[fiefs.ids[i]] === polity) out.push(i);
  return out;
}

/** 與一組領相鄰、且屬於別的國家的領所屬國 */
function neighborPolities(ctx: BindContext, members: number[], self: string): string[] {
  const out = new Set<string>();
  for (const i of members) {
    for (const j of ctx.fiefs.nb[i]) {
      const owner = ctx.snap.owners[ctx.fiefs.ids[j]];
      if (owner && owner !== self) out.add(owner);
    }
  }
  return [...out].sort();
}

/** 某點（邏輯座標）所在國：離該點最近的領的擁有者 */
export function polityAtPoint(snap: { owners: Record<string, string> }, fiefs: Fiefs, p: [number, number]): string {
  return snap.owners[fiefs.ids[fiefs.indexAt(p)]];
}

function freeSite(ctx: BindContext, region: string): number | null {
  const sites = ctx.data.map.regions.find((r) => r.id === region)?.sites ?? [];
  const taken = new Set(ctx.snap.sects.filter((s) => s.region === region).map((s) => s.site));
  for (let i = 0; i < sites.length; i++) if (!taken.has(i)) return i;
  return null;
}

function findSect(snap: WorldSnapshot, target: string): WorldSect | undefined {
  if (target === "guard") return snap.sects.find((s) => s.kind === "guard");
  if (target === "greatSect0" || target === "greatSect1") {
    return snap.sects.filter((s) => s.kind === "greatSect")[target === "greatSect0" ? 0 : 1];
  }
  return undefined;
}

/** 把候選綁定到這個世界裡具體的對象；這個世界裡不成立就回傳 null */
function bind(ctx: BindContext, ev: WorldEventDef, age: number): WorldChange | null {
  const { data, snap, rng } = ctx;
  const polName = (id: string): string => snap.polities.find((p) => p.id === id)!.name;
  switch (ev.kind) {
    case "merchant": {
      const free = landIds(data).filter((r) => !snap.merchantBranches.includes(r));
      if (free.length === 0) return null;
      const region = pickOne(rng, free);
      return {
        age, kind: "merchant", region,
        note: fill(ev.note, { target: ctx.merchant, region: regionName(data, region) }),
      };
    }
    case "sectState":
    case "sectRank": {
      let sect = findSect(snap, ev.target);
      if (ev.target === "school") {
        const cands = snap.sects.filter((s) => s.kind === "school" && (ev.kind === "sectRank" ? s.rank === "school" : true));
        const ok = cands.filter((s) => !SECT_BAD.includes(s.state) && (!ev.from || ev.from.includes(s.state)));
        sect = ok.length ? pickOne(rng, ok) : undefined;
      }
      if (!sect || SECT_BAD.includes(sect.state)) return null;
      if (ev.from && !ev.from.includes(sect.state)) return null;
      if (ev.kind === "sectState") {
        if (sect.state === ev.to) return null;
        return { age, kind: "sectState", sect: sect.id, to: ev.to as SectState, note: fill(ev.note, { target: sect.name }) };
      }
      if (sect.rank === ev.to) return null;
      return { age, kind: "sectRank", sect: sect.id, to: ev.to as SectRank, note: fill(ev.note, { target: sect.name }) };
    }
    case "sectNew": {
      const region = pickOne(ctx.rng, landIds(data));
      const site = freeSite(ctx, region);
      if (site === null) return null;
      const name = takeName(rng, data.worldNames.schools, ctx.used);
      if (!name) return null;
      const sect: WorldSect = {
        id: `sect_new_${ctx.counters.sect++}`, name, kind: "school", rank: "school", region, site,
        fief: ctx.fiefs.ids[ctx.fiefs.indexAt(data.map.regions.find((r) => r.id === region)!.sites![site])], state: "stable",
      };
      return { age, kind: "sectNew", sect, note: fill(ev.note, { target: name, region: regionName(data, region) }) };
    }
    case "merge": {
      const pols = snap.polities;
      if (pols.length < 2) return null;
      const from = pickOne(rng, pols);
      const options = neighborPolities(ctx, fiefsOf(snap, ctx.fiefs, from.id), from.id);
      if (options.length === 0) return null;
      const to = options[weightedIndex(rng, options.map((o) => relationWeight(snap, data, "merge", from.id, o)))];
      return { age, kind: "merge", from: from.id, to, note: fill(ev.note, { target: from.name, other: polName(to) }) };
    }
    case "split": {
      const big = snap.polities.filter((p) => fiefsOf(snap, ctx.fiefs, p.id).length >= SPLIT_MIN_FIEFS);
      if (big.length === 0) return null;
      const src = pickOne(rng, big);
      const mine = fiefsOf(snap, ctx.fiefs, src.id);
      const seat = ctx.fiefs.ids.indexOf(src.seat);
      const name = takeName(rng, data.worldNames.countries, ctx.used);
      const capital = takeName(rng, data.worldNames.capitals, ctx.used);
      if (!name || !capital) return null;
      // 從離國都最遠的領開始，向外連通地取走一半的領（不含國都領）
      const start = mine.filter((i) => i !== seat).sort((a, b) => fiefDistance(ctx.fiefs, seat, b) - fiefDistance(ctx.fiefs, seat, a) || a - b)[0];
      const want = Math.max(1, Math.floor(mine.length / 2));
      const taken = [start];
      for (let k = 0; k < taken.length && taken.length < want; k++) {
        for (const j of ctx.fiefs.nb[taken[k]]) {
          if (taken.length >= want) break;
          if (mine.includes(j) && j !== seat && !taken.includes(j)) taken.push(j);
        }
      }
      const created: WorldPolity = {
        id: `polity_new_${ctx.counters.polity}`, name, tribal: false,
        color: data.map.palette[(ctx.nations + ctx.counters.polity++) % data.map.palette.length], capital, seat: ctx.fiefs.ids[start],
      };
      return { age, kind: "split", polity: src.id, fiefs: taken.map((i) => ctx.fiefs.ids[i]), created, note: fill(ev.note, { target: src.name, new: name }) };
    }
    case "owner": {
      const big = snap.polities.filter((p) => fiefsOf(snap, ctx.fiefs, p.id).length >= OWNER_MIN_FIEFS);
      if (big.length === 0) return null;
      const src = pickOne(rng, big);
      const mine = fiefsOf(snap, ctx.fiefs, src.id);
      const seat = ctx.fiefs.ids.indexOf(src.seat);
      const border = mine.filter((i) => i !== seat && ctx.fiefs.nb[i].some((j) => snap.owners[ctx.fiefs.ids[j]] !== src.id));
      if (border.length === 0) return null;
      const first = pickOne(rng, border);
      const options = neighborPolities(ctx, [first], src.id);
      if (options.length === 0) return null;
      const to = options[weightedIndex(rng, options.map((o) => relationWeight(snap, data, "owner", src.id, o)))];
      const taken = [first];
      // 有時連同旁邊也鄰著對方的另一個領一起易手
      const second = border.filter((i) => i !== first && ctx.fiefs.nb[first].includes(i) && ctx.fiefs.nb[i].some((j) => snap.owners[ctx.fiefs.ids[j]] === to));
      if (second.length > 0 && mine.length - 2 >= OWNER_MIN_FIEFS - 1 && rng() < 0.5) taken.push(pickOne(rng, second));
      return { age, kind: "owner", fiefs: taken.map((i) => ctx.fiefs.ids[i]), to, note: fill(ev.note, { target: src.name, other: polName(to) }) };
    }
    case "polityNew": {
      const tribal = snap.polities.filter((p) => p.tribal);
      if (tribal.length === 0) return null;
      const p = pickOne(rng, tribal);
      const capital = takeName(rng, data.worldNames.capitals, ctx.used);
      if (!capital) return null;
      return { age, kind: "polityNew", polity: p.id, capital, note: fill(ev.note, { target: p.name }) };
    }
    case "rename": {
      const p = pickOne(rng, snap.polities);
      const name = takeName(rng, data.worldNames.countries, ctx.used);
      if (!name) return null;
      return { age, kind: "rename", polity: p.id, name, note: fill(ev.note, { old: p.name, new: name }) };
    }
    case "capital": {
      const cands = snap.polities.filter((p) => !p.tribal);
      if (cands.length === 0) return null;
      const p = pickOne(rng, cands);
      const capital = takeName(rng, data.worldNames.capitals, ctx.used);
      if (!capital) return null;
      return { age, kind: "capital", polity: p.id, capital, note: fill(ev.note, { target: p.name, new: capital }) };
    }
    case "ferry": {
      const wantBroken = ev.to === "broken";
      const cands = snap.ferries.filter((f) => f.broken !== wantBroken);
      if (cands.length === 0) return null;
      const f = pickOne(rng, cands);
      return { age, kind: "ferry", ferry: f.id, broken: wantBroken, note: fill(ev.note, { region: regionName(data, f.region) }) };
    }
  }
}

interface Pick {
  ev: WorldEventDef;
  age: number;
}

/** 依權重與互斥群抽出候選與年齡 */
function pickCandidates(rng: Rng, pool: WorldEventDef[], count: number, forced: Pick[]): Pick[] {
  const picks: Pick[] = [...forced];
  const groups = new Set(forced.map((p) => p.ev.group));
  let rest = pool.filter((e) => !groups.has(e.group));
  while (picks.length < count && rest.length > 0) {
    const ev = rest[weightedIndex(rng, rest.map((e) => e.weight))];
    picks.push({ ev, age: ev.ageMin + Math.floor(rng() * (ev.ageMax - ev.ageMin + 1)) });
    rest = rest.filter((e) => e.group !== ev.group);
  }
  return picks.sort((a, b) => a.age - b.age || a.ev.id.localeCompare(b.ev.id));
}

/** 生成這一世的世界。同一個種子與國家數永遠得到同樣的結果。 */
export function generateWorld(seed: number, data: GameData = gameData, nationCount: number = data.map.nations.default): World {
  const rng = makeRng(deriveSeed(seed, 11));
  const used = new Set<string>();
  const names = data.worldNames;
  const must = (n: string | null): string => {
    if (n === null) throw new Error("世界生成：名庫不夠用");
    return n;
  };
  const nations = Math.min(data.map.nations.max, Math.max(data.map.nations.min, Math.round(nationCount)));
  const fiefs = fiefsFor(seed, data);
  const fiefAt = (p: [number, number]): string => fiefs.ids[fiefs.indexAt(p)];

  const lands = landIds(data);
  const birthRegion = pickOne(rng, lands);
  // 國家：由領劃分，每國連通
  const parts = partitionNations(fiefs, nations, rng);
  const guardPoint = data.map.regions.find((r) => r.id === "north")!.sites![0];
  const guardPolity = parts[fiefs.indexAt(guardPoint)];
  // 諸部：機率性地讓一國尚未立國（守梯大宗所在的國不會是諸部）
  const tribalRoll = rng();
  const tribalChoices = Array.from({ length: nations }, (_, i) => i).filter((i) => i !== guardPolity);
  const tribalIndex = tribalRoll < 0.35 ? pickOne(rng, tribalChoices) : -1;

  const polities: WorldPolity[] = [];
  const owners: Record<string, string> = {};
  for (let i = 0; i < nations; i++) {
    const id = `polity_${i}`;
    const members = parts.map((o, k) => (o === i ? k : -1)).filter((k) => k >= 0);
    const tribal = i === tribalIndex;
    polities.push({
      id,
      name: must(takeName(rng, names.countries, used)),
      tribal,
      color: data.map.palette[i % data.map.palette.length],
      capital: tribal ? "" : must(takeName(rng, names.capitals, used)),
      seat: fiefs.ids[seatOf(fiefs, members)],
    });
    for (const k of members) owners[fiefs.ids[k]] = id;
  }

  const guard = must(takeName(rng, names.guards, used));
  const merchant = must(takeName(rng, names.merchants, used));
  const wanderers = must(takeName(rng, names.wanderers, used));
  const village = must(takeName(rng, names.villages, used));
  const market = must(takeName(rng, names.markets, used));
  const mountain = must(takeName(rng, names.mountains, used));

  const sects: WorldSect[] = [];
  const place = (region: string): number | null => {
    const sites = data.map.regions.find((r) => r.id === region)!.sites!;
    const taken = new Set(sects.filter((s) => s.region === region).map((s) => s.site));
    const free = sites.map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? pickOne(rng, free) : null;
  };
  const addSect = (id: string, name: string, kind: SectKind, region: string, state: SectState, fixedSite?: number): void => {
    let r = region;
    let site: number | null = fixedSite ?? place(r);
    while (site === null) {
      r = pickOne(rng, lands);
      site = place(r);
    }
    sects.push({ id, name, kind, rank: kind === "school" ? "school" : "great", region: r, site, fief: fiefAt(data.map.regions.find((x) => x.id === r)!.sites![site]), state });
  };
  addSect("sect_guard", guard, "guard", "north", rng() < 0.65 ? "prosper" : "stable", 0);
  for (let i = 0; i < 2; i++) {
    addSect(`sect_great_${i}`, must(takeName(rng, names.greatSects, used)), "greatSect", pickOne(rng, lands.filter((r) => r !== "north")), "decline");
  }
  for (let i = 0; i < 5; i++) {
    addSect(
      `sect_school_${i}`,
      must(takeName(rng, names.schools, used)),
      "school",
      i === 0 ? birthRegion : pickOne(rng, lands),
      rng() < 0.25 ? "prosper" : "stable",
    );
  }

  const ferries: WorldFerry[] = [];
  for (const r of data.map.regions) (r.ferries ?? []).forEach((_, index) => ferries.push({ id: `ferry_${r.id}_${index}`, region: r.id, index, broken: false }));

  const merchantBranches = [...new Set(["center", birthRegion])];

  const base: World = {
    seed,
    birth: { region: birthRegion, village, market, mountain, fief: fiefAt(data.map.regions.find((r) => r.id === birthRegion)!.birth!.village) },
    names: { guard, merchant, wanderers },
    nations,
    polities,
    owners,
    sects,
    ferries,
    merchantBranches,
    changes: [],
    relations: [],
  };

  base.relations = initialRelations(base, data);
  base.changes = buildChanges(base, deriveSeed(seed, 23), data, used);
  return base;
}

export function initialSnapshot(world: World): WorldSnapshot {
  return {
    owners: { ...world.owners },
    polities: world.polities.map((p) => ({ ...p })),
    sects: world.sects.map((s) => ({ ...s })),
    ferries: world.ferries.map((f) => ({ ...f })),
    merchantBranches: [...world.merchantBranches],
    relations: Object.fromEntries(world.relations.map((r) => [r.sect, { ally: r.ally, feud: r.feud }])),
    notes: [],
    changeCount: 0,
  };
}

/** 依序模擬候選，只保留在這個世界裡成立的，湊足數量，並保證三十到七十歲之間至少有一次變化 */
function buildChanges(world: World, seed: number, data: GameData, usedAtStart: Set<string>): WorldChange[] {
  const pickRng = makeRng(seed);
  const pool = data.worldEvents;
  const want = CHANGE_MIN + Math.floor(pickRng() * (CHANGE_SPREAD + 1));
  const expansionPool = pool.filter((e) => e.kind === "merge" && e.ageMin <= GUARANTEE_WINDOW[1] && e.ageMax >= GUARANTEE_WINDOW[0]);
  const expansion = expansionPool.length ? pickOne(pickRng, expansionPool) : null;
  const expansionAge = expansion ? Math.max(expansion.ageMin, GUARANTEE_WINDOW[0]) + Math.floor(pickRng() * (Math.min(expansion.ageMax, GUARANTEE_WINDOW[1]) - Math.max(expansion.ageMin, GUARANTEE_WINDOW[0]) + 1)) : 0;

  const simulate = (picks: Pick[]): WorldChange[] => {
    const rng = makeRng(deriveSeed(seed, 5));
    const snap = initialSnapshot(world);
    const ctx: BindContext = {
      data, snap, rng, used: new Set(usedAtStart), counters: { sect: 0, polity: 0 }, merchant: world.names.merchant,
      fiefs: fiefsFor(world.seed, data), nations: world.nations,
    };
    const out: WorldChange[] = [];
    // 關係變化（S2）與世局候選依年齡交錯模擬，這樣兩邊都看得到彼此造成的狀態；
    // 關係用自己的亂數線，所以世局候選的抽選不受它影響。同年齡時世局候選在前。
    const relRng = makeRng(deriveSeed(seed, 49));
    const rel = relationPicks(world.seed, data);
    let events = 0;
    let i = 0;
    let j = 0;
    while (i < picks.length || j < rel.length) {
      const takeEvent = j >= rel.length || (i < picks.length && picks[i].age <= rel[j].age);
      if (takeEvent) {
        const p = picks[i++];
        if (events >= want) continue;
        const change = bind(ctx, p.ev, p.age);
        if (!change) continue;
        applyChange(snap, change);
        out.push(change);
        events++;
      } else {
        const p = rel[j++];
        const change = bindRelation(snap, p.def, p.age, relRng, data, ctx.fiefs);
        if (!change) continue;
        applyChange(snap, change);
        out.push(change);
      }
    }
    return out;
  };

  // 多抽幾條備用，因為有些候選在這個世界裡不成立
  let picks = pickCandidates(pickRng, pool, want + 10, expansion ? [{ ev: expansion, age: expansionAge }] : []);
  let changes = simulate(picks);
  const inWindow = (cs: WorldChange[]): boolean => cs.filter((c) => c.kind !== "relation").some((c) => c.age >= GUARANTEE_WINDOW[0] && c.age <= GUARANTEE_WINDOW[1]);

  for (let tries = 0; !inWindow(changes) && tries < 60; tries++) {
    const cands = pool.filter(
      (e) => e.ageMin <= GUARANTEE_WINDOW[1] && e.ageMax >= GUARANTEE_WINDOW[0] && !picks.some((p) => p.ev.group === e.group),
    );
    if (cands.length === 0) break;
    const ev = pickOne(pickRng, cands);
    const lo = Math.max(ev.ageMin, GUARANTEE_WINDOW[0]);
    const hi = Math.min(ev.ageMax, GUARANTEE_WINDOW[1]);
    const extra: Pick = { ev, age: lo + Math.floor(pickRng() * (hi - lo + 1)) };
    picks = pickCandidates(pickRng, [], 0, [...picks, extra]);
    changes = simulate(picks);
  }
  return changes;
}

/** 某個年齡時的世界快照 */
export function worldAt(world: World, ageYears: number): WorldSnapshot {
  const snap = initialSnapshot(world);
  for (const c of world.changes) {
    if (c.age > ageYears) break;
    applyChange(snap, c);
  }
  snap.notes = snap.notes.slice(-RECENT_NOTES);
  return snap;
}

/** 兩個年齡之間發生的變化（不含 fromAge，含 toAge） */
export function changesBetween(world: World, fromAge: number, toAge: number): WorldChange[] {
  return world.changes.filter((c) => c.age > fromAge && c.age <= toAge);
}

let cached: { seed: number; data: GameData; nations: number; world: World } | null = null;

/** 同一個種子重複取用時不必重新生成（介面每次重繪都會用到） */
export function worldFor(seed: number, data: GameData = gameData, nationCount: number = data.map.nations.default): World {
  if (cached && cached.seed === seed && cached.data === data && cached.nations === nationCount) return cached.world;
  const world = generateWorld(seed, data, nationCount);
  cached = { seed, data, nations: nationCount, world };
  return world;
}

/** 填入名稱欄位用的當世名稱。國名取出生時的名字，讓同一世的文字前後一致。 */
export function worldSlots(world: World): WorldSlots {
  const birthPolity = world.polities.find((p) => p.id === world.owners[world.birth.fief])!;
  return {
    guard: world.names.guard,
    merchant: world.names.merchant,
    wanderers: world.names.wanderers,
    village: world.birth.village,
    market: world.birth.market,
    mountain: world.birth.mountain,
    country: birthPolity.name,
    // 同門名字要看入宗的人，由 core/sect.ts 的 slotsFor 覆寫；這裡只放通用稱呼
    peer: DEFAULT_SLOTS.peer,
    steward: DEFAULT_SLOTS.steward,
    elder: DEFAULT_SLOTS.elder,
  };
}

/** 國家的顯示名稱：諸部加上「諸部」 */
export function polityLabel(p: WorldPolity): string {
  return p.tribal ? `${p.name}諸部` : p.name;
}

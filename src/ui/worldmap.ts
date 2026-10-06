// 天下圖的畫面：底層 canvas 畫維諾格網地圖（地形、國家、河流），上層 SVG 放可點的標記、路線與國名。
// 預設只有地圖、圖層鈕與一張資訊卡；其餘（圖例、時間軸、行跡、世局影響）收進折疊區。
import type { GameState } from "../core/state";
import { localTerritory, marketTerritory, placesAt, routeTo, type TravelPlace } from "../core/travel";
import { polityLabel, worldAt, worldFor } from "../core/world";
import { sectReach, territoriesAt, territoryAt } from "../core/territory";
import { ageQuarters, territoryMapAt } from "../core/frontier";
import { relationOf } from "../core/relations";
import { provincesFor } from "../core/provinces";
import { terrainFor, type Terrain } from "../core/terrain";
import { toView } from "../core/mapview";
import type { GameData, Point } from "../data/types";
import { joinInfo } from "./sectinfo";
import { activeEffectsAt, describeEffect, describeTarget, effectsForTarget, legendOf, mapAgeYears, placeHistory, polityLookup, relationEdges, relationLines, sectMarker, targetKindLabel, terrainLine, territoryLines, timelineEntries, type MapTarget } from "./mapinfo";
import { placeLabels, type LabelItem } from "./mapgeo";
import { drawMapCanvas, polityAnchors, MAP_MARGIN, type HaloDraw, type MapLayers } from "./mapart/draw";
import { parseHex } from "./mapart/color";
import { sectCover, type HaloMode } from "./mapart/halo";
import { applyZoom, attachZoom, currentZoom, resetZoom, zoomAt, IDENTITY } from "./mapart/zoom";
import { readMapPrefs, writeMapPrefs } from "./mapprefs";

const SVG_NS = "http://www.w3.org/2000/svg";

interface WorldMapCache {
  key: string;
  nodes: ChildNode[];
  you: SVGGElement;
  routeProgress: SVGPolylineElement | null;
  travelStatus: HTMLParagraphElement | null;
}

let worldMapCache: WorldMapCache | null = null;

// 時間軸回看、事件高亮；只影響顯示，不進遊戲狀態
let mapView: { seed: number; quarter: number } | null = null;
let highlightSpots: Point[] = [];
let timelineNote: string | null = null;

/** 開啟天下圖時呼叫：回到現在、清掉高亮與縮放 */
export function resetMapView(): void {
  mapView = null;
  highlightSpots = [];
  timelineNote = null;
  resetZoom();
  worldMapCache = null;
}

const isPhone = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches === true;
const SEASONS = ["春", "夏", "秋", "冬"];

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const sameTarget = (a: MapTarget | null, b: MapTarget): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

function placeIdOf(target: MapTarget | null): string | null {
  if (!target || target.kind === "stairs") return null;
  if (target.kind === "capital" || target.kind === "territory") return `capital:${target.polity}`;
  if (target.kind === "sect" || target.kind === "ferry") return `${target.kind}:${target.id}`;
  if (target.kind === "branch") return `branch:${target.region}`;
  return target.kind;
}

function targetOfPlace(place: TravelPlace): MapTarget {
  if (place.id.startsWith("capital:")) return { kind: "capital", polity: place.id.slice(8) };
  if (place.id.startsWith("sect:")) return { kind: "sect", id: place.id.slice(5) };
  if (place.id.startsWith("ferry:")) return { kind: "ferry", id: place.id.slice(6) };
  if (place.id.startsWith("branch:")) return { kind: "branch", region: place.region };
  return { kind: place.id as "village" | "market" | "mountain" | "merchantHq" };
}

function along(points: Point[], progress: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((sum, n) => sum + n, 0);
  let distance = total * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : distance / lengths[i];
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
    }
    distance -= lengths[i];
  }
  return points.at(-1)!;
}

function travelProgress(state: GameState): number {
  if (state.travel.totalMonths <= 0) return 1;
  return Math.max(0, Math.min(1, (state.travel.totalMonths - state.travel.remainingMonths) / state.travel.totalMonths));
}

function moveTraveler(you: SVGGElement, point: Point): void {
  you.style.transform = `translate(${point[0]}px, ${point[1]}px)`;
}

function updateTravelProgress(cache: WorldMapCache, state: GameState, data: GameData): void {
  if (!state.travel.targetId) return;
  const route = routeTo(state, state.travel.targetId, data);
  if (!route) return;
  const progress = travelProgress(state);
  moveTraveler(cache.you, along(route.points.map((p) => toView(data.map, p)), progress));
  if (cache.routeProgress) cache.routeProgress.style.strokeDasharray = `${progress * 100} 100`;
  if (cache.travelStatus) cache.travelStatus.textContent = `正往${route.to.name}，尚需 ${state.travel.remainingMonths} 個月。途中修行與事件照常。`;
}

/** 目前實際看到的季：回看時是時間軸的位置，否則是現在 */
function shownQuarter(state: GameState, data: GameData): number {
  const now = ageQuarters(state.ageMonths);
  if (!mapView || mapView.seed !== state.worldSeed) return now;
  return Math.min(now, Math.max(data.config.startAgeYears * 4, mapView.quarter));
}

function worldMapCacheKey(state: GameState, data: GameData, selected: MapTarget | null): string {
  return JSON.stringify({
    worldSeed: state.worldSeed,
    quarter: shownQuarter(state, data),
    now: ageQuarters(state.ageMonths),
    highlightSpots,
    timelineNote,
    selected,
    prefs: readMapPrefs(data),
    phase: state.phase,
    eventPending: state.pendingEvent !== null,
    locationId: state.travel.locationId,
    targetId: state.travel.targetId,
    totalMonths: state.travel.totalMonths,
    trail: state.travel.trail,
    // 求入宗的資訊會隨所屬宗門、已試過的宗門與修為變
    sect: state.sect,
    sectsTried: state.sectsTried,
    realm: `${state.realmId}:${state.stage}`,
  });
}

/** 目前這一世、這個年齡的天下圖快照鍵：世界種子加變化條數，用來判斷「有新變化」 */
export function mapStamp(state: GameState, data: GameData): string {
  const world = worldFor(state.worldSeed, data, state.nationCount);
  return `${state.worldSeed}:${worldAt(world, mapAgeYears(state.ageMonths)).changeCount}`;
}

const coverCache = new WeakMap<Terrain, Map<string, number[]>>();

/** 組出天下圖的內容（標題列、地圖、圖層鈕、資訊卡與折疊區） */
export function buildWorldMap(
  state: GameState,
  data: GameData,
  selected: MapTarget | null,
  handlers: { onSelect(target: MapTarget | null): void; onClose(): void; onTravel(targetId: string): void; onJoinSect(): void; onRefresh(): void },
): DocumentFragment {
  const cacheKey = worldMapCacheKey(state, data, selected);
  if (worldMapCache?.key === cacheKey && worldMapCache.nodes.every((node) => node.ownerDocument === document)) {
    updateTravelProgress(worldMapCache, state, data);
    const cached = document.createDocumentFragment();
    cached.append(...worldMapCache.nodes);
    return cached;
  }

  const prefs = readMapPrefs(data);
  const world = worldFor(state.worldSeed, data, state.nationCount);
  const nowQuarter = ageQuarters(state.ageMonths);
  const nowYears = Math.floor(nowQuarter / 4);
  const viewQuarter = shownQuarter(state, data);
  const viewYears = Math.floor(viewQuarter / 4);
  const scrubbed = viewQuarter < nowQuarter;
  const snap = worldAt(world, viewYears);
  const decision = territoriesAt(world, viewYears, data);
  const polityById = polityLookup(world, snap);
  const terrain = terrainFor(state.worldSeed, data);
  const provinces = provincesFor(terrain, data, prefs.provinces);
  const tv = (p: Point): Point => toView(data.map, p);
  const [vw, vh] = data.map.view.size;
  const regionById = (id: string) => data.map.regions.find((r) => r.id === id)!;
  const places = placesAt(state, data);
  const placesView = placesAt({ ...state, ageMonths: viewYears * 12 }, data);

  const frag = document.createDocumentFragment();
  const head = html("div", "codex-head");
  head.append(html("h2", undefined, "天下圖"));
  const close = html("button", undefined, "關閉");
  close.type = "button";
  close.addEventListener("click", handlers.onClose);
  head.append(close);
  frag.append(head, html("p", "desc map-sub", "九渡洲。山河未改，行路的人已不同。"));

  // ---- 地圖：canvas 底圖加 SVG 疊層 ----
  const wrap = html("div", "map-zoomwrap");
  const stage = html("div", "map-stage");
  stage.style.aspectRatio = `${vw + 2 * MAP_MARGIN} / ${vh + 2 * MAP_MARGIN}`;
  const root = svg("svg", { viewBox: `${-MAP_MARGIN} ${-MAP_MARGIN} ${vw + 2 * MAP_MARGIN} ${vh + 2 * MAP_MARGIN}`, class: "map-svg", role: "group", "aria-label": "九渡洲地圖" });
  wrap.append(stage);
  stage.append(root);

  const territory = (q: number) => territoryMapAt(world, q, data, terrain);
  const halosAt = (years: number): HaloDraw[] => {
    const sn = worldAt(world, years);
    let byKey = coverCache.get(terrain);
    if (!byKey) coverCache.set(terrain, (byKey = new Map()));
    return sn.sects.flatMap((sect) => {
      const reach = sectReach(sect, data);
      if (reach <= 0) return [];
      const key = `${prefs.halo}:${sect.id}:${sect.state}:${sect.rank}`;
      let cover = byKey.get(key);
      if (!cover) {
        cover = sectCover(terrain, provinces, data, regionById(sect.region).sites![sect.site], reach, prefs.halo);
        byKey.set(key, cover);
      }
      const rel = relationOf(sn, sect.id);
      const tone = rel.ally && rel.feud ? "both" : rel.ally ? "ally" : rel.feud ? "feud" : "none";
      return [{ cover, tone: tone as HaloDraw["tone"] }];
    });
  };
  const colorsOf = (ids: string[]) => ids.map((id) => parseHex(polityById(id)?.color ?? data.map.palette[0]));
  const repaint = (quarter: number, canvas: HTMLCanvasElement): void => {
    const map = territory(quarter);
    const out = drawMapCanvas({ data, terrain, provinces, territory: map, polityColors: colorsOf(map.polityIds), halos: halosAt(Math.floor(quarter / 4)), layers: prefs.layers });
    canvas.width = out.width;
    canvas.height = out.height;
    canvas.getContext("2d")!.drawImage(out, 0, 0);
  };
  const art = html("canvas", "map-art");
  art.setAttribute("aria-hidden", "true");
  repaint(viewQuarter, art);
  stage.prepend(art);
  const map = territory(viewQuarter);

  // 標記共用：點選、鍵盤操作、放大點擊範圍（手機上好點）
  const interactive = (el: SVGElement, target: MapTarget, hit?: [number, number, number]): SVGElement => {
    const action = hit ? svg("g") : el;
    if (hit) action.append(svg("circle", { cx: hit[0], cy: hit[1], r: hit[2], fill: "transparent" }), el);
    action.classList.add("map-hit");
    if (sameTarget(selected, target)) action.classList.add("selected");
    action.setAttribute("role", "button");
    action.setAttribute("tabindex", "0");
    action.setAttribute("aria-label", describeTarget(target, world, snap, data).title);
    const choose = (ev: Event) => {
      ev.stopPropagation();
      handlers.onSelect(target);
    };
    action.addEventListener("click", choose);
    action.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      choose(ev);
    });
    return action;
  };

  // 國名（依各國現有領土的位置）；被選取的地域加高亮圈
  const nationLayer = svg("g", { class: "map-nations" });
  root.append(nationLayer);
  for (const a of polityAnchors(terrain, map)) {
    const polity = polityById(map.polityIds[a.index]);
    if (!polity) continue;
    const text = svg("text", { x: a.x, y: a.y, class: "map-nation", "text-anchor": "middle", "font-size": Math.max(10, Math.min(26, 7 + Math.sqrt(a.cells) * 0.55)) });
    text.textContent = polityLabel(polity);
    nationLayer.append(text);
  }
  // 關係線：只有選取宗門或國家時才畫；互惠實線、世仇虛線
  const relTarget = selected?.kind === "sect" ? { sect: selected.id } : selected?.kind === "territory" && map.polityIds[map.owner[Number(selected.id.slice(5))]] ? { polity: map.polityIds[map.owner[Number(selected.id.slice(5))]] } : null;
  if (relTarget) {
    const anchors = new Map(polityAnchors(terrain, map).map((a) => [map.polityIds[a.index], a]));
    const relLayer = svg("g", { class: "map-relations" });
    root.append(relLayer);
    for (const e of relationEdges(snap, relTarget)) {
      const sect = snap.sects.find((s) => s.id === e.sect)!;
      const to = anchors.get(e.polity);
      if (!to) continue;
      const [x1, y1] = tv(regionById(sect.region).sites![sect.site]);
      const len = Math.hypot(to.x - x1, to.y - y1);
      if (len < 14) continue;
      const bend = Math.min(30, len * 0.18) * (e.kind === "ally" ? 1 : -1);
      const cx = (x1 + to.x) / 2 - ((to.y - y1) / len) * bend;
      const cy = (y1 + to.y) / 2 + ((to.x - x1) / len) * bend;
      relLayer.append(svg("path", { d: `M${x1},${y1} Q${cx},${cy} ${to.x},${to.y}`, class: `map-rel map-rel-${e.kind}` }), svg("circle", { cx: to.x, cy: to.y, r: 3, class: "map-rel-end" }));
    }
  }
  for (const spot of highlightSpots) root.append(svg("circle", { cx: tv(spot)[0], cy: tv(spot)[1], r: 16, class: "map-highlight" }));
  // 推進箭頭：由進攻方最近的領指向被攻處；進度越高越不透明
  for (const fight of map.fights) {
    if (!fight.source) continue;
    const [x1, y1] = fight.source;
    const [x2, y2] = fight.focus;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const sx = x1 + ux * len * 0.42;
    const sy = y1 + uy * len * 0.42;
    const ex = x1 + ux * len * (0.55 + 0.3 * fight.progress);
    const ey = y1 + uy * len * (0.55 + 0.3 * fight.progress);
    const headPath = `M${ex - ux * 6 - uy * 3.5},${ey - uy * 6 + ux * 3.5} L${ex},${ey} L${ex - ux * 6 + uy * 3.5},${ey - uy * 6 - ux * 3.5}`;
    root.append(svg("path", { d: `M${sx},${sy} L${ex},${ey} ${headPath}`, class: "map-arrow", "stroke-opacity": (0.4 + 0.5 * fight.progress).toFixed(2) }));
  }

  // 已走路線與正在走的路線
  const visited = state.travel.trail.map((id) => places.find((place) => place.id === id)).filter((place) => place !== undefined);
  for (let i = 1; i < visited.length; i++) {
    root.append(svg("path", { d: `M${tv(visited[i - 1].point).join(",")} L${tv(visited[i].point).join(",")}`, class: "map-visited" }));
  }
  const activeRoute = state.travel.targetId ? routeTo(state, state.travel.targetId, data) : null;
  const previewRoute = !activeRoute && selected ? routeTo(state, placeIdOf(selected) ?? "", data) : null;
  const shownRoute = activeRoute ?? previewRoute;
  let routeProgress: SVGPolylineElement | null = null;
  if (shownRoute) {
    const pts = shownRoute.points.map(tv);
    root.append(svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: activeRoute ? "map-route active" : "map-route" }));
    if (activeRoute) {
      routeProgress = svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "map-route-progress", pathLength: 100 });
      routeProgress.style.strokeDasharray = `${travelProgress(state) * 100} 100`;
      root.append(routeProgress);
    }
  }

  // 小標籤先收集，最後依重要度避讓重疊的；被選取的永遠顯示，其餘仍可點、可由鍵盤聚焦
  const labels: LabelItem[] = [];
  const addLabel = (key: string, p: Point, dx: number, dy: number, text: string, priority: number, anchor: "start" | "middle", target?: MapTarget): void => {
    labels.push({ key, x: p[0] + dx, y: p[1] + dy, text, anchor, priority: target && sameTarget(selected, target) ? 0 : priority });
  };
  for (const polity of snap.polities) {
    const capital = placesView.find((place) => place.id === `capital:${polity.id}`);
    if (capital && !polity.tribal) {
      const c = tv(capital.point);
      root.append(svg("circle", { cx: c[0], cy: c[1], r: 1.8, class: "map-capital" }));
      addLabel(`capital:${polity.id}`, c, 4, 2, capital.name, 2, "start");
    }
  }

  // 殘階（灰色，只聞其名）
  const st = tv([data.map.stairs.x, data.map.stairs.y]);
  root.append(interactive(svg("path", { d: `M${st[0] - 6},${st[1] + 5} L${st[0]},${st[1] - 6} L${st[0] + 6},${st[1] + 5} Z`, class: "map-stairs" }), { kind: "stairs" }, [st[0], st[1], 12]));
  addLabel("stairs", st, 0, 16, "殘階", 2, "middle", { kind: "stairs" });

  // 渡口：毀壞的畫叉；出生地的坊市標在該地域第一處渡口
  for (const f of snap.ferries) {
    const [x, y] = tv(regionById(f.region).ferries![f.index]);
    const isMarket = f.region === world.birth.region && f.index === 0;
    const g = svg("g");
    if (f.broken) g.append(svg("path", { d: `M${x - 3.5},${y - 3.5} L${x + 3.5},${y + 3.5} M${x + 3.5},${y - 3.5} L${x - 3.5},${y + 3.5}`, class: "map-ferry-broken" }));
    else g.append(svg("rect", { x: x - 3, y: y - 3, width: 6, height: 6, transform: `rotate(45 ${x} ${y})`, class: "map-ferry" }));
    root.append(interactive(g, isMarket ? { kind: "market" } : { kind: "ferry", id: f.id }, [x, y, 10]));
    if (isMarket) addLabel("market", [x, y], 6, -4, world.birth.market, 5, "start", { kind: "market" });
  }

  // 商行：總號在中部，分號在各地域的都城旁
  for (const region of data.map.regions.filter((r) => r.land && snap.merchantBranches.includes(r.id))) {
    const [cx, cy] = tv(region.capital!);
    const hq = region.id === "center";
    const x = cx + 9;
    const y = cy + 6;
    const size = hq ? 8 : 5.5;
    root.append(interactive(svg("rect", { x: x - size / 2, y: y - size / 2, width: size, height: size, class: hq ? "map-merchant-hq" : "map-merchant" }), hq ? { kind: "merchantHq" } : { kind: "branch", region: region.id }, [x, y, 10]));
  }

  // 宗門
  for (const sect of snap.sects) {
    const [x, y] = tv(regionById(sect.region).sites![sect.site]);
    const m = sectMarker(sect);
    const r = m.radius * 0.8;
    const g = svg("g", { class: `map-sect map-sect-${m.fill}` });
    if (m.ring) g.append(svg("circle", { cx: x, cy: y, r: r + 2.5, class: "map-sect-ring" }));
    g.append(svg("circle", { cx: x, cy: y, r, class: "map-sect-dot" }));
    if (m.fill === "fallen") g.append(svg("path", { d: `M${x - r},${y - r} L${x + r},${y + r} M${x + r},${y - r} L${x - r},${y + r}`, class: "map-sect-x" }));
    root.append(interactive(g, { kind: "sect", id: sect.id }, [x, y, 11]));
    addLabel(`sect:${sect.id}`, [x, y], r + 3, 3, sect.name, sect.rank === "great" ? 3 : 4, "start", { kind: "sect", id: sect.id });
  }

  // 出生地：山與村
  const birthRegion = regionById(world.birth.region);
  const [mx, my] = tv(birthRegion.birth!.mountain);
  root.append(interactive(svg("path", { d: `M${mx - 5},${my + 3.5} L${mx},${my - 5} L${mx + 5},${my + 3.5} Z`, class: "map-mountain" }), { kind: "mountain" }, [mx, my, 9]));
  addLabel("mountain", [mx, my], 7, 3, world.birth.mountain, 6, "start", { kind: "mountain" });
  const [vx, vy] = tv(birthRegion.birth!.village);
  const village = svg("g", { class: "map-village" });
  village.append(svg("circle", { cx: vx, cy: vy, r: 3.2, class: "map-village-dot" }));
  root.append(interactive(village, { kind: "village" }, [vx, vy, 10]));
  addLabel("village", [vx, vy], 0, 16, world.birth.village, 6, "middle", { kind: "village" });
  for (const item of placeLabels(labels).shown) {
    const text = svg("text", { x: item.x, y: item.y, class: "map-small", "text-anchor": item.anchor });
    text.textContent = item.text;
    root.append(text);
  }

  const current = tv(places.find((place) => place.id === state.travel.locationId)?.point ?? birthRegion.birth!.village);
  const markerPoint = activeRoute ? along(activeRoute.points.map(tv), travelProgress(state)) : current;
  const you = svg("g", { class: "map-you" });
  you.append(svg("circle", { cx: 0, cy: 0, r: 8, class: "map-you-ring" }), svg("circle", { cx: 0, cy: 0, r: 4, class: "map-you-dot" }));
  moveTraveler(you, markerPoint);
  root.append(you);

  // 點地圖：選取該處的領土；點到海或空白處取消選取
  root.addEventListener("click", (ev) => {
    const r = root.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * (vw + 2 * MAP_MARGIN) - MAP_MARGIN;
    const y = ((ev.clientY - r.top) / r.height) * (vh + 2 * MAP_MARGIN) - MAP_MARGIN;
    const id = terrain.grid.locate(x, y);
    if (id < 0 || !terrain.land[id]) {
      handlers.onSelect(null);
      return;
    }
    const owner = map.owner[id] >= 0 ? map.polityIds[map.owner[id]] : null;
    if (owner === null) {
      handlers.onSelect(null);
      return;
    }
    const target: MapTarget = { kind: "territory", id: `cell:${id}`, region: terrain.regionIds[terrain.region[id]], polity: owner };
    handlers.onSelect(sameTarget(selected, target) ? null : target);
  });
  if (isPhone()) attachZoom(wrap, stage);
  else applyZoom(stage, IDENTITY);

  const mapPane = html("div", "map-pane");
  mapPane.append(wrap);
  if (isPhone()) {
    const bar = html("div", "map-zoom");
    const rect = (): { w: number; h: number } => ({ w: wrap.clientWidth, h: wrap.clientHeight });
    for (const [text, label, factor] of [["＋", "放大地圖", 1.6], ["－", "縮小地圖", 1 / 1.6], ["還原", "還原地圖大小", null]] as const) {
      const b = html("button", "map-zoom-btn", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => {
        const { w, h } = rect();
        applyZoom(stage, factor === null ? IDENTITY : zoomAt(currentZoom(), w, h, w / 2, h / 2, factor));
      });
      bar.append(b);
    }
    mapPane.append(bar);
  }

  // ---- 圖層鈕 ----
  const toggle = (key: keyof MapLayers, text: string): HTMLLabelElement => {
    const label = html("label", "map-chip-toggle");
    const input = html("input");
    input.type = "checkbox";
    input.checked = prefs.layers[key];
    input.addEventListener("change", () => {
      writeMapPrefs({ ...prefs, layers: { ...prefs.layers, [key]: input.checked } });
      handlers.onRefresh();
    });
    label.append(input, html("span", undefined, text));
    return label;
  };
  const chips = html("div", "map-chips");
  chips.append(toggle("nation", "國家"), toggle("terrain", "地形"), toggle("river", "河流"), toggle("sect", "宗門靈脈"), toggle("symbol", "山林符號"));
  mapPane.append(chips);

  // ---- 資訊卡 ----
  const info = html("section", "map-info");
  info.setAttribute("aria-live", "polite");
  const territoryOf = (place: TravelPlace | undefined) => (place ? territoryAt(decision, place.point) : undefined);
  if (selected) {
    const d = describeTarget(selected, world, snap, data);
    const title = html("p", "map-info-title");
    title.append(html("strong", undefined, d.title), html("small", undefined, `　${targetKindLabel(selected, snap)}`));
    info.append(title);
    for (const line of d.lines) info.append(html("p", undefined, line));
    if (selected.kind === "sect") for (const line of relationLines(snap, { sect: selected.id })) info.append(html("p", "map-effect-line", line));
    if (selected.kind === "territory") {
      if (relTarget) for (const line of relationLines(snap, relTarget)) info.append(html("p", "map-effect-line", line));
      const cellId = Number(selected.id.slice(5));
      for (const line of territoryLines(world, map, terrain, cellId, data, viewYears)) info.append(html("p", "map-effect-line", line));
      info.append(html("p", "desc", `此處：${terrainLine(terrain, data, cellId)}`));
    } else {
      const place = places.find((p) => p.id === placeIdOf(selected));
      const t = territoryOf(place);
      if (t) {
        const owner = polityById(t.ownerId);
        info.append(html("p", "map-effect-line", `所在地：${owner ? polityLabel(owner) : "諸部"}${t.contested ? "；邊界正在推移" : ""}。`));
      }
    }
    const past = placeHistory(world, d.title.split("・"), viewYears).slice(-3);
    if (past.length > 0) info.append(html("p", "desc", `本世此處的事：${past.map((e) => `${e.age} 歲，${e.note}`).join(" ")}`));
    if (previewRoute && !activeRoute) {
      info.append(html("p", "map-travel-status", `${previewRoute.to.status}。需時 ${previewRoute.months} 個月${previewRoute.delayMonths ? `（邊境動盪多 ${previewRoute.delayMonths} 個月）` : ""}，途經 ${previewRoute.regions.map((id) => regionById(id).name).join("、")}。`));
      if (state.phase === "living" && state.pendingEvent === null && !scrubbed) {
        const go = html("button", "primary map-travel-go", `前往${previewRoute.to.name}`);
        go.type = "button";
        go.addEventListener("click", () => handlers.onTravel(previewRoute.to.id));
        info.append(go);
      }
    }
    if (selected.kind === "sect" && state.phase === "living" && !scrubbed) {
      const join = joinInfo(state, selected.id, data);
      if (join) {
        const box = html("div", "map-join");
        box.append(html("p", "map-effect-line", `求入宗試煉成功率約 ${Math.round(join.rate * 100)}%（看悟性、根骨與靈根；每個宗門每世只能叩一次）。`));
        if (join.canJoin) {
          const go = html("button", "primary map-join-go", "求入宗");
          go.type = "button";
          go.addEventListener("click", () => handlers.onJoinSect());
          box.append(go);
        } else if (join.reason) {
          box.append(html("p", "desc", join.reason));
        }
        info.append(box);
      }
    }
    for (const e of effectsForTarget(selected, snap, data)) {
      const x = describeEffect(e, world, data);
      info.append(html("p", "map-effect-line", `${x.reason}（${x.impact}）`));
    }
  } else {
    const title = html("p", "map-info-title");
    title.append(html("strong", undefined, "九渡洲"), html("small", undefined, `　${snap.polities.length} 國・${snap.sects.length} 宗門`));
    info.append(title, html("p", undefined, "點選國家、宗門、渡口，看一看。"));
    for (const f of map.fights) {
      const attacker = polityById(f.attacker);
      info.append(html("p", "map-effect-line", `${attacker ? polityLabel(attacker) : "他國"}正向${polityById(f.defender) ? polityLabel(polityById(f.defender)!) : "鄰國"}的疆域推進。`));
    }
  }
  mapPane.append(info);

  // ---- 折疊區：更多圖層與圖例 ----
  const more = html("details", "map-more");
  more.append(html("summary", undefined, "更多圖層與圖例"));
  const moreChips = html("div", "map-chips");
  moreChips.append(toggle("border", "國界省界"), toggle("sea", "淺海虛線"), toggle("grid", "經緯格線"));
  more.append(moreChips);
  const haloLabel = html("label", "map-destination-label", "靈脈範圍畫法");
  const haloSelect = html("select", "map-destination");
  for (const [value, text] of [["aura", "有機光暈（預設）"], ["circle", "圓圈"], ["province", "以省染色"]] as const) {
    const o = html("option", undefined, text);
    o.value = value;
    haloSelect.append(o);
  }
  haloSelect.value = prefs.halo;
  haloSelect.addEventListener("change", () => {
    writeMapPrefs({ ...prefs, halo: haloSelect.value as HaloMode });
    handlers.onRefresh();
  });
  haloLabel.append(haloSelect);
  const provLabel = html("label", "map-destination-label", `國界格數（省）：${prefs.provinces}`);
  const provInput = html("input", "map-prov-slider");
  provInput.type = "range";
  provInput.min = String(data.mapart.provinces.min);
  provInput.max = String(data.mapart.provinces.max);
  provInput.step = "10";
  provInput.value = String(prefs.provinces);
  provInput.addEventListener("input", () => {
    provLabel.firstChild!.textContent = `國界格數（省）：${provInput.value}`;
  });
  provInput.addEventListener("change", () => {
    writeMapPrefs({ ...prefs, provinces: Number(provInput.value) });
    handlers.onRefresh();
  });
  provLabel.append(provInput);
  more.append(haloLabel, provLabel);
  const legend = html("div", "map-legend");
  const oldOwners = [...new Set(map.polityIds)]
    .filter((id) => !snap.polities.some((p) => p.id === id))
    .map((id) => polityById(id))
    .filter((p) => p !== undefined)
    .map((p) => ({ name: `${polityLabel(p)}（舊界）`, color: p.color }));
  for (const item of [...legendOf(snap), ...oldOwners]) {
    const chip = html("span", "map-chip");
    const sw = html("span", "map-swatch");
    sw.style.background = item.color;
    chip.append(sw, document.createTextNode(item.name));
    legend.append(chip);
  }
  more.append(legend);
  more.append(html("p", "desc map-symbols", "色塊為國家領土，實線是國界、紅色箭頭由進攻方指向被攻處；細線是省界。● 目前位置　◇ 渡口　■ 商行　⋯ 路線"));
  more.append(html("p", "desc map-symbols", "宗門圓點：實心＝興盛、空心＝尋常、虛線外框＝衰微、灰色＝閉山、✕＝覆滅；大宗較大，守梯大宗多一圈；外圍色暈是靈脈範圍。"));
  mapPane.append(more);

  // ---- 折疊區：本世疆界時間軸與大事記 ----
  const startQuarter = data.config.startAgeYears * 4;
  const seasonText = (q: number) => `${Math.floor(q / 4)} 歲${SEASONS[q % 4]}`;
  const timeline = html("details", "map-timeline");
  if (scrubbed || timelineNote) timeline.open = true;
  timeline.append(html("summary", undefined, "本世疆界與大事記"));
  const history = timelineEntries(world, data, nowYears);
  const jumpTo = (age: number, spots: Point[], note: string | null) => {
    mapView = { seed: state.worldSeed, quarter: Math.min(nowQuarter, Math.max(startQuarter, age * 4)) };
    highlightSpots = spots;
    timelineNote = note;
    handlers.onRefresh();
  };
  if (nowQuarter > startQuarter) {
    const row = html("div", "map-tl-row");
    const slider = html("input", "map-tl-slider");
    slider.type = "range";
    slider.min = String(startQuarter);
    slider.max = String(nowQuarter);
    slider.step = "1";
    slider.value = String(viewQuarter);
    slider.setAttribute("aria-label", "回看本世疆界");
    const ageText = html("span", "map-tl-age", scrubbed ? seasonText(viewQuarter) : "現在");
    slider.addEventListener("input", () => {
      const q = Number(slider.value);
      mapView = { seed: state.worldSeed, quarter: q };
      ageText.textContent = q >= nowQuarter ? "現在" : seasonText(q);
      repaint(q, art);
    });
    slider.addEventListener("change", () => handlers.onRefresh());
    row.append(slider, ageText);
    const marks = html("div", "map-tl-marks");
    for (const entry of history.filter((e) => e.spots.length > 0)) {
      const mark = html("button", "map-tl-mark");
      mark.type = "button";
      mark.style.left = `${((entry.age * 4 - startQuarter) / (nowQuarter - startQuarter)) * 100}%`;
      mark.setAttribute("aria-label", `${entry.age} 歲：${entry.note}`);
      mark.title = `${entry.age} 歲：${entry.note}`;
      mark.addEventListener("click", () => jumpTo(entry.age, entry.spots, `${entry.age} 歲：${entry.note}`));
      marks.append(mark);
    }
    timeline.append(row, marks);
    if (scrubbed) {
      const back = html("button", undefined, "回到現在");
      back.type = "button";
      back.addEventListener("click", () => {
        mapView = null;
        highlightSpots = [];
        timelineNote = null;
        handlers.onRefresh();
      });
      timeline.append(html("p", "map-effect-line", `正在回看 ${seasonText(viewQuarter)} 的疆界與宗門（唯讀，不影響這一世）。`), back);
    }
    if (timelineNote) timeline.append(html("p", "map-tl-note", timelineNote));
  } else {
    timeline.append(html("p", "desc", "年紀尚輕，還沒有可回看的變化。"));
  }
  const notes = html("div", "map-notes");
  if (history.length === 0) notes.append(html("p", "desc", "天下無事。"));
  for (const entry of [...history].reverse()) {
    const item = html("button", "map-note-btn", `${entry.age} 歲　${entry.note}`);
    item.type = "button";
    if (viewYears === entry.age && timelineNote?.endsWith(entry.note)) item.classList.add("current");
    item.addEventListener("click", () => jumpTo(entry.age, entry.spots, `${entry.age} 歲：${entry.note}`));
    notes.append(item);
  }
  timeline.append(notes);
  mapPane.append(timeline);

  // ---- 折疊區：行跡與前往 ----
  const travel = html("details", "map-travel");
  if (activeRoute) travel.open = true;
  travel.append(html("summary", undefined, "行跡與前往"));
  const currentPlace = places.find((place) => place.id === state.travel.locationId);
  travel.append(html("p", undefined, `目前：${currentPlace?.name ?? "出生地"}　已訪 ${new Set(state.travel.trail).size} 處`));
  if (state.travel.trail.length > 1) {
    const recent = state.travel.trail.slice(-6).map((id) => places.find((place) => place.id === id)?.name ?? id);
    travel.append(html("p", "map-trail-text", `近程：${recent.join(" → ")}`));
  }
  const destinationLabel = html("label", "map-destination-label", "選擇地點");
  const destinationSelect = html("select", "map-destination");
  const prompt = html("option", undefined, "— 請選擇 —");
  prompt.value = "";
  destinationSelect.append(prompt);
  for (const region of data.map.regions.filter((r) => r.land)) {
    const group = html("optgroup");
    group.label = region.name;
    for (const place of places.filter((p) => p.region === region.id)) {
      const option = html("option", undefined, `${place.name}・${place.status}`);
      option.value = place.id;
      group.append(option);
    }
    destinationSelect.append(group);
  }
  destinationSelect.value = selected?.kind === "territory" ? "" : placeIdOf(selected) ?? "";
  destinationSelect.addEventListener("change", () => {
    const place = places.find((item) => item.id === destinationSelect.value);
    handlers.onSelect(place ? targetOfPlace(place) : null);
  });
  destinationLabel.append(destinationSelect);
  travel.append(destinationLabel);
  let travelStatus: HTMLParagraphElement | null = null;
  if (activeRoute) {
    travelStatus = html("p", "map-travel-status", `正往${activeRoute.to.name}，尚需 ${state.travel.remainingMonths} 個月。途中修行與事件照常。`);
    travel.append(travelStatus);
  } else {
    travel.append(html("p", "desc", "點選都城、宗門、渡口或坊市，可查看路線；前往的按鈕在上方資訊卡。"));
  }
  mapPane.append(travel);

  // ---- 折疊區：世局影響 ----
  const related = new Set((selected ? effectsForTarget(selected, snap, data) : []).map((e) => e.id));
  const effects = html("details", "map-effects");
  effects.append(html("summary", undefined, "世局影響"));
  const active = activeEffectsAt(snap, data);
  if (active.length === 0) effects.append(html("p", "desc", "眼下世局平靜，坊市物價照舊。"));
  for (const e of active) {
    const d = describeEffect(e, world, data);
    const p = html("p", related.has(e.id) ? "map-effect related" : "map-effect");
    p.append(document.createTextNode(d.reason), html("small", undefined, `　${d.impact}`));
    effects.append(p);
  }
  if (marketTerritory(state, data)?.contested) effects.append(html("p", "map-effect", `出生坊市一帶國界正在易手，物價約漲 ${Math.round((data.map.territoryRules.marketMultiplier - 1) * 100)}%。`));
  if (localTerritory(state, data)?.contested) effects.append(html("p", "map-effect", "目前所在地邊界動盪，可能遇到關道商隊。"));
  mapPane.append(effects);

  frag.append(mapPane);
  worldMapCache = { key: cacheKey, nodes: Array.from(frag.childNodes), you, routeProgress, travelStatus };
  return frag;
}

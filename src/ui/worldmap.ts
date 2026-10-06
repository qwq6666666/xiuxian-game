// 天下圖的畫面：用一張 SVG 畫出地域、國家、宗門、渡口與「你在這裡」，點選後顯示簡介。
import type { GameState } from "../core/state";
import { localTerritory, marketTerritory, placesAt, routeTo, type TravelPlace } from "../core/travel";
import { polityLabel, worldAt, worldFor } from "../core/world";
import { sectReach, territoriesAt, territoryForPoint } from "../core/territory";
import { ageQuarters, frontLines, regionFight, territoryGeometryAt, type GeoCell } from "../core/frontier";
import type { GameData, MapRegion, Point } from "../data/types";
import { joinInfo } from "./sectinfo";
import { activeEffectsAt, describeEffect, describeTarget, effectsForTarget, legendOf, mapAgeYears, placeHistory, polityLookup, sectMarker, targetKindLabel, territoryLines, timelineEntries, type MapTarget } from "./mapinfo";
import { brushLine, clampView, compassNames, placeLabels, polyTween, zoomView, type LabelItem, type ViewBox } from "./mapgeo";

const SVG_NS = "http://www.w3.org/2000/svg";

interface WorldMapCache {
  key: string;
  nodes: ChildNode[];
  you: SVGGElement;
  routeProgress: SVGPolylineElement | null;
  travelStatus: HTMLParagraphElement | null;
}

let worldMapCache: WorldMapCache | null = null;

// 時間軸回看、事件高亮、縮放與上一幀的幾何；只影響顯示，不進遊戲狀態
let mapView: { seed: number; quarter: number } | null = null;
let highlightRegions: string[] = [];
let timelineNote: string | null = null;
let zoomBox: ViewBox | null = null;
let lastGeo: { seed: number; quarter: number; cells: GeoCell[] } | null = null;
let animToken = 0;

/** 開啟天下圖時呼叫：回到現在、清掉高亮與縮放 */
export function resetMapView(): void {
  mapView = null;
  highlightRegions = [];
  timelineNote = null;
  zoomBox = null;
  worldMapCache = null;
}

const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
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
  if (target.kind === "region" || target.kind === "territory") return (target.kind === "region" ? target.id : target.region) === "beihuang" ? null : `capital:${target.kind === "region" ? target.id : target.region}`;
  if (target.kind === "sect" || target.kind === "ferry") return `${target.kind}:${target.id}`;
  if (target.kind === "branch") return `branch:${target.region}`;
  return target.kind;
}

function targetOfPlace(place: TravelPlace): MapTarget {
  if (place.id.startsWith("capital:")) return { kind: "region", id: place.region };
  if (place.id.startsWith("sect:")) return { kind: "sect", id: place.id.slice(5) };
  if (place.id.startsWith("ferry:")) return { kind: "ferry", id: place.id.slice(6) };
  if (place.id.startsWith("branch:")) return { kind: "branch", region: place.region };
  return { kind: place.id as "village" | "market" | "mountain" | "merchantHq" };
}

function along(points: [number, number][], progress: number): [number, number] {
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

function moveTraveler(you: SVGGElement, point: [number, number]): void {
  you.style.transform = `translate(${point[0]}px, ${point[1]}px)`;
}

function updateTravelProgress(cache: WorldMapCache, state: GameState, data: GameData): void {
  if (!state.travel.targetId) return;
  const route = routeTo(state, state.travel.targetId, data);
  if (!route) return;
  const progress = travelProgress(state);
  moveTraveler(cache.you, along(route.points, progress));
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
    highlightRegions,
    timelineNote,
    selected,
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
  const world = worldFor(state.worldSeed, data);
  return `${state.worldSeed}:${worldAt(world, mapAgeYears(state.ageMonths)).changeCount}`;
}

/** 組出天下圖的內容（標題列、地圖、圖例、天下大勢、簡介） */
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

  const world = worldFor(state.worldSeed, data);
  const nowQuarter = ageQuarters(state.ageMonths);
  const nowYears = Math.floor(nowQuarter / 4);
  const viewQuarter = shownQuarter(state, data);
  const viewYears = Math.floor(viewQuarter / 4);
  const scrubbed = viewQuarter < nowQuarter;
  const snap = worldAt(world, viewYears);
  const territories = territoriesAt(world, viewYears, data);
  const polityById = polityLookup(world, snap);
  const [w, h] = data.map.viewBox;
  const frag = document.createDocumentFragment();
  const layout = html("div", "map-layout");
  const mapPane = html("div", "map-pane");
  const mapSide = html("div", "map-side");
  layout.append(mapPane, mapSide);

  const head = html("div", "codex-head");
  head.append(html("h2", undefined, "天下圖"));
  const close = html("button", undefined, "關閉");
  close.type = "button";
  close.addEventListener("click", handlers.onClose);
  head.append(close);
  const ferryScene = html("div", "scene-art scene-art-ferry");
  ferryScene.setAttribute("role", "img");
  ferryScene.setAttribute("aria-label", "晨霧江面上，一葉渡船泊在古渡旁");
  frag.append(head, html("p", "desc", "九渡洲。山河未改，行路的人已不同。"), ferryScene, layout);

  const view0 = zoomBox ?? { x: 0, y: 0, w, h };
  const root = svg("svg", { viewBox: `${view0.x} ${view0.y} ${view0.w} ${view0.h}`, class: "map-svg", role: "group", "aria-label": "九渡洲地圖" });

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

  // 地域底線；國界由下面的疆界幾何畫，不再沿著地域輪廓。
  const polityOf = (r: MapRegion) => snap.polities.find((p) => p.id === snap.owners[r.id]);
  const placesView = placesAt({ ...state, ageMonths: viewYears * 12 }, data);
  const defs = svg("defs");
  const mask = svg("clipPath", { id: "land-mask" });
  for (const region of data.map.regions.filter((r) => r.land)) mask.append(svg("path", { d: region.path }));
  defs.append(mask);
  root.append(defs);
  for (const region of data.map.regions) {
    const p = region.land ? polityOf(region) : undefined;
    const path = svg("path", {
      d: region.path,
      class: region.land ? "map-region map-region-land" : "map-region map-region-void",
      ...(region.land ? {} : { "fill-opacity": 0.22 }),
      stroke: "currentColor",
      "stroke-opacity": region.land ? 0.2 : 0.45,
      "stroke-width": 1.2,
      ...(p?.tribal ? { "stroke-dasharray": "4 3" } : {}),
    });
    root.append(interactive(path, { kind: "region", id: region.id }));
  }

  // 疆界幾何：加權 Voronoi 的格子（無描邊）、只描不同國之間的國界、交戰處的推進箭頭。
  const geoLayer = svg("g", { "clip-path": "url(#land-mask)" });
  const frontLayer = svg("g", { class: "map-fronts", "clip-path": "url(#land-mask)" });
  const arrowLayer = svg("g", { class: "map-arrows" });
  root.append(geoLayer, frontLayer, arrowLayer);
  const brushPhase = world.seed % 9973;
  const regionById = (id: string) => data.map.regions.find((r) => r.id === id)!;
  const pointString = (poly: Point[]) => poly.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

  /** 重畫某一季的疆界；animateFrom 有值時，色塊從舊形狀滑到新形狀 */
  const renderGeo = (quarter: number, animateFrom: GeoCell[] | null): void => {
    const cells = territoryGeometryAt(world, quarter, data);
    const years = Math.floor(quarter / 4);
    const owners = worldAt(world, years).owners;
    const oldById = new Map((animateFrom ?? []).map((c) => [c.id, c]));
    const tweens: { el: SVGPolygonElement; at: (t: number) => Point[] }[] = [];
    geoLayer.replaceChildren();
    for (const cell of cells) {
      const polity = polityById(cell.ownerId);
      const poly = svg("polygon", {
        points: pointString(cell.polygon),
        class: ["map-territory", cell.fight ? "contested" : "", highlightRegions.includes(cell.region) ? "highlight" : ""].filter(Boolean).join(" "),
        fill: polity?.color ?? data.map.palette[0],
      });
      geoLayer.append(interactive(poly, { kind: "territory", id: cell.id, region: cell.region }));
      if (animateFrom) tweens.push({ el: poly, at: polyTween(oldById.get(cell.id)?.polygon, cell.polygon) });
    }
    frontLayer.replaceChildren();
    frontLayer.classList.toggle("settling", animateFrom !== null);
    for (const line of frontLines(cells)) {
      const pts = brushLine(line.a, line.b, brushPhase);
      frontLayer.append(svg("path", { d: `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" L")}`, class: line.fighting ? "map-front fighting" : "map-front" }));
    }
    // 推進箭頭：由進攻方相鄰的地域都城指向被攻地域的都城；進度越高越不透明
    arrowLayer.replaceChildren();
    for (const region of data.map.regions.filter((r) => r.land)) {
      const fight = regionFight(cells, region.id);
      if (!fight) continue;
      const source = (data.map.adjacency[region.id] ?? []).find((n) => owners[n] === fight.attacker && !regionFight(cells, n));
      if (!source) continue;
      const [x1, y1] = regionById(source).capital!;
      const [x2, y2] = region.capital!;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len;
      const uy = (y2 - y1) / len;
      const sx = x1 + ux * len * 0.42;
      const sy = y1 + uy * len * 0.42;
      const ex = x1 + ux * len * (0.55 + 0.3 * fight.progress);
      const ey = y1 + uy * len * (0.55 + 0.3 * fight.progress);
      const head = `M${ex - ux * 7 - uy * 4},${ey - uy * 7 + ux * 4} L${ex},${ey} L${ex - ux * 7 + uy * 4},${ey - uy * 7 - ux * 4}`;
      const arrow = svg("path", { d: `M${sx},${sy} L${ex},${ey} ${head}`, class: "map-arrow", "stroke-opacity": (0.4 + 0.5 * fight.progress).toFixed(2) });
      arrowLayer.append(arrow);
    }
    if (animateFrom && tweens.length > 0 && !reducedMotion()) {
      const token = ++animToken;
      const start = performance.now();
      const apply = (t: number) => { for (const x of tweens) x.el.setAttribute("points", pointString(x.at(t))); };
      apply(0);
      const step = (now: number) => {
        if (token !== animToken) return;
        const t = Math.min(1, (now - start) / 700);
        apply(1 - (1 - t) ** 3);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // 背景分頁會暫停影格，保險起見定時收尾成最終形狀
      setTimeout(() => { if (token === animToken) apply(1); }, 900);
    } else {
      animToken++;
    }
    lastGeo = { seed: world.seed, quarter, cells };
  };
  const previous = lastGeo && lastGeo.seed === world.seed && lastGeo.quarter !== viewQuarter && Math.abs(lastGeo.quarter - viewQuarter) <= 4 ? lastGeo.cells : null;
  renderGeo(viewQuarter, previous);

  // 宗門只覆蓋靈脈勢力，不改凡俗國界。
  for (const sect of snap.sects) {
    const reach = sectReach(sect, data);
    if (reach === 0) continue;
    const region = data.map.regions.find((r) => r.id === sect.region)!;
    const [x, y] = region.sites![sect.site];
    const circle = svg("circle", { cx: x, cy: y, r: reach, class: `map-influence ${sect.state}` });
    root.append(interactive(circle, { kind: "sect", id: sect.id }));
  }

  // 已走路線與正在走的路線放在地形之上、地點標記之下。
  const places = placesAt(state, data);
  const visited = state.travel.trail.map((id) => places.find((place) => place.id === id)).filter((place) => place !== undefined);
  for (let i = 1; i < visited.length; i++) {
    root.append(svg("path", { d: `M${visited[i - 1].point.join(",")} L${visited[i].point.join(",")}`, class: "map-visited" }));
  }
  const activeRoute = state.travel.targetId ? routeTo(state, state.travel.targetId, data) : null;
  const previewRoute = !activeRoute && selected ? routeTo(state, placeIdOf(selected) ?? "", data) : null;
  const shownRoute = activeRoute ?? previewRoute;
  let routeProgress: SVGPolylineElement | null = null;
  if (shownRoute) {
    root.append(svg("polyline", { points: shownRoute.points.map((p) => p.join(",")).join(" "), class: activeRoute ? "map-route active" : "map-route" }));
    if (activeRoute) {
      routeProgress = svg("polyline", {
        points: activeRoute.points.map((p) => p.join(",")).join(" "),
        class: "map-route-progress",
        pathLength: 100,
      });
      routeProgress.style.strokeDasharray = `${travelProgress(state) * 100} 100`;
      root.append(routeProgress);
    }
  }
  // 小標籤先收集，最後依重要度避讓重疊的；被選取的永遠顯示，其餘仍可點、可由鍵盤聚焦
  const labels: LabelItem[] = [];
  const addLabel = (key: string, x: number, y: number, text: string, priority: number, anchor: "start" | "middle", target?: MapTarget): void => {
    labels.push({ key, x, y, text, anchor, priority: target && sameTarget(selected, target) ? 0 : priority });
  };
  for (const region of data.map.regions) {
    const p = region.land ? polityOf(region) : undefined;
    const label = svg("text", { x: region.label[0], y: region.label[1], class: "map-label", "text-anchor": "middle" });
    label.textContent = p ? polityLabel(p) : region.name;
    root.append(label);
    const capital = placesView.find((place) => place.id === `capital:${region.id}`);
    if (p && region.capital && capital && !p.tribal) {
      root.append(svg("circle", { cx: region.capital[0], cy: region.capital[1], r: 2.5, class: "map-capital" }));
      addLabel(`capital:${region.id}`, region.capital[0] + 5, region.capital[1] + 3, capital.name, 2, "start");
    }
  }

  // 殘階（灰色，只聞其名）
  const st = data.map.stairs;
  const stairs = svg("path", { d: `M${st.x - 7},${st.y + 6} L${st.x},${st.y - 7} L${st.x + 7},${st.y + 6} Z`, class: "map-stairs" });
  root.append(interactive(stairs, { kind: "stairs" }, [st.x, st.y, 15]));
  addLabel("stairs", st.x, st.y + 20, "殘階", 2, "middle", { kind: "stairs" });

  // 渡口：毀壞的畫叉；出生地的坊市標在該地域第一處渡口
  for (const f of snap.ferries) {
    const region = data.map.regions.find((r) => r.id === f.region)!;
    const [x, y] = region.ferries![f.index];
    const isMarket = f.region === world.birth.region && f.index === 0;
    const g = svg("g");
    if (f.broken) {
      g.append(svg("path", { d: `M${x - 4},${y - 4} L${x + 4},${y + 4} M${x + 4},${y - 4} L${x - 4},${y + 4}`, class: "map-ferry-broken" }));
    } else {
      g.append(svg("rect", { x: x - 3.5, y: y - 3.5, width: 7, height: 7, transform: `rotate(45 ${x} ${y})`, class: "map-ferry" }));
    }
    root.append(interactive(g, isMarket ? { kind: "market" } : { kind: "ferry", id: f.id }, [x, y, 12]));
    if (isMarket) {
      addLabel("market", x + 7, y - 5, world.birth.market, 5, "start", { kind: "market" });
    }
  }

  // 商行：總號在中部，分號在各地域的都城旁
  for (const region of data.map.regions.filter((r) => r.land && snap.merchantBranches.includes(r.id))) {
    const [cx, cy] = region.capital!;
    const hq = region.id === "center";
    const x = cx + 12;
    const y = cy + 8;
    const size = hq ? 9 : 6;
    const rect = svg("rect", { x: x - size / 2, y: y - size / 2, width: size, height: size, class: hq ? "map-merchant-hq" : "map-merchant" });
    root.append(interactive(rect, hq ? { kind: "merchantHq" } : { kind: "branch", region: region.id }, [x, y, 12]));
  }

  // 宗門
  for (const sect of snap.sects) {
    const region = data.map.regions.find((r) => r.id === sect.region)!;
    const [x, y] = region.sites![sect.site];
    const m = sectMarker(sect);
    const g = svg("g", { class: `map-sect map-sect-${m.fill}` });
    if (m.ring) g.append(svg("circle", { cx: x, cy: y, r: m.radius + 3, class: "map-sect-ring" }));
    g.append(svg("circle", { cx: x, cy: y, r: m.radius, class: "map-sect-dot" }));
    if (m.fill === "fallen") {
      const d = m.radius;
      g.append(svg("path", { d: `M${x - d},${y - d} L${x + d},${y + d} M${x + d},${y - d} L${x - d},${y + d}`, class: "map-sect-x" }));
    }
    root.append(interactive(g, { kind: "sect", id: sect.id }, [x, y, 14]));
    addLabel(`sect:${sect.id}`, x + m.radius + 3, y + 3, sect.name, sect.rank === "great" ? 3 : 4, "start", { kind: "sect", id: sect.id });
  }

  // 出生地：山與村
  const birthRegion = data.map.regions.find((r) => r.id === world.birth.region)!;
  const [mx, my] = birthRegion.birth!.mountain;
  const mountain = svg("path", { d: `M${mx - 6},${my + 4} L${mx},${my - 6} L${mx + 6},${my + 4} Z`, class: "map-mountain" });
  root.append(interactive(mountain, { kind: "mountain" }, [mx, my, 10]));
  addLabel("mountain", mx + 8, my + 3, world.birth.mountain, 6, "start", { kind: "mountain" });
  const [vx, vy] = birthRegion.birth!.village;
  const village = svg("g", { class: "map-village" });
  village.append(svg("circle", { cx: vx, cy: vy, r: 4, class: "map-village-dot" }));
  root.append(interactive(village, { kind: "village" }, [vx, vy, 12]));
  addLabel("village", vx, vy + 21, world.birth.village, 6, "middle", { kind: "village" });
  for (const item of placeLabels(labels).shown) {
    const text = svg("text", { x: item.x, y: item.y, class: "map-small", "text-anchor": item.anchor });
    text.textContent = item.text;
    root.append(text);
  }

  const current = places.find((place) => place.id === state.travel.locationId)?.point ?? [vx, vy];
  const markerPoint = activeRoute ? along(activeRoute.points, travelProgress(state)) : current;
  const you = svg("g", { class: "map-you" });
  you.append(svg("circle", { cx: 0, cy: 0, r: 10, class: "map-you-ring" }), svg("circle", { cx: 0, cy: 0, r: 5, class: "map-you-dot" }));
  moveTraveler(you, markerPoint);
  root.append(you);

  root.addEventListener("click", () => handlers.onSelect(null));
  mapPane.append(root);
  attachZoom(root, [w, h]);
  if (isPhone()) {
    const bar = html("div", "map-zoom");
    const zoomBy = (factor: number | null) => {
      const cur = zoomBox ?? { x: 0, y: 0, w, h };
      zoomBox = factor === null ? null : zoomView(cur, [w, h], cur.x + cur.w / 2, cur.y + cur.h / 2, factor);
      const v = zoomBox ?? { x: 0, y: 0, w, h };
      root.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    };
    for (const [text, label, factor] of [["＋", "放大地圖", 1.6], ["－", "縮小地圖", 1 / 1.6], ["還原", "還原地圖大小", null]] as const) {
      const b = html("button", "map-zoom-btn", text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => zoomBy(factor));
      bar.append(b);
    }
    mapPane.append(bar);
  }

  // 本世疆界時間軸：只能回看到現在，拖動只改顯示
  const startQuarter = data.config.startAgeYears * 4;
  const seasonText = (q: number) => `${Math.floor(q / 4)} 歲${SEASONS[q % 4]}`;
  const timeline = html("section", "map-timeline");
  timeline.append(html("h3", undefined, "本世疆界"));
  const history = timelineEntries(world, data, nowYears);
  const jumpTo = (age: number, regions: string[], note: string | null) => {
    mapView = { seed: state.worldSeed, quarter: Math.min(nowQuarter, Math.max(startQuarter, age * 4)) };
    highlightRegions = regions;
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
      renderGeo(q, null);
    });
    slider.addEventListener("change", () => handlers.onRefresh());
    row.append(slider, ageText);
    const marks = html("div", "map-tl-marks");
    for (const entry of history.filter((e) => e.regions.length > 0)) {
      const mark = html("button", "map-tl-mark");
      mark.type = "button";
      mark.style.left = `${((entry.age * 4 - startQuarter) / (nowQuarter - startQuarter)) * 100}%`;
      mark.setAttribute("aria-label", `${entry.age} 歲：${entry.note}`);
      mark.title = `${entry.age} 歲：${entry.note}`;
      mark.addEventListener("click", () => jumpTo(entry.age, entry.regions, `${entry.age} 歲：${entry.note}`));
      marks.append(mark);
    }
    timeline.append(row, marks);
    if (scrubbed) {
      const back = html("button", undefined, "回到現在");
      back.type = "button";
      back.addEventListener("click", () => {
        mapView = null;
        highlightRegions = [];
        timelineNote = null;
        handlers.onRefresh();
      });
      timeline.append(html("p", "map-effect-line", `正在回看 ${seasonText(viewQuarter)} 的疆界與宗門（唯讀，不影響這一世）。`), back);
    }
    if (timelineNote) timeline.append(html("p", "map-tl-note", timelineNote));
  } else {
    timeline.append(html("p", "desc", "年紀尚輕，還沒有可回看的變化。"));
  }
  mapPane.append(timeline);

  // 圖例
  const legend = html("div", "map-legend");
  const oldOwners = [...new Set(territories.map((t) => t.ownerId))]
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
  mapPane.append(legend);
  mapPane.append(html("p", "desc map-symbols", "色塊為國家領土，實線是國界、紅色流動虛線是正在推進的國界，箭頭由進攻方指向被攻處。● 目前位置　◇ 渡口　■ 商行　⋯ 路線"));
  mapPane.append(html("p", "desc map-symbols", "宗門圓點：實心＝興盛、空心＝尋常、虛線外框＝衰微、灰色＝閉山、✕＝覆滅；大宗較大，守梯大宗多一圈；外圍虛線圓是靈脈範圍。"));

  const travel = html("section", "map-travel");
  travel.append(html("h3", undefined, "行跡"));
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
  const geoCells = territoryGeometryAt(world, viewQuarter, data);
  const territoryLabel = html("label", "map-destination-label", "查看領土");
  const territorySelect = html("select", "map-destination");
  const territoryPrompt = html("option", undefined, "— 請選擇 —");
  territoryPrompt.value = "";
  territorySelect.append(territoryPrompt);
  for (const region of data.map.regions.filter((r) => r.land)) {
    const group = html("optgroup");
    group.label = region.name;
    const names = compassNames(region.nodes!);
    for (const cell of geoCells.filter((c) => c.region === region.id)) {
      const owner = polityById(cell.ownerId);
      const option = html("option", undefined, `${region.name}・${names[cell.nodeIndex]}・${owner ? polityLabel(owner) : "諸部"}${cell.fight ? "・邊界推移中" : ""}`);
      option.value = cell.id;
      group.append(option);
    }
    territorySelect.append(group);
  }
  territorySelect.value = selected?.kind === "territory" ? selected.id : "";
  territorySelect.addEventListener("change", () => {
    const cell = geoCells.find((c) => c.id === territorySelect.value);
    handlers.onSelect(cell ? { kind: "territory", id: cell.id, region: cell.region } : null);
  });
  territoryLabel.append(territorySelect);
  travel.append(territoryLabel);
  let travelStatus: HTMLParagraphElement | null = null;
  if (activeRoute) {
    travelStatus = html("p", "map-travel-status", `正往${activeRoute.to.name}，尚需 ${state.travel.remainingMonths} 個月。途中修行與事件照常。`);
    travel.append(travelStatus);
  } else if (previewRoute) {
    travel.append(html("p", "map-travel-status", `${previewRoute.to.status}。需時 ${previewRoute.months} 個月${previewRoute.delayMonths ? `（邊境動盪多 ${previewRoute.delayMonths} 個月）` : ""}，途經 ${previewRoute.regions.map((id) => data.map.regions.find((r) => r.id === id)!.name).join("、")}。`));
    if (state.phase === "living" && state.pendingEvent === null && !scrubbed) {
      const go = html("button", "primary map-travel-go", `前往${previewRoute.to.name}`);
      go.type = "button";
      go.addEventListener("click", () => handlers.onTravel(previewRoute.to.id));
      travel.append(go);
    }
  } else {
    travel.append(html("p", "desc", "點選都城、宗門、渡口或坊市，可查看路線。"));
  }
  mapSide.append(travel);

  // 天下大勢
  const notes = html("div", "map-notes");
  notes.append(html("h3", undefined, "天下大勢"));
  if (history.length === 0) notes.append(html("p", "desc", "天下無事。"));
  for (const entry of [...history].reverse()) {
    const item = html("button", "map-note-btn", `${entry.age} 歲　${entry.note}`);
    item.type = "button";
    if (viewYears === entry.age && timelineNote?.endsWith(entry.note)) item.classList.add("current");
    item.addEventListener("click", () => jumpTo(entry.age, entry.regions, `${entry.age} 歲：${entry.note}`));
    notes.append(item);
  }
  mapSide.append(notes);

  // 世局影響：生效中的效果，原因加上影響的物價；點選相關標記時標出
  const related = new Set((selected ? effectsForTarget(selected, snap, data) : []).map((e) => e.id));
  const effects = html("div", "map-effects");
  effects.append(html("h3", undefined, "世局影響"));
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
  mapSide.append(effects);

  // 簡介
  const info = html("div", "map-info");
  if (selected) {
    const d = describeTarget(selected, world, snap, data);
    const title = html("p", "map-info-title");
    title.append(html("strong", undefined, d.title), html("small", undefined, `　${targetKindLabel(selected, snap)}`));
    info.append(title);
    for (const line of d.lines) info.append(html("p", undefined, line));
    if (selected.kind === "territory") {
      const cell = geoCells.find((c) => c.id === selected.id);
      const names = compassNames(regionById(selected.region).nodes!);
      if (cell) info.append(html("p", undefined, `位置：${regionById(selected.region).name}・${names[cell.nodeIndex]}。`));
      for (const line of territoryLines(world, geoCells, selected.id, data, viewYears)) info.append(html("p", "map-effect-line", line));
    } else {
      const place = places.find((p) => p.id === placeIdOf(selected));
      const territory = place ? territoryForPoint(territories, place.region, place.point) : undefined;
      if (territory) {
        const owner = polityById(territory.ownerId);
        info.append(html("p", "map-effect-line", `所在地：${owner ? polityLabel(owner) : "諸部"}${territory.contested ? "；邊界正在推移" : ""}。`));
      }
    }
    const past = placeHistory(world, d.title.split("・"), viewYears).slice(-3);
    if (past.length > 0) info.append(html("p", "desc", `本世此處的事：${past.map((e) => `${e.age} 歲，${e.note}`).join(" ")}`));
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
    info.append(html("p", "desc", "點選地域、宗門、渡口，看一看。"));
  }
  mapSide.append(info);
  worldMapCache = { key: cacheKey, nodes: Array.from(frag.childNodes), you, routeProgress, travelStatus };
  return frag;
}

/** 手機寬度的縮放與拖曳：雙指縮放、拖曳平移、雙擊放大。範圍限制在地圖內；桌面維持固定圖。 */
function attachZoom(root: SVGSVGElement, box: Point): void {
  if (!isPhone()) return;
  const current = (): ViewBox => zoomBox ?? { x: 0, y: 0, w: box[0], h: box[1] };
  const apply = (v: ViewBox) => {
    zoomBox = v.w >= box[0] ? null : v;
    root.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  };
  const toMap = (cx: number, cy: number): Point => {
    const r = root.getBoundingClientRect();
    const v = current();
    return [v.x + ((cx - r.left) / r.width) * v.w, v.y + ((cy - r.top) / r.height) * v.h];
  };
  const pointers = new Map<number, Point>();
  let pinch = 0;
  let moved = 0;
  let lastTap = { t: 0, x: 0, y: 0 };
  root.addEventListener("pointerdown", (ev) => {
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    root.setPointerCapture?.(ev.pointerId);
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  root.addEventListener("pointermove", (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch > 0 && dist > 0) {
        const mid = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        apply(zoomView(current(), box, mid[0], mid[1], dist / pinch));
        moved = 99;
      }
      pinch = dist;
      return;
    }
    const v = current();
    if (v.w >= box[0]) return;
    const r = root.getBoundingClientRect();
    const dx = ((ev.clientX - prev[0]) / r.width) * v.w;
    const dy = ((ev.clientY - prev[1]) / r.height) * v.h;
    moved += Math.abs(ev.clientX - prev[0]) + Math.abs(ev.clientY - prev[1]);
    if (moved > 6) apply(clampView({ ...v, x: v.x - dx, y: v.y - dy }, box));
  });
  const end = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    pinch = 0;
    if (pointers.size > 0 || moved > 6) return;
    const now = ev.timeStamp;
    if (now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 24) {
      const p = toMap(ev.clientX, ev.clientY);
      apply(zoomView(current(), box, p[0], p[1], current().w < box[0] * 0.6 ? 0.01 : 2));
      lastTap = { t: 0, x: 0, y: 0 };
      moved = 99;
    } else {
      lastTap = { t: now, x: ev.clientX, y: ev.clientY };
    }
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
  // 拖曳或縮放之後放開手指，不要當成點選地點
  root.addEventListener("click", (ev) => {
    if (moved > 6) {
      ev.stopPropagation();
      ev.preventDefault();
      moved = 0;
    }
  }, true);
}

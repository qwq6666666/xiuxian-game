// 天下圖的畫面：用一張 SVG 畫出地域、國家、宗門、渡口與「你在這裡」，點選後顯示簡介。
import type { GameState } from "../core/state";
import { localTerritory, marketTerritory, placesAt, routeTo, type TravelPlace } from "../core/travel";
import { polityLabel, worldAt, worldFor } from "../core/world";
import { sectReach, territoriesAt, territoryForPoint } from "../core/territory";
import type { GameData, MapRegion } from "../data/types";
import { joinInfo } from "./sectinfo";
import { activeEffectsAt, describeEffect, describeTarget, effectsForTarget, legendOf, mapAgeYears, sectMarker, type MapTarget } from "./mapinfo";

const SVG_NS = "http://www.w3.org/2000/svg";

interface WorldMapCache {
  key: string;
  nodes: ChildNode[];
  you: SVGGElement;
  routeProgress: SVGPolylineElement | null;
  travelStatus: HTMLParagraphElement | null;
}

let worldMapCache: WorldMapCache | null = null;

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

function worldMapCacheKey(state: GameState, selected: MapTarget | null): string {
  return JSON.stringify({
    worldSeed: state.worldSeed,
    year: mapAgeYears(state.ageMonths),
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
  handlers: { onSelect(target: MapTarget | null): void; onClose(): void; onTravel(targetId: string): void; onJoinSect(): void },
): DocumentFragment {
  const cacheKey = worldMapCacheKey(state, selected);
  if (worldMapCache?.key === cacheKey && worldMapCache.nodes.every((node) => node.ownerDocument === document)) {
    updateTravelProgress(worldMapCache, state, data);
    const cached = document.createDocumentFragment();
    cached.append(...worldMapCache.nodes);
    return cached;
  }

  const world = worldFor(state.worldSeed, data);
  const snap = worldAt(world, mapAgeYears(state.ageMonths));
  const territories = territoriesAt(world, mapAgeYears(state.ageMonths), data);
  const polityById = (id: string) => snap.polities.find((p) => p.id === id)
    ?? world.polities.find((p) => p.id === id)
    ?? world.changes.flatMap((c) => c.kind === "split" ? [c.created] : []).find((p) => p.id === id);
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
  const ferryScene = html("div", "scene scene-ferry");
  ferryScene.setAttribute("role", "img");
  ferryScene.setAttribute("aria-label", "晨霧江面上，一葉渡船泊在古渡旁");
  frag.append(head, html("p", "desc", "九渡洲。山河未改，行路的人已不同。"), ferryScene, layout);

  const root = svg("svg", { viewBox: `0 0 ${w} ${h}`, class: "map-svg", role: "group", "aria-label": "九渡洲地圖" });

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

  // 地域底線與分區；國家易手後依世局年份逐步換色。
  const polityOf = (r: MapRegion) => snap.polities.find((p) => p.id === snap.owners[r.id]);
  const defs = svg("defs");
  for (const region of data.map.regions.filter((r) => r.land)) {
    const clip = svg("clipPath", { id: `territory-${region.id}` });
    clip.append(svg("path", { d: region.path }));
    defs.append(clip);
  }
  root.append(defs);
  for (const region of data.map.regions) {
    const p = region.land ? polityOf(region) : undefined;
    const path = svg("path", {
      d: region.path,
      class: p ? "map-region" : "map-region map-region-void",
      ...(p ? { fill: p.color } : {}),
      "fill-opacity": p ? 0.1 : 0.22,
      stroke: "currentColor",
      "stroke-opacity": 0.45,
      "stroke-width": 1.2,
      ...(p?.tribal ? { "stroke-dasharray": "4 3" } : {}),
    });
    root.append(interactive(path, { kind: "region", id: region.id }));
  }
  for (const region of data.map.regions.filter((r) => r.land)) {
    const group = svg("g", { "clip-path": `url(#territory-${region.id})` });
    for (const territory of territories.filter((t) => t.region === region.id)) {
      const polity = polityById(territory.ownerId);
      group.append(interactive(svg("polygon", {
        points: territory.polygon.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" "),
        class: territory.contested ? "map-territory contested" : "map-territory",
        fill: polity?.color ?? data.map.palette[0],
      }), { kind: "territory", id: territory.id, region: region.id }));
    }
    root.append(group);
  }

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
  for (const region of data.map.regions) {
    const p = region.land ? polityOf(region) : undefined;
    const label = svg("text", { x: region.label[0], y: region.label[1], class: "map-label", "text-anchor": "middle" });
    label.textContent = p ? polityLabel(p) : region.name;
    root.append(label);
    if (p && region.capital && p.capital) {
      root.append(svg("circle", { cx: region.capital[0], cy: region.capital[1], r: 2.5, class: "map-capital" }));
      const t = svg("text", { x: region.capital[0] + 5, y: region.capital[1] + 3, class: "map-small" });
      t.textContent = p.capital;
      root.append(t);
    }
  }

  // 殘階（灰色，只聞其名）
  const st = data.map.stairs;
  const stairs = svg("path", { d: `M${st.x - 7},${st.y + 6} L${st.x},${st.y - 7} L${st.x + 7},${st.y + 6} Z`, class: "map-stairs" });
  root.append(interactive(stairs, { kind: "stairs" }, [st.x, st.y, 15]));
  const stairsLabel = svg("text", { x: st.x, y: st.y + 20, class: "map-small", "text-anchor": "middle" });
  stairsLabel.textContent = "殘階";
  root.append(stairsLabel);

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
      const t = svg("text", { x: x + 7, y: y - 5, class: "map-small" });
      t.textContent = world.birth.market;
      root.append(t);
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
    const t = svg("text", { x: x + m.radius + 3, y: y + 3, class: "map-small" });
    t.textContent = sect.name;
    root.append(t);
  }

  // 出生地：山與村
  const birthRegion = data.map.regions.find((r) => r.id === world.birth.region)!;
  const [mx, my] = birthRegion.birth!.mountain;
  const mountain = svg("path", { d: `M${mx - 6},${my + 4} L${mx},${my - 6} L${mx + 6},${my + 4} Z`, class: "map-mountain" });
  root.append(interactive(mountain, { kind: "mountain" }, [mx, my, 10]));
  const mt = svg("text", { x: mx + 8, y: my + 3, class: "map-small" });
  mt.textContent = world.birth.mountain;
  root.append(mt);
  const [vx, vy] = birthRegion.birth!.village;
  const village = svg("g", { class: "map-village" });
  village.append(svg("circle", { cx: vx, cy: vy, r: 4, class: "map-village-dot" }));
  root.append(interactive(village, { kind: "village" }, [vx, vy, 12]));
  const villageName = svg("text", { x: vx, y: vy + 21, class: "map-small", "text-anchor": "middle" });
  villageName.textContent = world.birth.village;
  root.append(villageName);

  const current = places.find((place) => place.id === state.travel.locationId)?.point ?? [vx, vy];
  const markerPoint = activeRoute ? along(activeRoute.points, travelProgress(state)) : current;
  const you = svg("g", { class: "map-you" });
  you.append(svg("circle", { cx: 0, cy: 0, r: 10, class: "map-you-ring" }), svg("circle", { cx: 0, cy: 0, r: 5, class: "map-you-dot" }));
  moveTraveler(you, markerPoint);
  root.append(you);

  root.addEventListener("click", () => handlers.onSelect(null));
  mapPane.append(root);

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
  mapPane.append(html("p", "desc map-symbols", "色塊為國家領土；虛線色塊為推進中的邊界；圓圈為宗門靈脈勢力。● 目前位置　◇ 渡口　■ 商行　⋯ 路線"));

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
  const territoryLabel = html("label", "map-destination-label", "查看領土");
  const territorySelect = html("select", "map-destination");
  const territoryPrompt = html("option", undefined, "— 請選擇 —");
  territoryPrompt.value = "";
  territorySelect.append(territoryPrompt);
  for (const region of data.map.regions.filter((r) => r.land)) {
    const group = html("optgroup");
    group.label = region.name;
    for (const territory of territories.filter((t) => t.region === region.id)) {
      const owner = polityById(territory.ownerId);
      const option = html("option", undefined, `第 ${territory.index + 1} 處・${owner ? polityLabel(owner) : "諸部"}${territory.contested ? "・邊界推移中" : ""}`);
      option.value = territory.id;
      group.append(option);
    }
    territorySelect.append(group);
  }
  territorySelect.value = selected?.kind === "territory" ? selected.id : "";
  territorySelect.addEventListener("change", () => {
    const territory = territories.find((t) => t.id === territorySelect.value);
    handlers.onSelect(territory ? { kind: "territory", id: territory.id, region: territory.region } : null);
  });
  territoryLabel.append(territorySelect);
  travel.append(territoryLabel);
  let travelStatus: HTMLParagraphElement | null = null;
  if (activeRoute) {
    travelStatus = html("p", "map-travel-status", `正往${activeRoute.to.name}，尚需 ${state.travel.remainingMonths} 個月。途中修行與事件照常。`);
    travel.append(travelStatus);
  } else if (previewRoute) {
    travel.append(html("p", "map-travel-status", `${previewRoute.to.status}。需時 ${previewRoute.months} 個月${previewRoute.delayMonths ? `（邊境動盪多 ${previewRoute.delayMonths} 個月）` : ""}，途經 ${previewRoute.regions.map((id) => data.map.regions.find((r) => r.id === id)!.name).join("、")}。`));
    if (state.phase === "living" && state.pendingEvent === null) {
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
  if (snap.notes.length === 0) notes.append(html("p", "desc", "天下無事。"));
  for (const n of snap.notes) notes.append(html("p", undefined, n));
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
    info.append(html("strong", undefined, d.title));
    for (const line of d.lines) info.append(html("p", undefined, line));
    if (selected.kind === "territory") {
      const territory = territories.find((t) => t.id === selected.id);
      const owner = territory ? polityById(territory.ownerId) : undefined;
      info.append(html("p", "map-effect-line", `此處現由${owner ? polityLabel(owner) : "諸部"}掌握。${territory?.contested ? "邊界仍在推移，行路與交易會受影響。" : "邊界暫時安定。"}`));
    } else {
      const place = places.find((p) => p.id === placeIdOf(selected));
      const territory = place ? territoryForPoint(territories, place.region, place.point) : undefined;
      if (territory) {
        const owner = polityById(territory.ownerId);
        info.append(html("p", "map-effect-line", `所在地：${owner ? polityLabel(owner) : "諸部"}${territory.contested ? "；邊界正在推移" : ""}。`));
      }
    }
    if (selected.kind === "sect" && state.phase === "living") {
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

// 天下圖的畫面：用一張 SVG 畫出地域、國家、宗門、渡口與「你在這裡」，點選後顯示簡介。
import type { GameState } from "../core/state";
import { polityLabel, worldAt, worldFor } from "../core/world";
import type { GameData, MapRegion } from "../data/types";
import { describeTarget, legendOf, mapAgeYears, sectMarker, type MapTarget } from "./mapinfo";

const SVG_NS = "http://www.w3.org/2000/svg";

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
  handlers: { onSelect(target: MapTarget | null): void; onClose(): void },
): DocumentFragment {
  const world = worldFor(state.worldSeed, data);
  const snap = worldAt(world, mapAgeYears(state.ageMonths));
  const [w, h] = data.map.viewBox;
  const frag = document.createDocumentFragment();

  const head = html("div", "codex-head");
  head.append(html("h2", undefined, "天下圖"));
  const close = html("button", undefined, "關閉");
  close.type = "button";
  close.addEventListener("click", handlers.onClose);
  head.append(close);
  frag.append(head, html("p", "desc", "九渡洲。這一世的天下，與上一世不同。"));

  const root = svg("svg", { viewBox: `0 0 ${w} ${h}`, class: "map-svg", role: "img", "aria-label": "九渡洲示意圖" });

  // 標記共用：點選、放大點擊範圍（手機上好點）
  const interactive = (el: SVGElement, target: MapTarget, hit?: [number, number, number]): SVGElement => {
    el.classList.add("map-hit");
    if (sameTarget(selected, target)) el.classList.add("selected");
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      handlers.onSelect(target);
    });
    if (!hit) return el;
    const g = svg("g");
    g.append(svg("circle", { cx: hit[0], cy: hit[1], r: hit[2], fill: "transparent" }), el);
    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      handlers.onSelect(target);
    });
    return g;
  };

  // 地域
  const polityOf = (r: MapRegion) => snap.polities.find((p) => p.id === snap.owners[r.id]);
  for (const region of data.map.regions) {
    const p = region.land ? polityOf(region) : undefined;
    const path = svg("path", {
      d: region.path,
      class: p ? "map-region" : "map-region map-region-void",
      ...(p ? { fill: p.color } : {}),
      "fill-opacity": p ? 0.4 : 0.22,
      stroke: "currentColor",
      "stroke-opacity": 0.45,
      "stroke-width": 1.2,
      ...(p?.tribal ? { "stroke-dasharray": "4 3" } : {}),
    });
    root.append(interactive(path, { kind: "region", id: region.id }));
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
  const village = svg("g", { class: "map-you" });
  village.append(svg("circle", { cx: vx, cy: vy, r: 9, class: "map-you-ring" }), svg("circle", { cx: vx, cy: vy, r: 4, class: "map-you-dot" }));
  root.append(interactive(village, { kind: "village" }, [vx, vy, 12]));
  const you = svg("text", { x: vx, y: vy - 13, class: "map-you-label", "text-anchor": "middle" });
  you.textContent = "你在這裡";
  const villageName = svg("text", { x: vx, y: vy + 21, class: "map-small", "text-anchor": "middle" });
  villageName.textContent = world.birth.village;
  root.append(you, villageName);

  root.addEventListener("click", () => handlers.onSelect(null));
  frag.append(root);

  // 圖例
  const legend = html("div", "map-legend");
  for (const item of legendOf(snap)) {
    const chip = html("span", "map-chip");
    const sw = html("span", "map-swatch");
    sw.style.background = item.color;
    chip.append(sw, document.createTextNode(item.name));
    legend.append(chip);
  }
  frag.append(legend);
  frag.append(html("p", "desc map-symbols", "宗門：● 興盛　○ 平穩　◌ 衰微　◍ 閉山　✕ 覆滅　｜　◇ 渡口　■ 商行"));

  // 天下大勢
  const notes = html("div", "map-notes");
  notes.append(html("h3", undefined, "天下大勢"));
  if (snap.notes.length === 0) notes.append(html("p", "desc", "天下無事。"));
  for (const n of snap.notes) notes.append(html("p", undefined, n));
  frag.append(notes);

  // 簡介
  const info = html("div", "map-info");
  if (selected) {
    const d = describeTarget(selected, world, snap, data);
    info.append(html("strong", undefined, d.title));
    for (const line of d.lines) info.append(html("p", undefined, line));
  } else {
    info.append(html("p", "desc", "點選地域、宗門、渡口，看一看。"));
  }
  frag.append(info);
  return frag;
}

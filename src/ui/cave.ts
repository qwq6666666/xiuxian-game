// 洞府第一人稱視角：四個固定朝向（面壁、石案、洞口、丹爐），轉身切換，點物件操作。
// 圖是程式繪製的水墨向量，顏色全走 tokens.css 的 --scene-*；熱點是真正的 button，鍵盤與讀屏都能用。
// 這裡只做畫面與事件綁定；操作本身都交給呼叫端傳進來的函式，與面板共用同一組 handler。
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";
import { FACINGS, FACING_NAME, caveActive, hotspotsFor, turn, type CaveAction, type Facing, type Hotspot } from "./caveLogic";
import { onSwipe } from "./gesture";
import { ageBand, qiLevel } from "./sceneLogic";

const QI = [[-22, 0], [-14, 0.9], [-6, 1.8], [4, 0.4], [12, 1.3], [20, 2.2], [-18, 2.6], [8, 3]];
const qis = (): string => QI.map(([x, d]) => `<circle class="sc-qi" cx="${x}" cy="0" r="1.4" style="--d:${d}s"/>`).join("");

/** 四個朝向各一張圖，viewBox 都是 800×450 */
const VIEWS: Record<Facing, string> = {
  front: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">
    <rect class="cv-wall" width="800" height="450"/>
    <path class="cv-sky" d="M300 250 V130 Q400 10 500 130 V250Z"/>
    <circle class="sc-halo" cx="445" cy="110" r="34"/><circle class="sc-orb" cx="445" cy="110" r="20"/>
    <path class="sc-far" d="M300 250 V190 L340 150 L380 185 L430 135 L470 175 L500 160 V250Z"/>
    <path class="cv-frame" d="M300 250 V130 Q400 10 500 130 V250Z"/>
    <path class="cv-floor" d="M0 300 L800 300 L800 450 L0 450Z"/>
    <ellipse class="cv-seat" cx="400" cy="428" rx="260" ry="46"/>
    <path class="cv-sleeve" d="M240 450 Q280 385 352 352 L398 376 Q338 404 326 450Z"/>
    <path class="cv-sleeve" d="M560 450 Q520 385 448 352 L402 376 Q462 404 474 450Z"/>
    <ellipse class="cv-hand" cx="385" cy="360" rx="22" ry="12"/><ellipse class="cv-hand" cx="415" cy="360" rx="22" ry="12"/>
    <circle class="sc-aura" cx="400" cy="350" r="52"/><circle class="sc-aura sc-aura-outer" cx="400" cy="350" r="76"/>
    <g transform="translate(400 330) scale(3.4)">${qis()}</g>
    <circle class="sc-burst" cx="400" cy="350" r="10"/>
  </svg>`,
  left: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">
    <rect class="cv-wall" width="800" height="450"/>
    <path class="cv-floor" d="M0 330 L800 330 L800 450 L0 450Z"/>
    <rect class="cv-shelf" x="60" y="130" width="230" height="12"/><rect class="cv-shelf" x="60" y="210" width="230" height="12"/>
    <path class="cv-herb" d="M90 130 Q84 100 100 92 M120 130 Q124 96 142 100 M210 130 Q204 108 222 102 M100 210 Q96 186 114 180 M240 210 Q246 184 262 188"/>
    <path class="cv-furnace" d="M300 400 L322 260 H508 L530 400Z"/>
    <rect class="cv-furnace" x="336" y="226" width="158" height="38" rx="6"/>
    <path class="cv-furnace" d="M332 400 L322 430 M498 400 L508 430 M415 400 L415 430"/>
    <ellipse class="cv-mouth" cx="415" cy="345" rx="52" ry="32"/>
    <ellipse class="cv-fire" cx="415" cy="352" rx="38" ry="22"/>
    <circle class="sc-smoke" cx="400" cy="214" r="9" style="--d:0s"/><circle class="sc-smoke" cx="428" cy="214" r="8" style="--d:1.2s"/><circle class="sc-smoke" cx="414" cy="214" r="10" style="--d:2.1s"/>
    <circle class="sc-halo cv-fireglow" cx="415" cy="352" r="130"/>
  </svg>`,
  right: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">
    <rect class="cv-wall" width="800" height="450"/>
    <path class="cv-floor" d="M0 380 L800 380 L800 450 L0 450Z"/>
    <path class="cv-table" d="M0 300 L800 300 L800 450 L0 450Z"/>
    <path class="cv-bottle" d="M110 300 L110 250 Q110 232 128 232 L148 232 Q166 232 166 250 L166 300Z M130 232 L130 216 L146 216 L146 232Z"/>
    <path class="cv-bottle" d="M180 300 L180 262 Q180 248 194 248 L210 248 Q224 248 224 262 L224 300Z M194 248 L194 236 L210 236 L210 248Z"/>
    <rect class="cv-scroll" x="300" y="268" width="170" height="30" rx="4"/><rect class="cv-scrollend" x="292" y="264" width="14" height="38" rx="6"/><rect class="cv-scrollend" x="464" y="264" width="14" height="38" rx="6"/>
    <path class="cv-bag" d="M530 300 Q520 240 560 214 Q580 204 600 214 Q640 240 630 300Z"/><path class="cv-bagtie" d="M560 218 Q580 232 600 218"/>
    <circle class="sc-lantern" cx="690" cy="190" r="14"/><path class="cv-hang" d="M690 120 V176"/>
  </svg>`,
  back: `<svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">
    <rect class="cv-wall" width="800" height="450"/>
    <path class="cv-sky cv-sky-wide" d="M170 450 V210 Q400 -30 630 210 V450Z"/>
    <circle class="sc-halo" cx="520" cy="130" r="40"/><circle class="sc-orb" cx="520" cy="130" r="22"/>
    <path class="sc-far" d="M170 340 L250 250 L320 310 L400 220 L480 300 L560 240 L630 320 V450 H170Z"/>
    <path class="sc-mid" d="M170 400 Q280 350 400 390 T630 380 V450 H170Z"/>
    <path class="cv-tree" d="M230 450 V380 M230 400 L206 418 M230 392 L254 410 M560 450 V372 M560 392 L536 410 M560 384 L584 402"/>
    <path class="cv-frame" d="M170 450 V210 Q400 -30 630 210 V450Z"/>
    <path class="cv-floor" d="M0 420 L800 420 L800 450 L0 450Z"/>
    <rect class="cv-sign" x="684" y="300" width="54" height="86" rx="4"/><path class="cv-signpost" d="M711 386 V450"/>
    <path class="sc-near" d="M0 450 Q200 430 400 440 T800 438 V450Z"/>
  </svg>`,
};

export function caveHtml(): string {
  return `<div id="cave" class="scene cave" data-facing="front" data-realm="mortal" data-sched="retreat" data-season="spring" data-age="adult" data-qi="0" data-no-swipe hidden>
  <div class="cave-views">${FACINGS.map((f) => `<div class="cave-view" data-view="${f}">${VIEWS[f]}</div>`).join("")}</div>
  <button type="button" class="cave-turn cave-turn-left" aria-label="向左轉身">‹</button>
  <button type="button" class="cave-turn cave-turn-right" aria-label="向右轉身">›</button>
  <div class="cave-name" aria-live="polite"></div>
  <div class="cave-schedules" role="group" aria-label="換個營生" hidden></div>
</div>`;
}

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
let facing: Facing = "front";
let builtKey = "";

/** 接上轉身（箭頭、鍵盤、滑動）與熱點點擊；回傳取消函式。只在建立畫面時呼叫一次 */
export function mountCave(cave: HTMLElement, run: (action: CaveAction) => void, refresh: () => void): () => void {
  const go = (dir: "left" | "right"): void => {
    facing = turn(facing, dir);
    builtKey = "";
    cave.querySelector<HTMLElement>(".cave-schedules")!.hidden = true;
    refresh();
  };
  cave.querySelector(".cave-turn-left")!.addEventListener("click", () => go("left"));
  cave.querySelector(".cave-turn-right")!.addEventListener("click", () => go("right"));
  cave.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      go("left");
    } else if (ev.key === "ArrowRight") {
      ev.preventDefault();
      go("right");
    }
  });
  // 熱點畫在 SVG 裡（與圖同一座標系，裁切縮放時不會錯位），事件統一在外層處理
  const fire = (target: EventTarget | null): void => {
    const b = (target as Element | null)?.closest<SVGElement>(".cave-hot[data-action]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    run(b.dataset.action as CaveAction);
  };
  cave.addEventListener("click", (ev) => fire(ev.target));
  cave.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (!(ev.target as Element).classList?.contains("cave-hot")) return;
    ev.preventDefault();
    fire(ev.target);
  });
  // 觸控：往左滑向右轉、往右滑向左轉（像是把視線拖過去）
  return onSwipe(cave, (dir) => go(dir === "left" ? "right" : "left"));
}

/** 依狀態更新：顯示與否、色調、朝向、熱點；沒變就不重建。靜室背景時原本的薄帶場景讓位 */
export function updateCave(cave: HTMLElement | null, scene: HTMLElement | null, state: GameState, data: GameData, chooseSchedule: (id: string) => void): void {
  if (!cave) return;
  const active = caveActive(state);
  cave.hidden = !active;
  if (scene) scene.hidden = active;
  if (!active) return;
  const set = (key: string, value: string): void => {
    if (cave.dataset[key] !== value) cave.dataset[key] = value;
  };
  set("age", ageBand(state, data));
  set("qi", String(qiLevel(state, data)));
  set("realm", state.realmId);
  set("sched", state.schedule);
  set("season", SEASONS[Math.floor((state.ageMonths % 12) / 3)]);
  set("brew", state.alchemy !== null ? "on" : "off");
  set("facing", facing);
  cave.querySelectorAll<HTMLElement>(".cave-view").forEach((v) => v.classList.toggle("on", v.dataset.view === facing));
  const spots = hotspotsFor(state, data, facing);
  const key = JSON.stringify([facing, spots]);
  if (key !== builtKey) {
    builtKey = key;
    cave.querySelectorAll(".cave-hots").forEach((g) => g.remove());
    const active = cave.querySelector<SVGSVGElement>(`.cave-view[data-view="${facing}"] svg`);
    if (active) active.append(buildHotspots(spots));
    cave.querySelector(".cave-name")!.textContent = `${FACING_NAME[facing]}・左右轉身`;
  }
  const picker = cave.querySelector<HTMLElement>(".cave-schedules")!;
  if (picker.childElementCount === 0) {
    for (const s of data.schedules) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.name;
      b.addEventListener("click", () => {
        picker.hidden = true;
        chooseSchedule(s.id);
      });
      picker.append(b);
    }
  }
}

/** 洞口的「換營生」小選單：開著再點一次就收起 */
export function toggleSchedulePicker(cave: HTMLElement | null): void {
  const picker = cave?.querySelector<HTMLElement>(".cave-schedules");
  if (picker) picker.hidden = !picker.hidden;
}

const NS = "http://www.w3.org/2000/svg";
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** 熱點：視圖座標（800×450）裡的透明矩形加一個小標籤；是 role=button，鍵盤可聚焦 */
function buildHotspots(spots: Hotspot[]): SVGGElement {
  const group = svgEl("g", { class: "cave-hots" });
  for (const h of spots) {
    const [px, py, pw, ph] = h.rect;
    const x = px * 8;
    const y = py * 4.5;
    const w = pw * 8;
    const hgt = ph * 4.5;
    const g = svgEl("g", { class: "cave-hot", role: "button", tabindex: "0", "data-action": h.action, "aria-label": `${h.label}：${h.hint}` });
    if (!h.enabled) g.setAttribute("aria-disabled", "true");
    g.append(svgEl("rect", { class: "cave-hit", x: String(x), y: String(y), width: String(w), height: String(hgt), rx: "10" }));
    const cap = svgEl("g", { class: "cave-cap", transform: `translate(${x + w / 2} ${y + hgt - 18})` });
    const width = [...h.label].length * 26 + 22;
    cap.append(svgEl("rect", { x: String(-width / 2), y: "-20", width: String(width), height: "32", rx: "16" }));
    const text = svgEl("text", { x: "0", y: "3", "text-anchor": "middle" });
    text.textContent = h.label;
    cap.append(text);
    g.append(cap);
    group.append(g);
  }
  return group;
}

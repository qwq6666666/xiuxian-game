// 主畫面的動態場景：程式繪製的水墨向量圖，只靠 data 屬性換景，不重畫、不進存檔。
// 顏色全走 tokens.css 的 --scene-*；動畫在 styles/scene.css，reduced-motion 時由 base.css 全域關閉。
import type { GameState } from "../../core/state";
import type { GameData } from "../../data/types";
import { ageBand, qiLevel, sceneSetting } from "./sceneLogic";

/** 靈氣粒子：x 為水平偏移、d 為延遲，固定的幾組讓畫面不要每次都長一樣 */
const QI = [
  [-22, 0], [-14, 0.9], [-6, 1.8], [4, 0.4], [12, 1.3], [20, 2.2], [-18, 2.6], [8, 3],
];
/** 季節落物（花瓣、落葉、雪） */
const FALL = [
  [40, 0], [90, 1.4], [150, 0.7], [230, 2.1], [290, 0.3], [340, 1.8], [380, 2.6], [120, 3.2],
];

const circles = (cls: string, rows: number[][], r: number, cy: number): string =>
  rows.map(([x, d]) => `<circle class="${cls}" cx="${cls === "sc-fallp" ? x * 2 : x}" cy="${cy}" r="${r}" style="--d:${d}s"/>`).join("");

export function sceneHtml(): string {
  return `<div id="scene" class="scene" data-realm="mortal" data-sched="retreat" data-season="spring" data-age="adult" data-setting="cave" data-qi="0" aria-hidden="true">
  <svg viewBox="0 0 800 120" preserveAspectRatio="xMidYMax slice" focusable="false">
    <circle class="sc-halo" cx="620" cy="34" r="22"/>
    <circle class="sc-orb" cx="620" cy="34" r="13"/>
    <g transform="scale(2 1)">
    <g class="sc-cloud sc-cloud-a"><ellipse cx="70" cy="30" rx="30" ry="6"/><ellipse cx="92" cy="26" rx="20" ry="5"/></g>
    <g class="sc-cloud sc-cloud-b"><ellipse cx="240" cy="48" rx="26" ry="5"/><ellipse cx="258" cy="44" rx="16" ry="4"/></g>
    <path class="sc-far" d="M0 80 L40 52 L80 74 L130 40 L190 78 L240 50 L300 76 L350 46 L400 70 L400 120 L0 120Z"/>
    <path class="sc-mid" d="M0 98 Q60 70 120 92 T250 88 T400 94 L400 120 L0 120Z"/>
    </g>
    <g transform="translate(190 0)">
    <g class="sc-boat"><path d="M300 99 L318 99 L314 104 L304 104Z"/><path d="M309 90 L309 99 L317 99Z"/></g>
    <g class="sc-furnace"><path d="M128 108 L132 90 L152 90 L156 108Z"/><rect x="136" y="84" width="12" height="6"/><circle class="sc-smoke" cx="142" cy="80" r="3" style="--d:0s"/><circle class="sc-smoke" cx="146" cy="80" r="2.5" style="--d:1.2s"/><circle class="sc-glow" cx="142" cy="100" r="4"/></g>
    <g class="sc-herbs"><path d="M118 108 Q116 98 122 96 M124 108 Q126 96 132 98 M168 108 Q166 100 172 98"/></g>
    <g class="sc-banner"><path d="M270 108 L270 80 M270 82 L286 86 L270 91"/></g>
    </g>
    <g class="sc-set sc-set-cave"><path d="M60 120 L70 70 Q110 44 170 70 L190 120Z"/><path d="M640 120 L660 74 Q700 52 750 76 L760 120Z"/></g>
    <g class="sc-set sc-set-road"><path class="sc-road" d="M150 120 Q300 108 380 112 Q470 116 640 104 L660 108 Q480 124 380 120 Q290 118 170 120Z"/><path d="M110 112 L110 84 M110 92 L98 100 M110 88 L122 98 M690 112 L690 80 M690 90 L678 99 M690 86 L704 96"/></g>
    <g class="sc-set sc-set-market"><path d="M90 108 L90 88 L112 78 L134 88 L134 108Z M150 108 L150 92 L170 84 L190 92 L190 108Z M610 108 L610 90 L634 80 L658 90 L658 108Z M670 108 L670 94 L688 86 L706 94 L706 108Z"/><circle class="sc-lantern" cx="140" cy="98" r="2.5"/><circle class="sc-lantern" cx="198" cy="100" r="2.5"/><circle class="sc-lantern" cx="664" cy="100" r="2.5"/></g>
    <g class="sc-set sc-set-ferry"><rect class="sc-river" x="0" y="100" width="800" height="20"/><path d="M120 120 L120 98 M132 120 L132 98 M120 100 L132 100 M660 120 L660 96 M672 120 L672 96 M660 98 L672 98"/></g>
    <path class="sc-near" d="M0 110 Q200 100 400 108 T800 106 L800 120 L0 120Z"/>
    <g class="sc-hero" transform="translate(400 108) scale(1.6)">
      <circle class="sc-aura" cx="0" cy="-12" r="19"/>
      <circle class="sc-aura sc-aura-outer" cx="0" cy="-12" r="27"/>
      <ellipse class="sc-seat" cx="0" cy="1" rx="14" ry="3"/>
      <g class="sc-lean">
        <path class="sc-body" d="M-9 0 Q-9 -13 0 -16 Q9 -13 9 0Z"/>
        <circle class="sc-head" cx="0" cy="-20" r="4.5"/>
      </g>
      <path class="sc-staff" d="M13 1 L13 -19"/>
      <g class="sc-qis" transform="translate(0 -4)">${circles("sc-qi", QI, 1.4, 0)}</g>
    </g>
    <g class="sc-falls">${circles("sc-fallp", FALL, 1.3, -4)}</g>
    <circle class="sc-burst" cx="400" cy="96" r="6"/>
  </svg>
</div>`;
}

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

/** 依狀態換景：境界定色調，日常安排定道具，月份定季節 */
export function updateScene(scene: HTMLElement | null, state: GameState, data: GameData): void {
  if (!scene) return;
  const set = (key: string, value: string): void => {
    if (scene.dataset[key] !== value) scene.dataset[key] = value;
  };
  set("age", ageBand(state, data));
  set("setting", sceneSetting(state));
  set("qi", String(qiLevel(state, data)));
  const season = SEASONS[Math.floor((state.ageMonths % 12) / 3)];
  if (scene.dataset.realm !== state.realmId) scene.dataset.realm = state.realmId;
  if (scene.dataset.sched !== state.schedule) scene.dataset.sched = state.schedule;
  if (scene.dataset.season !== season) scene.dataset.season = season;
}

/** 突破或升階時放一圈擴散的光 */
export function burstScene(scene: HTMLElement | null): void {
  if (!scene) return;
  scene.classList.remove("burst");
  void scene.offsetWidth;
  scene.classList.add("burst");
  window.setTimeout(() => scene.classList.remove("burst"), 1400);
}

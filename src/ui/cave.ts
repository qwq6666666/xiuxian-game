// 洞府第一人稱視角：四個固定朝向（面壁、石案、洞口、丹爐），轉身切換，點物件操作。
// 圖是程式繪製的水墨向量，顏色全走 tokens.css 的 --scene-*；熱點是真正的 button，鍵盤與讀屏都能用。
// 這裡只做畫面與事件綁定；操作本身都交給呼叫端傳進來的函式，與面板共用同一組 handler。
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";
import { FACINGS, caveActive, facingName, hotspotsFor, turn, type CaveAction, type Facing, type Hotspot } from "./caveLogic";
import { sceneHands } from "./firstPersonHands";
import { onSwipe } from "./gesture";
import { OUTDOOR } from "./outdoor";
import { ageBand, qiLevel, sceneSetting, type SceneSetting } from "./sceneLogic";

const QI = [[-22, 0], [-14, 0.9], [-6, 1.8], [4, 0.4], [12, 1.3], [20, 2.2], [-18, 2.6], [8, 3]];
const qis = (): string => QI.map(([x, d]) => `<circle class="sc-qi" cx="${x}" cy="0" r="1.4" style="--d:${d}s"/>`).join("");

/** 四個朝向各一張圖：以橫向 800×450 的座標畫，放進直式 450×600 的視圖時由 SHIFT 平移；熱點另外畫在最上層（見 buildHotspots） */
const wall = (extra = ""): string => `<rect class="cv-wall" x="-300" y="-300" width="1400" height="900" fill="url(#wallGrad)"/><rect x="-300" y="-300" width="1400" height="900" fill="url(#stone)" opacity=".5"/>${extra}<rect x="-300" y="-300" width="1400" height="900" filter="url(#grain)" opacity=".22" style="mix-blend-mode:overlay"/><rect x="-300" y="-150" width="1400" height="210" fill="url(#ceilGrad)"/>`;
const plank = (y: number): string => `<path class="cv-floor" d="M-300 ${y} L1100 ${y} L1100 700 L-300 700Z" fill="url(#floorGrad)"/><path d="M-40 ${y + 26} H840 M-40 ${y + 62} H840 M-40 ${y + 108} H840 M120 ${y} L60 480 M330 ${y} L300 480 M520 ${y} L540 480 M720 ${y} L780 480" stroke="var(--scene-figure)" stroke-width="2" opacity=".35" fill="none"/>`;
const mist = (y: number, o = 0.18): string => `<ellipse cx="260" cy="${y}" rx="220" ry="16" fill="var(--scene-orb)" opacity="${o}" filter="url(#blur12)"/><ellipse cx="560" cy="${y + 20}" rx="260" ry="14" fill="var(--scene-orb)" opacity="${o * 0.8}" filter="url(#blur12)"/>`;
const stars = "";
const window_ = (cx: number, top: number, bottom: number, half: number, moon = true): string => `
  <path d="M${cx - half} ${bottom} V${top + 120} Q${cx} ${top - 120} ${cx + half} ${top + 120} V${bottom}Z" fill="url(#skyGrad)"/>
  ${stars}
  ${moon ? `<circle class="sc-halo" cx="${cx + 45}" cy="${top + 60}" r="46"/><circle class="sc-orb" cx="${cx + 45}" cy="${top + 60}" r="21"/><circle cx="${cx + 38}" cy="${top + 54}" r="5" fill="var(--scene-sky-bottom)" opacity=".25"/>` : ""}
  <path class="sc-far" d="M${cx - half} ${bottom} V${bottom - 60} L${cx - 62} ${bottom - 104} L${cx - 22} ${bottom - 68} L${cx + 26} ${bottom - 118} L${cx + 70} ${bottom - 76} L${cx + half} ${bottom - 92} V${bottom}Z" filter="url(#ink)"/>
  <path class="sc-mid" d="M${cx - half} ${bottom} V${bottom - 30} Q${cx - 40} ${bottom - 54} ${cx + 10} ${bottom - 34} T${cx + half} ${bottom - 38} V${bottom}Z"/>
  ${mist(bottom - 36, 0.2)}
  <path d="M${cx} ${top - 8} V${bottom} M${cx - half} ${top + 100} H${cx + half}" stroke="var(--scene-figure)" stroke-width="5" opacity=".8"/>
  <path class="cv-frame" d="M${cx - half} ${bottom} V${top + 120} Q${cx} ${top - 120} ${cx + half} ${top + 120} V${bottom}Z" filter="url(#ink)"/>`;

const VIEWS: Record<Facing, string> = {
  front: `<g>${wall()}
      ${window_(400, -10, 170, 112)}
      <polygon points="288,170 512,170 660,480 140,480" fill="url(#beam)" style="mix-blend-mode:screen" opacity=".45"/></g>
    <g>
      <g transform="translate(206 130) scale(.8)"><path d="M0 0 V-18 M120 0 V-18" stroke="var(--scene-ink)" stroke-width="2"/><rect x="0" y="0" width="120" height="170" rx="3" fill="var(--scene-ink)" opacity=".78"/><rect x="0" y="0" width="120" height="14" fill="var(--scene-figure)"/><rect x="0" y="156" width="120" height="14" fill="var(--scene-figure)"/><path d="M14 126 L44 70 L64 104 L86 54 L108 126Z" fill="var(--scene-far)" filter="url(#ink)"/><circle cx="92" cy="40" r="9" fill="var(--scene-warm)" opacity=".7"/><path d="M20 44 H60 M20 56 H46" stroke="var(--scene-figure)" stroke-width="3" opacity=".6"/></g>
      <g transform="translate(520 232)"><path d="M0 70 H70" stroke="var(--scene-figure)" stroke-width="8"/><path d="M12 70 V40 Q12 28 35 28 Q58 28 58 40 V70Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><rect x="26" y="20" width="18" height="8" fill="var(--scene-figure)"/><path class="smoke-thread" d="M35 18 Q26 4 36 -10 Q46 -24 34 -40" fill="none" stroke="var(--scene-orb)" stroke-width="3" opacity=".3" filter="url(#blur4)"/></g>
      ${plank(300)}
      <ellipse cx="400" cy="440" rx="330" ry="40" fill="var(--scene-figure)" opacity=".28" filter="url(#blur12)"/></g>
    <g><ellipse cx="400" cy="424" rx="262" ry="48" fill="var(--scene-figure)" opacity=".92"/><ellipse cx="400" cy="418" rx="250" ry="42" fill="none" stroke="var(--scene-ink)" stroke-width="2" opacity=".35"/><ellipse cx="400" cy="418" rx="206" ry="34" fill="none" stroke="var(--scene-ink)" stroke-width="2" opacity=".28"/><ellipse cx="400" cy="418" rx="160" ry="26" fill="none" stroke="var(--scene-ink)" stroke-width="2" opacity=".22"/><ellipse cx="400" cy="418" rx="110" ry="18" fill="none" stroke="var(--scene-ink)" stroke-width="2" opacity=".16"/></g>
    <g transform="translate(400 330) scale(3.4)">${qis()}</g>`,

  left: `<g>${wall(`<polygon points="-200,480 320,200 560,200 1000,480" fill="url(#fireLight)" style="mix-blend-mode:screen" opacity=".0" class="fire-wall"/>`)}
      <g transform="translate(150 -60)"><rect class="cv-shelf" x="50" y="134" width="250" height="12" fill="var(--scene-figure)"/><rect class="cv-shelf" x="50" y="214" width="250" height="12" fill="var(--scene-figure)"/>
        <path d="M70 134 V104 Q54 96 56 82 Q70 72 86 82 Q88 98 80 104 V134Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><path d="M110 134 V110 Q100 100 108 88 Q124 82 134 94 Q132 104 124 110 V134Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/>
        <rect x="176" y="96" width="46" height="38" rx="6" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><rect x="184" y="88" width="30" height="8" rx="3" fill="var(--scene-ink)" opacity=".7"/>
        <path d="M70 214 Q64 178 84 170 M96 214 Q104 176 124 180 M214 214 Q208 184 228 176 M240 214 Q248 186 266 192" class="cv-herb"/>
        <path d="M150 70 V104 M150 76 Q132 92 140 112 M150 76 Q168 92 160 112" stroke="var(--scene-ink)" stroke-width="2" fill="none"/><ellipse cx="140" cy="116" rx="6" ry="12" fill="var(--scene-warm)" opacity=".55"/><ellipse cx="160" cy="116" rx="6" ry="12" fill="var(--scene-warm)" opacity=".55"/></g></g>
    <g>${plank(330)}<ellipse cx="415" cy="420" rx="260" ry="36" fill="var(--scene-figure)" opacity=".3" filter="url(#blur12)"/><circle class="cv-fireglow" cx="415" cy="352" r="170" fill="url(#fireLight)"/>
      <g transform="translate(500 400)"><path d="M0 60 H110 M10 40 H100 M20 20 H90" stroke="var(--scene-figure)" stroke-width="14" stroke-linecap="round"/><path d="M0 60 H110 M10 40 H100 M20 20 H90" stroke="var(--scene-ink)" stroke-width="2" opacity=".3"/></g></g>
    <g>
      <path d="M300 404 L322 262 H508 L530 404Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/>
      <path d="M312 330 H518 M306 366 H524" stroke="var(--scene-ink)" stroke-width="2" opacity=".4"/>
      <circle cx="342" cy="298" r="4" fill="var(--scene-ink)" opacity=".5"/><circle cx="415" cy="292" r="4" fill="var(--scene-ink)" opacity=".5"/><circle cx="488" cy="298" r="4" fill="var(--scene-ink)" opacity=".5"/>
      <rect x="334" y="228" width="162" height="38" rx="8" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/><rect x="396" y="206" width="38" height="26" rx="10" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/>
      <path d="M322 268 Q296 266 296 290 M508 268 Q534 266 534 290" fill="none" stroke="var(--scene-ink)" stroke-width="5" stroke-linecap="round"/>
      <path d="M332 404 L318 436 M498 404 L512 436 M415 404 L415 438" stroke="var(--scene-figure)" stroke-width="14" stroke-linecap="round"/>
      <ellipse class="cv-mouth" cx="415" cy="346" rx="54" ry="34" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/>
      <ellipse class="cv-fire" cx="415" cy="352" rx="40" ry="24" fill="url(#fireCore)"/>
      <path class="cv-fire sparks" d="M392 332 l3 -10 M430 326 l-3 -12 M414 320 l2 -12" stroke="var(--scene-warm)" stroke-width="2.5" stroke-linecap="round"/>
      <circle class="sc-smoke" cx="398" cy="204" r="10" style="--d:0s" filter="url(#blur4)"/><circle class="sc-smoke" cx="430" cy="204" r="9" style="--d:1.2s" filter="url(#blur4)"/><circle class="sc-smoke" cx="414" cy="204" r="11" style="--d:2.1s" filter="url(#blur4)"/></g>`,

  right: `<g>${wall(`<polygon points="445,60 725,60 725,300 365,300" fill="url(#lampLight)" style="mix-blend-mode:screen" opacity=".35"/>`)}
      <g transform="translate(-115 0)"><path d="M690 -20 V150" stroke="var(--scene-ink)" stroke-width="2"/><path d="M670 150 H710 L718 196 H662Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><ellipse class="sc-lantern" cx="690" cy="176" rx="20" ry="16"/><circle cx="690" cy="176" r="70" fill="url(#lampLight)" style="mix-blend-mode:screen" opacity=".55"/>
      </g><g transform="translate(230 80)" opacity=".8"><rect width="14" height="130" fill="var(--scene-figure)"/><path d="M0 8 H14 M0 30 H14 M0 52 H14" stroke="var(--scene-ink)" stroke-width="2"/><rect x="34" width="14" height="130" fill="var(--scene-figure)"/><path d="M34 14 H48 M34 40 H48 M34 66 H48" stroke="var(--scene-ink)" stroke-width="2"/></g></g>
    <g>${plank(386)}<path class="cv-table" d="M-300 300 L1100 300 L1100 700 L-300 700Z" fill="var(--scene-figure)"/><path d="M-300 300 H1100" stroke="var(--scene-ink)" stroke-width="3" opacity=".5"/><path d="M-40 330 Q200 322 400 332 T840 326 M-40 372 Q240 366 440 374 T840 368 M-40 420 Q260 414 460 422 T840 416" stroke="var(--scene-ink)" stroke-width="2" fill="none" opacity=".22"/>
      <ellipse cx="575" cy="304" rx="120" ry="12" fill="var(--scene-warm)" opacity=".16" filter="url(#blur12)"/>
      <g transform="translate(360 270)"><rect x="0" y="12" width="64" height="24" rx="4" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><path d="M8 12 Q32 -4 56 12" fill="var(--scene-far)"/><path d="M80 34 V-6 M80 -6 Q88 -22 96 -6" stroke="var(--scene-ink)" stroke-width="3" fill="none" stroke-linecap="round"/></g></g>
    <g>
      <g transform="translate(110 0)"><path d="M110 300 L110 250 Q110 232 128 232 L148 232 Q166 232 166 250 L166 300Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><rect x="128" y="206" width="22" height="26" rx="4" fill="var(--scene-ink)" opacity=".8"/><path d="M118 244 Q116 266 120 288" stroke="var(--scene-orb)" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/><rect x="114" y="262" width="48" height="22" fill="var(--scene-warm)" opacity=".45"/>
      <path d="M180 300 L180 262 Q180 248 194 248 L210 248 Q224 248 224 262 L224 300Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><rect x="194" y="226" width="18" height="22" rx="4" fill="var(--scene-ink)" opacity=".8"/><path d="M188 258 Q186 276 190 292" stroke="var(--scene-orb)" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/></g>
      <g transform="translate(0 70)"><rect x="300" y="266" width="172" height="32" rx="4" fill="var(--scene-ink)" opacity=".85"/><path d="M314 276 H452 M314 284 H430 M314 292 H446" stroke="var(--scene-figure)" stroke-width="2.5" opacity=".55"/><circle cx="440" cy="283" r="6" fill="var(--scene-warm)" opacity=".7"/>
      <rect x="290" y="262" width="16" height="40" rx="7" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><rect x="466" y="262" width="16" height="40" rx="7" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/></g>
      <g transform="translate(-65 0)"><path d="M530 300 Q518 240 556 212 Q580 200 604 212 Q642 240 630 300Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M552 222 Q580 240 608 222" fill="none" stroke="var(--scene-ink)" stroke-width="4"/><path d="M556 226 L552 252 M604 226 L608 252" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M544 262 Q530 280 536 296 M616 262 Q630 280 624 296" stroke="var(--scene-ink)" stroke-width="2" stroke-dasharray="4 5" fill="none" opacity=".6"/></g></g>`,

  back: `<g>${wall()}
      <path d="M170 450 V210 Q400 -30 630 210 V450Z" fill="url(#skyGradDay)"/>
      <polygon points="500,60 760,480 280,480" fill="url(#beam)" style="mix-blend-mode:screen" opacity=".3"/>
      ${stars}<circle class="sc-halo" cx="520" cy="130" r="48"/><circle class="sc-orb" cx="520" cy="130" r="22"/>
      <path class="sc-far" d="M170 346 L240 262 L300 312 L372 226 L440 304 L520 244 L590 318 L630 292 V450 H170Z" filter="url(#ink)"/>${mist(330, 0.28)}
      <path class="sc-mid" d="M170 404 Q270 352 390 392 T630 382 V450 H170Z"/>${mist(392, 0.2)}</g>
    <g>
      <path class="cv-tree" d="M226 450 V374 M226 400 L202 420 M226 390 L252 410 M226 376 L212 392 M566 450 V366 M566 392 L540 412 M566 382 L592 402 M566 370 L580 386" stroke-width="7"/>
      <g fill="var(--scene-figure)" opacity=".85"><ellipse cx="206" cy="372" rx="34" ry="18"/><ellipse cx="248" cy="364" rx="30" ry="16"/><ellipse cx="548" cy="360" rx="34" ry="18"/><ellipse cx="594" cy="366" rx="28" ry="14"/></g>
      <path d="M170 450 V210 Q400 -30 630 210 V450Z" class="cv-frame" filter="url(#rock)" stroke-width="22"/>
      <path d="M210 108 l-8 36 l14 -22 M256 78 l-6 44 l12 -26 M340 36 l-4 40 l10 -24 M468 34 l-4 40 l10 -24 M550 70 l-6 44 l12 -26" fill="var(--scene-figure)" stroke="var(--scene-figure)" stroke-width="6" stroke-linejoin="round"/>
      <path d="M190 160 Q184 200 192 240 M212 150 Q204 196 214 236 M610 170 Q618 206 608 244" stroke="var(--scene-ink)" stroke-width="2" fill="none" opacity=".4"/></g>
    <g>
      <path class="cv-floor" d="M-300 420 L1100 420 L1100 700 L-300 700Z" fill="var(--scene-near)"/><path d="M300 450 L340 420 H460 L500 450Z M250 450 L300 450 L330 428" fill="var(--scene-far)" opacity=".7"/><path d="M340 420 H460 M322 434 H478" stroke="var(--scene-ink)" stroke-width="2" opacity=".3"/>
      <g transform="translate(-140 0)"><rect x="684" y="298" width="56" height="90" rx="5" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M696 320 H728 M696 338 H722 M696 356 H728" stroke="var(--scene-ink)" stroke-width="3" opacity=".55"/><path d="M712 388 V450" stroke="var(--scene-figure)" stroke-width="9"/></g>
      <ellipse cx="400" cy="446" rx="300" ry="10" fill="var(--scene-figure)" opacity=".25" filter="url(#blur4)"/></g>`
};

export const CAVE_DEFS = `<svg width="0" height="0" class="cave-defs" aria-hidden="true"><defs>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.4 -.35"/></filter>
  <filter id="rock" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".025 .06" numOctaves="3" seed="7"/><feDisplacementMap in="SourceGraphic" scale="14"/></filter>
  <filter id="ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
  <filter id="blur4"><feGaussianBlur stdDeviation="4"/></filter><filter id="blur12" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="12"/></filter>
  <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-near)"/><stop offset=".55" style="stop-color:var(--scene-mid)"/><stop offset="1" style="stop-color:var(--scene-near)"/></linearGradient>
  <linearGradient id="ceilGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-figure);stop-opacity:.92"/><stop offset="1" style="stop-color:var(--scene-figure);stop-opacity:0"/></linearGradient>
  <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-mid)"/><stop offset="1" style="stop-color:var(--scene-figure)"/></linearGradient>
  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-sky-top)"/><stop offset="1" style="stop-color:var(--scene-sky-bottom)"/></linearGradient>
  <linearGradient id="skyGradDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-sky-top)"/><stop offset=".7" style="stop-color:var(--scene-sky-bottom)"/><stop offset="1" style="stop-color:var(--scene-orb);stop-opacity:.35"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--scene-orb);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--scene-orb);stop-opacity:0"/></linearGradient>
  <radialGradient id="seal"><stop offset="0" style="stop-color:var(--scene-qi);stop-opacity:.6"/><stop offset="1" style="stop-color:var(--scene-qi);stop-opacity:0"/></radialGradient>
  <radialGradient id="fireLight"><stop offset="0" style="stop-color:var(--scene-warm);stop-opacity:.8"/><stop offset="1" style="stop-color:var(--scene-warm);stop-opacity:0"/></radialGradient>
  <radialGradient id="fireCore"><stop offset="0" style="stop-color:var(--scene-orb)"/><stop offset=".45" style="stop-color:var(--scene-warm)"/><stop offset="1" style="stop-color:var(--scene-warm);stop-opacity:.2"/></radialGradient>
  <radialGradient id="lampLight"><stop offset="0" style="stop-color:var(--scene-warm);stop-opacity:.7"/><stop offset="1" style="stop-color:var(--scene-warm);stop-opacity:0"/></radialGradient>
  <pattern id="stone" width="120" height="60" patternUnits="userSpaceOnUse"><path d="M0 0 H120 M0 30 H120 M60 0 V30 M0 30 V60 M120 30 V60" stroke="var(--scene-figure)" stroke-width="2" fill="none" opacity=".35"/></pattern>
</defs></svg>`;

/** 橫向畫好的構圖搬進直式視圖：水平位移讓主要物件落在中間（垂直一律下移 150，上方留給天花板的暗影） */
const SHIFT: Record<Facing, number> = { front: -175, left: -190, right: -175, back: -175 };

const SETTINGS: SceneSetting[] = ["cave", "road", "market", "ferry"];
const PORTRAIT_VB = "0 0 450 600";
/** 橫向：取視圖中間 800×450（直式視圖 450 寬的中心，左右延伸的牆、天空、地面是背景），底部對齊 */
const LANDSCAPE_VB = "-175 150 800 450";

const VIEW_DIVS = SETTINGS.flatMap((setting) =>
  FACINGS.map((f) => {
    const art = setting === "cave" ? `<g transform="translate(${SHIFT[f]} 150)">${VIEWS[f]}</g>` : OUTDOOR[setting][f];
    return `<div class="cave-view" data-view="${setting}-${f}"><svg viewBox="${PORTRAIT_VB}" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">${art}</svg></div>`;
  }),
).join("");

export type ArtKind = "opening" | "wilderness" | "market" | "breakthrough" | "reincarnation";

const ART: Record<ArtKind, { svg: () => string; label: string }> = {
  opening: { svg: () => OUTDOOR.road.back, label: "晨霧中，我立在村口，前方的路通向遠山" },
  wilderness: { svg: () => OUTDOOR.road.front, label: "我坐在山道旁的石上，雙手結印，路在眼前延伸" },
  market: { svg: () => OUTDOOR.market.front, label: "暮色中的坊市，攤棚下陳列藥材與器物，燈籠在眼前搖晃" },
  breakthrough: { svg: () => `<g transform="translate(${SHIFT.front} 150)">${VIEWS.front}</g>`, label: "我在石室中靜坐，雙手結印，雲氣緩緩匯聚" },
  reincarnation: { svg: () => OUTDOOR.ferry.front, label: "我立在渡頭，月輪映著靜水，遠方通向晨光" },
};

/** 第一人稱的場景插圖（取代原本的第三人稱插畫）：橫向取景，需要 CAVE_DEFS 在頁面裡 */
export function firstPersonArt(kind: ArtKind): string {
  const { svg, label } = ART[kind];
  return `<div class="scene-art scene-art-fp" role="img" aria-label="${label}"><svg viewBox="${LANDSCAPE_VB}" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">${svg()}${sceneHands()}</svg></div>`;
}

export function caveHtml(): string {
  return `<div id="cave" class="scene cave" data-facing="front" data-realm="mortal" data-sched="retreat" data-season="spring" data-age="adult" data-qi="0" data-no-swipe hidden>
  <div class="cave-views">${VIEW_DIVS}</div>
  <svg class="fp-overlay" viewBox="${PORTRAIT_VB}" preserveAspectRatio="xMidYMax slice" focusable="false" aria-hidden="true">
    <circle class="fp-touch" cx="225" cy="510" r="18"/>
    ${sceneHands()}
  </svg>
  <button type="button" class="cave-turn cave-turn-left" aria-label="向左轉身">‹</button>
  <button type="button" class="cave-turn cave-turn-right" aria-label="向右轉身">›</button>
  <div class="cave-name" aria-live="polite"></div>
  <div class="cave-schedules" role="group" aria-label="換個營生" hidden></div>
</div>`;
}

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const TURN_MS = 300;
const ACTION_MS = 280;
const ANIMATED_ACTIONS = new Set<CaveAction>(["focus", "brew", "pill", "bag", "scrolls", "schedule"]);
let facing: Facing = "front";
let builtKey = "";

/** 接上轉身（箭頭、鍵盤、滑動）與熱點點擊；回傳取消函式。只在建立畫面時呼叫一次 */
export function mountCave(cave: HTMLElement, run: (action: CaveAction) => void, refresh: () => void): () => void {
  let turnTimer = 0;
  let actionTimer = 0;
  const clearTurn = (): void => {
    window.clearTimeout(turnTimer);
    cave.querySelectorAll(".turn-enter-left, .turn-enter-right, .turn-leave-left, .turn-leave-right").forEach((el) => {
      el.classList.remove("turn-enter-left", "turn-enter-right", "turn-leave-left", "turn-leave-right");
    });
  };
  const go = (dir: "left" | "right"): void => {
    const old = cave.querySelector<HTMLElement>(".cave-view.on");
    clearTurn();
    old?.classList.add(`turn-leave-${dir}`);
    facing = turn(facing, dir);
    builtKey = "";
    cave.querySelector<HTMLElement>(".cave-schedules")!.hidden = true;
    refresh();
    cave.querySelector<HTMLElement>(".cave-view.on")?.classList.add(`turn-enter-${dir}`);
    turnTimer = window.setTimeout(clearTurn, TURN_MS + 40);
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
    const action = b.dataset.action as CaveAction;
    if (ANIMATED_ACTIONS.has(action)) {
      window.clearTimeout(actionTimer);
      cave.classList.remove("acting");
      const touch = cave.querySelector<SVGCircleElement>(".fp-touch");
      touch?.setAttribute("cx", b.dataset.cx ?? "225");
      touch?.setAttribute("cy", b.dataset.cy ?? "510");
      cave.dataset.action = action;
      // 同一個動作連點也要重新開始；只重排場景元素，不等待動畫才執行操作。
      void cave.offsetWidth;
      cave.classList.add("acting");
      actionTimer = window.setTimeout(() => cave.classList.remove("acting"), ACTION_MS + 40);
    }
    run(action);
  };
  cave.addEventListener("click", (ev) => fire(ev.target));
  cave.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (!(ev.target as Element).classList?.contains("cave-hot")) return;
    ev.preventDefault();
    fire(ev.target);
  });
  // 響應式：場景框比較寬就用橫向取景，否則用直式取景；熱點與圖在同一座標系，兩種取景都對得上
  const fit = (): void => {
    const r = cave.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const vb = r.width / r.height > 1.05 ? LANDSCAPE_VB : PORTRAIT_VB;
    cave.querySelectorAll<SVGSVGElement>(".cave-view svg, .fp-overlay").forEach((svg) => {
      if (svg.getAttribute("viewBox") !== vb) svg.setAttribute("viewBox", vb);
    });
  };
  // 沒有 ResizeObserver 的環境（測試、舊瀏覽器）退回只在載入與視窗改變時量一次
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
  ro?.observe(cave);
  if (!ro) window.addEventListener("resize", fit);
  fit();
  // 觸控：往左滑向右轉、往右滑向左轉（像是把視線拖過去）
  const off = onSwipe(cave, (dir) => go(dir === "left" ? "right" : "left"));
  return () => {
    window.clearTimeout(turnTimer);
    window.clearTimeout(actionTimer);
    off();
    ro?.disconnect();
    window.removeEventListener("resize", fit);
  };
}

/** 依狀態更新：顯示與否、色調、朝向、熱點；沒變就不重建。靜室背景時原本的薄帶場景讓位 */
export function updateCave(cave: HTMLElement | null, scene: HTMLElement | null, state: GameState, data: GameData, chooseSchedule: (id: string) => void, always = false): void {
  if (!cave) return;
  const active = caveActive(state, always);
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
  cave.style.setProperty("--dur-turn", `${Math.round(TURN_MS / Math.max(1, state.speed))}ms`);
  cave.style.setProperty("--dur-action", `${Math.round(ACTION_MS / Math.max(1, state.speed))}ms`);
  const setting = sceneSetting(state);
  set("facing", facing);
  set("setting", setting);
  const viewId = `${setting}-${facing}`;
  cave.querySelectorAll<HTMLElement>(".cave-view").forEach((v) => v.classList.toggle("on", v.dataset.view === viewId));
  const spots = hotspotsFor(state, data, facing);
  const key = JSON.stringify([viewId, spots]);
  if (key !== builtKey) {
    builtKey = key;
    cave.querySelectorAll(".cave-hots").forEach((g) => g.remove());
    const active = cave.querySelector<SVGSVGElement>(`.cave-view[data-view="${viewId}"] svg`);
    if (active) active.append(buildHotspots(spots));
    cave.querySelector(".cave-name")!.textContent = `${facingName(setting, facing)}・左右轉身`;
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
    const x = px * 4.5;
    const y = py * 6;
    const w = pw * 4.5;
    const hgt = ph * 6;
    const g = svgEl("g", { class: "cave-hot", role: "button", tabindex: "0", "data-action": h.action, "data-cx": String(x + w / 2), "data-cy": String(y + hgt / 2), "aria-label": `${h.label}：${h.hint}` });
    if (!h.enabled) g.setAttribute("aria-disabled", "true");
    g.append(svgEl("rect", { class: "cave-hit", x: String(x), y: String(y), width: String(w), height: String(hgt), rx: "10" }));
    const cap = svgEl("g", { class: "cave-cap", transform: `translate(${x + w / 2} ${y + hgt - 14})` });
    const width = [...h.label].length * 19 + 18;
    cap.append(svgEl("rect", { x: String(-width / 2), y: "-17", width: String(width), height: "26", rx: "13" }));
    const text = svgEl("text", { x: "0", y: "2", "text-anchor": "middle" });
    text.textContent = h.label;
    cap.append(text);
    g.append(cap);
    group.append(g);
  }
  return group;
}

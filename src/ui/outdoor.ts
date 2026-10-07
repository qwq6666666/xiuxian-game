// 洞府以外的第一人稱場景：山道、坊市、渡口，各四個朝向。座標直接用視圖座標（450×600，橫向時取中間 800×450），
// 物件都擺在中間 450 寬以內，兩側只是延伸的背景。顏色全走 --scene-*；質感用 cave.ts 的 DEFS（濾鏡與漸層）。
import type { Facing } from "./caveLogic";

export type OutdoorSetting = "road" | "market" | "ferry";

const QI = [[-22, 0], [-14, 0.9], [-6, 1.8], [4, 0.4], [12, 1.3], [20, 2.2], [-18, 2.6], [8, 3]];
const qis = (): string => QI.map(([x, d]) => `<circle class="sc-qi" cx="${x}" cy="0" r="1.4" style="--d:${d}s"/>`).join("");

/** 第一人稱的雙手結印（與洞府相同，放在視圖座標的下方中央），運功熱點用 */
const HANDS = `<g transform="translate(-175 150)">
  <ellipse cx="400" cy="372" rx="120" ry="60" fill="url(#seal)" style="mix-blend-mode:screen"/>
  <path class="cv-sleeve" d="M236 450 Q276 380 350 346 L398 372 Q334 402 322 450Z" fill="var(--scene-figure)" filter="url(#ink)"/>
  <path class="cv-sleeve" d="M564 450 Q524 380 450 346 L402 372 Q466 402 478 450Z" fill="var(--scene-figure)" filter="url(#ink)"/>
  <ellipse class="cv-hand" cx="386" cy="360" rx="23" ry="12"/><ellipse class="cv-hand" cx="414" cy="360" rx="23" ry="12"/>
  <circle class="sc-aura" cx="400" cy="350" r="54"/><circle class="sc-aura sc-aura-outer" cx="400" cy="350" r="80"/>
  <g transform="translate(400 330) scale(3.4)">${qis()}</g></g>`;

const W = { x: -300, w: 1400 };
const sky = (horizon: number): string => `<rect x="${W.x}" y="-300" width="${W.w}" height="${horizon + 300}" fill="url(#skyGradDay)"/><circle class="sc-halo" cx="330" cy="130" r="46"/><circle class="sc-orb" cx="330" cy="130" r="22"/>`;
const ground = (y: number): string => `<rect x="${W.x}" y="${y}" width="${W.w}" height="${700 - y}" fill="url(#floorGrad)"/><rect x="${W.x}" y="${y}" width="${W.w}" height="${700 - y}" filter="url(#grain)" opacity=".2" style="mix-blend-mode:overlay"/>`;
const hills = (y: number): string => `<path class="sc-far" d="M-300 ${y} L-120 ${y - 70} L-30 ${y - 20} L80 ${y - 96} L170 ${y - 30} L260 ${y - 110} L360 ${y - 36} L450 ${y - 84} L560 ${y - 24} L750 ${y - 90} L1100 ${y} V${y + 120} H-300Z" filter="url(#ink)"/><ellipse cx="120" cy="${y - 10}" rx="220" ry="16" fill="var(--scene-orb)" opacity=".26" filter="url(#blur12)"/><ellipse cx="380" cy="${y + 6}" rx="260" ry="14" fill="var(--scene-orb)" opacity=".2" filter="url(#blur12)"/><path class="sc-mid" d="M-300 ${y + 30} Q0 ${y - 20} 200 ${y + 24} T520 ${y + 20} T1100 ${y + 30} V${y + 120} H-300Z"/>`;
const pine = (x: number, base: number, h: number): string => `<path d="M${x} ${base} V${base - h}" stroke="var(--scene-figure)" stroke-width="${h / 14}" stroke-linecap="round"/><path d="M${x} ${base - h * 1.1} L${x - h * 0.22} ${base - h * 0.62} H${x + h * 0.22}Z M${x} ${base - h * 0.86} L${x - h * 0.3} ${base - h * 0.36} H${x + h * 0.3}Z M${x} ${base - h * 0.6} L${x - h * 0.38} ${base - h * 0.08} H${x + h * 0.38}Z" fill="var(--scene-figure)" opacity=".92"/>`;
const shadow = (cx: number, cy: number, rx: number): string => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx / 7}" fill="var(--scene-figure)" opacity=".3" filter="url(#blur4)"/>`;
const bottle = (x: number, y: number, s: number): string => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 60 L0 18 Q0 0 18 0 L38 0 Q56 0 56 18 L56 60Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><rect x="16" y="-22" width="24" height="24" rx="4" fill="var(--scene-ink)" opacity=".8"/><rect x="2" y="30" width="52" height="22" fill="var(--scene-warm)" opacity=".45"/><path d="M8 12 Q6 30 10 50" stroke="var(--scene-orb)" stroke-width="3" fill="none" opacity=".35" stroke-linecap="round"/></g>`;
const bag = (x: number, y: number, s: number): string => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 100 Q-12 40 26 12 Q50 0 74 12 Q112 40 100 100Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/><path d="M22 22 Q50 42 78 22" fill="none" stroke="var(--scene-ink)" stroke-width="5"/><path d="M14 62 Q0 80 6 96 M86 62 Q100 80 94 96" stroke="var(--scene-ink)" stroke-width="2.5" stroke-dasharray="4 5" fill="none" opacity=".6"/></g>`;
const lantern = (x: number, y: number): string => `<path d="M${x} -40 V${y - 14}" stroke="var(--scene-ink)" stroke-width="2"/><path d="M${x - 14} ${y - 14} H${x + 14} L${x + 18} ${y + 22} H${x - 18}Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/><ellipse class="sc-lantern" cx="${x}" cy="${y + 4}" rx="11" ry="12"/><circle cx="${x}" cy="${y + 4}" r="52" fill="url(#lampLight)" style="mix-blend-mode:screen" opacity=".5"/>`;

const road = (): Record<Facing, string> => ({
  front: `<g>${sky(300)}${hills(300)}${ground(332)}
    <path d="M168 600 L210 336 H240 L282 600Z" fill="var(--scene-ink)" opacity=".32"/><path d="M225 600 V336" stroke="var(--scene-figure)" stroke-width="3" stroke-dasharray="14 22" opacity=".25"/>
    ${pine(60, 420, 150)}${pine(392, 410, 170)}${pine(-40, 380, 120)}${pine(470, 370, 110)}
    <ellipse cx="225" cy="560" rx="230" ry="46" fill="var(--scene-figure)" opacity=".92"/><path d="M40 566 Q225 540 410 566" stroke="var(--scene-ink)" stroke-width="2.5" fill="none" opacity=".35"/>
    ${HANDS}</g>`,
  right: `<g>${sky(280)}${hills(280)}${ground(312)}${pine(380, 400, 190)}${pine(430, 380, 130)}
    <path d="M-80 600 L-40 420 Q225 380 490 420 L530 600Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/><path d="M-40 440 Q225 404 490 440" stroke="var(--scene-ink)" stroke-width="2" fill="none" opacity=".4"/>
    ${shadow(225, 596, 260)}${bottle(78, 332, 1.5)}${bag(250, 270, 1.4)}
    <path d="M356 430 q8 -40 24 -40 q16 0 24 40Z" fill="var(--scene-ink)" opacity=".5"/></g>`,
  back: `<g>${sky(300)}${hills(300)}${ground(332)}
    <path d="M168 600 L210 336 H240 L282 600Z" fill="var(--scene-ink)" opacity=".32"/>
    <g fill="var(--scene-figure)" opacity=".85"><path d="M110 330 l14 -16 l14 16Z M140 332 l12 -14 l12 14Z M300 330 l14 -16 l14 16Z"/><rect x="114" y="330" width="20" height="10"/><rect x="144" y="332" width="18" height="9"/><rect x="304" y="330" width="20" height="10"/></g>
    ${pine(40, 410, 140)}${pine(-30, 400, 110)}
    <path d="M360 600 V400" stroke="var(--scene-figure)" stroke-width="11"/><rect x="318" y="388" width="104" height="38" rx="4" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><rect x="330" y="440" width="86" height="34" rx="4" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M334 402 H408 M338 416 H396 M344 454 H402" stroke="var(--scene-ink)" stroke-width="3" opacity=".55"/></g>`,
  left: `<g>${sky(280)}${hills(280)}${ground(312)}${pine(40, 410, 170)}${pine(420, 400, 150)}
    <path d="M150 590 L158 250 Q225 220 292 250 L304 590Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3.5" filter="url(#ink)"/>
    <path d="M190 290 H262 M186 322 H266 M192 354 H258 M188 386 H264 M194 418 H256" stroke="var(--scene-ink)" stroke-width="4" opacity=".6" stroke-linecap="round"/><path d="M160 560 Q190 530 170 500 M300 560 Q270 520 296 480" stroke="var(--scene-orb)" stroke-width="3" fill="none" opacity=".25"/>
    ${shadow(228, 596, 140)}</g>`,
});

const market = (): Record<Facing, string> => ({
  front: `<g>${sky(250)}<path class="sc-far" d="M-300 250 L0 200 L120 240 L240 190 L340 236 L460 196 L1100 250 V300 H-300Z" filter="url(#ink)"/>${ground(330)}
    <path d="M-30 600 L170 330 H280 L480 600Z" fill="var(--scene-ink)" opacity=".18"/><path d="M60 560 H390 M110 480 H340 M150 420 H300 M185 370 H265" stroke="var(--scene-figure)" stroke-width="2" opacity=".3"/>
    <g><rect x="-10" y="270" width="190" height="230" fill="var(--scene-figure)" opacity=".9"/><path d="M-20 270 L90 232 L200 270Z" fill="var(--scene-warm)" opacity=".5"/><path d="M-20 270 L90 232 L200 270Z" fill="none" stroke="var(--scene-ink)" stroke-width="3"/><rect x="0" y="400" width="170" height="26" fill="var(--scene-ink)" opacity=".55"/><circle cx="30" cy="388" r="12" fill="var(--scene-warm)" opacity=".6"/><circle cx="64" cy="390" r="10" fill="var(--scene-orb)" opacity=".5"/><circle cx="98" cy="388" r="12" fill="var(--scene-warm)" opacity=".6"/><circle cx="132" cy="391" r="9" fill="var(--scene-orb)" opacity=".5"/></g>
    <g><rect x="290" y="290" width="170" height="210" fill="var(--scene-figure)" opacity=".85"/><path d="M280 290 L375 254 L470 290Z" fill="var(--scene-ink)" opacity=".4"/><path d="M280 290 L375 254 L470 290Z" fill="none" stroke="var(--scene-ink)" stroke-width="3"/></g>
    ${lantern(110, 190)}${lantern(340, 210)}${lantern(225, 160)}
    <ellipse cx="225" cy="590" rx="280" ry="20" fill="var(--scene-figure)" opacity=".3" filter="url(#blur4)"/></g>`,
  right: `<g>${sky(250)}${ground(330)}
    <rect x="-300" y="150" width="1400" height="230" fill="url(#wallGrad)"/><rect x="-300" y="150" width="1400" height="230" fill="url(#stone)" opacity=".4"/>
    <path d="M-40 150 L225 100 L490 150Z" fill="var(--scene-figure)"/><path d="M-40 150 L225 100 L490 150" fill="none" stroke="var(--scene-ink)" stroke-width="3"/>
    ${lantern(90, 190)}${lantern(360, 190)}
    <path d="M-40 400 H490 V600 H-40Z" fill="var(--scene-figure)"/><path d="M-40 400 H490" stroke="var(--scene-ink)" stroke-width="4" opacity=".6"/><path d="M-40 460 Q225 450 490 460 M-40 520 Q225 512 490 520" stroke="var(--scene-ink)" stroke-width="2" fill="none" opacity=".22"/>
    ${bottle(66, 330, 1.5)}${bottle(150, 346, 1.2)}${bag(270, 296, 1.35)}
    <g transform="translate(20 190)" fill="var(--scene-ink)" opacity=".7"><rect width="150" height="80" rx="4"/><path d="M14 22 H136 M14 40 H110 M14 58 H126" stroke="var(--scene-figure)" stroke-width="4" opacity=".6"/></g></g>`,
  back: `<g>${sky(300)}<path class="sc-far" d="M-300 300 L-40 230 L100 280 L240 214 L380 270 L520 220 L1100 300 V340 H-300Z" filter="url(#ink)"/>${ground(340)}
    <path d="M110 600 L170 360 H280 L340 600Z" fill="var(--scene-ink)" opacity=".2"/>
    <rect x="52" y="190" width="26" height="320" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><rect x="372" y="190" width="26" height="320" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/>
    <rect x="40" y="226" width="370" height="26" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/>
    <path d="M10 196 Q225 118 440 196 L424 214 Q225 146 26 214Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3"/><path d="M170 238 H280" stroke="var(--scene-warm)" stroke-width="10" opacity=".7"/>
    <path d="M200 136 L225 100 L250 136Z" fill="var(--scene-figure)"/>${lantern(120, 280)}${lantern(330, 280)}</g>`,
  left: `<g>${sky(250)}${ground(330)}
    <rect x="-300" y="120" width="1400" height="300" fill="url(#wallGrad)"/><rect x="-300" y="120" width="1400" height="300" fill="url(#stone)" opacity=".45"/>
    <rect x="24" y="170" width="402" height="320" rx="6" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="4"/>
    <g fill="var(--scene-ink)" opacity=".78"><rect x="48" y="196" width="104" height="132" rx="3" transform="rotate(-2 100 260)"/><rect x="170" y="190" width="104" height="96" rx="3" transform="rotate(2 220 240)"/><rect x="292" y="198" width="106" height="140" rx="3" transform="rotate(-1.5 345 268)"/><rect x="60" y="346" width="120" height="110" rx="3" transform="rotate(1.5 120 400)"/><rect x="204" y="312" width="86" height="130" rx="3" transform="rotate(-2 245 376)"/><rect x="306" y="360" width="94" height="96" rx="3" transform="rotate(2 350 408)"/></g>
    <g stroke="var(--scene-figure)" stroke-width="3" opacity=".55" fill="none"><path d="M62 222 H138 M62 242 H122 M62 262 H132 M186 214 H260 M186 236 H240 M306 224 H384 M306 246 H364 M306 268 H378 M74 372 H166 M74 394 H146 M218 336 H276 M218 358 H262 M320 382 H388"/></g>
    <circle cx="150" cy="200" r="7" fill="var(--scene-warm)" opacity=".7"/><circle cx="280" cy="200" r="7" fill="var(--scene-warm)" opacity=".7"/>${lantern(30, 120)}
    ${shadow(225, 596, 250)}</g>`,
});

const ferry = (): Record<Facing, string> => ({
  front: `<g>${sky(300)}${hills(300)}
    <rect x="-300" y="330" width="1400" height="170" fill="url(#skyGrad)" opacity=".85"/><rect x="-300" y="330" width="1400" height="170" fill="var(--scene-orb)" opacity=".1"/><path d="M-300 360 H1100 M-300 396 H1100 M-300 440 H1100" stroke="var(--scene-orb)" stroke-width="2" opacity=".18" stroke-dasharray="40 30"/>
    <g transform="translate(250 360)"><path d="M0 40 L24 66 H110 L134 40Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M66 40 V-20" stroke="var(--scene-ink)" stroke-width="4"/><path d="M66 -18 L108 24 H66Z" fill="var(--scene-ink)" opacity=".55"/></g>
    <path d="M-60 500 H520 V600 H-60Z" fill="var(--scene-figure)"/><path d="M-60 520 H520 M-60 548 H520 M-60 576 H520" stroke="var(--scene-ink)" stroke-width="2" opacity=".3"/><path d="M40 500 V470 M110 500 V470 M340 500 V470 M410 500 V470" stroke="var(--scene-figure)" stroke-width="8"/>
    ${HANDS}</g>`,
  right: `<g>${sky(280)}${hills(280)}${ground(330)}
    <path d="M-40 230 L225 160 L490 230Z" fill="var(--scene-figure)"/><path d="M-40 230 L225 160 L490 230" fill="none" stroke="var(--scene-ink)" stroke-width="3"/><path d="M30 230 V420 M420 230 V420" stroke="var(--scene-figure)" stroke-width="12"/>${lantern(225, 270)}
    <path d="M-40 420 H490 V600 H-40Z" fill="var(--scene-figure)"/><path d="M-40 420 H490" stroke="var(--scene-ink)" stroke-width="4" opacity=".6"/><path d="M-40 480 Q225 470 490 480 M-40 540 Q225 532 490 540" stroke="var(--scene-ink)" stroke-width="2" fill="none" opacity=".22"/>
    ${bottle(70, 350, 1.5)}${bag(262, 316, 1.35)}<path d="M366 420 q6 -34 20 -34 q14 0 20 34Z" fill="var(--scene-ink)" opacity=".55"/></g>`,
  back: `<g>${sky(300)}${hills(300)}${ground(332)}
    <path d="M168 600 L210 336 H240 L282 600Z" fill="var(--scene-ink)" opacity=".32"/>${pine(50, 410, 150)}${pine(410, 400, 160)}
    <path d="M360 600 V400" stroke="var(--scene-figure)" stroke-width="11"/><rect x="316" y="388" width="108" height="38" rx="4" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><rect x="326" y="440" width="90" height="34" rx="4" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2.5"/><path d="M332 402 H410 M336 416 H398 M340 454 H404" stroke="var(--scene-ink)" stroke-width="3" opacity=".55"/></g>`,
  left: `<g>${sky(290)}${hills(290)}
    <rect x="-300" y="320" width="1400" height="280" fill="url(#skyGrad)" opacity=".85"/><path d="M-300 360 H1100 M-300 410 H1100 M-300 470 H1100" stroke="var(--scene-orb)" stroke-width="2" opacity=".18" stroke-dasharray="46 30"/>
    <g transform="translate(40 330)"><path d="M0 120 Q20 190 90 200 H300 Q370 190 390 120Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="3.5"/><path d="M20 140 Q200 160 380 140" stroke="var(--scene-ink)" stroke-width="2.5" fill="none" opacity=".4"/><path d="M200 120 V-60" stroke="var(--scene-ink)" stroke-width="6"/><path d="M204 -56 L330 84 H204Z" fill="var(--scene-ink)" opacity=".55"/><path d="M60 118 Q70 80 100 80 Q130 80 140 118Z" fill="var(--scene-figure)" stroke="var(--scene-ink)" stroke-width="2"/></g>
    ${shadow(225, 596, 220)}</g>`,
});

export const OUTDOOR: Record<OutdoorSetting, Record<Facing, string>> = { road: road(), market: market(), ferry: ferry() };

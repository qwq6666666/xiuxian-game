// 事件配圖：依事件的主題畫一幅簡筆水墨小景（山、水、村、市集、夜、殿、爐火、林、路）。
// 主題由事件 id 的字眼判斷，判斷不出來就依 id 的雜湊在幾種風景裡挑，同一則事件每次都畫同一幅。
import type { EventDef } from "../data/types";
import { vignetteHands } from "./firstPersonHands";

type Theme = "mountain" | "water" | "village" | "market" | "night" | "hall" | "fire" | "forest" | "road";

const RULES: [RegExp, Theme][] = [
  [/dream|night|moon|lamp|star|ghost/, "night"],
  [/rain|river|ferry|boat|flood|well|water|lake|bridge|spring/, "water"],
  [/sect|hall|elder|banquet|exam|scripture|tribute|duty|guard/, "hall"],
  [/alchem|pill|fire|forge|furnace|herb_garden/, "fire"],
  [/market|tea|merchant|caravan|trade|stall|shop|price|loan|debt/, "market"],
  [/village|home|orphan|homecoming|child|wedding|family|neighbor/, "village"],
  [/herb|beast|forest|pine|wood|tree|hunt|mushroom/, "forest"],
  [/road|travel|wander|stranger|senior|visit|junior|traveler/, "road"],
  [/mountain|peak|cliff|cave|wall|stele|stone|hermit|meditation/, "mountain"],
];

const FALLBACK: Theme[] = ["mountain", "water", "village", "forest", "road"];

/** 簡單的字串雜湊，讓同一則事件畫同一幅 */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function themeOf(id: string): Theme {
  for (const [re, theme] of RULES) if (re.test(id)) return theme;
  return FALLBACK[hash(id) % FALLBACK.length];
}

const W = 400;
const H = 120;

/** 遠、中景山：起伏由種子決定 */
function ridges(seed: number): string {
  const a = 40 + (seed % 25);
  const b = 30 + ((seed >> 3) % 30);
  const c = 45 + ((seed >> 6) % 25);
  return (
    `<path class="vg-far" d="M0 82 L50 ${a} L100 76 L165 ${b} L225 80 L290 ${c} L350 74 L${W} 66 L${W} ${H} L0 ${H}Z"/>` +
    `<path class="vg-mid" d="M0 100 Q70 ${74 + (seed % 12)} 140 96 T280 92 T${W} 98 L${W} ${H} L0 ${H}Z"/>`
  );
}

const ground = `<path class="vg-near" d="M0 108 Q100 100 200 107 T${W} 105 L${W} ${H} L0 ${H}Z"/>`;
const orb = (x: number, y = 26, r = 12): string => `<circle class="vg-soft" cx="${x}" cy="${y}" r="${r + 9}"/><circle class="vg-orb" cx="${x}" cy="${y}" r="${r}"/>`;
const pine = (x: number, y: number, s = 1): string =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path class="vg-dark" d="M0 0 L-7 12 L-3 12 L-9 24 L9 24 L3 12 L7 12Z"/><rect class="vg-dark" x="-1" y="24" width="2" height="6"/></g>`;
const hut = (x: number, y: number): string =>
  `<g transform="translate(${x} ${y})"><rect class="vg-dark" x="0" y="8" width="26" height="16"/><path class="vg-dark" d="M-4 9 L13 -3 L30 9Z"/><rect class="vg-warm" x="10" y="13" width="6" height="8"/></g>`;

function scene(theme: Theme, seed: number): string {
  const ox = 40 + (seed % 320);
  switch (theme) {
    case "mountain":
      return orb(ox) + ridges(seed) + pine(70 + (seed % 60), 80, 0.9) + pine(110 + (seed % 40), 86, 0.7) + ground + `<path class="vg-stroke" d="M180 118 Q220 104 270 108 T360 102"/>`;
    case "water":
      return (
        orb(ox) + ridges(seed) + `<rect class="vg-water" x="0" y="92" width="${W}" height="${H - 92}"/>` +
        `<path class="vg-stroke" d="M30 102 q12 -3 24 0 M150 108 q14 -3 28 0 M260 100 q12 -3 24 0 M330 110 q14 -3 28 0"/>` +
        `<path class="vg-dark" d="M${180 + (seed % 60)} 99 L${204 + (seed % 60)} 99 L${199 + (seed % 60)} 105 L${185 + (seed % 60)} 105Z"/>` +
        `<path class="vg-stroke" d="M60 20 l-4 10 M90 14 l-4 10 M140 24 l-4 10 M200 10 l-4 10 M260 18 l-4 10 M330 12 l-4 10"/>`
      );
    case "village":
      return orb(ox) + ridges(seed) + ground + hut(80 + (seed % 40), 78) + hut(250 + (seed % 50), 84) + pine(210, 82, 0.8) + `<circle class="vg-soft" cx="${92 + (seed % 40)}" cy="68" r="5"/>`;
    case "market": {
      let stalls = "";
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 85 + ((seed >> i) % 12);
        stalls += `<g transform="translate(${x} 78)"><path class="vg-dark" d="M0 0 L36 0 L32 12 L4 12Z"/><rect class="vg-dark" x="4" y="12" width="28" height="18"/><circle class="vg-warm" cx="18" cy="${-6}" r="3.5"/></g>`;
      }
      return orb(ox, 22, 10) + ridges(seed) + ground + stalls;
    }
    case "night":
      return (
        `<rect x="0" y="0" width="${W}" height="${H}" class="vg-dark" opacity=".35"/>` +
        `<circle class="vg-soft" cx="${ox}" cy="30" r="26"/><circle class="vg-orb" cx="${ox}" cy="30" r="15"/>` +
        [...Array(9)].map((_, i) => `<circle class="vg-orb" cx="${(seed * (i + 3) * 17) % W}" cy="${8 + ((seed * (i + 5)) % 40)}" r="0.9"/>`).join("") +
        ridges(seed) + ground + `<circle class="vg-warm" cx="${300 - (seed % 60)}" cy="98" r="3.2"/><path class="vg-dark" d="M${296 - (seed % 60)} 101 L${304 - (seed % 60)} 101 L${303 - (seed % 60)} 110 L${297 - (seed % 60)} 110Z"/>`
      );
    case "hall":
      return (
        orb(ox) + ridges(seed) + ground +
        `<g transform="translate(${150 + (seed % 60)} 52)"><path class="vg-dark" d="M-8 22 L38 22 L30 14 L0 14Z"/><rect class="vg-dark" x="2" y="22" width="26" height="22"/><path class="vg-dark" d="M-4 14 L15 2 L34 14Z"/><rect class="vg-warm" x="12" y="28" width="6" height="16"/></g>` +
        `<path class="vg-stroke" d="M${160 + (seed % 60)} 112 l24 -10 M${170 + (seed % 60)} 114 l30 -10"/>`
      );
    case "fire":
      return (
        orb(ox, 24, 10) + ridges(seed) + ground +
        `<g transform="translate(${170 + (seed % 60)} 66)"><path class="vg-dark" d="M0 40 L6 14 L44 14 L50 40Z"/><rect class="vg-dark" x="12" y="6" width="26" height="8"/><circle class="vg-warm" cx="25" cy="34" r="6"/></g>` +
        `<circle class="vg-warm" cx="${180 + (seed % 60)}" cy="60" r="1.6"/><circle class="vg-warm" cx="${230 + (seed % 40)}" cy="52" r="1.2"/><circle class="vg-orb" cx="${200 + (seed % 60)}" cy="56" r="2.5" opacity=".4"/>`
      );
    case "forest":
      return orb(ox) + ridges(seed) + [...Array(7)].map((_, i) => pine(30 + i * 52 + ((seed >> i) % 14), 66 + ((i * 7 + seed) % 14), 0.9 + (i % 3) * 0.12)).join("") + ground;
    case "road":
      return orb(ox) + ridges(seed) + ground + `<path class="vg-stroke" d="M${60 + (seed % 40)} 118 Q180 92 ${230 + (seed % 40)} 100 T400 86"/><path class="vg-dark" d="M${300 - (seed % 50)} 96 l0 -9 l3 0 l0 9Z"/><circle class="vg-dark" cx="${301.5 - (seed % 50)}" cy="85" r="2"/>` + pine(70, 78, 0.8);
  }
}

/** 事件彈窗上方的配圖；境界決定色調，tone 為 bad 時壓暗並多一片烏雲與裂紋，good 時多一輪暖光與光線 */
export function vignetteHtml(ev: EventDef, realmId: string): string {
  return frame(themeOf(ev.id), hash(ev.id), realmId, ev.tone === "bad", ev.tone);
}

/** 依 tone 加上去的小道具：同一則事件每次畫同一幅（位置由雜湊決定） */
function toneProps(tone: EventDef["tone"] | undefined, seed: number): string {
  if (tone === "good") {
    const x = 120 + (seed % 160);
    return `<circle class="vg-warm" cx="${x}" cy="22" r="26" opacity=".18"/><path class="vg-ray" d="M${x} 22 L${x - 70} 84 M${x} 22 L${x - 24} 90 M${x} 22 L${x + 26} 90 M${x} 22 L${x + 72} 84"/>`;
  }
  if (tone === "bad") {
    const x = 60 + (seed % 200);
    return `<g class="vg-dark" opacity=".55"><ellipse cx="${x}" cy="10" rx="70" ry="13"/><ellipse cx="${x + 70}" cy="16" rx="52" ry="10"/><ellipse cx="${x - 60}" cy="18" rx="46" ry="9"/></g><path class="vg-crack" d="M${x + 20} 24 l-8 14 l9 3 l-10 18"/>`;
  }
  return "";
}

/** 遇怪視窗的配圖：凡人與練氣在林間，築基以上在山裡；同一種怪每次畫同一幅 */
export function huntVignetteHtml(monsterId: string, realmId: string): string {
  return frame(realmId === "mortal" || realmId === "lianqi" ? "forest" : "mountain", hash(monsterId), realmId, true);
}

function frame(theme: Theme, seed: number, realmId: string, darken: boolean, tone?: EventDef["tone"]): string {
  const dim = darken ? `<rect x="0" y="0" width="${W}" height="${H}" class="vg-dark" opacity=".3"/>` : "";
  return `<div class="vignette" data-realm="${realmId}" data-theme="${theme}"${tone ? ` data-tone="${tone}"` : ""} aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" focusable="false">${scene(theme, seed)}${toneProps(tone, seed)}${dim}${vignetteHands(H)}</svg></div>`;
}

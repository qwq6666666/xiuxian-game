// 統一風格的小圖示：16×16 線條向量，顏色跟隨文字（currentColor），純裝飾（aria-hidden），文字仍在旁邊。
import type { GameData, ItemDef } from "../data/types";

/** 圖示的內容（路徑），都畫在 16×16 內 */
const PATHS: Record<string, string> = {
  stone: '<path d="M8 2 L13 6 L11 13 L5 13 L3 6Z"/><path d="M3 6 L13 6 M8 2 L8 13" opacity=".5"/>',
  pill: '<circle cx="8" cy="8" r="5"/><path d="M5.5 6 Q7 4.5 9 5" opacity=".6"/>',
  pillGold: '<circle cx="8" cy="8" r="5"/><circle cx="8" cy="8" r="1.6"/>',
  peach: '<path d="M8 13 C3 11 3 6 8 5 C13 6 13 11 8 13Z"/><path d="M8 5 Q9 3 11 3"/>',
  heartPill: '<path d="M8 13 L4 8.5 C2.5 6.5 5 4 8 6.5 C11 4 13.5 6.5 12 8.5Z"/>',
  talisman: '<rect x="4.5" y="2" width="7" height="12" rx="1"/><path d="M6.5 5 L9.5 5 M6.5 7.5 L9.5 9.5 L6.5 11.5"/>',
  herb: '<path d="M8 14 L8 7"/><path d="M8 9 Q4 8.5 4 5 Q8 5 8 9Z"/><path d="M8 8 Q12 7.5 12 4 Q8 4 8 8Z"/>',
  sand: '<path d="M2 13 L14 13 L11 8 L9 10 L7 6 L5 10Z"/><circle cx="6" cy="4" r=".7"/><circle cx="10" cy="3.5" r=".7"/>',
  paper: '<path d="M4 2 L10.5 2 L12 3.5 L12 14 L4 14Z"/><path d="M6 6 L10 6 M6 8.5 L10 8.5 M6 11 L8.5 11" opacity=".6"/>',
  disc: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2.5 L8 5.5 M8 10.5 L8 13.5 M2.5 8 L5.5 8 M10.5 8 L13.5 8" opacity=".6"/>',
  bead: '<circle cx="8" cy="8" r="4.5"/><path d="M5.8 6 Q7 5 8.5 5.2" opacity=".6"/><path d="M8 2 L8 3.5" />',
  ding: '<path d="M4 5 L12 5 L11 10 L5 10Z"/><path d="M5.5 10 L5 13.5 M10.5 10 L11 13.5 M8 10 L8 13.5"/><path d="M5.5 5 L5.5 3 M10.5 5 L10.5 3"/>',
  mirror: '<circle cx="8" cy="6.5" r="4.2"/><path d="M8 10.7 L8 14"/><path d="M6 5.5 Q7 4.6 8.2 4.8" opacity=".6"/>',
  jade: '<circle cx="8" cy="9" r="4.5"/><circle cx="8" cy="9" r="1.6"/><path d="M8 4.5 L8 2 M6.5 2 L9.5 2"/>',
  ring: '<ellipse cx="8" cy="8" rx="5" ry="4.2"/><ellipse cx="8" cy="8" rx="2.6" ry="2"/>',
  // 日常安排
  retreat: '<path d="M2 12 Q8 9 14 12"/><path d="M5 10.5 Q8 5 11 10.5"/><circle cx="8" cy="4" r="1.5"/>',
  adventure: '<path d="M1.5 13 L6 5 L8.5 9 L10.5 6.5 L14.5 13Z"/>',
  wander: '<path d="M2 11 L14 11 L12 14 L4 14Z"/><path d="M8 3 L8 11 M8 4 L12.5 9.5 L8 9.5"/>',
  sectDuty: '<path d="M4 14 L11 3"/><path d="M10 3.5 L12.5 5.5 L9 9 L7.5 7.5Z"/>',
  alchemy: '<path d="M4 13 L5 7 L11 7 L12 13Z"/><rect x="6" y="4.5" width="4" height="2.5"/><path d="M7 3 Q8 1.5 9 3" opacity=".7"/>',
  // 其他
  method: '<path d="M3 4 Q8 1 13 4 L13 12 Q8 9 3 12Z"/><path d="M8 3.5 L8 10.5" opacity=".6"/>',
  fallback: '<circle cx="8" cy="8" r="4"/>',
};

/** 把圖示放進 16×16 的行內向量圖 */
export function icon(name: string): string {
  const body = PATHS[name] ?? PATHS.fallback;
  return `<svg class="ico" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 物品對應的圖示名稱：先看指定的物品 id，再看效果種類 */
export function itemIconName(item: ItemDef | undefined): string {
  if (!item) return "fallback";
  const byId: Record<string, string> = {
    ling_cao: "herb",
    ling_sha: "sand",
    fu_zhi: "paper",
    juling_pan: "disc",
    ningqi_zhu: "bead",
    yangyuan_ding: "ding",
    huxin_jing: "mirror",
    zhenhun_pei: "jade",
    shouyi_huan: "ring",
  };
  if (byId[item.id]) return byId[item.id];
  switch (item.effect.kind) {
    case "cultivationFraction":
      return "pill";
    case "breakthrough":
      return "pillGold";
    case "lifespan":
      return "peach";
    case "failLossRelief":
      return "heartPill";
    case "tribulationWard":
      return "talisman";
    default:
      return "fallback";
  }
}

export const itemIcon = (data: GameData, itemId: string): string => icon(itemIconName(data.items.find((i) => i.id === itemId)));

/** 日常安排的圖示（沒有專屬圖示的用預設） */
export const scheduleIcon = (scheduleId: string): string => icon(scheduleId in PATHS ? scheduleId : "retreat");

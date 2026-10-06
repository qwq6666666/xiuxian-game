// 還沒開放的分頁：整頁沒有任何可顯示的區塊時，改顯示開放條件，不讓玩家看到一片空白。純函式。
import type { GameData } from "../data/types";
import type { SideTab } from "./render";

/** 開放條件的說明；條件從資料取，不寫死境界名稱 */
export function lockedNote(tab: SideTab, data: GameData): string {
  if (tab === "make") {
    const idx = (id: string): number => data.realms.findIndex((r) => r.id === id);
    const earliest = [...data.recipes.recipes].sort((a, b) => idx(a.realmMin) - idx(b.realmMin))[0]?.realmMin;
    const name = data.realms.find((r) => r.id === earliest)?.name;
    if (name) return `煉丹與煉器要到${name}才開放。先在修行頁把修為練上去。`;
  }
  return "這一頁還沒有開放。";
}

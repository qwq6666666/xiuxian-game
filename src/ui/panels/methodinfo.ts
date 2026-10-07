// 心法選擇用的顯示資料：全由核心函式與資料算出，畫面只負責排版。
import { methodUnlocked } from "../../core/character/method";
import type { GameState } from "../../core/state";
import type { GameData, MethodEffects } from "../../data/types";

export interface MethodRow {
  id: string;
  name: string;
  desc: string;
  /** 效果的一行摘要，例如「修煉 +6%・事件 −15%」；沒有效果為「無加成也無代價」 */
  effectText: string;
  unlocked: boolean;
  selected: boolean;
  /** 未解鎖時的條件說明；已解鎖為空字串 */
  lockText: string;
}

const pct = (v: number): string => `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`;

/** 把效果寫成玩家看得懂的一行 */
export function effectSummary(e: MethodEffects): string {
  const parts: string[] = [];
  if (e.cultivation) parts.push(`修煉速度 ${pct(e.cultivation)}`);
  if (e.eventRate) parts.push(`事件頻率 ${pct(e.eventRate)}`);
  if (e.fragmentChance) parts.push(`殘卷機率 ${pct(e.fragmentChance)}`);
  if (e.failLoss) parts.push(`突破失敗損失 −${Math.round(e.failLoss * 100)} 個百分點`);
  if (e.guardBonus) parts.push(`天劫護體 +${Math.round(e.guardBonus * 100)}%`);
  return parts.length > 0 ? parts.join("・") : "無加成也無代價";
}

export function methodRows(state: GameState, data: GameData): MethodRow[] {
  return data.methods.map((m) => {
    const unlocked = methodUnlocked(state, m);
    return {
      id: m.id,
      name: m.name,
      desc: m.desc,
      effectText: effectSummary(m.effects),
      unlocked,
      selected: state.methodId === m.id,
      lockText: unlocked ? "" : `殘卷錄集到 ${m.unlock.fragments} 份才能選（目前 ${state.meta.fragments.length} 份）。`,
    };
  });
}

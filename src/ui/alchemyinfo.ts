// 煉丹介面用的顯示資料：全由核心函式與資料算出，畫面只負責排版。
import { canStartBrew, recipeOf, recipeOpen, recipeRate } from "../core/alchemy";
import { artifactOf, canForge } from "../core/forge";
import type { GameState } from "../core/state";
import { ALCHEMY_SCHEDULE } from "../data/types";
import type { GameData } from "../data/types";

export interface RecipeRow {
  id: string;
  /** 產出物的名稱 */
  name: string;
  /** 每種材料：名稱、需要與手上的數量 */
  inputs: { name: string; need: number; have: number }[];
  months: number;
  /** 成功率百分比（四捨五入） */
  ratePct: number;
  canStart: boolean;
  /** 不能開爐的原因；能開為 null */
  reason: string | null;
}

export interface ForgeRow {
  id: string;
  name: string;
  /** 欄位名稱與品階，例如「法器・二階」 */
  kind: string;
  /** 加成的一行摘要 */
  effect: string;
  inputs: { name: string; need: number; have: number }[];
  stones: number;
  ratePct: number;
  canForge: boolean;
  reason: string | null;
}

export interface BrewingInfo {
  name: string;
  progress: number;
  months: number;
  paid: boolean;
  ratePct: number;
  /** 爐子留著但目前的日常安排不是煉丹 */
  paused: boolean;
}

export interface AlchemyPanel {
  brewing: BrewingInfo | null;
  recipes: RecipeRow[];
  forge: ForgeRow[];
}

function realmName(data: GameData, id: string): string {
  return data.realms.find((r) => r.id === id)?.name ?? id;
}

/** 煉丹面板：沒有任何丹方開放、也沒有進行中的爐時為 null（凡人階段不顯示） */
export function alchemyPanel(state: GameState, data: GameData): AlchemyPanel | null {
  const itemName = (id: string): string => data.items.find((i) => i.id === id)?.name ?? id;
  const recipes = data.recipes.recipes.filter((r) => r.kind === "brew").map((r): RecipeRow => {
    const open = recipeOpen(state, r, data);
    const canStart = canStartBrew(state, r.id, data);
    let reason: string | null = null;
    if (!canStart) {
      if (!open) reason = `要到${realmName(data, r.realmMin)}才能煉。`;
      else if (state.alchemy !== null) reason = "爐裡已有一爐，先煉完或熄爐。";
      else reason = "材料不夠。";
    }
    return {
      id: r.id,
      name: itemName(r.output),
      inputs: Object.entries(r.inputs).map(([id, need]) => ({ name: itemName(id), need, have: state.items[id] ?? 0 })),
      months: r.months,
      ratePct: Math.round(recipeRate(state, r, data) * 100),
      canStart,
      reason,
    };
  });
  const a = state.alchemy;
  const recipe = a ? recipeOf(a.recipeId, data) : undefined;
  const brewing: BrewingInfo | null =
    a && recipe
      ? {
          name: itemName(recipe.output),
          progress: a.progress,
          months: recipe.months,
          paid: a.paid,
          ratePct: Math.round(recipeRate(state, recipe, data) * 100),
          paused: state.schedule !== ALCHEMY_SCHEDULE,
        }
      : null;
  const anyOpen = data.recipes.recipes.some((r) => recipeOpen(state, r, data));
  if (!anyOpen && brewing === null) return null;
  return { brewing, recipes, forge: forgeRows(state, data, itemName) };
}

const SLOT_NAME = { weapon: "法器", ward: "護身" } as const;

/** 法寶加成寫成一行 */
export function bonusText(b: { cultivation?: number; failLoss?: number; guardBonus?: number }): string {
  const parts: string[] = [];
  if (b.cultivation) parts.push(`修煉速度 +${Math.round(b.cultivation * 100)}%`);
  if (b.failLoss) parts.push(`突破失敗損失 −${Math.round(b.failLoss * 100)} 個百分點`);
  if (b.guardBonus) parts.push(`天劫護體 +${Math.round(b.guardBonus * 100)}%`);
  return parts.join("・");
}

function forgeRows(state: GameState, data: GameData, itemName: (id: string) => string): ForgeRow[] {
  return data.recipes.recipes
    .filter((r) => r.kind === "forge")
    .map((r) => {
      const art = artifactOf(r.output, data)!;
      const can = canForge(state, r.id, data);
      const open = recipeOpen(state, r, data);
      const inputs = Object.entries(r.inputs).map(([id, need]) => ({ name: itemName(id), need, have: state.items[id] ?? 0 }));
      let reason: string | null = null;
      if (!can) {
        if (!open) reason = `要到${realmName(data, r.realmMin)}才能煉。`;
        else if (inputs.some((i) => i.have < i.need)) reason = "材料不夠。";
        else reason = "靈石不夠。";
      }
      return {
        id: r.id,
        name: art.name,
        kind: `${SLOT_NAME[art.effect.slot]}・${art.effect.tier} 階`,
        effect: bonusText(art.effect.bonus),
        inputs,
        stones: r.stones,
        ratePct: Math.round(recipeRate(state, r, data) * 100),
        canForge: can,
        reason,
      };
    });
}

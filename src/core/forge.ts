// 煉器與法寶（M30）：用靈石與材料即時煉製，裝備在兩個欄位上提供被動加成；轉世時依本命天賦帶走幾件。
import { gameData } from "../data/load";
import type { ArtifactBonus, ArtifactSlot, GameData, ItemDef, RecipeDef } from "../data/types";
import { ARTIFACT_SLOTS } from "../data/types";
import { recipeOpen, recipeRate, hasMaterials } from "./alchemy";
import { talentBonus } from "./formulas";
import { addLog } from "./progress";
import { nextRandom } from "./rng";
import type { GameState } from "./state";

type ArtifactEffect = Extract<ItemDef["effect"], { kind: "artifact" }>;

/** 這個 id 若是法寶，回傳它的資料，否則 null */
export function artifactOf(id: string | null, data: GameData = gameData): (ItemDef & { effect: ArtifactEffect }) | null {
  const item = data.items.find((i) => i.id === id);
  return item && item.effect.kind === "artifact" ? (item as ItemDef & { effect: ArtifactEffect }) : null;
}

/** 目前裝備的法寶，某一項加成的總和 */
export function artifactBonus(state: GameState, key: keyof ArtifactBonus, data: GameData = gameData): number {
  let total = 0;
  for (const slot of ARTIFACT_SLOTS) total += artifactOf(state.equipment[slot], data)?.effect.bonus[key] ?? 0;
  return total;
}

export function forgeRecipes(data: GameData = gameData): RecipeDef[] {
  return data.recipes.recipes.filter((r) => r.kind === "forge");
}

/** 能煉：修行中、境界與材料與靈石都夠 */
export function canForge(state: GameState, recipeId: string, data: GameData = gameData): boolean {
  const r = data.recipes.recipes.find((x) => x.id === recipeId);
  if (!r || r.kind !== "forge" || state.phase !== "living" || state.tribulation !== null || state.encounter !== null) return false;
  return recipeOpen(state, r, data) && hasMaterials(state, r) && state.spiritStones >= r.stones;
}

/** 煉一件：材料與靈石先扣，一次抽籤；成功得法寶，失敗退回一半材料（靈石不退） */
export function forge(state: GameState, recipeId: string, data: GameData = gameData): GameState {
  if (!canForge(state, recipeId, data)) return state;
  const r = data.recipes.recipes.find((x) => x.id === recipeId)!;
  const items = { ...state.items };
  for (const [id, n] of Object.entries(r.inputs)) items[id] -= n;
  const [v, seed] = nextRandom(state.rngSeed);
  const base = { month: state.ageMonths, realmId: state.realmId, stage: state.stage };
  const s: GameState = { ...state, items, rngSeed: seed, spiritStones: state.spiritStones - r.stones };
  if (v < recipeRate(state, r, data)) {
    items[r.output] = (items[r.output] ?? 0) + 1;
    return addLog({ ...s, items }, { ...base, kind: "forgeDone", itemId: r.output }, data.config.logLimit);
  }
  for (const [id, n] of Object.entries(r.inputs)) {
    const back = Math.floor(n * data.recipes.rules.failRefund);
    if (back > 0) items[id] += back;
  }
  return addLog({ ...s, items }, { ...base, kind: "forgeFail" }, data.config.logLimit);
}

/** 背包裡有這件法寶、且是法寶 */
export function canEquip(state: GameState, itemId: string, data: GameData = gameData): boolean {
  return state.phase === "living" && artifactOf(itemId, data) !== null && (state.items[itemId] ?? 0) > 0;
}

/** 裝備：該欄原有的法寶退回背包，隨時可換 */
export function equip(state: GameState, itemId: string, data: GameData = gameData): GameState {
  if (!canEquip(state, itemId, data)) return state;
  const slot: ArtifactSlot = artifactOf(itemId, data)!.effect.slot;
  const items = { ...state.items, [itemId]: state.items[itemId] - 1 };
  const old = state.equipment[slot];
  if (old) items[old] = (items[old] ?? 0) + 1;
  return { ...state, items, equipment: { ...state.equipment, [slot]: itemId } };
}

export function unequip(state: GameState, slot: ArtifactSlot): GameState {
  const old = state.equipment[slot];
  if (state.phase !== "living" || !old) return state;
  return { ...state, items: { ...state.items, [old]: (state.items[old] ?? 0) + 1 }, equipment: { ...state.equipment, [slot]: null } };
}

/** 這一世結束時，依本命天賦挑出要帶走的法寶：品階高的優先，同階依 id 排序 */
export function artifactsToKeep(state: GameState, data: GameData = gameData): string[] {
  const n = Math.floor(talentBonus(state.meta, data.talents, "keepArtifact"));
  if (n <= 0) return [];
  const owned: string[] = [];
  for (const slot of ARTIFACT_SLOTS) if (state.equipment[slot]) owned.push(state.equipment[slot]!);
  for (const [id, count] of Object.entries(state.items)) if (artifactOf(id, data)) for (let i = 0; i < count; i++) owned.push(id);
  return owned
    .sort((a, b) => artifactOf(b, data)!.effect.tier - artifactOf(a, data)!.effect.tier || (a < b ? -1 : 1))
    .slice(0, n);
}

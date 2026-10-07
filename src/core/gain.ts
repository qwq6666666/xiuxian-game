// 每月修為增量：獨立成檔，讓遇怪等模組取用時不必回頭 import tick。
import { gameData } from "../data/load";
import type { GameData, ScheduleDef } from "../data/types";
import { cultivationPerMonth, talentBonus } from "./formulas";
import { fatigueMult } from "./fatigue";
import { artifactBonus } from "./forge";
import { methodEffect } from "./method";
import { realmOf } from "./progress";
import { sectBonus } from "./sect";
import { stanceMult } from "./stance";
import type { GameState } from "./state";

/** 依日常安排計算一個月的修為增量 */
export function monthlyGain(state: GameState, sched: ScheduleDef, data: GameData = gameData): number {
  const realm = realmOf(state, data);
  const root = data.spiritRoots.find((r) => r.id === state.spiritRootId);
  if (!root) throw new Error(`狀態：找不到靈根 ${state.spiritRootId}`);
  return cultivationPerMonth({
    config: data.config,
    rootMult: root.mult,
    bone: state.attributes.bone,
    realmMult: realm.cultivationMult,
    scheduleMult: sched.cultivationMult * fatigueMult(state, sched, data) * stanceMult(state, "cultivationMult", data),
    originBonus: state.cultivationBonus,
    reincarnationBonus: talentBonus(state.meta, data.talents, "cultivation"),
    sectBonus: sectBonus(state, data),
    methodBonus: methodEffect(state, "cultivation", data),
    artifactBonus: artifactBonus(state, "cultivation", data),
  });
}

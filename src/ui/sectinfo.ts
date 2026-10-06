// 宗門介面用的顯示資料：全由核心函式與資料算出，畫面只負責排版。
import { canJoinSect, canPromoteSect, companionsOf, joinRate, localSect, memberSect, nextRank, rankOf, sectBonus, sectStipend } from "../core/sect";
import type { GameState } from "../core/state";
import { snapshotOf } from "../core/worldeffects";
import type { GameData, SectState } from "../data/types";

export const SECT_STATE_TEXT: Record<SectState, string> = { prosper: "興盛", stable: "尋常", decline: "衰微", closed: "閉山", fallen: "覆滅" };

export interface SectPanel {
  sectName: string;
  stateText: string;
  rankName: string;
  contribution: number;
  /** 修煉加成百分比（四捨五入） */
  bonusPct: number;
  /** 每年月例靈石 */
  stipend: number;
  companions: { peer: string; steward: string; elder: string };
  /** 下一個位階；沒有（已到頂或這種宗門到頂）為 null */
  next: { name: string; realmName: string; contribution: number; contributionMet: boolean; realmMet: boolean } | null;
  canPromote: boolean;
}

function realmLabel(data: GameData, realmId: string, stage = 0): string {
  const realm = data.realms.find((r) => r.id === realmId);
  if (!realm) return realmId;
  return `${realm.name}${realm.stageNames.length > 1 ? realm.stageNames[stage] : ""}`;
}

/** 已入宗者的宗門面板；沒入宗為 null */
export function sectPanel(state: GameState, data: GameData): SectPanel | null {
  const rank = rankOf(state, data);
  const sect = memberSect(state, data);
  const companions = companionsOf(state, data);
  if (!rank || !sect || !state.sect || !companions) return null;
  const next = nextRank(state, data);
  const realmIdx = (id: string): number => data.realms.findIndex((r) => r.id === id);
  return {
    sectName: sect.name,
    stateText: SECT_STATE_TEXT[sect.state],
    rankName: rank.name,
    contribution: state.sect.contribution,
    bonusPct: Math.round(sectBonus(state, data) * 100),
    stipend: sectStipend(state, data),
    companions,
    next: next?.def.promote
      ? {
          name: next.def.name,
          realmName: realmLabel(data, next.def.promote.realm),
          contribution: next.def.promote.contribution,
          contributionMet: state.sect.contribution >= next.def.promote.contribution,
          realmMet: realmIdx(state.realmId) >= realmIdx(next.def.promote.realm),
        }
      : null,
    canPromote: canPromoteSect(state, data),
  };
}

export interface JoinInfo {
  /** 試煉成功率（0–1）；宗門不收人為 0 */
  rate: number;
  /** 現在就能按「求入宗」 */
  canJoin: boolean;
  /** 不能入的原因；能入為 null */
  reason: string | null;
}

/** 天下圖上選到某個宗門時的求入宗資訊；找不到宗門為 null */
export function joinInfo(state: GameState, sectId: string, data: GameData): JoinInfo | null {
  const sect = snapshotOf(state, data).sects.find((s) => s.id === sectId);
  if (!sect) return null;
  const rate = joinRate(state, sect, data);
  const here = localSect(state, data);
  const canJoin = here?.id === sectId && canJoinSect(state, data);
  let reason: string | null = null;
  if (!canJoin) {
    const j = data.sects.join;
    const idx = (id: string): number => data.realms.findIndex((r) => r.id === id);
    if (state.sect !== null) reason = state.sect.id === sectId ? "你已是這個宗門的人。" : "這一世你已有所屬宗門，要先離宗。";
    else if (sect.state === "closed" || sect.state === "fallen") reason = `宗門已${SECT_STATE_TEXT[sect.state]}，不收人。`;
    else if (state.sectsTried.includes(sectId)) reason = "這一世你已叩過這扇山門，不會再開。";
    else if (idx(state.realmId) < idx(j.minRealm) || (idx(state.realmId) === idx(j.minRealm) && state.stage < j.minStage)) {
      reason = `修為需達${realmLabel(data, j.minRealm, j.minStage)}才能求入宗。`;
    } else if (here?.id !== sectId) reason = "要先走到這處山門外，才能求入宗。";
    else if (state.pendingEvent !== null) reason = "眼前有事待決，先處理完。";
  }
  return { rate, canJoin, reason };
}

import { buyItem, buyTalent, canBuyItem, canBuyTalent, canUseItem, setSchedule, useItem } from "../../src/core/actions";
import { canChoose, eventOf } from "../../src/core/events";
import { nextRandom } from "../../src/core/rng";
import type { GameState } from "../../src/core/state";
import { gameData } from "../../src/data/load";
import { policy } from "./context";

/** 從可選的選項中隨機挑一個（模擬的玩家策略，與遊戲本身的亂數分開） */
export function randomChoice(pendingId: string, state: GameState): number {
  const options = (eventOf(pendingId, gameData).choices ?? []).map((c, i) => (canChoose(state, c) ? i : -1)).filter((i) => i >= 0);
  const [v, next] = nextRandom(policy.seed);
  policy.seed = next;
  return options[Math.floor(v * options.length)];
}

/** 混合策略的每月操作：換安排、買丹藥、吃丹藥 */
export function mixedActions(state: GameState): GameState {
  let s = state;
  // 練氣前期靈石不足時外出歷練賺錢，攢夠了就回去閉關
  const lianqiEarly = s.realmId === "lianqi" && s.stage < 3 && s.spiritStones < 40;
  s = setSchedule(s, lianqiEarly ? "adventure" : "retreat", gameData);
  if (s.realmId === "lianqi" && s.stage >= 6 && (s.items.zhuji_dan ?? 0) === 0) s = buyItem(s, "zhuji_dan", gameData);
  if (canBuyItem(s, "yanshou_dan", gameData) && s.realmId !== "mortal") s = buyItem(s, "yanshou_dan", gameData);
  if (canUseItem(s, "yanshou_dan", gameData)) s = useItem(s, "yanshou_dan", gameData);
  while (s.realmId !== "mortal" && canBuyItem(s, "juqi_dan", gameData) && s.spiritStones >= 520) s = buyItem(s, "juqi_dan", gameData);
  while (canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
  return s;
}

/**
 * 輪流安排策略（M42）：同 mixed 買丹吃丹，但每 12 個月裡 9 個月閉關、歷練／走訪／採藥各 1 個月（凡人只閉關）。
 * 量測「認真換安排」的玩家：首次金丹不得低於第 7 世（GDD 第 13 節的疊加上限檢查）。
 */
export const ROTATE_CYCLE = ["retreat", "retreat", "retreat", "retreat", "retreat", "retreat", "retreat", "retreat", "retreat", "adventure", "wander", "herb"];
export function rotateActions(state: GameState): GameState {
  const s = mixedActions(state);
  return s.realmId === "mortal" ? s : setSchedule(s, ROTATE_CYCLE[s.ageMonths % ROTATE_CYCLE.length], gameData);
}

/** 混合策略的天賦購買：依目標等級均衡，永遠買「等級/目標」最低且買得起的 */
export const TALENT_TARGETS: Record<string, number> = { suhui: 18, daoxin: 3, tianjuan: 2, fuyuan: 2, yize: 2 };
/** 通關後的目標：宿慧拉高，神光到上限；神光門檻另由 buyTalentsPost 先處理 */
export const POST_TARGETS: Record<string, number> = { suhui: 30, shenguang: 6, daoxin: 4, tianjuan: 2, fuyuan: 2, yize: 2 };
export function buyTalentsBalanced(state: GameState, targets: Record<string, number> = TALENT_TARGETS): GameState {
  let s = state;
  for (;;) {
    const order = Object.entries(targets)
      .map(([id, target]) => [id, (s.meta.talents[id] ?? 0) / target] as const)
      .sort((a, b) => a[1] - b[1]);
    const pick = order.find(([id]) => canBuyTalent(s, id, gameData));
    if (!pick) return s;
    // 最缺的天賦買不起就存著，不要被便宜的搶先（宿慧以外的天賦很貴）
    if (!canBuyTalent(s, order[0][0], gameData)) return s;
    s = buyTalent(s, pick[0], gameData);
  }
}

/** 通關後策略的天賦購買：第一次通關前同 mixed；之後先把神光買到結嬰門檻，再依 POST_TARGETS 均衡 */
export function buyTalentsPost(state: GameState): GameState {
  if (!Object.values(state.meta.clears).some((n) => n > 0)) return buyTalentsBalanced(state);
  const need = gameData.realms.find((r) => r.id === "jindan")?.breakthroughRule?.requiresTalent;
  let s = state;
  while (need && (s.meta.talents[need.id] ?? 0) < need.level) {
    // 門檻之前什麼都不買，存著道韻
    if (!canBuyTalent(s, need.id, gameData)) return s;
    s = buyTalent(s, need.id, gameData);
  }
  // 第一次元嬰之後：凝神買到化神門檻再依目標均衡
  const gate = gameData.realms.find((r) => r.id === "yuanying")?.breakthroughRule?.requiresTalent;
  if (gate && Object.values(s.meta.yuanying).some((n) => n > 0)) {
    while ((s.meta.talents[gate.id] ?? 0) < gate.level) {
      if (!canBuyTalent(s, gate.id, gameData)) return s;
      s = buyTalent(s, gate.id, gameData);
    }
    return buyTalentsBalanced(s, { ...POST_TARGETS, ningshen: 6 });
  }
  return buyTalentsBalanced(s, POST_TARGETS);
}


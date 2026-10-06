import { gameData } from "../data/load";
import type { GameData, ScheduleDef } from "../data/types";
import { advanceEvents } from "./events";
import { lifespanMonths } from "./formulas";
import { monthlyGain } from "./gain";
import { autoEncounter, maybeEncounter } from "./encounter";
import { addLog, atBottleneck, realmOf, resolveStages, scheduleOf } from "./progress";
import { endLife } from "./review";
import { deriveSeed, nextInt, nextRandom } from "./rng";
import type { GameState } from "./state";
import { advanceTravel } from "./travel";
import { stepSect } from "./sect";
import { stepAlchemy } from "./alchemy";
import { accrueFocus } from "./focus";
import { advanceStreak } from "./fatigue";

/** 材料掉落亂數的雜湊鹽值，與世界生成用的編號錯開 */
const DROP_SALT = 7_000_000;

export { monthlyGain };
// 其他模組一直從 tick 取用這些函式，維持原本的匯入路徑
export { addLog, atBottleneck, lifespanYears, nextRealm, realmOf, resolveStages, scheduleOf, scheduleOpen } from "./progress";

/** 日常安排的每月收穫與風險：靈石、拾得物品、歷練身亡 */
function applySchedule(state: GameState, sched: ScheduleDef, month: number, data: GameData): GameState {
  const limit = data.config.logLimit;
  let seed = state.rngSeed;
  const draw = (): number => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };

  if (sched.deathChance > 0 && draw() < sched.deathChance) {
    const died = addLog(
      { ...state, rngSeed: seed },
      { month, kind: "adventureDeath", realmId: state.realmId, stage: state.stage },
      limit,
    );
    return endLife(died, "adventure", data);
  }

  let stones = state.spiritStones;
  const { chance, min, max } = sched.stones;
  if (chance >= 1 || (chance > 0 && draw() < chance)) {
    if (max > min) {
      const [v, n] = nextInt(seed, min, max);
      seed = n;
      stones += v;
    } else {
      stones += min;
    }
  }

  const items = { ...state.items };
  const found: string[] = [];
  for (const f of sched.finds) {
    if (draw() < f.chance) {
      items[f.itemId] = (items[f.itemId] ?? 0) + 1;
      found.push(f.itemId);
    }
  }

  // 材料掉落：每種各用由 seed 衍生的獨立亂數，不消耗 rngSeed，也不寫日誌，不影響既有的亂數序列
  (sched.drops ?? []).forEach((d, j) => {
    if (nextRandom(deriveSeed(seed, DROP_SALT + month * 8 + j))[0] < d.chance) items[d.itemId] = (items[d.itemId] ?? 0) + 1;
  });

  let s: GameState = { ...state, rngSeed: seed, spiritStones: stones, items };
  for (const itemId of found) {
    s = addLog(s, { month, kind: "find", realmId: s.realmId, stage: s.stage, itemId }, limit);
  }
  return s;
}

/** 累積一個月的修為並處理升級（呼叫前須確認未卡瓶頸） */
export function addCultivation(state: GameState, sched: ScheduleDef, month: number, data: GameData): GameState {
  return resolveStages({ ...state, cultivation: state.cultivation + monthlyGain(state, sched, data) }, month, data);
}

function stepMonth(state: GameState, data: GameData): GameState {
  const month = state.ageMonths + 1;
  let s: GameState = accrueFocus({ ...state, ageMonths: month }, data);
  const sched = scheduleOf(s, data);
  // 已卡在瓶頸就不再累積修為
  const accrued = !atBottleneck(state, data);
  if (accrued) s = addCultivation(s, sched, month, data);
  s = advanceStreak(s, sched, accrued, data);
  s = applySchedule(s, sched, month, data);
  if (s.phase !== "living") return s;
  s = stepAlchemy(s, data);
  s = stepSect(s, data);
  if (month >= lifespanMonths(realmOf(s, data), s.lifespanBonus)) {
    const died = addLog(s, { month, kind: "death", realmId: s.realmId, stage: s.stage }, data.config.logLimit);
    return endLife(died, "lifespan", data);
  }
  s = { ...s, travel: advanceTravel(s.travel) };
  s = advanceEvents(s, month, data);
  // 外出歷練時可能遇怪：時間暫停等玩家選擇，自動抉擇時照預設打法一次打完
  if (s.phase !== "living" || s.pendingEvent !== null) return s;
  s = maybeEncounter(s, month, data);
  return s.encounter !== null && s.autoChoice ? autoEncounter(s, data) : s;
}

/**
 * 推進 months 個月，回傳新狀態，不修改輸入。
 * 只有修行中才會推進；死亡或等待抉擇時停止。
 */
export function tick(state: GameState, months = 1, data: GameData = gameData): GameState {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error(`tick：months 必須是非負整數，目前為 ${months}`);
  }
  let s = state;
  for (let i = 0; i < months && s.phase === "living" && s.pendingEvent === null && s.tribulation === null && s.encounter === null; i++) s = stepMonth(s, data);
  return s;
}

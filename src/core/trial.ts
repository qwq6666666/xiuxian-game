// 秘境試煉（M47）：每層一名強敵，整段在進入時就扣固定月數；每世每座只能入一次。
// 每一層就是一場現有的遇怪（encounter.ts），這裡只負責進入、逐層推進與結算。
// 亂數全由進入時抽定的種子衍生，不消耗 rngSeed；沒有入過秘境的世界，亂數序列與修為都不受影響。
import { gameData } from "../data/load";
import type { GameData, TrialDef, TrialRule } from "../data/types";
import { stepAlchemy } from "./alchemy";
import { advanceStreak } from "./fatigue";
import { accrueFocus } from "./focus";
import { lifespanMonths } from "./formulas";
import { monthlyGain } from "./gain";
import { addLog, atBottleneck, realmOf, resolveStages } from "./progress";
import { deriveSeed, nextRandom } from "./rng";
import { stepSect } from "./sect";
import type { Changes, EncounterState, GameState } from "./state";

/** 秘境亂數的雜湊鹽值，與材料掉落（7M）、遇怪（8M）、世界生成用的編號錯開 */
const TRIAL_SALT = 9_000_000;

const draw = (seed: number, salt: number): number => nextRandom(deriveSeed(seed, salt))[0];

export function trialOf(id: string, data: GameData = gameData): TrialDef {
  const t = data.trials.trials.find((x) => x.id === id);
  if (!t) throw new Error(`秘境：找不到秘境 ${id}`);
  return t;
}

/** 目前境界能入的秘境（不論是否入過） */
export function trialsFor(state: GameState, data: GameData = gameData): TrialDef[] {
  return data.trials.trials.filter((t) => t.realm === state.realmId);
}

/** 不能入的原因；能入回傳 null。文字給介面直接顯示 */
export function trialBlockReason(state: GameState, trialId: string, data: GameData = gameData): string | null {
  const def = data.trials.trials.find((t) => t.id === trialId);
  if (!def) return "沒有這座秘境。";
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.encounter !== null || state.trial !== null) return "現在走不開。";
  if (state.realmId !== def.realm) return "境界不符。";
  if (state.trialsDone.includes(trialId)) return "這一世已經入過。";
  const left = lifespanMonths(realmOf(state, data), state.lifespanBonus) - state.ageMonths;
  const need = def.months + data.trials.rules.lifespanBuffer;
  if (left < need) return `壽元不足：至少要再剩 ${Math.ceil(need / 12)} 年。`;
  return null;
}

export function canEnterTrial(state: GameState, trialId: string, data: GameData = gameData): boolean {
  return trialBlockReason(state, trialId, data) === null;
}

/** 這一層的遇怪狀態：怪物由秘境指定，亂數由進入時的種子衍生 */
function floorEncounter(def: TrialDef, floor: number, seed: number, myHp = 1): EncounterState {
  return { monsterId: def.floors[floor], round: 0, monsterHp: 1, myHp, seed: deriveSeed(seed, 100 + floor) };
}

/** 目前秘境的地形規則；不在秘境裡回傳 undefined */
export function trialRuleOf(state: GameState, data: GameData = gameData): TrialRule | undefined {
  return state.trial ? trialOf(state.trial.id, data).rule : undefined;
}

/**
 * 在秘境裡度過 months 個月：與外出歷練相同的低修為倍率，不抽事件、不遇怪、不拾物、不旅行。
 * 煉丹與宗門照常逐月推進，所以進去前開的爐子不會停在原地。
 */
function passMonths(state: GameState, months: number, data: GameData): GameState {
  const sched = data.schedules.find((s) => s.id === data.monsters.rules.schedule);
  if (!sched) throw new Error(`秘境：找不到日常安排 ${data.monsters.rules.schedule}`);
  let s = state;
  for (let i = 0; i < months; i++) {
    const month = s.ageMonths + 1;
    const accrued = !atBottleneck(s, data);
    s = accrueFocus({ ...s, ageMonths: month }, data);
    if (accrued) s = resolveStages({ ...s, cultivation: s.cultivation + monthlyGain(s, sched, data) }, month, data);
    s = advanceStreak(s, sched, accrued, data);
    s = stepAlchemy(s, data);
    s = stepSect(s, data);
  }
  return s;
}

/** 入秘境：先扣整段月數，再進第一層。不符條件時原樣回傳 */
export function enterTrial(state: GameState, trialId: string, data: GameData = gameData): GameState {
  if (!canEnterTrial(state, trialId, data)) return state;
  const def = trialOf(trialId, data);
  const seed = deriveSeed(state.rngSeed, TRIAL_SALT + state.ageMonths);
  const entered = addLog(state, { month: state.ageMonths, kind: "trialEnter", realmId: state.realmId, stage: state.stage, trialId }, data.config.logLimit);
  const spent = passMonths(entered, def.months, data);
  return {
    ...spent,
    trial: { id: trialId, floor: 0, seed, rests: 0 },
    trialsDone: [...spent.trialsDone, trialId],
    encounter: floorEncounter(def, 0, seed),
  };
}

function clearTrial(state: GameState, def: TrialDef, data: GameData): GameState {
  const t = state.trial!;
  const retreat = data.schedules.find((s) => s.id === "retreat");
  if (!retreat) throw new Error("秘境：找不到閉關修煉（retreat）安排");
  const r = def.reward;
  const gain = atBottleneck(state, data) ? 0 : monthlyGain(state, retreat, data) * r.cultivationMonths;
  const stones = r.stones.min + Math.floor(draw(t.seed, 900) * (r.stones.max - r.stones.min + 1));
  const items = { ...state.items };
  for (const [id, n] of Object.entries(r.items)) items[id] = (items[id] ?? 0) + n;
  const next = resolveStages({ ...state, cultivation: state.cultivation + gain, spiritStones: state.spiritStones + stones, items }, state.ageMonths, data);
  const changes: Changes = { ...(gain > 0 ? { cultivation: gain } : {}), ...(stones > 0 ? { spiritStones: stones } : {}), ...(Object.keys(r.items).length > 0 ? { items: { ...r.items } } : {}) };
  return addLog({ ...next, trial: null }, { month: state.ageMonths, kind: "trialClear", realmId: next.realmId, stage: next.stage, trialId: def.id, changes }, data.config.logLimit);
}

function endTrial(state: GameState, def: TrialDef, outcome: 0 | 1, data: GameData): GameState {
  return addLog({ ...state, trial: null }, { month: state.ageMonths, kind: "trialFail", realmId: state.realmId, stage: state.stage, trialId: def.id, outcome }, data.config.logLimit);
}

/**
 * 一層（一場遇怪）結束後呼叫：勝了進下一層或通關；敗、平手、逃跑失敗都結束，逃跑成功算中途抽身（不另損修為）。
 * outcome 沿用遇怪的定義：逃跑時 0 成功、1 失敗。
 */
export function advanceTrial(state: GameState, kind: "huntWin" | "huntLose" | "huntFlee" | "huntDraw", outcome: number | undefined, data: GameData = gameData, carryHp = 1): GameState {
  const t = state.trial;
  if (!t || state.encounter !== null) return state;
  const def = trialOf(t.id, data);
  if (kind === "huntWin") {
    // 氣血帶進下一層；下一層先停在休整，等玩家選繼續、調息或撤退
    if (t.floor + 1 < def.floors.length) return { ...state, trial: { ...t, floor: t.floor + 1 }, encounter: { ...floorEncounter(def, t.floor + 1, t.seed, carryHp), rest: true } };
    return clearTrial(state, def, data);
  }
  return endTrial(state, def, kind === "huntFlee" && outcome === 0 ? 1 : 0, data);
}

/** 休整中且還能調息 */
export function canTrialRest(state: GameState, data: GameData = gameData): boolean {
  return state.trial !== null && state.encounter?.rest === true && state.trial.rests < data.trials.rules.rest.max && state.encounter.myHp < 1;
}

/** 層間休整：直接開打下一層，氣血照舊 */
export function trialContinue(state: GameState): GameState {
  if (!state.encounter?.rest) return state;
  const { rest: _rest, ...fight } = state.encounter;
  return { ...state, encounter: fight };
}

/** 層間調息：花幾個月回復部分氣血，每座限次；仍停在休整 */
export function trialRest(state: GameState, data: GameData = gameData): GameState {
  if (!canTrialRest(state, data) || !state.trial || !state.encounter) return state;
  const r = data.trials.rules.rest;
  const spent = passMonths(state, r.months, data);
  return { ...spent, trial: { ...state.trial, rests: state.trial.rests + 1 }, encounter: { ...state.encounter, myHp: Math.min(1, state.encounter.myHp + r.heal) } };
}

/** 層間撤退：已過樓層的靈石與掉落早已入袋，只是拿不到通關獎勵；算中途抽身，這一世不再入 */
export function trialRetreat(state: GameState, data: GameData = gameData): GameState {
  if (!state.trial || !state.encounter?.rest) return state;
  return endTrial({ ...state, encounter: null }, trialOf(state.trial.id, data), 1, data);
}

/** 自動抉擇的休整決定：氣血不到一半且還能調息就調息 */
export function trialAutoRest(state: GameState, data: GameData = gameData): boolean {
  return canTrialRest(state, data) && (state.encounter?.myHp ?? 1) < 0.5;
}

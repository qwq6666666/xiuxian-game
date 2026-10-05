// 事件系統：計時、依條件抽取、抉擇結算。
import { gameData } from "../data/load";
import { ATTRIBUTE_KEYS, type ChoiceDef, type Effects, type EventDef, type GameData } from "../data/types";
import { eventWeight, outcomeWeight, stageNeed } from "./formulas";
import { addLog, atBottleneck, realmOf, resolveStages, scheduleOf } from "./progress";
import { nextInt, pickWeighted } from "./rng";
import type { Attributes, Changes, GameState } from "./state";

export function eventOf(id: string, data: GameData = gameData): EventDef {
  const ev = data.events.find((e) => e.id === id);
  if (!ev) throw new Error(`事件：找不到事件 ${id}`);
  return ev;
}

/** 事件目前能否出現：條件、重複上限都要符合 */
export function eventAvailable(state: GameState, ev: EventDef, data: GameData = gameData): boolean {
  if ((state.eventCounts[ev.id] ?? 0) >= ev.maxPerLife) return false;
  const c = ev.conditions;
  const realmIdx = data.realms.findIndex((r) => r.id === state.realmId);
  if (c.realmMin !== undefined && realmIdx < data.realms.findIndex((r) => r.id === c.realmMin)) return false;
  if (c.realmMax !== undefined && realmIdx > data.realms.findIndex((r) => r.id === c.realmMax)) return false;
  const years = Math.floor(state.ageMonths / 12);
  if (c.ageMin !== undefined && years < c.ageMin) return false;
  if (c.ageMax !== undefined && years > c.ageMax) return false;
  if (c.flags && !c.flags.every((f) => state.flags.includes(f))) return false;
  if (c.flagsNot && c.flagsNot.some((f) => state.flags.includes(f))) return false;
  if (c.schedules && !c.schedules.includes(state.schedule)) return false;
  if (c.bottleneck !== undefined && atBottleneck(state, data) !== c.bottleneck) return false;
  return true;
}

/** 依權重抽一個可出現的事件；沒有候選時回傳 null */
export function pickEvent(state: GameState, data: GameData = gameData): [EventDef | null, number] {
  const candidates = data.events.filter((ev) => eventAvailable(state, ev, data));
  if (candidates.length === 0) return [null, state.rngSeed];
  const weighted = candidates.map((ev) => ({
    ev,
    weight: eventWeight(
      ev.weight,
      ev.tone,
      state.attributes.fortune,
      ev.scheduleWeights?.[state.schedule] ?? 1,
      data.config,
    ),
  }));
  const [idx, seed] = pickWeighted(state.rngSeed, weighted);
  return [weighted[idx].ev, seed];
}

/** 選項的前提是否滿足 */
export function canChoose(state: GameState, choice: ChoiceDef): boolean {
  const r = choice.requires;
  if (!r) return true;
  if (r.spiritStones !== undefined && state.spiritStones < r.spiritStones) return false;
  for (const [id, n] of Object.entries(r.items ?? {})) if ((state.items[id] ?? 0) < n) return false;
  return true;
}

/** 套用效果，回傳新狀態與實際造成的變化；不處理死亡的日誌 */
function applyEffects(
  state: GameState,
  effects: Effects,
  month: number,
  data: GameData,
): { state: GameState; changes: Changes } {
  let s = state;
  const changes: Changes = {};

  if (effects.cultivation) {
    const amount = Math.round(stageNeed(realmOf(s, data), s.stage) * effects.cultivation);
    if (amount < 0) {
      const lost = Math.min(s.cultivation, -amount);
      if (lost > 0) {
        s = { ...s, cultivation: s.cultivation - lost };
        changes.cultivation = -Math.round(lost);
      }
    } else if (amount > 0 && !atBottleneck(s, data)) {
      s = resolveStages({ ...s, cultivation: s.cultivation + amount }, month, data);
      changes.cultivation = amount;
    }
  }
  if (effects.spiritStones) {
    const next = Math.max(0, s.spiritStones + effects.spiritStones);
    if (next !== s.spiritStones) changes.spiritStones = next - s.spiritStones;
    s = { ...s, spiritStones: next };
  }
  if (effects.lifespan) {
    s = { ...s, lifespanBonus: s.lifespanBonus + effects.lifespan };
    changes.lifespan = effects.lifespan;
  }
  if (effects.attributes) {
    const attrs = { ...s.attributes } as Attributes;
    const delta: Partial<Attributes> = {};
    for (const k of ATTRIBUTE_KEYS) {
      const d = effects.attributes[k];
      if (!d) continue;
      const next = Math.max(data.config.attributeMin, attrs[k] + d);
      if (next !== attrs[k]) delta[k] = next - attrs[k];
      attrs[k] = next;
    }
    s = { ...s, attributes: attrs };
    if (Object.keys(delta).length > 0) changes.attributes = delta;
  }
  if (effects.items) {
    const items = { ...s.items };
    const delta: Record<string, number> = {};
    for (const [id, n] of Object.entries(effects.items)) {
      const next = Math.max(0, (items[id] ?? 0) + n);
      if (next !== (items[id] ?? 0)) delta[id] = next - (items[id] ?? 0);
      items[id] = next;
    }
    s = { ...s, items };
    if (Object.keys(delta).length > 0) changes.items = delta;
  }
  if (effects.flags) {
    const flags = [...s.flags];
    for (const f of effects.flags) if (!flags.includes(f)) flags.push(f);
    s = { ...s, flags };
  }
  return { state: s, changes };
}

function dieByEvent(state: GameState, month: number, data: GameData): GameState {
  return addLog(
    { ...state, phase: "dead", pendingEvent: null },
    { month, kind: "death", realmId: state.realmId, stage: state.stage },
    data.config.logLimit,
  );
}

/** 見聞：直接套用效果並寫入日誌 */
function runAnecdote(state: GameState, ev: EventDef, month: number, data: GameData): GameState {
  const { state: s, changes } = applyEffects(state, ev.effects ?? {}, month, data);
  return addLog(
    s,
    {
      month,
      kind: "event",
      realmId: s.realmId,
      stage: s.stage,
      eventId: ev.id,
      ...(Object.keys(changes).length > 0 ? { changes } : {}),
    },
    data.config.logLimit,
  );
}

/** 玩家（或自動抉擇）選定選項：抽結果、套用效果、寫日誌，時間恢復 */
export function chooseEvent(state: GameState, choiceIndex: number, data: GameData = gameData): GameState {
  if (state.phase !== "living" || state.pendingEvent === null) return state;
  const ev = eventOf(state.pendingEvent, data);
  const choice = ev.choices?.[choiceIndex];
  if (!choice || !canChoose(state, choice)) return state;

  const weights = choice.outcomes.map((o) => ({
    weight: outcomeWeight(o.weight, o.weightPerAttribute, state.attributes),
  }));
  const [outcomeIdx, seed] = pickWeighted(state.rngSeed, weights);
  const outcome = choice.outcomes[outcomeIdx];
  const month = state.ageMonths;

  const applied = applyEffects({ ...state, rngSeed: seed, pendingEvent: null }, outcome.effects, month, data);
  let s = addLog(
    applied.state,
    {
      month,
      kind: "event",
      realmId: applied.state.realmId,
      stage: applied.state.stage,
      eventId: ev.id,
      choice: choiceIndex,
      outcome: outcomeIdx,
      ...(Object.keys(applied.changes).length > 0 ? { changes: applied.changes } : {}),
    },
    data.config.logLimit,
  );
  if (outcome.effects.death) s = dieByEvent(s, month, data);
  return s;
}

/** 第一個前提滿足的選項（自動抉擇用） */
export function firstAvailableChoice(state: GameState, ev: EventDef): number {
  const idx = (ev.choices ?? []).findIndex((c) => canChoose(state, c));
  return idx === -1 ? 0 : idx;
}

/** 切換自動抉擇；開啟時若正有抉擇待處理，立刻替玩家選第一個可選的選項 */
export function setAutoChoice(state: GameState, enabled: boolean, data: GameData = gameData): GameState {
  const s = { ...state, autoChoice: enabled };
  if (!enabled || s.phase !== "living" || s.pendingEvent === null) return s;
  return chooseEvent(s, firstAvailableChoice(s, eventOf(s.pendingEvent, data)), data);
}

/**
 * 每月呼叫：累加事件計時，達到門檻就抽事件。
 * 見聞直接寫入日誌；抉擇則暫停等待玩家（自動抉擇開啟時立即選第一個）。
 */
export function advanceEvents(state: GameState, month: number, data: GameData = gameData): GameState {
  const clock = state.eventClock + scheduleOf(state, data).eventRateMult;
  if (clock < state.eventThreshold) return { ...state, eventClock: clock };

  const [threshold, seed] = nextInt(state.rngSeed, data.config.eventIntervalMin, data.config.eventIntervalMax);
  let s: GameState = { ...state, eventClock: 0, eventThreshold: threshold, rngSeed: seed };
  const [ev, seed2] = pickEvent(s, data);
  s = { ...s, rngSeed: seed2 };
  if (!ev) return s;
  s = { ...s, eventCounts: { ...s.eventCounts, [ev.id]: (s.eventCounts[ev.id] ?? 0) + 1 } };

  if (ev.type === "anecdote") {
    s = runAnecdote(s, ev, month, data);
    return s;
  }
  s = { ...s, pendingEvent: ev.id };
  return s.autoChoice ? chooseEvent(s, firstAvailableChoice(s, ev), data) : s;
}

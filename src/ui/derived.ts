// 主畫面的衍生顯示：只讀狀態，不改任何數值、不碰時間。
import { stageNeed } from "../core/formulas";
import { atBottleneck, realmOf, scheduleOf } from "../core/progress";
import type { GameState } from "../core/state";
import { monthlyGain } from "../core/tick";
import type { GameData, ScheduleDef } from "../data/types";
import { fillSlots, type SlotValues } from "../data/slots";
import { itemPrice, snapshotOf, whenApplies } from "../core/worldeffects";
import { ATTRIBUTE_KEYS, type AttributeKey } from "../data/types";
import { talentCost } from "../core/formulas";
import type { Meta } from "../core/state";
import type { TalentDef } from "../data/types";
import { ATTR_LABEL, describeTalent } from "./format";

export interface PaceHint {
  /** eta：可估算距下一階段的時間；bottleneck：已卡瓶頸，不給倒數；none：無法估算 */
  kind: "eta" | "bottleneck" | "none";
  /** 以目前安排計的每月修為增量 */
  perMonth: number;
  /** 距下一階段的月數（只有 eta 有意義） */
  months: number;
  /** 以目前速度換算的現實秒數（只有 eta 有意義） */
  seconds: number;
}

/** 每月增量與距下一階段的約略時間；事件、丹藥、換安排都會讓實際時間不同，所以只是約略值 */
export function paceHint(state: GameState, data: GameData): PaceHint {
  const none: PaceHint = { kind: "none", perMonth: 0, months: 0, seconds: 0 };
  if (state.phase !== "living") return none;
  if (atBottleneck(state, data)) return { ...none, kind: "bottleneck" };
  const perMonth = monthlyGain(state, scheduleOf(state, data), data);
  if (!(perMonth > 0)) return none;
  const remaining = Math.max(0, stageNeed(realmOf(state, data), state.stage) - state.cultivation);
  const months = Math.ceil(remaining / perMonth);
  const seconds = (months * data.config.msPerMonth) / 1000 / Math.max(1, state.speed);
  return { kind: "eta", perMonth, months, seconds };
}

/** 修為增量的顯示：十以上取整，其餘一位小數 */
export function formatGain(perMonth: number): string {
  return perMonth >= 10 ? String(Math.round(perMonth)) : perMonth.toFixed(1);
}

/** 現實秒數的約略說法：不足九十秒用秒，不足一小時用分，其餘小時加分 */
export function formatDuration(seconds: number): string {
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} 秒`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

/** 壽元剩餘的整年數（至少 0） */
export function yearsLeft(ageMonths: number, lifespanYears: number): number {
  return Math.max(0, Math.ceil(lifespanYears - ageMonths / 12));
}

export interface ScheduleFacts {
  /** 每月修為增量 */
  perMonth: number;
  /** 修煉倍率（%），閉關為 100 */
  cultivationPct: number;
  /** 平均多少年遇到一件事（事件間隔取中位，除以頻率倍率） */
  eventEveryYears: number;
  /** 每月靈石期望值 */
  stonesPerMonth: number;
  /** 以此安排攢到一顆參考物品要幾年；沒有靈石收入時為 null */
  refYears: number | null;
  refName: string;
  refPrice: number;
  /** 每月身亡機率不為零時才有，供顯示「兇險」 */
  risky: boolean;
}

/** 一個日常安排的效率數字：全由目前狀態與資料算出，只供顯示 */
export function scheduleFacts(state: GameState, sched: ScheduleDef, data: GameData): ScheduleFacts {
  const { eventIntervalMin, eventIntervalMax, priceRefItemId } = data.config;
  const eventEveryYears = (eventIntervalMin + eventIntervalMax) / 2 / sched.eventRateMult / 12;
  const stonesPerMonth = sched.stones.chance * ((sched.stones.min + sched.stones.max) / 2);
  const refPrice = itemPrice(state, priceRefItemId, data);
  return {
    perMonth: monthlyGain(state, sched, data),
    cultivationPct: Math.round(sched.cultivationMult * 100),
    eventEveryYears,
    stonesPerMonth,
    refYears: stonesPerMonth > 0 ? refPrice / stonesPerMonth / 12 : null,
    refName: data.items.find((i) => i.id === priceRefItemId)?.name ?? priceRefItemId,
    refPrice,
    risky: sched.deathChance > 0,
  };
}

/** 安排按鈕上的效率說明，一行一項 */
export function scheduleFactLines(f: ScheduleFacts): string[] {
  const lines = [`修為 ${formatGain(f.perMonth)}／月（修煉 ${f.cultivationPct}%）`];
  lines.push(`約每 ${f.eventEveryYears.toFixed(1)} 年遇一件事`);
  if (f.stonesPerMonth > 0) {
    lines.push(`靈石約 ${f.stonesPerMonth.toFixed(1)}／月，攢一顆${f.refName}（${f.refPrice}）約 ${Math.ceil(f.refYears!)} 年`);
  }
  if (f.risky) lines.push("有性命之憂");
  return lines;
}

/** 目前世局下，這個安排旁該顯示的提示 */
export function scheduleHints(state: GameState, sched: ScheduleDef, slots: SlotValues, data: GameData): string[] {
  if (!sched.worldHints?.length) return [];
  const snap = snapshotOf(state, data);
  return sched.worldHints.filter((h) => whenApplies(snap, h.when)).map((h) => fillSlots(h.text, slots));
}

export interface AttrGuide {
  label: string;
  text: string;
}

/** 四個屬性與靈根各自影響什麼；百分比由 config 算出，不寫死在文字裡 */
export function attributeGuide(data: GameData): { attributes: Record<AttributeKey, AttrGuide>; spiritRoot: string } {
  const g = data.text.guide;
  const pct = (x: number): string => String(Math.round(x * 1000) / 10);
  const raw: Record<AttributeKey, string> = {
    bone: g.bone.replace("#", pct(data.config.bonePerPoint)),
    insight: g.insight,
    fortune: g.fortune.replace("#", pct(data.config.fortuneGoodWeight)),
    mind: g.mind.replace("#", pct(data.config.mindLossReduction)),
  };
  const attributes = {} as Record<AttributeKey, AttrGuide>;
  for (const k of ATTRIBUTE_KEYS) attributes[k] = { label: ATTR_LABEL[k], text: raw[k] };
  return { attributes, spiritRoot: g.spiritRoot };
}

export interface TalentAdvice {
  talentId: string;
  reason: string;
}

const fillText = (t: string, vars: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

/** 這個天賦被哪個境界的突破門檻要求；沒有則為 null */
function gateOf(talent: TalentDef, data: GameData): { realmName: string; level: number } | null {
  for (const r of data.realms) {
    const need = r.breakthroughRule?.requiresTalent;
    if (need && need.id === talent.id) return { realmName: r.name, level: need.level };
  }
  return null;
}

/**
 * 天賦頁的推薦：先看有沒有已走到、卻被天賦門檻擋住的境界（例如金丹之後要神光才能結嬰），
 * 否則依資料順序取第一個等級還低於 advice.upTo 的天賦。沒有可推薦的回傳 null。
 */
export function recommendTalent(meta: Meta, data: GameData): TalentAdvice | null {
  for (const r of data.realms) {
    const need = r.breakthroughRule?.requiresTalent;
    if (!need || !meta.reached.some((k) => k.startsWith(`${r.id}:`))) continue;
    const level = meta.talents[need.id] ?? 0;
    const talent = data.talents.find((t) => t.id === need.id);
    if (talent && level < need.level) {
      return { talentId: talent.id, reason: fillText(data.text.talentAdvice.gate, { realm: r.name, talent: talent.name, n: need.level, k: need.level - level }) };
    }
  }
  for (const t of data.talents) {
    if (t.advice && (meta.talents[t.id] ?? 0) < t.advice.upTo && (meta.talents[t.id] ?? 0) < t.maxLevel) return { talentId: t.id, reason: t.advice.reason };
  }
  return null;
}

/** 升一級的預覽：升級後的效果、道韻缺口、升到滿級的總價、突破門檻說明；已滿級回傳空陣列 */
export function talentPreview(talent: TalentDef, level: number, daoYun: number, data: GameData): string[] {
  if (level >= talent.maxLevel) return [];
  const t = data.text.talentAdvice;
  const cost = talentCost(talent, level);
  const lines = [fillText(t.preview, { n: level + 1, effect: describeTalent(talent, level + 1) })];
  const gate = gateOf(talent, data);
  if (gate) lines.push(level + 1 >= gate.level ? t.thresholdMet : fillText(t.threshold, { n: gate.level }));
  if (daoYun < cost) lines.push(fillText(t.shortfall, { k: cost - daoYun }));
  if (talent.maxLevel - level > 1) {
    let total = 0;
    for (let l = level; l < talent.maxLevel; l++) total += talentCost(talent, l);
    lines.push(fillText(t.total, { k: total }));
  }
  return lines;
}

// 主畫面的衍生顯示：只讀狀態，不改任何數值、不碰時間。
import { lifespanMonths, stageNeed } from "../core/formulas";
import { breakthroughRuleOf } from "../core/breakthrough";
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

export interface LifeForecast {
  /** 照目前安排，修為圓滿還要幾個月 */
  monthsToFull: number;
  /** 圓滿時壽元還剩幾個月（負數代表來不及） */
  leftAtFull: number;
  /** 突破要用的丹藥：缺的靈石（已持有或不需要則為 0）；不需要丹藥時為 null */
  pill: { name: string; price: number; missing: number } | null;
}

/** 壽元預算：照目前的安排推算何時圓滿、屆時壽元剩多少、突破丹藥還差多少靈石；只在需要手動突破的境界給 */
export function lifeForecast(state: GameState, data: GameData): LifeForecast | null {
  if (state.phase !== "living" || atBottleneck(state, data)) return null;
  const realm = realmOf(state, data);
  if (realm.breakthrough !== "manual") return null;
  const perMonth = monthlyGain(state, scheduleOf(state, data), data);
  if (!(perMonth > 0)) return null;
  let need = 0;
  for (let i = state.stage; i < realm.stageNames.length; i++) need += stageNeed(realm, i) - (i === state.stage ? state.cultivation : 0);
  const monthsToFull = Math.ceil(Math.max(0, need) / perMonth);
  const leftAtFull = lifespanMonths(realm, state.lifespanBonus) - state.ageMonths - monthsToFull;
  const pillId = breakthroughRuleOf(state, data)?.pillId;
  const item = pillId ? data.items.find((i) => i.id === pillId) : undefined;
  const pill = item && pillId ? { name: item.name, price: itemPrice(state, pillId, data), missing: 0 } : null;
  if (pill && pillId && (state.items[pillId] ?? 0) === 0) pill.missing = Math.max(0, pill.price - state.spiritStones);
  return { monthsToFull, leftAtFull, pill };
}

/** 壽元預算的一句話；來不及圓滿時直說 */
export function formatForecast(f: LifeForecast): string {
  const years = (m: number): number => Math.max(1, Math.round(m / 12));
  const head = f.leftAtFull < 0 ? "照目前的安排，壽元耗盡前來不及圓滿。" : `照目前的安排，約 ${years(f.monthsToFull)} 年後圓滿，屆時壽元約剩 ${Math.round(f.leftAtFull / 12)} 年。`;
  const pill = f.pill === null ? "" : f.pill.missing > 0 ? `${f.pill.name}要 ${f.pill.price} 靈石，還差 ${f.pill.missing}。` : `${f.pill.name}的錢備足了。`;
  return `${head}${pill}`;
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
  /** 宗門差事每月得到的貢獻；其他安排沒有 */
  contributionPerMonth?: number;
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
    ...(sched.id === data.sects.dutySchedule && state.sect ? { contributionPerMonth: data.sects.ranks[state.sect.rank].duty } : {}),
  };
}

/** 安排按鈕上的效率說明，一行一項 */
export function scheduleFactLines(f: ScheduleFacts): string[] {
  const lines = [`修為 ${formatGain(f.perMonth)}／月`, `${f.eventEveryYears.toFixed(1)} 年一事`];
  if (f.stonesPerMonth > 0) lines.push(`靈石 ${f.stonesPerMonth.toFixed(1)}／月`);
  if (f.contributionPerMonth !== undefined) lines.push(`貢獻 +${f.contributionPerMonth}／月`);
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
    if (total <= data.config.talentTotalShowMax) lines.push(fillText(t.total, { k: total }));
  }
  return lines;
}

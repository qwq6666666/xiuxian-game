// 「當前數值」面板的顯示資料：把影響修煉速度的每一項乘數攤開，只供顯示，全由核心函式與資料算出。
import { currentBreakthroughRate, currentFailLoss } from "../core/breakthrough";
import { fatigueMult } from "../core/fatigue";
import { talentBonus } from "../core/formulas";
import { artifactBonus } from "../core/forge";
import { methodEffect, methodOf } from "../core/method";
import { scheduleOf } from "../core/progress";
import { sectBonus } from "../core/sect";
import type { GameState } from "../core/state";
import { monthlyGain, lifespanYears, realmOf } from "../core/tick";
import type { GameData } from "../data/types";
import { yearsLeft, formatGain } from "./derived";

export interface StatRow {
  label: string;
  value: string;
}

export interface StatPanel {
  /** 主要數字，一行一項 */
  main: StatRow[];
  /** 每月修為的乘數明細（沒有加成的項目不列） */
  breakdown: StatRow[];
}

const signed = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 1000) / 10)}%`;
const times = (v: number): string => `×${Math.round(v * 1000) / 1000}`;

export function statPanel(state: GameState, data: GameData): StatPanel {
  const sched = scheduleOf(state, data);
  const realm = realmOf(state, data);
  const root = data.spiritRoots.find((r) => r.id === state.spiritRootId);
  const breakdown: StatRow[] = [
    { label: "基礎", value: String(data.config.baseCultivation) },
    { label: `靈根（${root?.name ?? "—"}）`, value: times(root?.mult ?? 1) },
    { label: "根骨", value: times(1 + state.attributes.bone * data.config.bonePerPoint) },
    { label: `境界（${realm.name}）`, value: times(realm.cultivationMult) },
    { label: `安排（${sched.name}）`, value: times(sched.cultivationMult) },
  ];
  const fatigue = fatigueMult(state, sched, data);
  if (fatigue < 1) {
    const years = Math.floor(state.retreatStreak / 12);
    breakdown.push({ label: "閉關疲勞", value: `${times(fatigue)}　連續閉關已 ${years} 年，出門走走可回復` });
  }
  const extras: [string, number][] = [
    ["出身", state.cultivationBonus],
    ["輪迴天賦", talentBonus(state.meta, data.talents, "cultivation")],
    ["宗門", sectBonus(state, data)],
    [`心法（${methodOf(state, data).name}）`, methodEffect(state, "cultivation", data)],
    ["法寶", artifactBonus(state, "cultivation", data)],
  ];
  for (const [label, v] of extras) if (v !== 0) breakdown.push({ label, value: signed(v) });

  const main: StatRow[] = [{ label: "心法", value: methodOf(state, data).name }, { label: "每月修為", value: `+${formatGain(monthlyGain(state, sched, data))}` }];
  const rule = realm.breakthroughRule;
  if (rule) {
    main.push({ label: "突破成功率", value: `${Math.round(currentBreakthroughRate(state, false, data) * 100)}%` });
    main.push({ label: "失敗損失", value: `${Math.round(currentFailLoss(state, data) * 100)}% 修為` });
    if (rule.tribulation) main.push({ label: "天劫", value: `${rule.tribulation.waves} 道` });
  }
  const lifespan = lifespanYears(state, data);
  main.push({ label: "壽元", value: `${lifespan} 年（餘 ${yearsLeft(state.ageMonths, lifespan)} 年）` });
  const every = (data.config.eventIntervalMin + data.config.eventIntervalMax) / 2 / (sched.eventRateMult * (1 + methodEffect(state, "eventRate", data))) / 12;
  main.push({ label: "事件間隔", value: `約 ${every.toFixed(1)} 年` });
  main.push({ label: "靈石", value: String(state.spiritStones) });
  return { main, breakdown };
}

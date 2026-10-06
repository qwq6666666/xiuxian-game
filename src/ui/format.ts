import type { VersusLine } from "../core/goals";
import { eraName } from "../core/era";
import type { OfflineSummary } from "../core/offline";
import type { Changes, LifeReview, LogEntry, Meta } from "../core/state";
import { DEFAULT_SLOTS, fillSlots, type SlotValues } from "../data/slots";
import { ATTRIBUTE_KEYS, type AttributeKey, type ChoiceRequires, type GameData, type RealmDef, type TalentDef } from "../data/types";

export const ATTR_LABEL: Record<AttributeKey, string> = {
  bone: "根骨",
  insight: "悟性",
  fortune: "氣運",
  mind: "心性",
};

function signed(n: number): string {
  return `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

/** 事件造成的數值變化，由介面另外顯示，不寫進敘述文字 */
export function formatChanges(changes: Changes | undefined, data: GameData, slots: SlotValues = DEFAULT_SLOTS): string[] {
  if (!changes) return [];
  const out: string[] = [];
  if (changes.cultivation) out.push(`修為 ${signed(changes.cultivation)}`);
  if (changes.spiritStones) out.push(`靈石 ${signed(changes.spiritStones)}`);
  if (changes.lifespan) out.push(`壽元上限 ${signed(changes.lifespan)} 年`);
  for (const k of ATTRIBUTE_KEYS) {
    const d = changes.attributes?.[k];
    if (d) out.push(`${ATTR_LABEL[k]} ${signed(d)}`);
  }
  if (changes.fragment) {
    const title = data.fragments.items.find((f) => f.id === changes.fragment)?.title ?? changes.fragment;
    out.push(`得殘卷《${fillSlots(title, slots)}》`);
  }
  for (const [id, n] of Object.entries(changes.items ?? {})) {
    if (n) out.push(`${data.items.find((i) => i.id === id)?.name ?? id} ${signed(n)}`);
  }
  return out;
}

/** 輪迴天賦在指定等級的總效果描述，例如「修煉速度 +15%」 */
export function describeTalent(talent: TalentDef, level: number): string {
  const pct = (v: number) => `${Math.round(v * level * 100)}%`;
  switch (talent.effect) {
    case "cultivation":
      return `修煉速度 +${pct(talent.perLevel)}`;
    case "rerolls":
      return `開局重擲 +${talent.perLevel * level} 次`;
    case "fortune":
      return `氣運 +${talent.perLevel * level}`;
    case "stoneCarry":
      return `保留上一世 ${pct(talent.perLevel)} 的靈石`;
    case "failLoss":
      return `突破失敗的修為損失 −${pct(talent.perLevel)}`;
    case "breakthroughAid":
      return `衝擊大關之時用得上，等級愈高愈有把握（${level} 級）`;
  }
}

/** 擲骰畫面用的輪迴加成摘要，沒有任何天賦時回傳空陣列 */
export function talentSummary(talents: Record<string, number>, data: GameData): string[] {
  return data.talents
    .filter((t) => (talents[t.id] ?? 0) > 0)
    .map((t) => `${t.name} ${talents[t.id]} 級：${describeTalent(t, talents[t.id])}`);
}

/** 一生回顧的標題 */
export function reviewTitle(review: LifeReview | null): string {
  if (review?.cause === "cleared") return "金丹大成";
  if (review?.cause === "yuanying") return "元嬰大成";
  if (review?.cause === "huashen") return "化神大成";
  if (review?.cause === "zuohua") return "閉關坐化";
  return "此生已盡";
}

/** 「享年一百一十九歲，終身練氣六層。臨終之際……」 */
export function formatReviewSummary(review: LifeReview, data: GameData): string {
  const realm = data.realms.find((r) => r.id === review.realmId);
  if (!realm) throw new Error(`回顧：找不到境界 ${review.realmId}`);
  const closing = data.text.review[review.cause][review.closing]?.text ?? "";
  const years = toChineseNumber(Math.floor(review.ageMonths / 12));
  return `享年${years}歲，終身${realmLabel(realm, review.stage)}。${closing}`;
}

/** 第 index 世的年號文字：「生於承平年間」。transition 用於第二世起的擲骰畫面。 */
export function eraBorn(index: number, data: GameData): string {
  return data.text.era.born.replace("{era}", eraName(index, data));
}

/** 擲骰畫面的換世句；第一世沒有上一世，回傳空字串 */
export function eraTransition(index: number, data: GameData): string {
  if (index <= 0) return "";
  return data.text.era.transition.replace("{prev}", eraName(index - 1, data)).replace("{era}", eraName(index, data));
}

/** 選項無法選擇的原因，可以選則回傳 null 。 */
export function choiceBlockReason(
  requires: ChoiceRequires | undefined,
  state: { spiritStones: number; items: Record<string, number>; attributes?: Record<AttributeKey, number>; meta?: { fragments: string[] } },
  data: GameData,
): string | null {
  if (!requires) return null;
  const lacks: string[] = [];
  if (requires.spiritStones !== undefined && state.spiritStones < requires.spiritStones) {
    lacks.push(`${requires.spiritStones} 靈石`);
  }
  for (const [id, n] of Object.entries(requires.items ?? {})) {
    if ((state.items[id] ?? 0) < n) lacks.push(`${data.items.find((i) => i.id === id)?.name ?? id} ×${n}`);
  }
  for (const [k, n] of Object.entries(requires.attributes ?? {})) {
    if ((state.attributes?.[k as AttributeKey] ?? 0) < n) lacks.push(`${ATTR_LABEL[k as AttributeKey]} ${n}`);
  }
  // 殘卷門檻不寫殘卷名稱，免得提前洩漏
  if ((requires.fragments ?? []).some((f) => !(state.meta?.fragments ?? []).includes(f))) lacks.push("一則尚未讀過的舊聞");
  return lacks.length > 0 ? `需要 ${lacks.join("、")}` : null;
}

const DIGITS = "零一二三四五六七八九";

/** 0–999 轉中文數字：十、三十二、一百一十九 */
export function toChineseNumber(n: number): string {
  if (n < 0 || n >= 1000 || !Number.isInteger(n)) return String(n);
  const ones = (x: number) => (x === 0 ? "" : DIGITS[x]);
  if (n < 10) return DIGITS[n];
  if (n < 20) return `十${ones(n % 10)}`;
  if (n < 100) return `${DIGITS[Math.floor(n / 10)]}十${ones(n % 10)}`;
  const h = Math.floor(n / 100);
  const r = n % 100;
  const head = `${DIGITS[h]}百`;
  if (r === 0) return head;
  if (r < 10) return `${head}零${DIGITS[r]}`;
  if (r < 20) return `${head}一十${ones(r % 10)}`;
  return `${head}${DIGITS[Math.floor(r / 10)]}十${ones(r % 10)}`;
}

const SEASONS = ["春", "夏", "秋", "冬"];

/** 「三十二歲春」：每三個月一季 */
export function formatAgeZh(ageMonths: number): string {
  const years = Math.floor(ageMonths / 12);
  const season = SEASONS[Math.floor((ageMonths % 12) / 3)];
  return `${toChineseNumber(years)}歲${season}`;
}

export function realmLabel(realm: RealmDef, stage: number): string {
  return `${realm.name}${realm.stageNames[stage] ?? ""}`;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/** 把日誌事件組成一行文字 */
export function formatLogEntry(entry: LogEntry, data: GameData, name = "你", slots: SlotValues = DEFAULT_SLOTS): string {
  const realm = data.realms.find((r) => r.id === entry.realmId);
  if (!realm) throw new Error(`日誌：找不到境界 ${entry.realmId}`);
  const log = data.text.log;
  const vars = {
    realm: realmLabel(realm, entry.stage),
    years: `${toChineseNumber(Math.floor(entry.month / 12))}歲`,
    item: data.items.find((i) => i.id === entry.itemId)?.name ?? entry.itemId ?? "",
    name,
    era: entry.eraIndex === undefined ? "" : eraName(entry.eraIndex, data),
  };
  const pick = (list: string[]) => list[entry.month % list.length];
  const pickBy = (list: string[], n: number) => list[n % list.length];
  let template: string;
  switch (entry.kind) {
    case "stageUp":
      template = pick(log.stageUp);
      break;
    case "realmUp":
      template = log.realmUp[entry.realmId] ?? log.stageUp[0];
      break;
    case "bottleneck":
      template = log.bottleneck;
      break;
    case "death":
      template = log.death;
      break;
    case "breakthroughSuccess":
      template = log.breakthroughSuccess[entry.realmId] ?? log.stageUp[0];
      break;
    case "breakthroughFail":
      template = pick(log.breakthroughFail);
      break;
    case "buy":
      template = pick(log.buy);
      break;
    case "find":
      template = pick(log.find);
      break;
    case "adventureDeath":
      template = log.adventureDeath;
      break;
    case "zuohua":
      template = log.zuohua;
      break;
    case "retreat": {
      const months = entry.retreatMonths ?? 0;
      const [mid, long] = data.config.offlineRetreatTierYears;
      const years = months / 12;
      const tier = years >= long ? log.retreat.long : years >= mid ? log.retreat.medium : log.retreat.short;
      const tail = entry.stop === "bottleneck" || entry.stop === "lifespan" ? log.retreat.stop[entry.stop] : [];
      template = pickBy(tier, months) + (tail.length > 0 ? pickBy(tail, months) : "");
      break;
    }
    case "era":
      template = pickBy(data.text.era.opening, entry.eraIndex ?? 0);
      break;
    case "event": {
      const ev = data.events.find((e) => e.id === entry.eventId);
      if (!ev) throw new Error(`日誌：找不到事件 ${entry.eventId}`);
      const outcome = entry.choice === undefined ? undefined : ev.choices?.[entry.choice]?.outcomes[entry.outcome ?? 0];
      template = fillSlots(`【${ev.title}】${outcome ? outcome.text : ev.text}`, slots);
      break;
    }
  }
  const body = fill(template, vars);
  // 死亡文字自帶「享年」，不再加年齡前綴
  return entry.kind === "death" || entry.kind === "adventureDeath" || entry.kind === "zuohua" || entry.kind === "era" ? body : `${formatAgeZh(entry.month)}，${body}`;
}

export interface CollectionSummary {
  total: number;
  /** 元嬰總次數 */
  yuanyingTotal: number;
  /** 化神總次數 */
  huashenTotal: number;
  rows: { id: string; name: string; desc: string; count: number; yuanying: number; huashen: number }[];
  /** 每種出身都至少通關一次 */
  allCleared: boolean;
}

/** 通關收藏的摘要：總次數與各出身的次數，出身名單讀資料檔 */
export function collectionSummary(meta: Meta, data: GameData): CollectionSummary {
  const rows = data.origins.map((o) => ({
    id: o.id,
    name: o.name,
    desc: o.desc,
    count: meta.clears[o.id] ?? 0,
    yuanying: meta.yuanying[o.id] ?? 0,
    huashen: meta.huashen[o.id] ?? 0,
  }));
  return {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    yuanyingTotal: rows.reduce((sum, r) => sum + r.yuanying, 0),
    huashenTotal: rows.reduce((sum, r) => sum + r.huashen, 0),
    rows,
    allCleared: rows.every((r) => r.count > 0),
  };
}

/** 離線回歸提示，例如「閉關 3 年 2 個月，修為增加 360。」；沒有閉關則回傳空字串 */
export function formatOffline(summary: OfflineSummary): string {
  if (summary.months <= 0) return "";
  const years = Math.floor(summary.months / 12);
  const months = summary.months % 12;
  const span = [years > 0 ? `${years} 年` : "", months > 0 ? `${months} 個月` : ""].filter(Boolean).join(" ");
  const reason = { elapsed: "", bottleneck: "，已至瓶頸", lifespan: "，壽元所剩不多，不宜再閉關" }[summary.stop];
  return `閉關 ${span}，修為增加 ${Math.round(summary.gained)}${reason}。`;
}

/** 與上一世的差別：把比較結果填進 text.json 的句子 */
export function formatVersus(line: VersusLine, data: GameData): string {
  const t = data.text.versus;
  const name = (b: { realmId: string; stage: number }): string => realmLabel(data.realms.find((r) => r.id === b.realmId)!, b.stage);
  switch (line.kind) {
    case "age":
      return fill(line.cmp === "more" ? t.ageMore : line.cmp === "less" ? t.ageLess : t.ageSame, { n: String(line.years) });
    case "progress":
      return fill(line.cmp === "far" ? t.progressFar : line.cmp === "short" ? t.progressShort : t.progressSame, { from: name(line.from), to: name(line.to) });
    case "origin":
      return t.originDiff;
  }
}

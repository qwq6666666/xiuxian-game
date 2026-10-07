import type { VersusLine } from "../core/goals";
import { eraName } from "../core/era";
import { outcomeWeight } from "../core/formulas";
import { composeRetreat } from "../core/retreattext";
import type { OfflineSummary } from "../core/offline";
import type { BestiaryEntry, Changes, LifeReview, LogEntry, Meta } from "../core/state";
import { DEFAULT_SLOTS, fillSlots, type SlotValues } from "../data/slots";
import { ATTRIBUTE_KEYS, type AttributeKey, type ChoiceDef, type ChoiceRequires, type GameData, type RealmDef, type TalentDef } from "../data/types";

export const ATTR_LABEL: Record<AttributeKey, string> = {
  bone: "根骨",
  insight: "悟性",
  fortune: "氣運",
  mind: "心性",
};

/** 小數（修為變化是比例換算出的實數）：不到 10 留一位，之後取整，免得顯示一長串小數 */
function shown(n: number): string {
  const a = Math.abs(n);
  if (Number.isInteger(a)) return String(a);
  return a < 10 ? a.toFixed(1) : String(Math.round(a));
}

function signed(n: number): string {
  return `${n > 0 ? "+" : "−"}${shown(n)}`;
}

/** 事件造成的數值變化，由介面另外顯示，不寫進敘述文字 */
export function formatChanges(changes: Changes | undefined, data: GameData, slots: SlotValues = DEFAULT_SLOTS): string[] {
  if (!changes) return [];
  const out: string[] = [];
  if (changes.cultivation && Math.abs(changes.cultivation) >= 0.05) out.push(`修為 ${signed(changes.cultivation)}`);
  if (changes.spiritStones) out.push(`靈石 ${signed(changes.spiritStones)}`);
  if (changes.lifespan) out.push(`壽元上限 ${signed(changes.lifespan)} 年`);
  if (changes.contribution) out.push(`貢獻 ${signed(changes.contribution)}`);
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
    case "keepArtifact":
      return `轉世時帶走 ${talent.perLevel * level} 件法寶`;
    case "breakthroughAid":
      return `衝擊大關之時用得上，等級愈高愈有把握（${level} 級）`;
    case "chartChoice":
      return `擲命盤時多得 ${talent.perLevel * level} 份功率相近的備選，擇一而行`;
    case "wish":
      return level >= 2 ? "可從已解鎖的全部目標中指定夙願" : "可從這一世的目標中指定夙願";
    case "omen":
      return `每世可窺看 ${talent.perLevel * level} 次抉擇的吉凶`;
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

/** 已備齊的門檻說明，例如「門檻：悟性 7、300 靈石」；沒有門檻回傳空陣列（沒備齊時由 choiceBlockReason 說明） */
export function choiceRequireLine(requires: ChoiceRequires | undefined, data: GameData): string[] {
  if (!requires) return [];
  const parts: string[] = [];
  if (requires.spiritStones !== undefined) parts.push(`${requires.spiritStones} 靈石`);
  for (const [id, n] of Object.entries(requires.items ?? {})) parts.push(`${data.items.find((i) => i.id === id)?.name ?? id} ×${n}`);
  for (const [k, n] of Object.entries(requires.attributes ?? {})) parts.push(`${ATTR_LABEL[k as AttributeKey]} ${n}`);
  if ((requires.fragments ?? []).length > 0) parts.push("一則舊聞");
  return parts.length > 0 ? [`門檻：${parts.join("、")}`] : [];
}

const consumedFlagsCache = new WeakMap<GameData, Set<string>>();

/** 有任何事件把它當成「需要具備」的旗標（事件前提、本世目標）；只看資料，不洩漏是哪件事 */
function consumedFlags(data: GameData): Set<string> {
  let set = consumedFlagsCache.get(data);
  if (!set) {
    set = new Set(data.events.flatMap((e) => e.conditions.flags ?? []));
    for (const g of data.goals) if (g.condition.kind === "flag") set.add(g.condition.flagId);
    consumedFlagsCache.set(data, set);
  }
  return set;
}

/** 這個選項的任一結果會留下日後有用的旗標（養育、結緣之類）：只提示「有後續」，不說是什麼 */
export function choiceHasFollowUp(choice: ChoiceDef, data: GameData): boolean {
  const used = consumedFlags(data);
  return choice.outcomes.some((o) => (o.effects.flags ?? []).some((flag) => used.has(flag)));
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
    sect: entry.sectName ?? "",
  };
  const pick = (list: string[]) => list[entry.month % list.length];
  const pickBy = (list: string[], n: number) => list[n % list.length];
  let template: string;
  switch (entry.kind) {
    case "stageUp":
      template = log.stageMilestone[`${entry.realmId}:${entry.stage}`] ?? pick(log.stageUp);
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
      if (entry.wave !== undefined) {
        const images = data.tribulation.images;
        template = log.tribulationFail.replace("{wave}", String(entry.wave)).replace("{fail}", images[(entry.wave - 1) % images.length].fail);
      } else template = pick(log.breakthroughFail);
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
    case "forgeDone":
      template = log.forge.done;
      break;
    case "forgeFail":
      template = log.forge.fail;
      break;
    case "alchemyDone":
      template = log.alchemy.done;
      break;
    case "alchemyFail":
      template = log.alchemy.fail;
      break;
    case "alchemyStop":
      template = log.alchemy.stop;
      break;
    case "sectJoin":
      template = log.sect.join;
      break;
    case "sectRefuse":
      template = log.sect.refuse;
      break;
    case "sectLeave":
      template = log.sect.leave;
      break;
    case "sectPromote":
      template = log.sect.promote[data.sects.ranks[entry.rank ?? 1]?.id] ?? log.sect.join;
      break;
    case "retreat": {
      template = composeRetreat(entry, data);
      break;
    }
    case "huntWin":
    case "huntLose":
    case "huntFlee":
    case "huntDraw": {
      const monster = data.monsters.monsters.find((m) => m.id === entry.monsterId);
      if (!monster) throw new Error(`日誌：找不到怪物 ${entry.monsterId}`);
      const t = data.monsters.rules.text;
      const line = entry.kind === "huntWin" ? monster.win : entry.kind === "huntLose" ? (monster.loseText ?? t.lose) : entry.kind === "huntDraw" ? (monster.drawText ?? t.draw) : entry.outcome === 1 ? (monster.fleeFailText ?? t.fleeFail) : (monster.fleeOkText ?? t.fleeOk);
      template = line.replace("{monster}", monster.name);
      break;
    }
    case "trialEnter":
    case "trialClear":
    case "trialFail": {
      const def = data.trials.trials.find((x) => x.id === entry.trialId);
      if (!def) throw new Error(`日誌：找不到秘境 ${entry.trialId}`);
      const t = data.trials.rules.text;
      // 失敗日誌的 outcome：0 敗退、1 中途抽身
      const line = entry.kind === "trialEnter" ? t.enter : entry.kind === "trialClear" ? t.clear : entry.outcome === 1 ? t.abandon : t.fail;
      template = line.replace("{trial}", def.name);
      break;
    }
    case "era":
      template = pickBy(data.text.era.opening, entry.eraIndex ?? 0);
      {
        // 開場句再接一句出身或靈根的話：偶數世講出身，奇數世講靈根（舊檔沒有欄位就只有通用句）
        const idx = entry.eraIndex ?? 0;
        const extra = idx % 2 === 0 ? data.text.era.origin[entry.originId ?? ""] : data.text.era.root[entry.spiritRootId ?? ""];
        if (extra && extra.length > 0) template += pickBy(extra, Math.floor(idx / 2));
      }
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
  rows: { id: string; name: string; desc: string; count: number; yuanying: number; huashen: number; fastest: { cleared?: number; yuanying?: number; huashen?: number } }[];
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
    fastest: { cleared: meta.fastest[`cleared:${o.id}`], yuanying: meta.fastest[`yuanying:${o.id}`], huashen: meta.fastest[`huashen:${o.id}`] },
  }));
  return {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    yuanyingTotal: rows.reduce((sum, r) => sum + r.yuanying, 0),
    huashenTotal: rows.reduce((sum, r) => sum + r.huashen, 0),
    rows,
    allCleared: rows.every((r) => r.count > 0),
  };
}

/** 勝滿幾次才解鎖怪物的見聞（lore） */
export const BESTIARY_LORE_WINS = 3;

export interface BestiarySummary {
  seen: number;
  rows: { id: string; name: string; realm: string; entry: BestiaryEntry | null; lore: string | null }[];
}

/** 怪物圖鑑：依境界與資料檔順序列出，沒遇過的只顯示境界；見聞勝滿三次才解鎖 */
export function bestiarySummary(meta: Meta, data: GameData): BestiarySummary {
  const rows = data.monsters.monsters.map((m) => {
    const entry = meta.bestiary[m.id] ?? null;
    return {
      id: m.id,
      name: m.name,
      realm: data.realms.find((r) => r.id === m.realm)?.name ?? m.realm,
      entry,
      lore: entry !== null && entry.win >= BESTIARY_LORE_WINS && m.lore !== undefined ? m.lore : null,
    };
  });
  return { seen: rows.filter((r) => r.entry !== null).length, rows };
}

export interface AcquaintanceRow {
  id: string;
  name: string;
  desc: string;
  /** 初遇是第幾世（從 1 起算）；沒遇過為 null */
  firstLife: number | null;
  /** 這一世與初遇相隔幾世 */
  gap: number | null;
}

/** 故人收藏：遇過的顯示名字與初遇世數，沒遇過的只留空位 */
export function acquaintanceRows(meta: Meta, data: GameData): AcquaintanceRow[] {
  return data.acquaintances.map((a) => {
    const seen = meta.met[a.id];
    return { id: a.id, name: a.name, desc: a.desc, firstLife: seen ? seen.firstLife + 1 : null, gap: seen ? meta.lives - seen.firstLife : null };
  });
}

/** 一個選項各結果的機率（百分比，加總為 100），依目前的屬性算；只有一個結果時回傳空陣列 */
export function choiceOdds(choice: ChoiceDef, attributes: Record<AttributeKey, number>): number[] {
  if (choice.outcomes.length < 2) return [];
  const weights = choice.outcomes.map((o) => outcomeWeight(o.weight, o.weightPerAttribute, attributes));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const pct = weights.map((w) => Math.round((w / total) * 100));
  // 四捨五入後補差額到最大的一項，讓總和剛好 100
  const diff = 100 - pct.reduce((a, b) => a + b, 0);
  pct[pct.indexOf(Math.max(...pct))] += diff;
  return pct;
}

/** 不管結果如何都必付的代價（所有結果都扣的最小值），例如「必付 8 靈石」；沒有則回傳空陣列 */
export function choiceSureCost(choice: ChoiceDef): string[] {
  const sure = (pick: (e: ChoiceDef["outcomes"][number]["effects"]) => number | undefined): number => {
    const losses = choice.outcomes.map((o) => -(pick(o.effects) ?? 0));
    return Math.min(...losses);
  };
  const out: string[] = [];
  const stones = sure((e) => e.spiritStones);
  if (stones > 0) out.push(`${stones} 靈石`);
  const years = sure((e) => e.lifespan);
  if (years > 0) out.push(`${years} 年壽元`);
  return out.length > 0 ? [`必付 ${out.join("、")}`] : [];
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

// 日誌分段與加強顯示：每十年一段、年紀當小標；有代價或有後續的紀錄標出來。純函式，與 DOM 無關。
import type { GameData } from "../data/types";
import type { LogEntry, LogKind } from "../core/state";
import { composeRetreat } from "../core/retreattext";
import { toChineseNumber } from "./format";

export type LogMark = "cost" | "follow" | "rare";

/** 本身就是損失的紀錄種類 */
const COST_KINDS: readonly LogKind[] = ["breakthroughFail", "huntLose", "adventureDeath", "alchemyFail", "forgeFail"];

/** 日誌紀錄的歲數 */
export const entryYears = (entry: LogEntry): number => Math.floor(entry.month / 12);

/** 「二十至二十九歲」；十歲以下合併成「九歲以前」 */
export function decadeLabel(startYear: number): string {
  if (startYear < 10) return "九歲以前";
  return `${toChineseNumber(startYear)}至${toChineseNumber(startYear + 9)}歲`;
}

export interface LogGroup {
  startYear: number;
  label: string;
  entries: LogEntry[];
}

/** 依歲數每十年分段；輸入順序即輸出順序（日誌由新到舊就由新到舊），同一段連續的才併在一起 */
export function groupByDecade(entries: readonly LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const entry of entries) {
    const years = entryYears(entry);
    const startYear = years < 10 ? 0 : Math.floor(years / 10) * 10;
    const last = groups[groups.length - 1];
    if (last && last.startYear === startYear) last.entries.push(entry);
    else groups.push({ startYear, label: decadeLabel(startYear), entries: [entry] });
  }
  return groups;
}

/** 小額的損失（茶錢、遇怪平手的零頭修為）不算代價，免得日誌處處標紅；只是顯示用的門檻，不影響遊戲 */
const LOSS_CULTIVATION = 1;
const LOSS_STONES = 10;
const LOSS_CONTRIBUTION = 5;

/** 這筆紀錄實際造成的明顯損失：修為、靈石、貢獻達門檻，或壽元、屬性減少 */
function hasLoss(entry: LogEntry): boolean {
  const c = entry.changes;
  if (!c) return false;
  if ((c.cultivation ?? 0) <= -LOSS_CULTIVATION || (c.spiritStones ?? 0) <= -LOSS_STONES || (c.lifespan ?? 0) < 0 || (c.contribution ?? 0) <= -LOSS_CONTRIBUTION) return true;
  return Object.values(c.attributes ?? {}).some((v) => (v ?? 0) < 0);
}

/** 這個事件實際選到的結果有沒有立旗標，且另有事件要求那面旗標（事件鏈的前段） */
function leadsOn(entry: LogEntry, data: GameData): boolean {
  const ev = data.events.find((e) => e.id === entry.eventId);
  if (!ev) return false;
  const outcome = entry.choice !== undefined ? ev.choices?.[entry.choice]?.outcomes[entry.outcome ?? 0] : undefined;
  const produced = new Set([...(ev.effects?.flags ?? []), ...(outcome?.effects.flags ?? [])]);
  if (produced.size === 0) return false;
  return data.events.some((other) => other.id !== ev.id && (other.conditions.flags ?? []).some((f) => produced.has(f)));
}

/** 加強顯示的標記：有代價（損失或失敗）、有後續（事件鏈前段）、偶得的閉關見聞 */
export function logMarks(entry: LogEntry, data: GameData): LogMark[] {
  const marks: LogMark[] = [];
  if (COST_KINDS.includes(entry.kind) || hasLoss(entry)) marks.push("cost");
  if (entry.kind === "event" && leadsOn(entry, data)) marks.push("follow");
  if (entry.kind === "retreat" && composeRetreat(entry, data).startsWith("【偶得】")) marks.push("rare");
  return marks;
}

export const MARK_LABEL: Record<LogMark, string> = { cost: "代價", follow: "後續", rare: "偶得" };

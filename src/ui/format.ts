import type { LogEntry } from "../core/state";
import type { GameData, RealmDef } from "../data/types";

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
export function formatLogEntry(entry: LogEntry, data: GameData): string {
  const realm = data.realms.find((r) => r.id === entry.realmId);
  if (!realm) throw new Error(`日誌：找不到境界 ${entry.realmId}`);
  const log = data.text.log;
  const vars = {
    realm: realmLabel(realm, entry.stage),
    years: `${toChineseNumber(Math.floor(entry.month / 12))}歲`,
  };
  let template: string;
  switch (entry.kind) {
    case "stageUp":
      template = log.stageUp[entry.month % log.stageUp.length];
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
  }
  const body = fill(template, vars);
  // 死亡文字自帶「享年」，不再加年齡前綴
  return entry.kind === "death" ? body : `${formatAgeZh(entry.month)}，${body}`;
}

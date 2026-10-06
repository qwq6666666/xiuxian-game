import { checkNum, checkStr, isPlainObject, type NumOpts, type Obj } from "../check";
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
} from "../types";

/** worldEvents 的 note 有自己的模板欄位，檢查參考名時先拿掉 */
export const SLOT_PATTERN_FOR_NOTE = /\{[^}]*\}/g;

export function fail(where: string, field: string, msg: string): never {
  throw new Error(`${where}：欄位 ${field} ${msg}`);
}

export function obj(raw: unknown, where: string): Obj {
  if (!isPlainObject(raw)) throw new Error(`${where}：內容必須是物件`);
  return raw;
}

export function list(raw: unknown, where: string): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${where}：內容必須是非空陣列`);
  }
  return raw;
}

export function num(o: Obj, key: string, where: string, opts: NumOpts = {}): number {
  return checkNum(o[key], key, opts, (f, m) => fail(where, f, m));
}

export function str(o: Obj, key: string, where: string, allowEmpty = false): string {
  return checkStr(o[key], key, allowEmpty, (f, m) => fail(where, f, m));
}

export function strList(o: Obj, key: string, where: string, allowEmptyItem = false): string[] {
  const v = o[key];
  if (!Array.isArray(v) || v.length === 0) fail(where, key, "必須是非空陣列");
  v.forEach((s, i) => {
    if (typeof s !== "string" || (!allowEmptyItem && s === "")) {
      fail(where, `${key}[${i}]`, "必須是字串");
    }
  });
  return v as string[];
}

export function numRecord(o: Obj, key: string, where: string, integer: boolean): Record<string, number> {
  const r = obj(o[key], `${where} 欄位 ${key}`);
  const out: Record<string, number> = {};
  for (const k of Object.keys(r)) out[k] = num(r, k, `${where} 欄位 ${key}`, { min: 0, integer });
  return out;
}

export function uniqueIds(items: { id: string }[], file: string): void {
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`${file}：id ${it.id} 重複`);
    seen.add(it.id);
  }
}

export function tierYears(o: Obj, file: string): [number, number] {
  const v = o.offlineRetreatTierYears;
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === "number" && n > 0) || !(v[0] < v[1])) {
    fail(file, "offlineRetreatTierYears", "必須是兩個由小到大的正數，例如 [5, 15]");
  }
  return [v[0], v[1]];
}

export function optStrList(o: Obj, key: string, where: string): string[] | undefined {
  if (o[key] === undefined) return undefined;
  const v = o[key];
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string" && s !== "")) {
    fail(where, key, "必須是字串陣列");
  }
  return v as string[];
}

export function intRecord(o: Obj, key: string, where: string, min?: number): Record<string, number> {
  const r = obj(o[key], `${where} 欄位 ${key}`);
  const out: Record<string, number> = {};
  for (const k of Object.keys(r)) out[k] = num(r, k, `${where} 欄位 ${key}`, { integer: true, min });
  return out;
}

export function attrRecord(o: Obj, key: string, where: string): Partial<Record<AttributeKey, number>> {
  const r = intRecord(o, key, where);
  for (const k of Object.keys(r)) {
    if (!(ATTRIBUTE_KEYS as readonly string[]).includes(k)) {
      fail(where, `${key}.${k}`, `不是合法的屬性，可用：${ATTRIBUTE_KEYS.join("、")}`);
    }
  }
  return r as Partial<Record<AttributeKey, number>>;
}

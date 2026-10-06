// 資料檔與存檔共用的欄位檢查：只做型別與範圍判斷，錯誤訊息的前綴由呼叫端的 fail 決定
// （資料檔：「檔名：欄位 X …」，存檔：「存檔：欄位 X …」），所以兩邊既有的錯誤訊息不變。

export type Obj = Record<string, unknown>;

/** 回報錯誤：field 是欄位路徑，msg 是描述；必須拋出例外 */
export type Fail = (field: string, msg: string) => never;

export interface NumOpts {
  min?: number;
  gt?: number;
  max?: number;
  integer?: boolean;
}

export function isPlainObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function checkNum(v: unknown, field: string, opts: NumOpts, fail: Fail): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(field, `必須是數字，目前為 ${JSON.stringify(v)}`);
  if (opts.integer && !Number.isInteger(v)) fail(field, `必須是整數，目前為 ${v}`);
  if (opts.min !== undefined && v < opts.min) fail(field, `必須 ≥ ${opts.min}，目前為 ${v}`);
  if (opts.gt !== undefined && v <= opts.gt) fail(field, `必須 > ${opts.gt}，目前為 ${v}`);
  if (opts.max !== undefined && v > opts.max) fail(field, `必須 ≤ ${opts.max}，目前為 ${v}`);
  return v;
}

/** allowEmpty 為 false 時，空字串視為錯誤 */
export function checkStr(v: unknown, field: string, allowEmpty: boolean, fail: Fail): string {
  if (typeof v !== "string" || (!allowEmpty && v === "")) {
    fail(field, `必須是${allowEmpty ? "" : "非空"}字串，目前為 ${JSON.stringify(v)}`);
  }
  return v;
}

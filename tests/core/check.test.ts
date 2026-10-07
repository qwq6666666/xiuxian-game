import { describe, expect, it } from "vitest";
import { checkNum, checkStr, isPlainObject, type Fail } from "../../src/data/check";

const fail: Fail = (field, msg) => {
  throw new Error(`測試：欄位 ${field} ${msg}`);
};

describe("共用欄位檢查", () => {
  it("checkNum 檢查型別、整數與範圍", () => {
    expect(checkNum(3, "x", { integer: true, min: 1, max: 5 }, fail)).toBe(3);
    expect(() => checkNum("3", "x", {}, fail)).toThrow('測試：欄位 x 必須是數字，目前為 "3"');
    expect(() => checkNum(NaN, "x", {}, fail)).toThrow("必須是數字");
    expect(() => checkNum(1.5, "x", { integer: true }, fail)).toThrow("必須是整數，目前為 1.5");
    expect(() => checkNum(0, "x", { min: 1 }, fail)).toThrow("必須 ≥ 1，目前為 0");
    expect(() => checkNum(1, "x", { gt: 1 }, fail)).toThrow("必須 > 1，目前為 1");
    expect(() => checkNum(6, "x", { max: 5 }, fail)).toThrow("必須 ≤ 5，目前為 6");
  });

  it("checkStr 依 allowEmpty 決定空字串是否合法", () => {
    expect(checkStr("a", "s", false, fail)).toBe("a");
    expect(checkStr("", "s", true, fail)).toBe("");
    expect(() => checkStr("", "s", false, fail)).toThrow("必須是非空字串");
    expect(() => checkStr(1, "s", true, fail)).toThrow("必須是字串，目前為 1");
  });

  it("isPlainObject 排除 null 與陣列", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
  });
});

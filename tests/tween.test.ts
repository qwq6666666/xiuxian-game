import { describe, expect, it } from "vitest";
import { tweenValue } from "../src/ui/tween";

describe("數字滾動", () => {
  it("線性內插：起點、中點、終點，超時停在終點", () => {
    expect(tweenValue(10, 20, 0, 1000)).toBe(10);
    expect(tweenValue(10, 20, 500, 1000)).toBe(15);
    expect(tweenValue(10, 20, 1000, 1000)).toBe(20);
    expect(tweenValue(10, 20, 5000, 1000)).toBe(20);
  });

  it("往下滾（損失）也成立；時長為零直接到終點", () => {
    expect(tweenValue(100, 40, 500, 1000)).toBe(70);
    expect(tweenValue(1, 9, 3, 0)).toBe(9);
  });

  it("負的經過時間視為尚未開始", () => {
    expect(tweenValue(5, 50, -10, 1000)).toBe(5);
  });
});

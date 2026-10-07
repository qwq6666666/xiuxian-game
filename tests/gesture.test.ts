import { describe, expect, it } from "vitest";
import { DEFAULT_SWIPE, neighbourOf, swipeOf } from "../src/ui/gesture";
import { HAPTIC_PATTERNS } from "../src/ui/haptics";

describe("滑動方向", () => {
  it("水平位移夠長、夠快、夠平才算；方向與位移符號一致", () => {
    expect(swipeOf(-90, 5, 200)).toBe("left");
    expect(swipeOf(90, -10, 200)).toBe("right");
  });

  it("位移太短、太慢或偏垂直都不算，避免捲動頁面時誤觸", () => {
    expect(swipeOf(-DEFAULT_SWIPE.minDistance + 1, 0, 100)).toBeNull();
    expect(swipeOf(-120, 0, DEFAULT_SWIPE.maxMs + 1)).toBeNull();
    expect(swipeOf(-80, 70, 200)).toBeNull();
    expect(swipeOf(0, 200, 100)).toBeNull();
  });

  it("相鄰項目：往左滑是下一個、往右滑是上一個，到頭不循環", () => {
    const tabs = ["a", "b", "c"];
    expect(neighbourOf(tabs, "b", "left")).toBe("c");
    expect(neighbourOf(tabs, "b", "right")).toBe("a");
    expect(neighbourOf(tabs, "c", "left")).toBeNull();
    expect(neighbourOf(tabs, "a", "right")).toBeNull();
    expect(neighbourOf(tabs, "zzz", "left")).toBeNull();
  });
});

describe("觸覺回饋", () => {
  it("震動長度都在克制範圍內（單次不超過 50 毫秒）", () => {
    for (const p of Object.values(HAPTIC_PATTERNS)) {
      const parts = Array.isArray(p) ? p : [p];
      expect(Math.max(...parts)).toBeLessThanOrEqual(50);
    }
  });
});

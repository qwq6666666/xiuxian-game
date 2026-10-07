// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { VEIL_MS, charDelays, createVeil } from "../../src/ui/scene/veil";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("全螢幕過場", () => {
  it("逐字延遲落在總長的 25%–75%，字距不超過 70 毫秒且遞增", () => {
    const d = charDelays(40, 3000);
    expect(d).toHaveLength(40);
    expect(d[0]).toBe(750);
    expect(d[39]).toBeLessThanOrEqual(2250);
    for (let i = 1; i < d.length; i++) {
      expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
      expect(d[i] - d[i - 1]).toBeLessThanOrEqual(71);
    }
    expect(charDelays(0, 1000)).toEqual([]);
    expect(charDelays(1, 1000)).toEqual([250]);
  });

  it("失敗最短，死亡與轉世最長", () => {
    expect(VEIL_MS.fail).toBeLessThan(VEIL_MS.success);
    expect(VEIL_MS.success).toBeLessThan(VEIL_MS.death);
  });

  it("播放時逐字拆成 span，點擊或按鍵可立即跳過，時間到自動結束", () => {
    vi.useFakeTimers();
    const veil = createVeil();
    veil.play("success", "你已築基。", "標題");
    const el = document.querySelector<HTMLElement>(".veil")!;
    expect(el.dataset.kind).toBe("success");
    expect(el.querySelectorAll(".veil-text span")).toHaveLength(5);
    expect(el.querySelector(".veil-title")?.textContent).toBe("標題");
    el.click();
    expect(document.querySelector(".veil")).toBeNull();

    veil.play("fail", "失敗。");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".veil")).toBeNull();

    veil.play("fail", "失敗。");
    vi.advanceTimersByTime(VEIL_MS.fail + 10);
    expect(document.querySelector(".veil")).toBeNull();
  });

  it("新的過場取代正在播的；空文字不播", () => {
    vi.useFakeTimers();
    const veil = createVeil();
    veil.play("success", "甲。");
    veil.play("death", "乙。");
    expect(document.querySelectorAll(".veil")).toHaveLength(1);
    expect(document.querySelector<HTMLElement>(".veil")!.dataset.kind).toBe("death");
    veil.skip();
    veil.play("fail", "");
    expect(document.querySelector(".veil")).toBeNull();
  });

  it("偏好減少動態時完全不播", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    createVeil().play("death", "此生已盡。");
    expect(document.querySelector(".veil")).toBeNull();
  });
});

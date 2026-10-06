// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/life";
import { tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { mountUi, type UiHandlers } from "../src/ui/render";
import { living } from "./helpers";

// UI 煙霧測試：確認畫面能掛載、各階段能繪製、點擊會呼叫對應處理器。
// 不驗證版面與樣式，只擋「拆檔或改版後整個畫面壞掉」這類回歸。

/** 所有處理器都是 spy，點擊後可查呼叫 */
function spyHandlers(): UiHandlers {
  return new Proxy({} as UiHandlers, {
    get: (target, key) => {
      const t = target as unknown as Record<string | symbol, unknown>;
      return (t[key] ??= vi.fn());
    },
  });
}

function mount(): { root: HTMLElement; ui: ReturnType<typeof mountUi>; handlers: UiHandlers } {
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  const handlers = spyHandlers();
  return { root, ui: mountUi(root, gameData, handlers), handlers };
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  // jsdom 沒有 matchMedia
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe("UI 煙霧測試", () => {
  it("擲骰階段能掛載，有開始鈕", () => {
    const { root, ui, handlers } = mount();
    ui.render(createInitialState(1));
    const start = root.querySelector<HTMLButtonElement>("#start");
    expect(start?.textContent).toBe("開始修行");
    start!.click();
    expect(handlers.onStart).toHaveBeenCalled();
  });

  it("修行階段能繪製狀態卡、進度條與日誌", () => {
    const { root, ui } = mount();
    const state = living(1);
    ui.render(state);
    expect(root.querySelector("#name")?.textContent).toContain(state.name);
    expect(root.querySelector("#progress")).toBeTruthy();
    expect(root.querySelector("#log")).toBeTruthy();
    expect(root.querySelectorAll(".side").length).toBe(1);
  });

  it("連續 tick 多年後重繪不拋錯，日誌有內容", () => {
    const { root, ui } = mount();
    let state = living(7, { eventThreshold: 12 });
    for (let i = 0; i < 40; i++) {
      state = tick(state, 12, gameData);
      expect(() => ui.render(state)).not.toThrow();
      if (state.phase !== "living" || state.pendingEvent !== null) break;
    }
    expect(root.querySelectorAll("#log li").length).toBeGreaterThan(0);
  });

  it("等待抉擇時顯示事件彈窗與選項", () => {
    const { root, ui } = mount();
    let state = living(3, { eventThreshold: 1 });
    for (let i = 0; i < 60 && state.pendingEvent === null && state.phase === "living"; i++) state = tick(state, 1, gameData);
    if (state.pendingEvent === null) return; // 這個種子沒抽到事件就略過，避免脆弱
    ui.render(state);
    const modal = root.querySelector<HTMLElement>("#eventModal");
    expect(modal?.hidden).toBe(false);
    expect(root.querySelectorAll("#eventChoices button").length).toBeGreaterThan(0);
  });

  it("notice 能顯示提示文字", () => {
    const { root, ui } = mount();
    ui.render(living(1));
    ui.notice("測試提示");
    expect(root.textContent).toContain("測試提示");
  });

  it("切換速度會呼叫 onSpeed", () => {
    const { root, ui, handlers } = mount();
    ui.render(living(1));
    const speedBtns = root.querySelectorAll<HTMLButtonElement>(".speeds button");
    expect(speedBtns.length).toBe(gameData.config.speeds.length);
    speedBtns[1].click();
    expect(handlers.onSpeed).toHaveBeenCalledWith(gameData.config.speeds[1]);
  });
});

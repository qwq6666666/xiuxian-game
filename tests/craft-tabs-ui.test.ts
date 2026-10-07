// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gameData } from "../src/data/load";
import { mountUi, type UiHandlers } from "../src/ui/render";
import { living } from "./helpers";

const handlers = (): UiHandlers => new Proxy({} as UiHandlers, {
  get: (target, key) => {
    const record = target as unknown as Record<string | symbol, unknown>;
    return (record[key] ??= vi.fn());
  },
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe("煉製分類分頁", () => {
  it("面板資料在遊戲推進後重畫，仍保留玩家選的符籙頁", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const ui = mountUi(root, gameData, handlers());
    const state = living(1, { realmId: "lianqi", stage: 1 });
    ui.render(state);
    root.querySelector<HTMLButtonElement>('#sideTabs button[data-go="make"]')!.click();

    const talisman = Array.from(root.querySelectorAll<HTMLButtonElement>('#alchemyBox [role="tab"]'))
      .find((tab) => tab.textContent === "符籙")!;
    talisman.click();
    expect(talisman.getAttribute("aria-selected")).toBe("true");

    // 材料數量會進入 alchemyKey，確保這次 render 真的重建煉製面板。
    ui.render({
      ...state,
      ageMonths: state.ageMonths + 1,
      items: { ...state.items, lingcao: (state.items.lingcao ?? 0) + 1 },
    });
    const selected = root.querySelector<HTMLButtonElement>('#alchemyBox [role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toBe("符籙");
  });
});

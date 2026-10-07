// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stageNeed } from "../src/core/formulas";
import { gameData } from "../src/data/load";
import { mountUi, type UiHandlers } from "../src/ui/render";
import { statPanel } from "../src/ui/statinfo";
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

describe("M46 介面", () => {
  it("築基閉關疲勞時才在修為乘數明細顯示倍率與回復提示", () => {
    const fresh = statPanel(living(1, { realmId: "zhuji", schedule: "retreat", retreatStreak: 120 }), gameData);
    expect(fresh.breakdown.some((row) => row.label === "閉關疲勞")).toBe(false);

    const tired = statPanel(living(1, { realmId: "zhuji", schedule: "retreat", retreatStreak: 150 }), gameData);
    expect(tired.breakdown.find((row) => row.label === "閉關疲勞")).toEqual({
      label: "閉關疲勞",
      value: "×0.95　連續閉關已 12 年，出門走走可回復",
    });
  });

  it("突破成功率拆出非零來源，勾選丹藥後即時加入丹藥加成", () => {
    const root = document.querySelector<HTMLElement>("#app")!;
    const ui = mountUi(root, gameData, handlers());
    const base = living(1);
    const realm = gameData.realms.find((entry) => entry.id === "lianqi")!;
    const state = {
      ...base,
      realmId: "lianqi",
      stage: realm.stageNames.length - 1,
      cultivation: stageNeed(realm, realm.stageNames.length - 1),
      breakthroughStudy: 2,
      attributes: { ...base.attributes, insight: 2 },
      items: { ...base.items, zhuji_dan: 1 },
    };
    ui.render(state);

    const info = root.querySelector<HTMLElement>("#btInfo")!;
    expect(info.textContent).toContain("基礎");
    expect(info.textContent).toContain("悟性");
    expect(info.textContent).toContain("心得 8%（失敗累積的心得）");
    expect(info.textContent).not.toContain("丹藥 20%");

    const pill = root.querySelector<HTMLInputElement>("#pill")!;
    pill.checked = true;
    pill.dispatchEvent(new Event("change"));
    expect(info.textContent).toContain("丹藥 20%");
  });
});

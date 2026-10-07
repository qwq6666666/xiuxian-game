// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../../src/core/life";
import { serialize } from "../../src/core/save";
import { gameData } from "../../src/data/load";
import { clearSlot, describeState, readActiveSlot, slotInfos, slotKeys, writeActiveSlot } from "../../src/slots";

describe("存檔槽", () => {
  beforeEach(() => localStorage.clear());

  it("第 1 槽沿用原本的鍵，其他槽用編號", () => {
    expect(slotKeys(1)).toEqual({ save: "xiuxian-save", seen: "xiuxian-last-seen" });
    expect(slotKeys(3)).toEqual({ save: "xiuxian-save-3", seen: "xiuxian-last-seen-3" });
  });

  it("使用中的槽預設第 1 槽，不合法的值也退回第 1 槽", () => {
    expect(readActiveSlot()).toBe(1);
    writeActiveSlot(2);
    expect(readActiveSlot()).toBe(2);
    localStorage.setItem("xiuxian-slot", "9");
    expect(readActiveSlot()).toBe(1);
    localStorage.setItem("xiuxian-slot", "abc");
    expect(readActiveSlot()).toBe(1);
  });

  it("逐槽列出空、正常、損毀三種狀態；使用中的槽用即時摘要", () => {
    localStorage.setItem(slotKeys(2).save, serialize(createInitialState(5, gameData)));
    localStorage.setItem(slotKeys(3).save, "不是存檔");
    const infos = slotInfos(gameData, 1, "即時摘要");
    expect(infos.map((i) => i.status)).toEqual(["ok", "ok", "broken"]);
    expect(infos[0]).toMatchObject({ slot: 1, active: true, summary: "即時摘要" });
    expect(infos[1].active).toBe(false);
    expect(infos[1].summary).toContain("第 1 世");
  });

  it("沒存過的槽是空的", () => {
    expect(slotInfos(gameData, 2, "x").map((i) => i.status)).toEqual(["empty", "ok", "empty"]);
  });

  it("清空只動指定的槽（含最後存檔時間）", () => {
    for (const s of [1, 2]) {
      localStorage.setItem(slotKeys(s).save, "a");
      localStorage.setItem(slotKeys(s).seen, "1");
    }
    clearSlot(2);
    expect(localStorage.getItem(slotKeys(2).save)).toBeNull();
    expect(localStorage.getItem(slotKeys(2).seen)).toBeNull();
    expect(localStorage.getItem(slotKeys(1).save)).toBe("a");
  });

  it("摘要含姓名、境界與世數", () => {
    const s = createInitialState(7, gameData);
    const text = describeState(s, gameData);
    expect(text).toContain(s.name);
    expect(text).toContain("歲");
  });
});

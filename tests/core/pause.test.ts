import { describe, expect, it } from "vitest";
import { gameData } from "../../src/data/load";
import { isFree, isWaiting, settleEncounter } from "../../src/core/pause";
import { living } from "../helpers";

describe("時間暫停的判斷", () => {
  it("修行中且沒有待處理的事：可自由行動", () => {
    const s = living(1);
    expect(isWaiting(s)).toBe(false);
    expect(isFree(s)).toBe(true);
  });

  it("等待抉擇、天劫、遇怪任一個都算有事等著", () => {
    const s = living(1);
    expect(isWaiting({ ...s, pendingEvent: "x" })).toBe(true);
    expect(isFree({ ...s, pendingEvent: "x" })).toBe(false);
    expect(isWaiting({ ...s, tribulation: {} as never })).toBe(true);
    expect(isWaiting({ ...s, encounter: {} as never })).toBe(true);
  });

  it("不在修行中就不是自由狀態", () => {
    expect(isFree({ ...living(1), phase: "dead" })).toBe(false);
  });

  it("沒有遇怪或沒開自動抉擇時，原樣回傳", () => {
    const s = living(1);
    expect(settleEncounter(s, gameData)).toBe(s);
    const e = { ...s, encounter: {} as never, autoChoice: false };
    expect(settleEncounter(e, gameData)).toBe(e);
  });
});

import { describe, expect, it } from "vitest";
import { lifespanMonths } from "../../src/core/formulas";
import { realmOf } from "../../src/core/progress";
import { gameData } from "../../src/data/load";
import { holdFor } from "../../src/ui/hold";
import { living } from "../helpers";

describe("holdFor：關鍵節點自動暫停", () => {
  it("平常不暫停", () => {
    expect(holdFor(living(1), gameData)).toBeNull();
  });
  it("壽元不到一年時暫停", () => {
    const s = living(1);
    const max = lifespanMonths(realmOf(s, gameData), s.lifespanBonus);
    const hold = holdFor({ ...s, ageMonths: max - gameData.config.holdLifespanMonths }, gameData);
    expect(hold?.key).toBe(`end:${s.meta.lives}`);
    expect(holdFor({ ...s, ageMonths: max - gameData.config.holdLifespanMonths - 1 }, gameData)).toBeNull();
  });
  it("有待決事件時不暫停（本來就停著）", () => {
    const s = living(1);
    const max = lifespanMonths(realmOf(s, gameData), s.lifespanBonus);
    expect(holdFor({ ...s, ageMonths: max - 1, encounter: {} as never }, gameData)).toBeNull();
  });
});

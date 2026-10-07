import { describe, expect, it } from "vitest";
import { snapshotOf } from "../../src/core/world/worldeffects";
import type { GameState } from "../../src/core/state";
import { gameData as data } from "../../src/data/load";
import { joinInfo, sectPanel } from "../../src/ui/panels/sectinfo";
import { scheduleFactLines, scheduleFacts } from "../../src/ui/derived";
import { living } from "../helpers";

function atGate(patch: Partial<GameState> = {}): { state: GameState; sectId: string } {
  for (let seed = 1; seed < 200; seed++) {
    const base = living(seed, { realmId: "lianqi", stage: 3, ageMonths: 40 * 12 });
    const sect = snapshotOf(base, data).sects.find((s) => s.rank === "great" && s.state !== "closed" && s.state !== "fallen");
    if (sect) return { state: { ...base, travel: { ...base.travel, locationId: `sect:${sect.id}` }, ...patch }, sectId: sect.id };
  }
  throw new Error("找不到世界");
}

describe("宗門介面資料", () => {
  it("在山門外且夠格：可以求入宗，沒有不能的原因", () => {
    const { state, sectId } = atGate();
    const info = joinInfo(state, sectId, data)!;
    expect(info.canJoin).toBe(true);
    expect(info.reason).toBeNull();
    expect(info.rate).toBeGreaterThan(0);
  });
  it("不能入時說明原因：不在山門、境界不足、已試過、已入宗", () => {
    const { state, sectId } = atGate();
    expect(joinInfo({ ...state, travel: { ...state.travel, locationId: "village" } }, sectId, data)!.reason).toContain("走到");
    expect(joinInfo({ ...state, stage: 0 }, sectId, data)!.reason).toContain("練氣");
    expect(joinInfo({ ...state, sectsTried: [sectId] }, sectId, data)!.reason).toContain("叩過");
    const member = { ...state, sect: { id: sectId, rank: 0, contribution: 0, joinedAge: state.ageMonths } };
    expect(joinInfo(member, sectId, data)!.reason).toContain("已是");
    expect(joinInfo(state, "ghost", data)).toBeNull();
  });
  it("宗門面板：沒入宗為 null；入宗後有位階、加成、月例、同門與下一階條件", () => {
    const { state, sectId } = atGate();
    expect(sectPanel(state, data)).toBeNull();
    const member = { ...state, sect: { id: sectId, rank: 0, contribution: 150, joinedAge: state.ageMonths } };
    const panel = sectPanel(member, data)!;
    expect(panel.rankName).toBe("外門弟子");
    expect(panel.bonusPct).toBeGreaterThan(0);
    expect(panel.next).toMatchObject({ name: "內門弟子", contribution: 200, contributionMet: false, realmMet: false });
    expect(panel.canPromote).toBe(false);
    expect(Object.values(panel.companions)).toHaveLength(3);
    const ready = sectPanel({ ...member, realmId: "zhuji", sect: { ...member.sect, contribution: 200 } }, data)!;
    expect(ready.canPromote).toBe(true);
  });
  it("宗門差事的效率說明帶出每月貢獻", () => {
    const { state, sectId } = atGate();
    const member = { ...state, sect: { id: sectId, rank: 1, contribution: 0, joinedAge: state.ageMonths } };
    const duty = data.schedules.find((s) => s.id === data.sects.dutySchedule)!;
    expect(scheduleFactLines(scheduleFacts(member, duty, data)).join("")).toContain(`貢獻 +${data.sects.ranks[1].duty}`);
    expect(scheduleFactLines(scheduleFacts(state, data.schedules[0], data)).join("")).not.toContain("貢獻");
  });
});

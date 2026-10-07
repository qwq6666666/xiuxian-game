// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createAchievementWatch } from "../../src/ui/achievementWatch";
import { emptyMeta } from "../../src/core/state";
import { gameData } from "../../src/data/load";

describe("成就達成提示", () => {
  beforeEach(() => localStorage.clear());

  it("第一次執行只記下已達成的，不提示", () => {
    const messages: string[] = [];
    const watch = createAchievementWatch(gameData, (m) => (messages.push(m), true));
    watch({ ...emptyMeta(), lives: 1 });
    expect(messages).toEqual([]);
    expect(JSON.parse(localStorage.getItem("xiuxian-ach-seen")!)).toContain("first_life");
  });

  it("之後新達成的才提示，而且只提示一次", () => {
    const messages: string[] = [];
    const watch = createAchievementWatch(gameData, (m) => (messages.push(m), true));
    watch(emptyMeta());
    watch({ ...emptyMeta(), lives: 1 });
    expect(messages).toEqual(["成就達成：初入輪迴"]);
    watch({ ...emptyMeta(), lives: 1 });
    expect(messages).toHaveLength(1);
  });

  it("提示列正忙時不記成看過，下一次再提示", () => {
    let busy = true;
    const messages: string[] = [];
    const watch = createAchievementWatch(gameData, (m) => (busy ? false : (messages.push(m), true)));
    watch(emptyMeta());
    const meta = { ...emptyMeta(), lives: 1 };
    watch(meta);
    expect(messages).toEqual([]);
    busy = false;
    watch(meta);
    expect(messages).toEqual(["成就達成：初入輪迴"]);
  });
});

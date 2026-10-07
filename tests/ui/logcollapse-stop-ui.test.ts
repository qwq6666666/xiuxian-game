import { describe, expect, it } from "vitest";
import type { LogEntry, OfflineStop } from "../../src/core/state";
import { composeRetreat } from "../../src/core/character/retreattext";
import { gameData } from "../../src/data/load";
import { collapseRoutineRetreats } from "../../src/ui/panels/logGroups";

const retreat = (years: number, no: number, stop: OfflineStop): LogEntry => ({
  month: years * 12,
  kind: "retreat",
  realmId: "zhuji",
  stage: 2,
  retreatMonths: 24,
  stop,
  retreatNo: no,
  retreatSeed: 456,
});

describe("特殊原因收關的日誌顯示", () => {
  it("瓶頸與壽元收關保留原文，並中斷前後的例行閉關收合", () => {
    const bottleneck = retreat(76, 3, "bottleneck");
    const lifespan = retreat(72, 5, "lifespan");
    const rows = collapseRoutineRetreats([
      retreat(78, 2, "elapsed"),
      bottleneck,
      retreat(74, 4, "elapsed"),
      lifespan,
      retreat(70, 6, "elapsed"),
    ], gameData);

    expect(rows.map((row) => row.kind)).toEqual(["entry", "entry", "entry", "entry", "entry"]);
    expect(composeRetreat(bottleneck, gameData)).toMatch(/瓶頸|關隘|靈氣已滿|破關/);
    expect(composeRetreat(lifespan, gameData)).toMatch(/壽元|坐化|剩下的日子|餘年/);
  });
});

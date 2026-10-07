import { describe, expect, it } from "vitest";
import type { LogEntry } from "../../src/core/state";
import { composeRetreat } from "../../src/core/character/retreattext";
import { gameData as data } from "../../src/data/load";
import { collapseRoutineRetreats } from "../../src/ui/panels/logGroups";

const retreat = (years: number, no: number, months = 6): LogEntry => ({
  month: years * 12,
  kind: "retreat",
  realmId: "lianqi",
  stage: 2,
  retreatMonths: months,
  stop: "elapsed",
  retreatNo: no,
  retreatSeed: 123,
});

describe("日誌的例行閉關收合", () => {
  it("只合併相鄰的例行閉關，其他日誌會中斷", () => {
    const event: LogEntry = { month: 71 * 12, kind: "stageUp", realmId: "lianqi", stage: 3 };
    const rows = collapseRoutineRetreats([retreat(79, 3), retreat(74, 2), event, retreat(70, 1)], data);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: "retreats", label: "七十四至七十九歲，閉關兩次" });
    expect(rows[1]).toEqual({ kind: "entry", entry: event });
    expect(rows[2]).toEqual({ kind: "entry", entry: retreat(70, 1) });
  });

  it("偶得見聞保留原文，並中斷前後的例行閉關", () => {
    let rare: LogEntry | undefined;
    for (let no = 0; no < 5000; no++) {
      const candidate = retreat(75, no, 36);
      if (composeRetreat(candidate, data).startsWith("【偶得】")) {
        rare = candidate;
        break;
      }
    }
    expect(rare).toBeDefined();
    const rows = collapseRoutineRetreats([retreat(79, 2), rare!, retreat(72, 1)], data);
    expect(rows.map((row) => row.kind)).toEqual(["entry", "entry", "entry"]);
  });
});

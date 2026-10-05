// 無介面模擬：跑 N 世，印出享年與最高境界的統計。用法：npm run sim -- [局數] [種子]
// 玩家策略很簡單：一直閉關，卡在瓶頸就突破（有築基丹就吃）。
import { attemptBreakthrough, canBreakthrough } from "../src/core/breakthrough";
import { createInitialState, startLife } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import { atBottleneck, tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { realmLabel } from "../src/ui/format";

const runs = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 1);

const reached = new Map<string, number>();
let totalMonths = 0;
let seed = baseSeed;
for (let i = 0; i < runs; i++) {
  const [v, s] = nextRandom(seed);
  seed = s;
  let state = startLife(createInitialState(Math.floor(v * 2 ** 32), gameData));
  const start = state.ageMonths;
  while (state.phase === "living") {
    state = tick(state, 1, gameData);
    // 卡在瓶頸時反覆嘗試突破，直到成功或老死
    while (state.phase === "living" && atBottleneck(state, gameData) && canBreakthrough(state, gameData)) {
      state = attemptBreakthrough(state, true, gameData);
      if (atBottleneck(state, gameData)) break;
    }
  }
  totalMonths += state.ageMonths - start;
  const realm = gameData.realms.find((r) => r.id === state.realmId)!;
  const label = state.phase === "cleared" ? "通關" : realmLabel(realm, state.stage);
  reached.set(label, (reached.get(label) ?? 0) + 1);
}

console.log(`模擬 ${runs} 世（種子 ${baseSeed}）`);
console.log(`平均在世 ${(totalMonths / runs / 12).toFixed(1)} 年（約 ${(totalMonths / runs / 60).toFixed(1)} 分鐘 @×1）`);
console.log("終身最高境界分布：");
for (const [label, n] of [...reached.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${label}  ${((n / runs) * 100).toFixed(1)}%`);
}

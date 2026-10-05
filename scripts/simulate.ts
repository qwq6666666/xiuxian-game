// 無介面模擬：跑 N 世，印出享年、最高境界、事件與死因統計。用法：npm run sim -- [局數] [種子]
// 玩家策略很簡單：一直閉關，卡在瓶頸就突破（有築基丹就吃），抉擇則在可選的選項中隨機挑一個。
import { attemptBreakthrough, canBreakthrough } from "../src/core/breakthrough";
import { canChoose, chooseEvent, eventOf } from "../src/core/events";
import { createInitialState, startLife } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import { atBottleneck, tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { realmLabel } from "../src/ui/format";

const runs = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 1);

const reached = new Map<string, number>();
const eventTotals = new Map<string, number>();
const choiceCounts: number[] = [];
const causes = { lifespan: 0, event: 0, adventure: 0 };
let totalMonths = 0;
let seed = baseSeed;
let policySeed = baseSeed + 7919;

/** 從可選的選項中隨機挑一個（模擬的玩家策略，與遊戲本身的亂數分開） */
function randomChoice(pendingId: string, state: Parameters<typeof canChoose>[0]): number {
  const options = (eventOf(pendingId, gameData).choices ?? []).map((c, i) => (canChoose(state, c) ? i : -1)).filter((i) => i >= 0);
  const [v, next] = nextRandom(policySeed);
  policySeed = next;
  return options[Math.floor(v * options.length)];
}

for (let i = 0; i < runs; i++) {
  const [v, s] = nextRandom(seed);
  seed = s;
  let state = startLife(createInitialState(Math.floor(v * 2 ** 32), gameData), gameData);
  const start = state.ageMonths;
  while (state.phase === "living") {
    state = tick(state, 1, gameData);
    if (state.pendingEvent !== null) state = chooseEvent(state, randomChoice(state.pendingEvent, state), gameData);
    // 卡在瓶頸時反覆嘗試突破，直到成功或老死
    while (state.phase === "living" && atBottleneck(state, gameData) && canBreakthrough(state, gameData)) {
      state = attemptBreakthrough(state, true, gameData);
      if (atBottleneck(state, gameData)) break;
    }
  }
  totalMonths += state.ageMonths - start;
  let choices = 0;
  for (const ev of gameData.events) {
    const n = state.eventCounts[ev.id] ?? 0;
    eventTotals.set(ev.id, (eventTotals.get(ev.id) ?? 0) + n);
    if (ev.type === "choice") choices += n;
  }
  choiceCounts.push(choices);
  if (state.phase === "dead") {
    const [prev, last] = state.log.slice(-2);
    const prevEvent = prev?.kind === "event" && prev.choice !== undefined ? eventOf(prev.eventId!, gameData) : undefined;
    const killedByEvent = prevEvent?.choices?.[prev.choice!]?.outcomes[prev.outcome ?? 0]?.effects.death === true && prev.month === last?.month;
    if (last?.kind === "adventureDeath") causes.adventure++;
    else if (killedByEvent) causes.event++;
    else causes.lifespan++;
  }
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

choiceCounts.sort((a, b) => a - b);
const avgChoices = choiceCounts.reduce((a, b) => a + b, 0) / runs;
const pct = (p: number) => choiceCounts[Math.min(runs - 1, Math.floor(runs * p))];
console.log(`每世抉擇事件：平均 ${avgChoices.toFixed(1)} 個（P10 ${pct(0.1)}、中位 ${pct(0.5)}、P90 ${pct(0.9)}）`);
console.log(
  `死因：壽元耗盡 ${causes.lifespan}、事件 ${causes.event}（${((causes.event / runs) * 100).toFixed(1)}%）、歷練 ${causes.adventure}`,
);
console.log("各事件平均每世出現次數：");
for (const [id, n] of [...eventTotals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(16)} ${(n / runs).toFixed(2)}`);
}

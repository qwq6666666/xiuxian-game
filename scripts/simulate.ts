// 無介面模擬。用法：npm run sim -- [局數] [種子] [世數]
//   世數 = 1（預設）：模擬 N 個獨立的一世，輸出享年、最高境界、事件與死因統計。
//   世數 > 1：模擬 N 場連續轉世的戰役，每場跑「世數」世，輸出每一世的進度，看輪迴加成的效果。
// 玩家策略很簡單：一直閉關，卡在瓶頸就突破（有築基丹就吃），抉擇在可選的選項中隨機挑一個，
// 每世結束後把道韻優先買宿慧。
import { buyTalent, canBuyTalent } from "../src/core/actions";
import { attemptBreakthrough, canBreakthrough } from "../src/core/breakthrough";
import { canChoose, chooseEvent, eventOf } from "../src/core/events";
import { createInitialState, newLife, startLife } from "../src/core/life";
import { nextRandom } from "../src/core/rng";
import type { GameState } from "../src/core/state";
import { atBottleneck, tick } from "../src/core/tick";
import { gameData } from "../src/data/load";
import { realmLabel } from "../src/ui/format";

const runs = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 1);
const lives = Number(process.argv[4] ?? 1);

let policySeed = baseSeed + 7919;

/** 從可選的選項中隨機挑一個（模擬的玩家策略，與遊戲本身的亂數分開） */
function randomChoice(pendingId: string, state: GameState): number {
  const options = (eventOf(pendingId, gameData).choices ?? []).map((c, i) => (canChoose(state, c) ? i : -1)).filter((i) => i >= 0);
  const [v, next] = nextRandom(policySeed);
  policySeed = next;
  return options[Math.floor(v * options.length)];
}

/** 從開局玩到這一世結束（死亡或通關） */
function playLife(start: GameState): GameState {
  let state = startLife(start, gameData);
  while (state.phase === "living") {
    state = tick(state, 1, gameData);
    if (state.pendingEvent !== null) state = chooseEvent(state, randomChoice(state.pendingEvent, state), gameData);
    // 卡在瓶頸時反覆嘗試突破，直到成功或老死
    while (state.phase === "living" && atBottleneck(state, gameData) && canBreakthrough(state, gameData)) {
      state = attemptBreakthrough(state, true, gameData);
      if (atBottleneck(state, gameData)) break;
    }
  }
  return state;
}

/** 進度 = 已達成的境界階段數（練氣一層 = 1，築基初期 = 10，金丹 = 13），凡人為 0 */
function progressOf(state: GameState): number {
  let n = 0;
  for (const realm of gameData.realms) {
    if (realm.daoYun <= 0) {
      if (realm.id === state.realmId) break;
      continue;
    }
    if (realm.id === state.realmId) return n + state.stage + 1;
    n += realm.stageNames.length;
  }
  return n;
}

const finalLabel = (state: GameState): string =>
  state.phase === "cleared" ? "通關" : realmLabel(gameData.realms.find((r) => r.id === state.realmId)!, state.stage);

const freshSeed = (): number => {
  const [v, s] = nextRandom(seedState);
  seedState = s;
  return Math.floor(v * 2 ** 32);
};
let seedState = baseSeed;

if (lives <= 1) {
  singleLives();
} else {
  campaigns();
}

/** 獨立的一世：每世都從沒有任何輪迴加成開始 */
function singleLives(): void {
  const reached = new Map<string, number>();
  const eventTotals = new Map<string, number>();
  const choiceCounts: number[] = [];
  const causes = { lifespan: 0, event: 0, adventure: 0, cleared: 0 };
  let totalMonths = 0;

  for (let i = 0; i < runs; i++) {
    const start = createInitialState(freshSeed(), gameData);
    const state = playLife(start);
    totalMonths += state.ageMonths - start.ageMonths;
    let choices = 0;
    for (const ev of gameData.events) {
      const n = state.eventCounts[ev.id] ?? 0;
      eventTotals.set(ev.id, (eventTotals.get(ev.id) ?? 0) + n);
      if (ev.type === "choice") choices += n;
    }
    choiceCounts.push(choices);
    causes[state.review!.cause]++;
    reached.set(finalLabel(state), (reached.get(finalLabel(state)) ?? 0) + 1);
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
    `死因：壽元耗盡 ${causes.lifespan}、事件 ${causes.event}（${((causes.event / runs) * 100).toFixed(1)}%）、歷練 ${causes.adventure}、通關 ${causes.cleared}`,
  );
  console.log("各事件平均每世出現次數：");
  for (const [id, n] of [...eventTotals.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(16)} ${(n / runs).toFixed(2)}`);
  }
}

/** 連續轉世的戰役：每世結束後優先把道韻花在宿慧 */
function campaigns(): void {
  const zhujiIdx = gameData.realms.findIndex((r) => r.id === "zhuji");
  const jindanIdx = gameData.realms.findIndex((r) => r.id === "jindan");
  const realmIdx = (s: GameState) => gameData.realms.findIndex((r) => r.id === s.realmId);

  const perLife = Array.from({ length: lives }, () => ({
    progress: 0, years: 0, gained: 0, zhuji: 0, cleared: 0, suhui: 0, toFive: 0, toFiveN: 0,
  }));
  /** 這一世第幾年進入練氣五層（沒到就回傳 null） */
  const yearsToLianqi5 = (s: GameState): number | null => {
    const e = s.log.find((x) => x.kind === "stageUp" && x.realmId === "lianqi" && x.stage === 4);
    return e ? (e.month - gameData.config.startAgeYears * 12) / 12 : null;
  };
  const firstZhuji = new Map<number, number>();
  const firstClear = new Map<number, number>();

  for (let c = 0; c < runs; c++) {
    let state = createInitialState(freshSeed(), gameData);
    let gotZhuji = false;
    let gotClear = false;
    for (let k = 0; k < lives; k++) {
      const row = perLife[k];
      row.suhui += state.meta.talents.suhui ?? 0;
      const start = state.ageMonths;
      state = playLife(state);
      row.progress += progressOf(state);
      row.years += (state.ageMonths - start) / 12;
      row.gained += state.review!.daoYunBase + state.review!.daoYunBonus;
      const t5 = yearsToLianqi5(state);
      if (t5 !== null) {
        row.toFive += t5;
        row.toFiveN++;
      }
      if (realmIdx(state) >= zhujiIdx) {
        row.zhuji++;
        if (!gotZhuji) firstZhuji.set(k + 1, (firstZhuji.get(k + 1) ?? 0) + 1);
        gotZhuji = true;
      }
      if (realmIdx(state) >= jindanIdx) {
        row.cleared++;
        if (!gotClear) firstClear.set(k + 1, (firstClear.get(k + 1) ?? 0) + 1);
        gotClear = true;
      }
      // 把道韻優先花在宿慧
      while (canBuyTalent(state, "suhui", gameData)) state = buyTalent(state, "suhui", gameData);
      state = newLife(state, gameData);
    }
  }

  console.log(`模擬 ${runs} 場戰役，每場 ${lives} 世（種子 ${baseSeed}；策略：優先買宿慧）`);
  console.log("世數 | 開局宿慧 | 平均進度(階段) | 到練氣五層(年) | 平均享年 | 平均道韻 | 已達築基 | 已達金丹");
  perLife.forEach((r, k) => {
    console.log(
      [
        String(k + 1).padStart(3),
        r.suhui === 0 ? "   0.0" : (r.suhui / runs).toFixed(1).padStart(6),
        (r.progress / runs).toFixed(2).padStart(10),
        (r.toFiveN > 0 ? (r.toFive / r.toFiveN).toFixed(1) : "—").padStart(12),
        (r.years / runs).toFixed(1).padStart(8),
        (r.gained / runs).toFixed(1).padStart(8),
        `${((r.zhuji / runs) * 100).toFixed(1)}%`.padStart(8),
        `${((r.cleared / runs) * 100).toFixed(1)}%`.padStart(8),
      ].join(" | "),
    );
  });
  const dist = (m: Map<number, number>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `第 ${k} 世 ${((n / runs) * 100).toFixed(0)}%`).join("、") || "（無）";
  console.log(`首次築基發生在：${dist(firstZhuji)}`);
  console.log(`首次金丹發生在：${dist(firstClear)}`);
}

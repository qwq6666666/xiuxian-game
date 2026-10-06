// 無介面模擬。用法：npm run sim -- [局數] [種子] [世數]
//   世數 = 1（預設）：模擬 N 個獨立的一世，輸出享年、最高境界、事件與死因統計。
//   世數 > 1：模擬 N 場連續轉世的戰役，每場跑「世數」世，輸出每一世的進度，看輪迴加成的效果。
// 預設策略（simple）：一直閉關，卡在瓶頸就突破（有築基丹就吃），抉擇在可選的選項中隨機挑一個，
// 每世結束後把道韻優先買宿慧。
// 混合策略（mixed，第 5 個參數）：練氣前期外出歷練、之後閉關，靈石拿去買聚氣丹、延壽丹與築基丹，
// 道韻依目標等級均衡購買五種天賦，比較接近認真玩的人。
// 通關後策略（post，第 5 個參數）：通關前與 mixed 相同；第一次通關之後道韻先買神光到結嬰門檻，
// 再依較高的目標均衡購買，並量測首次元嬰、金丹期單世時長與結嬰嘗試次數（對照 GDD 第 23.6 節）。
// post 另在第一次元嬰之後買凝神到化神門檻、嘗試化神，並量測首次化神、元嬰期單世時長與化神嘗試次數（GDD 第 25.6 節）。
// 入宗策略（sect，第 5 個參數）：同 mixed，另外練氣三層起旅行到最近的開放宗門求入宗，入宗後依晉升條件做差事並晉升，量測入宗成功率與位階分布（GDD 第 29 節）。
// 採藥丹修策略（herb，第 5 個參數）：永遠採藥、有錢就買聚氣丹並服用，檢查丹藥沒有蓋過閉關這條路（第 8.1 節）。
// 走訪渡口策略（wander，第 5 個參數）：練氣之後永遠走訪渡口，檢查它不會快過閉關，並看殘卷收集的節奏。
// 例：npm run sim -- 300 1 40 post
import { beginTravel, placesAt, routeTo } from "../src/core/travel";
import { canJoinSect, canPromoteSect, joinSect, nextRank, promoteSect } from "../src/core/sect";
import { buyItem, buyTalent, canBuyItem, canBuyTalent, canUseItem, canZuohua, setSchedule, useItem, zuohua } from "../src/core/actions";
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
const strategy = process.argv[5] === "mixed" ? "mixed" : process.argv[5] === "post" ? "post" : process.argv[5] === "herb" ? "herb" : process.argv[5] === "wander" ? "wander" : process.argv[5] === "sect" ? "sect" : "simple";

let policySeed = baseSeed + 7919;

/** 從可選的選項中隨機挑一個（模擬的玩家策略，與遊戲本身的亂數分開） */
function randomChoice(pendingId: string, state: GameState): number {
  const options = (eventOf(pendingId, gameData).choices ?? []).map((c, i) => (canChoose(state, c) ? i : -1)).filter((i) => i >= 0);
  const [v, next] = nextRandom(policySeed);
  policySeed = next;
  return options[Math.floor(v * options.length)];
}

/** 混合策略的每月操作：換安排、買丹藥、吃丹藥 */
function mixedActions(state: GameState): GameState {
  let s = state;
  // 練氣前期靈石不足時外出歷練賺錢，攢夠了就回去閉關
  const lianqiEarly = s.realmId === "lianqi" && s.stage < 3 && s.spiritStones < 40;
  s = setSchedule(s, lianqiEarly ? "adventure" : "retreat", gameData);
  if (s.realmId === "lianqi" && s.stage >= 6 && (s.items.zhuji_dan ?? 0) === 0) s = buyItem(s, "zhuji_dan", gameData);
  if (canBuyItem(s, "yanshou_dan", gameData) && s.realmId !== "mortal") s = buyItem(s, "yanshou_dan", gameData);
  if (canUseItem(s, "yanshou_dan", gameData)) s = useItem(s, "yanshou_dan", gameData);
  while (s.realmId !== "mortal" && canBuyItem(s, "juqi_dan", gameData) && s.spiritStones >= 520) s = buyItem(s, "juqi_dan", gameData);
  while (canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
  return s;
}

/** 採藥丹修策略的每月操作：一直採藥，凡人以外有錢就買聚氣丹、能服就服 */
function herbActions(state: GameState): GameState {
  let s = setSchedule(state, "herb", gameData);
  while (s.realmId !== "mortal" && canBuyItem(s, "juqi_dan", gameData)) s = buyItem(s, "juqi_dan", gameData);
  while (canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
  return s;
}

/** 入宗策略的每月操作：練氣三層起去最近的開放宗門求入宗；入宗後境界夠了但貢獻不足就做差事，條件滿足就晉升 */
const sectStats = { tries: 0, joins: 0, lives: 0, peaks: [0, 0, 0, 0, 0] };
function sectActions(state: GameState): GameState {
  let s = state;
  if (s.sect === null) {
    if (canJoinSect(s, gameData)) {
      const before = s.sectsTried.length;
      s = joinSect(s, gameData);
      if (s.sectsTried.length > before) sectStats.tries++;
      if (s.sect !== null) sectStats.joins++;
      return s;
    }
    const ready = s.realmId !== "mortal" && (s.realmId !== "lianqi" || s.stage >= gameData.sects.join.minStage);
    if (ready && s.travel.targetId === null && s.pendingEvent === null) {
      const options = placesAt(s, gameData)
        .filter((p) => p.kind === "sect" && !s.sectsTried.includes(p.id.slice(5)) && !p.status.includes("閉山") && !p.status.includes("覆滅"))
        .map((p) => ({ p, months: routeTo(s, p.id, gameData)?.months ?? Infinity }))
        .sort((a, b) => a.months - b.months);
      if (options.length > 0 && Number.isFinite(options[0].months)) s = beginTravel(s, options[0].p.id, gameData);
    }
    return s;
  }
  if (canPromoteSect(s, gameData)) s = promoteSect(s, gameData);
  const next = nextRank(s, gameData);
  const idx = (id: string): number => gameData.realms.findIndex((r) => r.id === id);
  const wantDuty = next?.def.promote !== undefined && idx(s.realmId) >= idx(next.def.promote.realm) - 0 && s.sect!.contribution < next.def.promote.contribution;
  s = setSchedule(s, wantDuty ? gameData.sects.dutySchedule : "retreat", gameData);
  return s;
}

/** 走訪渡口策略的每月操作：練氣之後一直走訪，其餘照 mixed 買賣丹藥 */
function wanderActions(state: GameState): GameState {
  const s = mixedActions(state);
  return s.realmId === "mortal" ? s : setSchedule(s, "wander", gameData);
}

/** 通關後策略的天賦購買：第一次通關前同 mixed；之後先把神光買到結嬰門檻，再依 POST_TARGETS 均衡 */
function buyTalentsPost(state: GameState): GameState {
  if (!Object.values(state.meta.clears).some((n) => n > 0)) return buyTalentsBalanced(state);
  const need = gameData.realms.find((r) => r.id === "jindan")?.breakthroughRule?.requiresTalent;
  let s = state;
  while (need && (s.meta.talents[need.id] ?? 0) < need.level) {
    // 門檻之前什麼都不買，存著道韻
    if (!canBuyTalent(s, need.id, gameData)) return s;
    s = buyTalent(s, need.id, gameData);
  }
  // 第一次元嬰之後：凝神買到化神門檻再依目標均衡
  const gate = gameData.realms.find((r) => r.id === "yuanying")?.breakthroughRule?.requiresTalent;
  if (gate && Object.values(s.meta.yuanying).some((n) => n > 0)) {
    while ((s.meta.talents[gate.id] ?? 0) < gate.level) {
      if (!canBuyTalent(s, gate.id, gameData)) return s;
      s = buyTalent(s, gate.id, gameData);
    }
    return buyTalentsBalanced(s, { ...POST_TARGETS, ningshen: 6 });
  }
  return buyTalentsBalanced(s, POST_TARGETS);
}

/** 混合策略的天賦購買：依目標等級均衡，永遠買「等級/目標」最低且買得起的 */
const TALENT_TARGETS: Record<string, number> = { suhui: 18, daoxin: 3, tianjuan: 2, fuyuan: 2, yize: 2 };
/** 通關後的目標：宿慧拉高，神光到上限；神光門檻另由 buyTalentsPost 先處理 */
const POST_TARGETS: Record<string, number> = { suhui: 30, shenguang: 6, daoxin: 4, tianjuan: 2, fuyuan: 2, yize: 2 };
function buyTalentsBalanced(state: GameState, targets: Record<string, number> = TALENT_TARGETS): GameState {
  let s = state;
  for (;;) {
    const order = Object.entries(targets)
      .map(([id, target]) => [id, (s.meta.talents[id] ?? 0) / target] as const)
      .sort((a, b) => a[1] - b[1]);
    const pick = order.find(([id]) => canBuyTalent(s, id, gameData));
    if (!pick) return s;
    // 最缺的天賦買不起就存著，不要被便宜的搶先（宿慧以外的天賦很貴）
    if (!canBuyTalent(s, order[0][0], gameData)) return s;
    s = buyTalent(s, pick[0], gameData);
  }
}

/** 最近一世的量測：金丹期的結嬰嘗試次數與停留月數（沒進金丹為 0） */
let lifeStats = { attempts: 0, jindanMonths: 0, jindanEnd: 0, ready: false, zuohua: false, huashenAttempts: 0, yuanyingMonths: 0, huashenReady: false };

/** 從開局玩到這一世結束（死亡、通關或元嬰大成） */
function playLife(start: GameState): GameState {
  const need = gameData.realms.find((r) => r.id === "jindan")?.breakthroughRule?.requiresTalent;
  const hgate = gameData.realms.find((r) => r.id === "yuanying")?.breakthroughRule?.requiresTalent;
  lifeStats = {
    attempts: 0, jindanMonths: 0, jindanEnd: 0, ready: !need || (start.meta.talents[need.id] ?? 0) >= need.level, zuohua: false,
    huashenAttempts: 0, yuanyingMonths: 0, huashenReady: !hgate || (start.meta.talents[hgate.id] ?? 0) >= hgate.level,
  };
  let yuanyingEntered: number | null = null;
  let jindanEntered: number | null = null;
  let jindanLeft: number | null = null;
  let state = startLife(start, gameData);
  while (state.phase === "living") {
    state = tick(state, 1, gameData);
    if (strategy === "herb" && state.phase === "living") state = herbActions(state);
    else if (strategy === "wander" && state.phase === "living") state = wanderActions(state);
    else if (strategy !== "simple" && state.phase === "living") state = mixedActions(state);
    if (state.pendingEvent !== null) state = chooseEvent(state, randomChoice(state.pendingEvent, state), gameData);
    if (strategy === "sect" && state.phase === "living" && state.pendingEvent === null) state = sectActions(state);
    // 卡在瓶頸時反覆嘗試突破，直到成功或老死
    while (state.phase === "living" && atBottleneck(state, gameData) && canBreakthrough(state, gameData)) {
      if (state.realmId === "jindan") lifeStats.attempts++;
      if (state.realmId === "yuanying") lifeStats.huashenAttempts++;
      state = attemptBreakthrough(state, true, gameData);
      if (atBottleneck(state, gameData)) break;
    }
    if (jindanEntered === null && state.realmId === "jindan") jindanEntered = state.ageMonths;
    // 離開金丹（結嬰）的那一刻封存金丹期的長度與止步位置；元嬰期之後的月數不算金丹期
    if (jindanEntered !== null && jindanLeft === null) {
      if (state.realmId === "jindan") lifeStats.jindanEnd = state.stage;
      else {
        jindanLeft = state.ageMonths;
        lifeStats.jindanEnd = 3;
      }
    }
    if (yuanyingEntered === null && state.realmId === "yuanying") yuanyingEntered = state.ageMonths;
    // post 策略：凝神沒到門檻，元嬰後期圓滿、卡在瓶頸時坐化，不空等壽盡
    if (strategy === "post" && !lifeStats.huashenReady && state.realmId === "yuanying" && state.phase === "living" && canZuohua(state, gameData) && atBottleneck(state, gameData)) {
      state = zuohua(state, gameData);
    }
    // post 策略：神光沒到門檻，修到金丹後期圓滿、卡在瓶頸時坐化，不空等壽盡（第 24.2 節）
    if (strategy === "post" && !lifeStats.ready && state.phase === "living" && canZuohua(state, gameData) && atBottleneck(state, gameData)) {
      lifeStats.zuohua = true;
      state = zuohua(state, gameData);
    }
  }
  if (yuanyingEntered !== null) lifeStats.yuanyingMonths = state.ageMonths - yuanyingEntered;
  if (jindanEntered !== null) lifeStats.jindanMonths = (jindanLeft ?? state.ageMonths) - jindanEntered;
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
  const causes = { lifespan: 0, event: 0, adventure: 0, cleared: 0, yuanying: 0, huashen: 0, zuohua: 0 };
  let totalMonths = 0;
  let totalProgress = 0;

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
    totalProgress += progressOf(state);
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

  // 對照 GDD 第 13 節
  const minutes = (totalMonths / runs / 60) * (gameData.config.msPerMonth / 1000);
  const avgProgress = totalProgress / runs;
  // 玩家策略從不歷練，所以歷練身亡用最壞情況推算：整世都在歷練
  const adventure = gameData.schedules.find((x) => x.id === "adventure");
  const lianqi = gameData.realms.find((r) => r.id === "lianqi")!;
  const advDeath = adventure ? 1 - (1 - adventure.deathChance) ** (lianqi.lifespan * 12 - gameData.config.startAgeYears * 12) : 0;
  const ok = (pass: boolean): string => (pass ? "✓" : "✗");
  console.log("對照第 13 節：");
  console.log(`  ${ok(minutes >= 20 && minutes <= 25)} 第一世時長：${minutes.toFixed(1)} 分鐘（目標 20–25）`);
  console.log(`  ${ok(avgProgress >= 5 && avgProgress <= 7)} 第一世平均止步：練氣 ${avgProgress.toFixed(1)} 層（目標 5–7）`);
  console.log(`  ${ok(avgChoices >= 8 && avgChoices <= 15)} 每世抉擇事件：${avgChoices.toFixed(1)} 個（目標 8–15）`);
  console.log(`  ${ok(advDeath <= 0.05)} 歷練身亡（整世都在歷練的最壞情況）：${(advDeath * 100).toFixed(1)}%（目標 ≤ 5%）`);
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
  /** 每場戰役首次築基、首次金丹的世數（沒達成為 Infinity），以及到首次金丹為止的遊玩分鐘數（×1 速度） */
  const zhujiLives: number[] = [];
  const clearLives: number[] = [];
  const clearMinutes: number[] = [];
  /** 殘卷指標：前五世每世新得數、f01 與 f02 都到手的世數、集滿的世數 */
  let earlyFragments = 0;
  const bothLives: number[] = [];
  const allLives: number[] = [];
  /** 通關後指標：首次元嬰與首次通關相隔幾世、累計小時，金丹期單世分鐘數，結嬰嘗試次數 */
  const yuanyingGap: number[] = [];
  const yuanyingHours: number[] = [];
  const jindanMinutes: number[] = [];
  const attemptCounts: number[] = [];
  /** 化神指標：首次化神與首次元嬰相隔幾世、之間的遊玩小時，元嬰期單世分鐘數（凝神已到門檻），化神嘗試次數 */
  const huashenGap: number[] = [];
  const huashenHours: number[] = [];
  const yuanyingMinutes: number[] = [];
  const huashenAttemptCounts: number[] = [];
  /** 金丹期（通關後繼續活的世）的止步：0 初期、1 中期、2 後期、3 結嬰成功 */
  const jindanEnds = [0, 0, 0, 0];
  /** 通關後進了金丹、但神光還沒到門檻而空等的世數 */
  let waitingLives = 0;
  /** 通關後進了金丹、神光未到門檻而選擇坐化的世數 */
  let zuohuaLives = 0;

  for (let c = 0; c < runs; c++) {
    let state = createInitialState(freshSeed(), gameData);
    let gotZhuji = false;
    let gotClear = false;
    let months = 0;
    let gotBoth = false;
    let gotAll = false;
    let gotYuanying = false;
    let gotHuashen = false;
    let yuanyingLife = 0;
    let yuanyingMonthsAt = 0;
    let clearLife = 0;
    for (let k = 0; k < lives; k++) {
      const fragmentsBefore = state.meta.fragments.length;
      const row = perLife[k];
      row.suhui += state.meta.talents.suhui ?? 0;
      const start = state.ageMonths;
      state = playLife(state);
      if (k < 5) earlyFragments += state.meta.fragments.length - fragmentsBefore;
      if (!gotBoth && state.meta.fragments.includes("f01") && state.meta.fragments.includes("f02")) {
        gotBoth = true;
        bothLives.push(k + 1);
      }
      if (!gotAll && state.meta.fragments.length >= gameData.fragments.items.length) {
        gotAll = true;
        allLives.push(k + 1);
      }
      if (strategy === "sect") {
        sectStats.lives++;
        sectStats.peaks[state.sectPeak]++;
      }
      row.progress += progressOf(state);
      row.years += (state.ageMonths - start) / 12;
      months += state.ageMonths - start;
      row.gained += state.review!.daoYunBase + state.review!.daoYunBonus;
      const t5 = yearsToLianqi5(state);
      if (t5 !== null) {
        row.toFive += t5;
        row.toFiveN++;
      }
      if (realmIdx(state) >= zhujiIdx) {
        row.zhuji++;
        if (!gotZhuji) {
          firstZhuji.set(k + 1, (firstZhuji.get(k + 1) ?? 0) + 1);
          zhujiLives.push(k + 1);
        }
        gotZhuji = true;
      }
      if (realmIdx(state) >= jindanIdx) {
        row.cleared++;
        if (!gotClear) {
          firstClear.set(k + 1, (firstClear.get(k + 1) ?? 0) + 1);
          clearLives.push(k + 1);
          clearMinutes.push((months * gameData.config.msPerMonth) / 60000);
        }
        if (!gotClear) clearLife = k + 1;
        gotClear = true;
      }
      if (lifeStats.jindanMonths >= 0 && lifeStats.zuohua) zuohuaLives++;
      else if (lifeStats.jindanMonths > 0 && !lifeStats.ready) waitingLives++;
      if (lifeStats.jindanMonths > 0 && lifeStats.ready) jindanMinutes.push((lifeStats.jindanMonths * gameData.config.msPerMonth) / 60000);
      if (lifeStats.attempts > 0) attemptCounts.push(lifeStats.attempts);
      if (lifeStats.jindanMonths > 0 && lifeStats.ready) jindanEnds[lifeStats.jindanEnd]++;
      if (gotYuanying && lifeStats.yuanyingMonths > 0 && lifeStats.huashenReady) yuanyingMinutes.push((lifeStats.yuanyingMonths * gameData.config.msPerMonth) / 60000);
      if (lifeStats.huashenAttempts > 0) huashenAttemptCounts.push(lifeStats.huashenAttempts);
      if (!gotHuashen && state.review?.cause === "huashen") {
        gotHuashen = true;
        huashenGap.push(k + 1 - yuanyingLife);
        huashenHours.push(((months - yuanyingMonthsAt) * gameData.config.msPerMonth) / 3_600_000);
      }
      if (!gotYuanying && (state.review?.cause === "yuanying" || (state.review?.cause === "huashen" && !gotYuanying))) {
        yuanyingLife = k + 1;
        yuanyingMonthsAt = months;
      }
      if (!gotYuanying && state.review?.cause === "yuanying") {
        gotYuanying = true;
        yuanyingGap.push(k + 1 - clearLife);
        yuanyingHours.push((months * gameData.config.msPerMonth) / 3_600_000);
      }
      // 把道韻優先花在宿慧
      if (strategy === "mixed" || strategy === "herb" || strategy === "wander" || strategy === "sect") state = buyTalentsBalanced(state);
      else if (strategy === "post") state = buyTalentsPost(state);
      else while (canBuyTalent(state, "suhui", gameData)) state = buyTalent(state, "suhui", gameData);
      state = newLife(state, gameData);
    }
  }

  console.log(`模擬 ${runs} 場戰役，每場 ${lives} 世（種子 ${baseSeed}；策略：${{ mixed: "混合", post: "通關後", herb: "採藥丹修", wander: "走訪渡口", simple: "優先買宿慧", sect: "入宗" }[strategy]}）`);
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

  // 對照 GDD 第 13 節：把沒達成的戰役算成無限大，中位數才不會被只看成功者而低估
  const median = (done: number[]): number => {
    const all = [...done, ...Array<number>(runs - done.length).fill(Infinity)].sort((a, b) => a - b);
    return all[Math.floor(runs / 2)];
  };
  const [zLo, zHi] = [3, 5];
  const [cLo, cHi] = [8, 12];
  const zMed = median(zhujiLives);
  const cMed = median(clearLives);
  const hours = clearMinutes.length > 0 ? clearMinutes.reduce((a, b) => a + b, 0) / clearMinutes.length / 60 : NaN;
  const ok = (pass: boolean): string => (pass ? "✓" : "✗");
  console.log("對照第 13 節（以中位數判定）：");
  console.log(`  ${ok(zMed >= zLo && zMed <= zHi)} 首次築基：中位數第 ${zMed} 世（目標第 ${zLo}–${zHi} 世）`);
  console.log(`  ${ok(cMed >= cLo && cMed <= cHi)} 首次金丹：中位數第 ${cMed} 世（目標第 ${cLo}–${cHi} 世）`);
  console.log(`  ${ok(hours >= 4 && hours <= 6)} 通關總遊玩時間：平均 ${hours.toFixed(1)} 小時（目標 4–6 小時，僅計已通關者）`);
  const fragPerLife = earlyFragments / runs / Math.min(5, lives);
  const bothMed = median(bothLives);
  const allMed = median(allLives);
  console.log("對照第 18.7 節（殘卷）：");
  console.log(`  ${ok(fragPerLife >= 1 && fragPerLife <= 2)} 前五世每世新得殘卷：平均 ${fragPerLife.toFixed(2)} 份（目標 1–2）`);
  console.log(`  ${ok(bothMed <= 3)} f01 與 f02 都到手：中位數第 ${bothMed} 世（目標第 3 世結束前），第 3 世前已到手 ${((bothLives.filter((l) => l <= 3).length / runs) * 100).toFixed(0)}%`);
  console.log(`  ${ok(allMed >= 10 && allMed <= 14)} 集滿 ${gameData.fragments.items.length} 份：中位數第 ${allMed} 世（目標第 10–14 世）`);
  if (strategy === "post") {
    const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const gapMed = median(yuanyingGap);
    console.log("對照第 23.6 節（元嬰）：");
    const jt = jindanEnds.reduce((a, b) => a + b, 0) || 1;
    console.log(`  金丹期止步（神光已到門檻的 ${jt} 世）：初期 ${((jindanEnds[0] / jt) * 100).toFixed(0)}%、中期 ${((jindanEnds[1] / jt) * 100).toFixed(0)}%、後期 ${((jindanEnds[2] / jt) * 100).toFixed(0)}%、結嬰 ${((jindanEnds[3] / jt) * 100).toFixed(0)}%`);
    console.log(`  ${ok(gapMed >= 8 && gapMed <= 14)} 首次元嬰：通關後再 ${Number.isFinite(gapMed) ? `${gapMed} 世` : `超過 ${lives} 世`}（中位數；目標 8–14 世），${lives} 世內已結嬰 ${((yuanyingGap.length / runs) * 100).toFixed(0)}%`);
    const h = mean(yuanyingHours);
    console.log(`  ${ok(h >= 8 && h <= 12)} 首次元嬰累計遊玩：平均 ${h.toFixed(1)} 小時（目標 8–12 小時，僅計已結嬰者）`);
    const m = mean(jindanMinutes);
    console.log(`  ${ok(m >= 20 && m <= 40)} 金丹期單世時長：平均 ${m.toFixed(1)} 分鐘（目標 20–40 分鐘，僅計神光已到門檻的 ${jindanMinutes.length} 世）`);
    console.log(`  （神光未到門檻的金丹期：修到後期圓滿後坐化離場 ${zuohuaLives} 世；壽盡前沒修到圓滿 ${waitingLives} 世；皆不計入上面的時長）`);
    const a = mean(attemptCounts);
    console.log(`  ${ok(a >= 2 && a <= 5)} 每世結嬰嘗試：平均 ${a.toFixed(1)} 次（目標 2–5 次，僅計有嘗試的 ${attemptCounts.length} 世）`);
    const hgMed = median(huashenGap);
    console.log("對照第 25.6 節（化神）：");
    console.log(`  ${ok(hgMed >= 8 && hgMed <= 14)} 首次化神：首次元嬰後再 ${Number.isFinite(hgMed) ? `${hgMed} 世` : `超過 ${lives} 世`}（中位數；目標 8–14 世），${lives} 世內已化神 ${((huashenGap.length / runs) * 100).toFixed(0)}%`);
    const hh = mean(huashenHours);
    console.log(`  ${ok(hh >= 6 && hh <= 9)} 首次元嬰到首次化神的遊玩：平均 ${hh.toFixed(1)} 小時（目標 6–9 小時，僅計已化神者；每世仍要重走前三境，見 GDD 25.12）`);
    const ym = mean(yuanyingMinutes);
    console.log(`  ${ok(ym >= 20 && ym <= 45)} 元嬰期單世時長：平均 ${ym.toFixed(1)} 分鐘（目標 20–45 分鐘，僅計凝神已到門檻的 ${yuanyingMinutes.length} 世）`);
    const ha = mean(huashenAttemptCounts);
    console.log(`  ${ok(ha >= 2 && ha <= 5)} 每世化神嘗試：平均 ${ha.toFixed(1)} 次（目標 2–5 次，僅計有嘗試的 ${huashenAttemptCounts.length} 世）`);
  }
  if (strategy === "sect") {
    const pct = (n: number): string => `${((n / Math.max(1, sectStats.lives)) * 100).toFixed(1)}%`;
    console.log("對照第 29.10 節（入宗）：");
    console.log(`  試煉 ${sectStats.tries} 次，成功 ${sectStats.joins} 次（${((sectStats.joins / Math.max(1, sectStats.tries)) * 100).toFixed(0)}%）；${sectStats.lives} 世中入宗 ${pct(sectStats.joins)}`);
    console.log(`  各世最高位階：未入宗 ${pct(sectStats.peaks[0])}、外門 ${pct(sectStats.peaks[1])}、內門 ${pct(sectStats.peaks[2])}、執事 ${pct(sectStats.peaks[3])}、長老 ${pct(sectStats.peaks[4])}`);
    console.log(`  ${ok(cMed >= 7)} 入宗路線首次金丹：中位數第 ${cMed} 世（不得低於第 7 世）`);
    console.log(`  ${ok(hours >= 3.5)} 入宗路線通關總遊玩時間：平均 ${hours.toFixed(1)} 小時（不得少於 3.5 小時）`);
  }
  console.log(`  ${lives} 世內已築基 ${((zhujiLives.length / runs) * 100).toFixed(0)}%、已通關 ${((clearLives.length / runs) * 100).toFixed(0)}%`);
}

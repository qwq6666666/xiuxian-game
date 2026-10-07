// 歷練遇怪（M34）：外出歷練時每月可能遇到怪物，時間暫停，玩家選擇戰或逃。
// 亂數全由遇怪開始時抽定的種子衍生，不消耗 rngSeed；沒有外出歷練的世界，亂數序列與修為都不受影響。
import { gameData } from "../data/load";
import type { GameData, HuntAction, MonsterDef } from "../data/types";
import { monthlyGain } from "./gain";
import { addLog, atBottleneck, resolveStages } from "./progress";
import { deriveSeed, nextRandom } from "./rng";
import type { BestiaryEntry, Changes, GameState } from "./state";
import { advanceTrial } from "./trial";

/** 遇怪亂數的雜湊鹽值，與材料掉落、世界生成用的編號錯開 */
const HUNT_SALT = 8_000_000;

export type HuntChoice = HuntAction | "flee";
export const HUNT_CHOICES: readonly HuntChoice[] = ["steady", "fierce", "ward", "flee"];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const draw = (seed: number, salt: number): number => nextRandom(deriveSeed(seed, salt))[0];

export function monsterOf(id: string, data: GameData = gameData): MonsterDef {
  const m = data.monsters.monsters.find((x) => x.id === id);
  if (!m) throw new Error(`遇怪：找不到怪物 ${id}`);
  return m;
}

/** 戰鬥用的符籙：資料裡第一個 tribulationWard 效果的物品（與天劫共用） */
export function huntTalisman(data: GameData = gameData): string | null {
  for (const item of data.items) if (item.effect.kind === "tribulationWard") return item.id;
  return null;
}

/** 玩家的戰力：境界基準，隨小階段與根骨增加 */
export function playerPower(state: GameState, data: GameData = gameData): number {
  const r = data.monsters.rules;
  return r.realmPower[state.realmId] * (1 + r.stagePower * state.stage) * (1 + r.bonePower * (state.attributes.bone - 5));
}

/** 玩家戰力與怪物戰力的比值 */
export function powerRatio(state: GameState, monster: MonsterDef, data: GameData = gameData): number {
  return playerPower(state, data) / (data.monsters.rules.realmPower[monster.realm] * monster.power);
}

/** 這一招的命中率（符籙必中） */
export function actionHit(state: GameState, action: HuntAction, data: GameData = gameData): number {
  const e = state.encounter;
  const a = data.monsters.rules.actions[action];
  if (!e || a.hit >= 1) return a.hit;
  return clamp(a.hit + data.monsters.rules.ratioHit * (powerRatio(state, monsterOf(e.monsterId, data), data) - 1), 0.1, 0.95);
}

/** 逃跑成功率 */
export function fleeChance(state: GameState, data: GameData = gameData): number {
  const e = state.encounter;
  if (!e) return 0;
  const f = data.monsters.rules.flee;
  const r = powerRatio(state, monsterOf(e.monsterId, data), data);
  return clamp(f.base + f.perRatio * (r - 1) + f.perFortune * state.attributes.fortune, f.min, f.max);
}

export function canHunt(state: GameState, choice: HuntChoice, data: GameData = gameData): boolean {
  if (state.encounter === null || state.phase !== "living") return false;
  if (choice !== "ward") return true;
  const id = huntTalisman(data);
  return id !== null && (state.items[id] ?? 0) > 0;
}

/** 外出歷練時，這個月是否遇怪；遇到就進入遇怪狀態（不消耗 rngSeed） */
export function maybeEncounter(state: GameState, month: number, data: GameData = gameData): GameState {
  const rules = data.monsters.rules;
  if (state.phase !== "living" || state.encounter !== null || state.schedule !== rules.schedule) return state;
  const pool = data.monsters.monsters.filter((m) => m.realm === state.realmId);
  if (pool.length === 0) return state;
  if (draw(state.rngSeed, HUNT_SALT + month * 4) >= rules.chance) return state;
  const pick = pool[Math.floor(draw(state.rngSeed, HUNT_SALT + month * 4 + 1) * pool.length)];
  const seed = deriveSeed(state.rngSeed, HUNT_SALT + month * 4 + 2);
  return { ...state, encounter: { monsterId: pick.id, round: 0, monsterHp: 1, myHp: 1, seed } };
}

type HuntLog = "huntWin" | "huntLose" | "huntFlee" | "huntDraw";

/** 結束遇怪：寫日誌，清除狀態。outcome 只用在逃跑：0 成功、1 失敗 */
function finish(state: GameState, kind: HuntLog, data: GameData, extra: { outcome?: number; changes?: Changes } = {}): GameState {
  const e = state.encounter!;
  const hasChanges = extra.changes !== undefined && Object.keys(extra.changes).length > 0;
  const field = { huntWin: "win", huntLose: "lose", huntFlee: "flee", huntDraw: "draw" }[kind] as keyof BestiaryEntry;
  const seen = state.meta.bestiary[e.monsterId] ?? { win: 0, lose: 0, flee: 0, draw: 0 };
  const meta = { ...state.meta, bestiary: { ...state.meta.bestiary, [e.monsterId]: { ...seen, [field]: seen[field] + 1 } } };
  const done = addLog(
    { ...state, meta, encounter: null },
    {
      month: state.ageMonths,
      kind,
      realmId: state.realmId,
      stage: state.stage,
      monsterId: e.monsterId,
      ...(extra.outcome !== undefined ? { outcome: extra.outcome } : {}),
      ...(hasChanges ? { changes: extra.changes } : {}),
    },
    data.config.logLimit,
  );
  // 秘境試煉中：這一層結束，由秘境決定接下來進下一層、通關或結束（M47）
  return done.trial ? advanceTrial(done, kind, extra.outcome, data) : done;
}

/** 損失目前修為的一部分 */
function lose(state: GameState, frac: number): [GameState, number] {
  const loss = state.cultivation * frac;
  return [{ ...state, cultivation: state.cultivation - loss }, loss];
}

function win(state: GameState, data: GameData): GameState {
  const e = state.encounter!;
  const m = monsterOf(e.monsterId, data);
  const retreat = data.schedules.find((s) => s.id === "retreat");
  if (!retreat) throw new Error("遇怪：找不到閉關修煉（retreat）安排");
  // 秘境裡每層只給靈石與掉落；修為只在通關時一次給（見 trial.ts），免得秘境比閉關更划算
  const gain = atBottleneck(state, data) || state.trial !== null ? 0 : monthlyGain(state, retreat, data) * m.reward;
  const stones = m.stones.min + Math.floor(draw(e.seed, 900) * (m.stones.max - m.stones.min + 1));
  const items = { ...state.items };
  const got: Record<string, number> = {};
  m.drops.forEach((d, j) => {
    if (draw(e.seed, 910 + j) < d.chance) {
      items[d.itemId] = (items[d.itemId] ?? 0) + 1;
      got[d.itemId] = (got[d.itemId] ?? 0) + 1;
    }
  });
  const next = resolveStages({ ...state, cultivation: state.cultivation + gain, spiritStones: state.spiritStones + stones, items }, state.ageMonths, data);
  return finish(next, "huntWin", data, {
    changes: { ...(gain > 0 ? { cultivation: gain } : {}), ...(stones > 0 ? { spiritStones: stones } : {}), ...(Object.keys(got).length > 0 ? { items: got } : {}) },
  });
}

/**
 * 選一招：穩打、強攻、符籙，或逃。
 * 每回合玩家先出手，怪物沒倒就反擊；氣血先歸零者敗，打滿回合數算平手（怪物退走，沒有獎勵，只損失一點修為）。
 */
export function huntChoose(state: GameState, choice: HuntChoice, data: GameData = gameData): GameState {
  const e = state.encounter;
  if (!e || !canHunt(state, choice, data)) return state;
  const rules = data.monsters.rules;

  if (choice === "flee") {
    if (draw(e.seed, 100 + e.round) < fleeChance(state, data)) return finish(state, "huntFlee", data, { outcome: 0 });
    const [s, loss] = lose(state, rules.flee.failLoss);
    return finish(s, "huntFlee", data, { outcome: 1, changes: loss > 0 ? { cultivation: -loss } : {} });
  }

  let s = state;
  if (choice === "ward") {
    const id = huntTalisman(data)!;
    s = { ...s, items: { ...s.items, [id]: s.items[id] - 1 } };
  }
  const a = rules.actions[choice];
  const m = monsterOf(e.monsterId, data);
  const r = powerRatio(state, m, data);
  const swing = (v: number): number => 1 + rules.variance * (2 * v - 1);
  const hit = draw(e.seed, e.round * 3) < actionHit(state, choice, data);
  const monsterHp = e.monsterHp - (hit ? a.dmg * clamp(r, 0.6, 1.5) * swing(draw(e.seed, e.round * 3 + 1)) : 0);
  if (monsterHp <= 1e-9) return win({ ...s, encounter: { ...e, monsterHp: 0 } }, data);
  const myHp = e.myHp - a.taken * clamp(1 / r, 0.5, 2) * swing(draw(e.seed, e.round * 3 + 2));
  if (myHp <= 1e-9) {
    const [lost, loss] = lose({ ...s, encounter: { ...e, monsterHp, myHp: 0 } }, rules.lossFrac);
    return finish(lost, "huntLose", data, { changes: loss > 0 ? { cultivation: -loss } : {} });
  }
  if (e.round + 1 >= rules.rounds) {
    const [tired, loss] = lose({ ...s, encounter: { ...e, monsterHp, myHp } }, rules.drawLossFrac);
    return finish(tired, "huntDraw", data, { changes: loss > 0 ? { cultivation: -loss } : {} });
  }
  return { ...s, encounter: { ...e, round: e.round + 1, monsterHp, myHp } };
}

/** 預設打法：戰力夠就穩打，不夠就逃（自動抉擇與模擬用） */
export function autoEncounter(state: GameState, data: GameData = gameData): GameState {
  let s = state;
  while (s.encounter !== null) {
    const ok = powerRatio(s, monsterOf(s.encounter.monsterId, data), data) >= data.monsters.rules.autoMinRatio;
    s = huntChoose(s, ok ? "steady" : "flee", data);
  }
  return s;
}

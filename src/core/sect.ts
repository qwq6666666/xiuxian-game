// 宗門（M25）：入宗、離宗、位階、月例與貢獻、同門。
// 宗門本身由世界快照決定（不進存檔）；存檔只記玩家的身分。同門名字由世界種子推算，不耗亂數。
import { gameData } from "../data/load";
import { DEFAULT_SLOTS, type SlotValues } from "../data/slots";
import type { GameData, SectRankDef } from "../data/types";
import { addLog } from "./progress";
import { deriveSeed, nextInt, nextRandom } from "./rng";
import type { GameState } from "./state";
import { snapshotOf } from "./worldeffects";
import { worldFor, worldSlots, type WorldSect } from "./world";

const OPEN_STATES = ["prosper", "stable", "decline"] as const;
type OpenState = (typeof OPEN_STATES)[number];

const isOpen = (sect: WorldSect): boolean => (OPEN_STATES as readonly string[]).includes(sect.state);

export function rankOf(state: GameState, data: GameData = gameData): SectRankDef | null {
  return state.sect === null ? null : data.sects.ranks[state.sect.rank];
}

/** 所屬宗門此刻在世界裡的樣子；宗門不存在視為已覆滅 */
export function memberSect(state: GameState, data: GameData = gameData): WorldSect | undefined {
  if (state.sect === null) return undefined;
  return snapshotOf(state, data).sects.find((s) => s.id === state.sect!.id);
}

/** 人正好在某個宗門山門外（M22 的旅行抵達）時，回傳那個宗門 */
export function localSect(state: GameState, data: GameData = gameData): WorldSect | undefined {
  if (state.travel.targetId !== null) return undefined;
  const id = state.travel.locationId;
  if (!id.startsWith("sect:")) return undefined;
  return snapshotOf(state, data).sects.find((s) => `sect:${s.id}` === id);
}

function realmReached(state: GameState, realmId: string, stage: number, data: GameData): boolean {
  const idx = (id: string): number => data.realms.findIndex((r) => r.id === id);
  const here = idx(state.realmId);
  const need = idx(realmId);
  return here > need || (here === need && state.stage >= stage);
}

/** 入宗試煉的成功率；宗門不收人時為 0 */
export function joinRate(state: GameState, sect: WorldSect, data: GameData = gameData): number {
  if (!isOpen(sect)) return 0;
  const j = data.sects.join;
  const rate =
    j.baseRate[sect.rank] * j.stateMult[sect.state as OpenState] +
    state.attributes.insight * j.insightBonus +
    state.attributes.bone * j.boneBonus +
    (j.rootBonus[state.spiritRootId] ?? 0);
  return Math.min(1, Math.max(0, rate));
}

/** 現在能不能向所在山門求入宗 */
export function canJoinSect(state: GameState, data: GameData = gameData): boolean {
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.sect !== null) return false;
  const sect = localSect(state, data);
  if (!sect || !isOpen(sect) || state.sectsTried.includes(sect.id)) return false;
  return realmReached(state, data.sects.join.minRealm, data.sects.join.minStage, data);
}

/** 求入宗：抽一次試煉，成功入外門，失敗記入已試過。每個宗門每世只能試一次。 */
export function joinSect(state: GameState, data: GameData = gameData): GameState {
  if (!canJoinSect(state, data)) return state;
  const sect = localSect(state, data)!;
  const [v, seed] = nextRandom(state.rngSeed);
  const limit = data.config.logLimit;
  const base: GameState = { ...state, rngSeed: seed, sectsTried: [...state.sectsTried, sect.id] };
  if (v >= joinRate(state, sect, data)) {
    return addLog(base, { month: state.ageMonths, kind: "sectRefuse", realmId: state.realmId, stage: state.stage, sectName: sect.name }, limit);
  }
  const joined: GameState = {
    ...base,
    sect: { id: sect.id, rank: 0, contribution: 0, joinedAge: state.ageMonths },
    sectPeak: Math.max(state.sectPeak, 1),
  };
  return addLog(joined, { month: state.ageMonths, kind: "sectJoin", realmId: state.realmId, stage: state.stage, sectName: sect.name, rank: 0 }, limit);
}

/** 離開宗門：失去身分與貢獻，這一世不能再入同一宗；差事安排改回第一個安排。collapsed 表示宗門閉山或覆滅。 */
export function leaveSect(state: GameState, data: GameData = gameData, collapsed = false): GameState {
  if (state.sect === null) return state;
  const name = memberSect(state, data)?.name ?? "";
  const left: GameState = {
    ...state,
    sect: null,
    sectsTried: state.sectsTried.includes(state.sect.id) ? state.sectsTried : [...state.sectsTried, state.sect.id],
    schedule: state.schedule === data.sects.dutySchedule ? data.schedules[0].id : state.schedule,
    flags: collapsed && !state.flags.includes("sect_collapse") ? [...state.flags, "sect_collapse"] : state.flags,
  };
  return addLog(left, { month: state.ageMonths, kind: "sectLeave", realmId: state.realmId, stage: state.stage, sectName: name, rank: state.sect.rank }, data.config.logLimit);
}

/** 下一個位階（沒有，或這種宗門到頂了，就是 null） */
export function nextRank(state: GameState, data: GameData = gameData): { index: number; def: SectRankDef } | null {
  const sect = memberSect(state, data);
  if (state.sect === null || !sect) return null;
  const index = state.sect.rank + 1;
  if (index > data.sects.maxRank[sect.rank] || index >= data.sects.ranks.length) return null;
  return { index, def: data.sects.ranks[index] };
}

export function canPromoteSect(state: GameState, data: GameData = gameData): boolean {
  if (state.phase !== "living" || state.pendingEvent !== null || state.tribulation !== null || state.sect === null) return false;
  const next = nextRank(state, data);
  if (!next?.def.promote) return false;
  return state.sect.contribution >= next.def.promote.contribution && realmReached(state, next.def.promote.realm, 0, data);
}

/** 晉升：確定性，不抽亂數 */
export function promoteSect(state: GameState, data: GameData = gameData): GameState {
  if (!canPromoteSect(state, data)) return state;
  const next = nextRank(state, data)!;
  const name = memberSect(state, data)?.name ?? "";
  const promoted: GameState = {
    ...state,
    sect: { ...state.sect!, rank: next.index },
    sectPeak: Math.max(state.sectPeak, next.index + 1),
  };
  return addLog(promoted, { month: state.ageMonths, kind: "sectPromote", realmId: state.realmId, stage: state.stage, sectName: name, rank: next.index }, data.config.logLimit);
}

/** 位階加成 × 宗門規模 × 興衰；沒入宗或宗門已不收人為 0 */
export function sectBonus(state: GameState, data: GameData = gameData): number {
  const rank = rankOf(state, data);
  const sect = memberSect(state, data);
  if (!rank || !sect || !isOpen(sect)) return 0;
  return rank.bonus * data.sects.scale[sect.rank] * data.sects.bonusState[sect.state as OpenState];
}

/** 每年月例靈石（四捨五入）；入宗滿一年、兩年……各發一次 */
export function sectStipend(state: GameState, data: GameData = gameData): number {
  const rank = rankOf(state, data);
  const sect = memberSect(state, data);
  if (!rank || !sect || !isOpen(sect)) return 0;
  return Math.round(rank.stipend * data.sects.scale[sect.rank] * data.sects.bonusState[sect.state as OpenState]);
}

/** 每月呼叫：宗門閉山或覆滅就自動離宗，否則每滿一年發月例、記差事貢獻 */
export function stepSect(state: GameState, data: GameData = gameData): GameState {
  if (state.sect === null) return state;
  const sect = memberSect(state, data);
  if (!sect || !isOpen(sect)) return leaveSect(state, data, true);
  const duty = state.schedule === data.sects.dutySchedule ? rankOf(state, data)!.duty : 0;
  const served = state.ageMonths - state.sect.joinedAge;
  const payday = served > 0 && served % 12 === 0;
  return {
    ...state,
    spiritStones: state.spiritStones + (payday ? sectStipend(state, data) : 0),
    sect: { ...state.sect, contribution: state.sect.contribution + duty },
  };
}

/** 入宗者的三位同門：由世界種子、宗門與入宗年齡推算，不耗亂數、不進存檔 */
export function companionsOf(state: GameState, data: GameData = gameData): { peer: string; steward: string; elder: string } | null {
  if (state.sect === null) return null;
  let salt = state.sect.joinedAge;
  for (const ch of state.sect.id) salt = (salt * 31 + ch.charCodeAt(0)) >>> 0;
  let seed = deriveSeed(state.worldSeed, salt);
  const names: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [si, s1] = nextInt(seed, 0, data.names.surnames.length - 1);
    const [gi, s2] = nextInt(s1, 0, data.names.given.length - 1);
    names.push(data.names.surnames[si] + data.names.given[gi]);
    seed = s2;
  }
  return { peer: names[0], steward: names[1], elder: names[2] };
}

/** 名稱欄位：世界名稱加上入宗者的同門名字（沒入宗用通用稱呼） */
export function slotsFor(state: GameState, data: GameData = gameData): SlotValues {
  const base = worldSlots(worldFor(state.worldSeed, data));
  const c = companionsOf(state, data);
  return c ? { ...base, ...c } : { ...base, peer: DEFAULT_SLOTS.peer, steward: DEFAULT_SLOTS.steward, elder: DEFAULT_SLOTS.elder };
}

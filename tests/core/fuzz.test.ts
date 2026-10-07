import { describe, expect, it } from "vitest";
import { buyItem, canBuyItem, canUseItem, setSchedule, useItem } from "../../src/core/actions";
import { canBreakthrough, attemptBreakthrough, autoTribulation } from "../../src/core/character/breakthrough";
import { HUNT_CHOICES, huntChoose } from "../../src/core/combat/encounter";
import { canChoose, chooseEvent, eventOf } from "../../src/core/events";
import { createInitialState, startLife } from "../../src/core/life";
import { isFree } from "../../src/core/pause";
import { nextRandom } from "../../src/core/rng";
import { deserialize, serialize } from "../../src/core/save";
import type { GameState } from "../../src/core/state";
import { atBottleneck, tick } from "../../src/core/tick";
import { gameData } from "../../src/data/load";

// 隨機亂玩幾世：每個檢查點都要能存讀還原、不變量不被破壞。目的是在改動核心或存檔後，
// 抓到「某個狀態組合存不回來」或「數值跑出範圍」這類單元測試不容易想到的錯。

/** 測試自己的亂數（與遊戲亂數分開） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    const [v, next] = nextRandom(s);
    s = next;
    return v;
  };
}

function invariants(s: GameState, label: string): void {
  expect(s.spiritStones, `${label} 靈石`).toBeGreaterThanOrEqual(0);
  expect(s.cultivation, `${label} 修為`).toBeGreaterThanOrEqual(0);
  for (const [id, n] of Object.entries(s.items)) expect(n, `${label} 物品 ${id}`).toBeGreaterThanOrEqual(0);
  const realm = gameData.realms.find((r) => r.id === s.realmId);
  expect(realm, `${label} 境界 ${s.realmId}`).toBeDefined();
  expect(s.stage, `${label} 階段`).toBeGreaterThanOrEqual(0);
  expect(s.stage, `${label} 階段`).toBeLessThanOrEqual(Math.max(0, realm!.stageNames.length - 1));
  expect(new Set(s.flags).size, `${label} 旗標重複`).toBe(s.flags.length);
  if (s.trial !== null) expect(s.encounter, `${label} 秘境進行中遇怪必須存在`).not.toBeNull();
}

function roundTrips(s: GameState, label: string): void {
  const back = deserialize(serialize(s), gameData);
  expect(back, `${label} 存讀後不同`).toEqual(s);
}

/** 各種等待狀態實際被檢查到的次數，確認亂玩真的走進這些路徑 */
const visited = { event: 0, encounter: 0, tribulation: 0, realms: new Set<string>() };

function play(seed: number, maxMonths: number): void {
  const r = rng(seed * 7919 + 1);
  let s = startLife(createInitialState(seed, gameData), gameData);
  const schedules = gameData.schedules.map((x) => x.id);
  let months = 0;
  while (s.phase === "living" && months < maxMonths) {
    const label = `種子 ${seed} 第 ${months} 個月`;
    const before = s.ageMonths;
    s = tick(s, 1, gameData);
    if (s.phase === "living" && isFree(s)) expect(s.ageMonths, `${label} 年齡`).toBeGreaterThanOrEqual(before);
    months++;
    if (s.encounter !== null) {
      visited.encounter++;
      invariants(s, label);
      roundTrips(s, label);
    }
    if (s.encounter !== null) s = huntChoose(s, HUNT_CHOICES[Math.floor(r() * HUNT_CHOICES.length)], gameData);
    if (s.pendingEvent !== null) {
      visited.event++;
      invariants(s, label);
      roundTrips(s, label);
      const ev = eventOf(s.pendingEvent, gameData);
      const ok = (ev.choices ?? []).map((c, i) => (canChoose(s, c) ? i : -1)).filter((i) => i >= 0);
      if (ok.length > 0) s = chooseEvent(s, ok[Math.floor(r() * ok.length)], gameData);
    }
    if (s.phase !== "living") break;
    if (isFree(s)) {
      if (r() < 0.05) s = setSchedule(s, schedules[Math.floor(r() * schedules.length)], gameData);
      if (r() < 0.05 && canBuyItem(s, "juqi_dan", gameData)) s = buyItem(s, "juqi_dan", gameData);
      if (r() < 0.05 && canUseItem(s, "juqi_dan", gameData)) s = useItem(s, "juqi_dan", gameData);
      if (atBottleneck(s, gameData) && canBreakthrough(s, gameData)) {
        s = attemptBreakthrough(s, false, gameData);
        if (s.tribulation !== null) {
          visited.tribulation++;
          roundTrips(s, label);
        }
        s = autoTribulation(s, gameData);
      }
    }
    invariants(s, label);
    visited.realms.add(s.realmId);
    // 等待中的狀態（抉擇、遇怪、天劫）與每隔一陣子都要能存讀
    if (s.pendingEvent !== null || s.encounter !== null || s.tribulation !== null || months % 40 === 0) roundTrips(s, label);
  }
  roundTrips(s, `種子 ${seed} 結束`);
}

describe("亂玩幾世（存讀還原與不變量）", () => {
  it.each([1, 2, 3, 4, 5, 6])("種子 %i：一世之內每個檢查點都能存讀還原", (seed) => {
    play(seed, 1500);
  });

  it("亂玩真的走過抉擇、遇怪與練氣以後的境界", () => {
    expect(visited.event).toBeGreaterThan(5);
    expect(visited.encounter).toBeGreaterThan(0);
    expect(visited.realms.has("lianqi")).toBe(true);
  });

  it("tick 是可分割的：一次走 n 個月等於分開走", () => {
    const s0 = startLife(createInitialState(11, gameData), gameData);
    const a = tick(s0, 24, gameData);
    let b = s0;
    for (let i = 0; i < 24 && isFree(b); i++) b = tick(b, 1, gameData);
    expect(a).toEqual(b);
  });
});

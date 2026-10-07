// 閉關見聞的文字（M45）：日誌只存事實，文字在顯示時由事實與世界種子算出，同樣的輸入永遠得到同樣的句子。
// 不消耗遊戲的亂數（rngSeed），只用 deriveSeed 衍生。
import { gameData } from "../../data/load";
import type { GameData, RetreatMood } from "../../data/types";
import { deriveSeed, nextInt, nextRandom } from "../rng";
import type { LogEntry } from "../state";

const SALT_ORDER = 0x4d45;
const SALT_ROLL = 0x4d46;

/** 這次閉關的語氣：卡在瓶頸偏焦躁，壽元將盡或已用掉大半偏孤寂，其餘平靜 */
export function retreatMood(entry: LogEntry, data: GameData = gameData): RetreatMood {
  if (entry.stop === "bottleneck") return "anxious";
  if (entry.stop === "lifespan") return "lonely";
  const realm = data.realms.find((r) => r.id === entry.realmId);
  if (realm && entry.month / 12 / realm.lifespan >= data.config.retreatLonelyRatio) return "lonely";
  return "calm";
}

/** 依種子洗牌，回傳 0..n-1 的一個排列 */
function shuffled(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    let j: number;
    [j, s] = nextInt(s, 0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * 意象的序號：同一世（同一個世界種子）第 no 次閉關見聞，依洗牌後的順序取下一個符合語氣的意象。
 * 只要意象夠多，一世內不會重複。
 */
export function retreatThemeIndex(no: number, seed: number, mood: RetreatMood, data: GameData = gameData): number {
  const themes = data.text.log.retreat.themes;
  const order = shuffled(themes.length, deriveSeed(seed, SALT_ORDER));
  for (let k = 0; k < order.length; k++) {
    const idx = order[(no + k) % order.length];
    if (mood === "lonely" || !themes[idx].lonely) return idx;
  }
  return order[no % order.length];
}

const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length)];

/** 把一筆閉關見聞組成句子（不含年齡前綴） */
export function composeRetreat(entry: LogEntry, data: GameData = gameData): string {
  const { retreat } = data.text.log;
  const months = entry.retreatMonths ?? 0;
  const tailPool = entry.stop === "bottleneck" || entry.stop === "lifespan" ? retreat.stop[entry.stop] : [];
  const tail = (n: number): string => (tailPool.length > 0 ? tailPool[n % tailPool.length] : "");
  if (months / 12 < data.config.retreatBriefYears) {
    return retreat.brief[months % retreat.brief.length] + tail(months);
  }

  // 沒有序號的舊檔：以年齡推出一個序號，同樣穩定
  const no = entry.retreatNo ?? Math.floor(entry.month / 12);
  const seed = entry.retreatSeed ?? 0;
  const mood = retreatMood(entry, data);
  let s = deriveSeed(seed, SALT_ROLL + no * 8);
  const roll = (): number => {
    let v: number;
    [v, s] = nextRandom(s);
    return v;
  };

  if (retreat.rare.length > 0 && roll() < data.config.retreatRareChance) {
    return `【偶得】${pick(retreat.rare, roll())}`;
  }
  const theme = retreat.themes[retreatThemeIndex(no, seed, mood, data)];
  const feelSet = retreat.feel[entry.realmId] ?? retreat.feel.default;
  const feelPool = feelSet[mood].length > 0 ? feelSet[mood] : retreat.feel.default[mood];
  const feel = pick(feelPool, roll());
  const useGag = roll() < data.config.retreatGagChance;
  const ending = tailPool.length > 0 ? tail(months) : useGag ? theme.gag : pick(theme.exit, roll());
  return theme.open + feel + ending;
}

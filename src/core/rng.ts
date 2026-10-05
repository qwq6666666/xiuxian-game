// 可設種子的亂數產生器（mulberry32）。
// 狀態就是一個 32 位元整數，存在遊戲狀態裡，存檔後亂數序列可以接續。

/** 回傳 [0, 1) 的亂數與新的種子 */
export function nextRandom(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

/** 回傳 [min, max] 的整數與新的種子 */
export function nextInt(seed: number, min: number, max: number): [number, number] {
  const [v, s] = nextRandom(seed);
  return [min + Math.floor(v * (max - min + 1)), s];
}

/** 依權重抽一個，回傳索引與新的種子 */
export function pickWeighted(
  seed: number,
  items: readonly { weight: number }[],
): [number, number] {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  const [v, s] = nextRandom(seed);
  let r = v * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].weight;
    if (r < 0) return [i, s];
  }
  return [items.length - 1, s];
}

/**
 * 由種子與編號雜湊出另一個種子，不消耗也不改變原本的亂數序列。
 * 世界生成靠它取得自己的種子，才不會讓既有的模擬結果位移。
 */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

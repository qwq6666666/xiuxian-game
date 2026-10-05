// 數值公式集中處。M0 只有時間換算，之後的修煉、突破公式放這裡。

/** 現實經過的毫秒數換算成遊戲月數（含小數） */
export function msToMonths(ms: number, speed: number, msPerMonth: number): number {
  return (ms * speed) / msPerMonth;
}

/** 月數拆成 [歲, 月] */
export function splitAge(ageMonths: number): [number, number] {
  return [Math.floor(ageMonths / 12), ageMonths % 12];
}

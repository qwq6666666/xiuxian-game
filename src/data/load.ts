import configJson from "./config.json";

export interface GameConfig {
  /** 速度 ×1 時，現實多少毫秒等於遊戲 1 個月 */
  msPerMonth: number;
  speeds: number[];
  startAgeYears: number;
  /** 單次更新最多補算幾個月，避免分頁回到前景時一次衝太多 */
  maxCatchUpMonths: number;
}

/** 檢查資料格式，錯誤訊息指出是哪一筆資料的哪個欄位 */
export function validateConfig(raw: unknown, source = "config.json"): GameConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${source}：內容必須是物件`);
  }
  const o = raw as Record<string, unknown>;
  const positive = (key: string): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new Error(`${source}：欄位 ${key} 必須是正數，目前為 ${JSON.stringify(v)}`);
    }
    return v;
  };
  const msPerMonth = positive("msPerMonth");
  const speeds = o.speeds;
  if (
    !Array.isArray(speeds) ||
    speeds.length === 0 ||
    !speeds.every((s) => typeof s === "number" && s > 0)
  ) {
    throw new Error(`${source}：欄位 speeds 必須是非空的正數陣列`);
  }
  return {
    msPerMonth,
    speeds: speeds as number[],
    startAgeYears: positive("startAgeYears"),
    maxCatchUpMonths: positive("maxCatchUpMonths"),
  };
}

export const config: GameConfig = validateConfig(configJson);

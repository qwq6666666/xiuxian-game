import { SAVE_VERSION, type GameState } from "./state";

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 舊版存檔遷移。key 是來源版本，函式把它升到下一版。 */
const migrations: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 目前只有 v1，之後改動存檔結構時在這裡加 1: (d) => ({ ...d, version: 2, ... })
};

function checkNumber(o: Record<string, unknown>, key: string, integer = false): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v))) {
    throw new Error(`存檔：欄位 ${key} 必須是${integer ? "整數" : "數字"}，目前為 ${JSON.stringify(v)}`);
  }
  return v;
}

/** 讀取存檔，格式錯誤時丟出指出欄位的錯誤 */
export function deserialize(text: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("存檔：內容不是合法的 JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error("存檔：內容必須是物件");
  }
  let data = raw as Record<string, unknown>;
  let version = checkNumber(data, "version", true);
  if (version > SAVE_VERSION) {
    throw new Error(`存檔：版本 ${version} 比遊戲支援的 ${SAVE_VERSION} 新`);
  }
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new Error(`存檔：找不到版本 ${version} 的遷移函式`);
    data = migrate(data);
    version = checkNumber(data, "version", true);
  }
  return {
    version,
    rngSeed: checkNumber(data, "rngSeed", true),
    ageMonths: checkNumber(data, "ageMonths", true),
    speed: checkNumber(data, "speed"),
  };
}

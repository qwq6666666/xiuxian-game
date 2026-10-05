export const SAVE_VERSION = 1;

export type Speed = number;

export interface GameState {
  version: number;
  rngSeed: number;
  /** 年齡，以月為單位 */
  ageMonths: number;
  speed: Speed;
}

export function createInitialState(
  seed: number,
  startAgeYears: number,
): GameState {
  return {
    version: SAVE_VERSION,
    rngSeed: seed >>> 0,
    ageMonths: startAgeYears * 12,
    speed: 1,
  };
}

import configJson from "./config.json";
import originsJson from "./origins.json";
import realmsJson from "./realms.json";
import spiritRootsJson from "./spiritRoots.json";
import textJson from "./text.json";
import type { GameData } from "./types";
import {
  validateConfig,
  validateGameData,
  validateOrigins,
  validateRealms,
  validateSpiritRoots,
  validateText,
} from "./validate";

export const gameData: GameData = validateGameData({
  config: validateConfig(configJson),
  realms: validateRealms(realmsJson),
  spiritRoots: validateSpiritRoots(spiritRootsJson),
  origins: validateOrigins(originsJson),
  text: validateText(textJson),
});

export const config = gameData.config;

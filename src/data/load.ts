import configJson from "./config.json";
import itemsJson from "./items.json";
import originsJson from "./origins.json";
import realmsJson from "./realms.json";
import schedulesJson from "./schedules.json";
import spiritRootsJson from "./spiritRoots.json";
import textJson from "./text.json";
import type { GameData } from "./types";
import {
  validateConfig,
  validateGameData,
  validateItems,
  validateOrigins,
  validateRealms,
  validateSchedules,
  validateSpiritRoots,
  validateText,
} from "./validate";

export const gameData: GameData = validateGameData({
  config: validateConfig(configJson),
  realms: validateRealms(realmsJson),
  schedules: validateSchedules(schedulesJson),
  items: validateItems(itemsJson),
  spiritRoots: validateSpiritRoots(spiritRootsJson),
  origins: validateOrigins(originsJson),
  text: validateText(textJson),
});

export const config = gameData.config;

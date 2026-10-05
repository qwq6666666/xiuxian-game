import configJson from "./config.json";
import eventsJson from "./events.json";
import itemsJson from "./items.json";
import originsJson from "./origins.json";
import realmsJson from "./realms.json";
import schedulesJson from "./schedules.json";
import spiritRootsJson from "./spiritRoots.json";
import talentsJson from "./talents.json";
import textJson from "./text.json";
import type { GameData } from "./types";
import {
  validateConfig,
  validateEvents,
  validateGameData,
  validateItems,
  validateOrigins,
  validateRealms,
  validateSchedules,
  validateSpiritRoots,
  validateTalents,
  validateText,
} from "./validate";

export const gameData: GameData = validateGameData({
  config: validateConfig(configJson),
  realms: validateRealms(realmsJson),
  schedules: validateSchedules(schedulesJson),
  items: validateItems(itemsJson),
  events: validateEvents(eventsJson),
  talents: validateTalents(talentsJson),
  spiritRoots: validateSpiritRoots(spiritRootsJson),
  origins: validateOrigins(originsJson),
  text: validateText(textJson),
});

export const config = gameData.config;

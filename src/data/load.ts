import configJson from "./config.json";
import goalsJson from "./goals.json";
import eventsJson from "./events.json";
import yuanyingEventsJson from "./events/yuanying.json";
import fragmentsJson from "./fragments.json";
import itemsJson from "./items.json";
import erasJson from "./eras.json";
import namesJson from "./names.json";
import originsJson from "./origins.json";
import realmsJson from "./realms.json";
import schedulesJson from "./schedules.json";
import spiritRootsJson from "./spiritRoots.json";
import talentsJson from "./talents.json";
import textJson from "./text.json";
import mapJson from "./map.json";
import worldEffectsJson from "./worldEffects.json";
import worldEventsJson from "./worldEvents.json";
import worldNamesJson from "./worldNames.json";
import type { GameData } from "./types";
import {
  validateConfig,
  validateEras,
  validateEventFiles,
  validateFragments,
  validateGameData,
  validateGoals,
  validateItems,
  validateNames,
  validateOrigins,
  validateRealms,
  validateSchedules,
  validateSpiritRoots,
  validateTalents,
  validateMap,
  validateText,
  validateWorldEffects,
  validateWorldEvents,
  validateWorldNames,
} from "./validate";

export const gameData: GameData = validateGameData({
  config: validateConfig(configJson),
  realms: validateRealms(realmsJson),
  schedules: validateSchedules(schedulesJson),
  items: validateItems(itemsJson),
  // 新增事件檔：在 src/data/events/ 放 json，並在這裡加一行（只有整合者改這個檔）
  events: validateEventFiles([
    { file: "events.json", raw: eventsJson },
    { file: "events/yuanying.json", raw: yuanyingEventsJson },
  ]),
  talents: validateTalents(talentsJson),
  spiritRoots: validateSpiritRoots(spiritRootsJson),
  origins: validateOrigins(originsJson),
  text: validateText(textJson),
  names: validateNames(namesJson),
  fragments: validateFragments(fragmentsJson),
  worldNames: validateWorldNames(worldNamesJson),
  map: validateMap(mapJson),
  worldEvents: validateWorldEvents(worldEventsJson),
  worldEffects: validateWorldEffects(worldEffectsJson),
  goals: validateGoals(goalsJson),
  eras: validateEras(erasJson),
});

export const config = gameData.config;

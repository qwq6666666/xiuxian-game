import configJson from "./config.json";
import goalsJson from "./goals.json";
import eventsJson from "./events.json";
import yuanyingEventsJson from "./events/yuanying.json";
import introEventsJson from "./events/intro.json";
import sectEventsJson from "./events/sect.json";
import zhujiEventsJson from "./events/zhuji.json";
import fragmentsJson from "./fragments.json";
import itemsJson from "./items.json";
import erasJson from "./eras.json";
import namesJson from "./names.json";
import methodsJson from "./methods.json";
import originsJson from "./origins.json";
import recipesJson from "./recipes.json";
import realmsJson from "./realms.json";
import schedulesJson from "./schedules.json";
import sectsJson from "./sects.json";
import tribulationJson from "./tribulation.json";
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
  validateMethods,
  validateRealms,
  validateRecipes,
  validateSchedules,
  validateSects,
  validateTribulation,
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
  recipes: validateRecipes(recipesJson),
  methods: validateMethods(methodsJson),
  // 新增事件檔：在 src/data/events/ 放 json，並在這裡加一行（只有整合者改這個檔）
  events: validateEventFiles([
    { file: "events.json", raw: eventsJson },
    { file: "events/yuanying.json", raw: yuanyingEventsJson },
    { file: "events/intro.json", raw: introEventsJson },
    { file: "events/sect.json", raw: sectEventsJson },
    { file: "events/zhuji.json", raw: zhujiEventsJson },
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
  sects: validateSects(sectsJson),
  tribulation: validateTribulation(tribulationJson),
  eras: validateEras(erasJson),
});

export const config = gameData.config;

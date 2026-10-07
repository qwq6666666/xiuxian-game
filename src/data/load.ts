import configJson from "./config.json";
import achievementsJson from "./achievements.json";
import goalsJson from "./goals.json";
import eventsJson from "./events.json";
import base2EventsJson from "./events/base2.json";
import base3EventsJson from "./events/base3.json";
import base4EventsJson from "./events/base4.json";
import yuanyingEventsJson from "./events/yuanying.json";
import introEventsJson from "./events/intro.json";
import openingEventsJson from "./events/opening.json";
import lianqiEventsJson from "./events/lianqi.json";
import sectEventsJson from "./events/sect.json";
import zhujiEventsJson from "./events/zhuji.json";
import prepEventsJson from "./events/prep.json";
import fragmentsJson from "./fragments.json";
import itemsJson from "./items.json";
import erasJson from "./eras.json";
import acquaintancesJson from "./acquaintances.json";
import reunionEventsJson from "./events/reunion.json";
import chainsEventsJson from "./events/chains.json";
import namesJson from "./names.json";
import methodsJson from "./methods.json";
import originsJson from "./origins.json";
import recipesJson from "./recipes.json";
import monstersJson from "./monsters.json";
import stancesJson from "./stances.json";
import trialsJson from "./trials.json";
import realmsJson from "./realms.json";
import schedulesJson from "./schedules.json";
import sectsJson from "./sects.json";
import tribulationJson from "./tribulation.json";
import spiritRootsJson from "./spiritRoots.json";
import talentsJson from "./talents.json";
import textJson from "./text.json";
import mapJson from "./map.json";
import mapartJson from "./mapart.json";
import worldEffectsJson from "./worldEffects.json";
import worldEventsJson from "./worldEvents.json";
import worldRelationsJson from "./worldRelations.json";
import worldNamesJson from "./worldNames.json";
import type { GameData } from "./types";
import {
  validateConfig,
  validateAcquaintances,
  validateAchievements,
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
  validateMonsters,
  validateSchedules,
  validateSects,
  validateTribulation,
  validateStances,
  validateTrials,
  validateSpiritRoots,
  validateTalents,
  validateMap,
  validateMapArt,
  validateText,
  validateWorldEffects,
  validateWorldEvents,
  validateWorldRelations,
  validateWorldNames,
} from "./validate";

const realmsData = validateRealms(realmsJson);
const itemsData = validateItems(itemsJson);
const monstersData = validateMonsters(
  monstersJson,
  realmsData.map((r) => r.id),
  itemsData.map((i) => i.id),
);

export const gameData: GameData = validateGameData({
  config: validateConfig(configJson),
  realms: realmsData,
  schedules: validateSchedules(schedulesJson),
  items: itemsData,
  recipes: validateRecipes(recipesJson),
  monsters: monstersData,
  trials: validateTrials(
    trialsJson,
    monstersData.monsters,
    realmsData.map((r) => r.id),
    itemsData.map((i) => i.id),
  ),
  stances: validateStances(stancesJson),
  methods: validateMethods(methodsJson),
  // 新增事件檔：在 src/data/events/ 放 json，並在這裡加一行（只有整合者改這個檔）
  events: validateEventFiles([
    { file: "events.json", raw: eventsJson },
    { file: "events/base2.json", raw: base2EventsJson },
    { file: "events/base3.json", raw: base3EventsJson },
    { file: "events/base4.json", raw: base4EventsJson },
    { file: "events/yuanying.json", raw: yuanyingEventsJson },
    { file: "events/intro.json", raw: introEventsJson },
    { file: "events/opening.json", raw: openingEventsJson },
    { file: "events/lianqi.json", raw: lianqiEventsJson },
    { file: "events/reunion.json", raw: reunionEventsJson },
    { file: "events/chains.json", raw: chainsEventsJson },
    { file: "events/sect.json", raw: sectEventsJson },
    { file: "events/zhuji.json", raw: zhujiEventsJson },
    { file: "events/prep.json", raw: prepEventsJson },
  ]),
  talents: validateTalents(talentsJson),
  spiritRoots: validateSpiritRoots(spiritRootsJson),
  origins: validateOrigins(originsJson),
  text: validateText(textJson),
  names: validateNames(namesJson),
  fragments: validateFragments(fragmentsJson),
  worldNames: validateWorldNames(worldNamesJson),
  map: validateMap(mapJson),
  mapart: validateMapArt(mapartJson),
  worldEvents: validateWorldEvents(worldEventsJson),
  worldRelations: validateWorldRelations(worldRelationsJson),
  worldEffects: validateWorldEffects(worldEffectsJson),
  goals: validateGoals(goalsJson),
  achievements: validateAchievements(achievementsJson),
  sects: validateSects(sectsJson),
  tribulation: validateTribulation(tribulationJson),
  eras: validateEras(erasJson),
  acquaintances: validateAcquaintances(acquaintancesJson),
});

export const config = gameData.config;

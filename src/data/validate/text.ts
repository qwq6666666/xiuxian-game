import { type Obj } from "../check";
import { SLOT_NAMES } from "../slots";
import {
  type AcquaintanceDef,
  REVIEW_CAUSES,
  type ClosingVariant,
  type FragmentData,
  type FragmentDef,
  type WorldNames,
  type NameData,
  type TextData,
  RETREAT_MOODS,
  type RetreatFeel,
  type RetreatTheme,
} from "../types";
import { bool, fail, obj, list, num, str, strList, uniqueIds } from "./common";

export function validateText(raw: unknown, file = "text.json"): TextData {
  const o = obj(raw, file);
  const log = obj(o.log, `${file} 欄位 log`);
  const where = `${file} 欄位 log`;
  const retreat = obj(log.retreat, `${where}.retreat`);
  const retreatStop = obj(retreat.stop, `${where}.retreat.stop`);
  const strRecord = (key: string): Record<string, string> => {
    const raw = obj(log[key], `${where}.${key}`);
    const out: Record<string, string> = {};
    for (const k of Object.keys(raw)) out[k] = str(raw, k, `${where}.${key}`);
    return out;
  };
  // 先檢查 review，缺欄位時錯誤訊息的順序才穩定
  const review = parseReview(o.review, `${file} 欄位 review`);
  const collection = obj(o.collection, `${file} 欄位 collection`);
  const era = obj(o.era, `${file} 欄位 era`);
  return {
    log: {
      stageUp: strList(log, "stageUp", where),
      realmUp: strRecord("realmUp"),
      bottleneck: str(log, "bottleneck", where),
      death: str(log, "death", where),
      breakthroughSuccess: strRecord("breakthroughSuccess"),
      breakthroughFail: strList(log, "breakthroughFail", where),
      buy: strList(log, "buy", where),
      buyRemote: strList(log, "buyRemote", where),
      find: strList(log, "find", where),
      adventureDeath: str(log, "adventureDeath", where),
      zuohua: str(log, "zuohua", where),
      stageMilestone: strRecord("stageMilestone"),
      tribulationFail: str(log, "tribulationFail", where),
      alchemy: (() => {
        const aw = `${where}.alchemy`;
        const ao = obj(log.alchemy, aw);
        return { done: str(ao, "done", aw), fail: str(ao, "fail", aw), stop: str(ao, "stop", aw) };
      })(),
      forge: (() => {
        const fw = `${where}.forge`;
        const fo = obj(log.forge, fw);
        return { done: str(fo, "done", fw), fail: str(fo, "fail", fw) };
      })(),
      sect: (() => {
        const sw = `${where}.sect`;
        const so = obj(log.sect, sw);
        return { join: str(so, "join", sw), refuse: str(so, "refuse", sw), leave: str(so, "leave", sw), promote: ((): Record<string, string> => {
          const po = obj(so.promote, `${sw}.promote`);
          const out: Record<string, string> = {};
          for (const k of Object.keys(po)) out[k] = str(po, k, `${sw}.promote`);
          return out;
        })() };
      })(),
      retreat: {
        brief: strList(retreat, "brief", `${where}.retreat`),
        themes: parseRetreatThemes(retreat.themes, `${where}.retreat.themes`),
        feel: parseRetreatFeel(retreat.feel, `${where}.retreat.feel`),
        rare: strList(retreat, "rare", `${where}.retreat`),
        stop: {
          bottleneck: strList(retreatStop, "bottleneck", `${where}.retreat.stop`),
          lifespan: strList(retreatStop, "lifespan", `${where}.retreat.stop`),
        },
      },
    },
    era: {
      opening: strList(era, "opening", `${file} 欄位 era`),
      transition: str(era, "transition", `${file} 欄位 era`),
      born: str(era, "born", `${file} 欄位 era`),
      origin: strListRecord(era, "origin", `${file} 欄位 era`),
      root: strListRecord(era, "root", `${file} 欄位 era`),
    },
    breakthroughGate: str(o, "breakthroughGate", file),
    talentAdvice: (() => {
      const g = obj(o.talentAdvice, `${file} 欄位 talentAdvice`);
      const w = `${file} 欄位 talentAdvice`;
      return {
        gate: str(g, "gate", w),
        preview: str(g, "preview", w),
        shortfall: str(g, "shortfall", w),
        total: str(g, "total", w),
        thresholdMet: str(g, "thresholdMet", w),
        threshold: str(g, "threshold", w),
      };
    })(),
    versus: (() => {
      const g = obj(o.versus, `${file} 欄位 versus`);
      const w = `${file} 欄位 versus`;
      return {
        ageMore: str(g, "ageMore", w),
        ageLess: str(g, "ageLess", w),
        ageSame: str(g, "ageSame", w),
        progressFar: str(g, "progressFar", w),
        progressShort: str(g, "progressShort", w),
        progressSame: str(g, "progressSame", w),
        originDiff: str(g, "originDiff", w),
      };
    })(),
    guide: (() => {
      const g = obj(o.guide, `${file} 欄位 guide`);
      const w = `${file} 欄位 guide`;
      return { bone: str(g, "bone", w), insight: str(g, "insight", w), fortune: str(g, "fortune", w), mind: str(g, "mind", w), spiritRoot: str(g, "spiritRoot", w) };
    })(),
    review,
    collection: {
      note: str(collection, "note", `${file} 欄位 collection`),
      empty: str(collection, "empty", `${file} 欄位 collection`),
      allCleared: str(collection, "allCleared", `${file} 欄位 collection`),
    },
  };
}

export function validateFragments(raw: unknown, file = "fragments.json"): FragmentData {
  const o = obj(raw, file);
  const nameMap = (key: string): Record<string, string> => {
    const r = obj(o[key], `${file} 欄位 ${key}`);
    const out: Record<string, string> = {};
    for (const k of Object.keys(r)) out[k] = str(r, k, `${file} 欄位 ${key}`);
    if (Object.keys(out).length === 0) fail(file, key, "不可為空");
    return out;
  };
  const topics = nameMap("topics");
  const stances = nameMap("stances");
  const items = list(o.items, `${file} 欄位 items`).map((raw, i): FragmentDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const f = obj(raw, where);
    const id = str(f, "id", where);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    const topic = str(f, "topic", w);
    if (!(topic in topics)) fail(w, "topic", `不是 topics 裡的 id（${Object.keys(topics).join("、")}），目前為 ${topic}`);
    const stance = str(f, "stance", w);
    if (!(stance in stances)) fail(w, "stance", `不是 stances 裡的 id（${Object.keys(stances).join("、")}），目前為 ${stance}`);
    const tier = num(f, "tier", w, { min: 1, max: 3, integer: true }) as 1 | 2 | 3;
    if (f.fixed !== undefined && typeof f.fixed !== "boolean") fail(w, "fixed", "必須是 true 或 false");
    return {
      id,
      title: str(f, "title", w),
      topic,
      source: str(f, "source", w),
      stance,
      era: str(f, "era", w),
      tier,
      ...(f.fixed === true ? { fixed: true } : {}),
      text: str(f, "text", w),
    };
  });
  uniqueIds(items, file);
  return { topics, stances, items };
}

/** 地圖簡介模板可用的欄位：名稱欄位，加上標記自己的名字、地域、所屬國與都城 */
export const BLURB_TOKENS = ["name", "region", "country", "capital", ...SLOT_NAMES];

export const NAME_MIN: Record<keyof WorldNames, number> = {
  countries: 10,
  capitals: 10,
  guards: 6,
  greatSects: 6,
  schools: 14,
  merchants: 6,
  wanderers: 6,
  villages: 10,
  markets: 10,
  mountains: 10,
};

export function validateWorldNames(raw: unknown, file = "worldNames.json"): WorldNames {
  const o = obj(raw, file);
  const out = {} as WorldNames;
  const seen = new Map<string, string>();
  for (const key of Object.keys(NAME_MIN) as (keyof WorldNames)[]) {
    const names = strList(o, key, file);
    if (names.length < NAME_MIN[key]) fail(file, key, `至少需要 ${NAME_MIN[key]} 個名字，目前只有 ${names.length} 個`);
    names.forEach((n, i) => {
      // 名字之間不可重複，同欄位內與不同欄位之間都一樣
      const prev = seen.get(n);
      if (prev !== undefined) fail(file, `${key}[${i}]`, `「${n}」與 ${prev} 重複`);
      seen.set(n, `${key}[${i}]`);
    });
    out[key] = names;
  }
  for (const k of Object.keys(o)) if (!(k in NAME_MIN)) fail(file, k, "不是合法的名庫欄位");
  return out;
}

/** 物件的每個值都是非空字串陣列（開場句依出身、靈根分流用） */
export function strListRecord(o: Obj, key: string, where: string): Record<string, string[]> {
  const r = obj(o[key], `${where}.${key}`);
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(r)) out[k] = strList(r, k, `${where}.${key}`);
  return out;
}

/** 隔世重逢的故人（acquaintances.json） */
export function validateAcquaintances(raw: unknown, file = "acquaintances.json"): AcquaintanceDef[] {
  const list_ = list(raw, file).map((r, i): AcquaintanceDef => {
    const o = obj(r, `${file} 第 ${i + 1} 筆`);
    const id = str(o, "id", `${file} 第 ${i + 1} 筆`);
    const w = `${file} 第 ${i + 1} 筆（${id}）`;
    return { id, name: str(o, "name", w), desc: str(o, "desc", w) };
  });
  uniqueIds(list_, file);
  return list_;
}

export function validateNames(raw: unknown, file = "names.json"): NameData {
  const o = obj(raw, file);
  return { surnames: strList(o, "surnames", file), given: strList(o, "given", file) };
}

export function parseReview(raw: unknown, where: string): TextData["review"] {
  const o = obj(raw, where);
  const out = {} as TextData["review"];
  for (const cause of REVIEW_CAUSES) {
    const variants = list(o[cause], `${where}.${cause}`).map((v, i): ClosingVariant => {
      const vw = `${where}.${cause}[${i}]`;
      const vo = obj(v, vw);
      return {
        text: str(vo, "text", vw),
        ...(vo.ifItem !== undefined ? { ifItem: str(vo, "ifItem", vw) } : {}),
        ...(vo.ifFlag !== undefined ? { ifFlag: str(vo, "ifFlag", vw) } : {}),
        ...(vo.ifRealmMax !== undefined ? { ifRealmMax: str(vo, "ifRealmMax", vw) } : {}),
        ...(vo.ifGoalMissed !== undefined ? { ifGoalMissed: bool(vo, "ifGoalMissed", vw) } : {}),
      };
    });
    // 至少要有一句沒有任何條件的，否則可能沒有句子可用
    if (!variants.some((v) => v.ifItem === undefined && v.ifFlag === undefined && v.ifRealmMax === undefined && v.ifGoalMissed === undefined)) {
      throw new Error(`${where}.${cause}：至少要有一句沒有任何條件（ifItem、ifFlag、ifRealmMax、ifGoalMissed）的收尾句`);
    }
    out[cause] = variants;
  }
  return out;
}

function parseRetreatThemes(raw: unknown, where: string): RetreatTheme[] {
  const seen = new Set<string>();
  return list(raw, where).map((v, i): RetreatTheme => {
    const w = `${where}[${i}]`;
    const o = obj(v, w);
    const id = str(o, "id", w);
    if (seen.has(id)) fail(w, "id", `重複：${id}`);
    seen.add(id);
    const exit = strList(o, "exit", w);
    if (exit.length < 2) fail(w, "exit", "至少要有兩句平常收尾");
    return { id, lonely: o.lonely === undefined ? false : bool(o, "lonely", w), open: str(o, "open", w), exit, gag: str(o, "gag", w) };
  });
}

function parseRetreatFeel(raw: unknown, where: string): Record<string, RetreatFeel> {
  const o = obj(raw, where);
  if (o.default === undefined) fail(where, "default", "必須有 default 這一組，沒有專屬感受句的境界都用它");
  const out: Record<string, RetreatFeel> = {};
  for (const key of Object.keys(o)) {
    const w = `${where}.${key}`;
    const f = obj(o[key], w);
    const feel = {} as RetreatFeel;
    for (const mood of RETREAT_MOODS) {
      // 只有 default 一定要三種語氣都有；其他境界缺的（或寫成空陣列的）語氣退回 default
      if (key !== "default" && (f[mood] === undefined || (Array.isArray(f[mood]) && f[mood].length === 0))) feel[mood] = [];
      else feel[mood] = strList(f, mood, w);
    }
    out[key] = feel;
  }
  return out;
}

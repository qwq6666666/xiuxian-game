import { slotProblems } from "../slots";
import {
  REVIEW_CAUSES,
  type Effects,
  type EventDef,
  type GameData,
  ALCHEMY_SCHEDULE,
} from "../types";
import { SLOT_PATTERN_FOR_NOTE } from "./common";

/** 遞迴掃過資料裡的每個字串 */
export function scanStrings(value: unknown, path: string, visit: (text: string, path: string) => void): void {
  if (typeof value === "string") visit(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, visit));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) scanStrings(v, path === "" ? k : `${path}.${k}`, visit);
  }
}

/**
 * 玩家看得到的文字不得寫死參考名（太衡宗等），一律用名稱欄位。
 * 事件與殘卷可以用欄位，其餘資料檔連欄位都不該用。錯誤訊息指出是哪一筆的哪個欄位。
 */
export function checkSlotRules(data: GameData): void {
  const check = (where: string, value: unknown, allowSlots: boolean): void => {
    scanStrings(value, "", (text, path) => {
      const problems = slotProblems(text, allowSlots);
      if (problems.length > 0) throw new Error(`${where}：欄位 ${path} ${problems[0]}`);
    });
  };
  data.events.forEach((e, i) => check(`events.json 第 ${i + 1} 筆（${e.id}）`, e, true));
  data.fragments.items.forEach((f, i) => check(`fragments.json 第 ${i + 1} 筆（${f.id}）`, f, true));
  check("fragments.json 欄位 stances", data.fragments.stances, true);
  check("fragments.json 欄位 topics", data.fragments.topics, true);
  data.items.forEach((x, i) => check(`items.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.schedules.forEach((x, i) => {
    const { worldHints, ...rest } = x;
    check(`schedules.json 第 ${i + 1} 筆（${x.id}）`, rest, false);
    check(`schedules.json 第 ${i + 1} 筆（${x.id}）`, { worldHints: (worldHints ?? []).map((h) => h.text) }, true);
  });
  data.origins.forEach((x, i) => check(`origins.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.talents.forEach((x, i) => check(`talents.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.spiritRoots.forEach((x, i) => check(`spiritRoots.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.realms.forEach((x, i) => check(`realms.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.goals.forEach((x, i) => check(`goals.json 第 ${i + 1} 筆（${x.id}）`, x, false));
  data.worldEffects.forEach((x, i) => check(`worldEffects.json 第 ${i + 1} 筆（${x.id}）`, { reason: x.reason }, true));
  data.worldEvents.forEach((x, i) => check(`worldEvents.json 第 ${i + 1} 筆（${x.id}）`, { note: x.note.replace(SLOT_PATTERN_FOR_NOTE, "") }, false));
  check("map.json", data.map, false);
  // text.json 的日誌模板用自己的 {realm}、{item} 等，只檢查參考名
  check("text.json", data.text, false);
}

/** 檢查各檔案之間的對應關係 */
export function validateGameData(data: GameData): GameData {
  checkSlotRules(data);
  const realmIds = new Set(data.realms.map((r) => r.id));
  const itemIds = new Set(data.items.map((i) => i.id));
  const has = (set: Set<string>, id: string, from: string, what: string) => {
    if (!set.has(id)) throw new Error(`${from}：${id} 不是 ${what} 裡的 id`);
  };
  for (const k of Object.keys(data.text.log.realmUp)) has(realmIds, k, "text.json 的 log.realmUp", "realms.json");
  for (const k of Object.keys(data.text.log.breakthroughSuccess)) {
    has(realmIds, k, "text.json 的 log.breakthroughSuccess", "realms.json");
  }
  data.realms.forEach((realm, i) => {
    const where = `realms.json 第 ${i + 1} 筆（${realm.id}）`;
    const isLast = i === data.realms.length - 1;
    if (realm.breakthrough === "manual" && !isLast) {
      if (!realm.breakthroughRule) throw new Error(`${where}：欄位 breakthroughRule 手動突破的境界必須提供`);
      const next = data.realms[i + 1];
      if (!data.text.log.breakthroughSuccess[next.id]) {
        throw new Error(`text.json：log.breakthroughSuccess 缺少突破後境界 ${next.id} 的文字`);
      }
    }
    if (realm.breakthroughRule?.pillId) has(itemIds, realm.breakthroughRule.pillId, `${where} 的 pillId`, "items.json");
    const rule = realm.breakthroughRule;
    for (const [key, ref] of [["requiresTalent", rule?.requiresTalent], ["talentRate", rule?.talentRate]] as const) {
      if (!ref) continue;
      const talent = data.talents.find((x) => x.id === ref.id);
      if (!talent) throw new Error(`${where} 的 breakthroughRule.${key}：${ref.id} 不是 talents.json 裡的 id`);
      const level = "level" in ref ? ref.level : ref.from;
      if (level > talent.maxLevel) {
        throw new Error(`${where} 的 breakthroughRule.${key}：${ref.id} 的等級 ${level} 超過天賦上限 ${talent.maxLevel}`);
      }
    }
  });
  // 宗門（M25）：引用的境界、靈根、物品、日常安排都要存在
  const sj = data.sects;
  has(realmIds, sj.join.minRealm, "sects.json 的 join.minRealm", "realms.json");
  for (const r of sj.ranks) if (r.promote) has(realmIds, r.promote.realm, `sects.json 的 ranks ${r.id} 的 promote.realm`, "realms.json");
  const rootIds = new Set(data.spiritRoots.map((r) => r.id));
  for (const id of Object.keys(sj.join.rootBonus)) has(rootIds, id, "sects.json 的 join.rootBonus", "spiritRoots.json");
  for (const id of sj.discount.itemIds) has(itemIds, id, "sects.json 的 discount.itemIds", "items.json");
  const originIds = new Set(data.origins.map((o) => o.id));
  const effectIds = new Set(data.worldEffects.map((x) => x.id));
  has(itemIds, data.config.priceRefItemId, "config.json 的 priceRefItemId", "items.json");
  data.worldEffects.forEach((x, i) => {
    for (const id of Object.keys(x.market)) has(itemIds, id, `worldEffects.json 第 ${i + 1} 筆（${x.id}）的 market`, "items.json");
  });
  data.events.forEach((ev) => {
    for (const id of [...(ev.conditions.world ?? []), ...(ev.conditions.worldNot ?? [])]) {
      has(effectIds, id, `events.json ${ev.id} 的 conditions.world`, "worldEffects.json");
    }
  });
  data.schedules.forEach((s, i) => {
    if (s.realmMin !== undefined) has(realmIds, s.realmMin, `schedules.json 第 ${i + 1} 筆（${s.id}）的 realmMin`, "realms.json");
    for (const f of s.finds) has(itemIds, f.itemId, `schedules.json 第 ${i + 1} 筆（${s.id}）的 finds`, "items.json");
    for (const f of s.drops ?? []) {
      has(itemIds, f.itemId, `schedules.json 第 ${i + 1} 筆（${s.id}）的 drops`, "items.json");
      if (data.items.find((x) => x.id === f.itemId)?.effect.kind !== "material") {
        throw new Error(`schedules.json 第 ${i + 1} 筆（${s.id}）的 drops：${f.itemId} 不是材料`);
      }
    }
  });
  data.recipes.recipes.forEach((rc, i) => {
    const where = `recipes.json 第 ${i + 1} 筆（${rc.id}）`;
    has(itemIds, rc.output, `${where} 的 output`, "items.json");
    has(realmIds, rc.realmMin, `${where} 的 realmMin`, "realms.json");
    const outKind = data.items.find((x) => x.id === rc.output)?.effect.kind;
    if (outKind === "material") throw new Error(`${where} 的 output：${rc.output} 是材料，不能是產出`);
    if ((rc.kind === "forge") !== (outKind === "artifact")) throw new Error(`${where} 的 output：煉器（forge）只能產出法寶，煉丹（brew）不能產出法寶`);
    for (const id of Object.keys(rc.inputs)) {
      has(itemIds, id, `${where} 的 inputs`, "items.json");
      if (data.items.find((x) => x.id === id)?.effect.kind !== "material") throw new Error(`${where} 的 inputs：${id} 不是材料`);
    }
  });
  if (!data.schedules.some((s) => s.id === ALCHEMY_SCHEDULE)) throw new Error(`schedules.json：缺少煉丹用的日常安排 ${ALCHEMY_SCHEDULE}`);
  data.origins.forEach((o, i) => {
    for (const id of Object.keys(o.items)) has(itemIds, id, `origins.json 第 ${i + 1} 筆（${o.id}）的 items`, "items.json");
  });

  for (const cause of REVIEW_CAUSES) {
    for (const v of data.text.review[cause]) {
      if (v.ifItem !== undefined) has(itemIds, v.ifItem, `text.json 的 review.${cause}`, "items.json");
      if (v.ifRealmMax !== undefined) has(realmIds, v.ifRealmMax, `text.json 的 review.${cause}`, "realms.json");
    }
  }
  for (const key of Object.keys(data.text.log.retreat.feel)) {
    if (key !== "default") has(realmIds, key, "text.json 的 log.retreat.feel", "realms.json");
  }

  const scheduleIds = new Set(data.schedules.map((s) => s.id));
  const fragmentIds = new Set(data.fragments.items.map((f) => f.id));
  const allEffects = (ev: EventDef): Effects[] => [
    ...(ev.effects ? [ev.effects] : []),
    ...(ev.choices ?? []).flatMap((c) => c.outcomes.map((o) => o.effects)),
  ];
  // 由程式設定的旗標（不經事件效果）：宗門閉山或覆滅時自動離宗（core/sect.ts 的 leaveSect）
  const systemFlags = ["sect_collapse"];
  const setFlags = new Set([...systemFlags, ...data.events.flatMap((ev) => allEffects(ev).flatMap((e) => e.flags ?? []))]);
  data.events.forEach((ev, i) => {
    const from = `events.json 第 ${i + 1} 筆（${ev.id}）`;
    const c = ev.conditions;
    for (const r of [c.realmMin, c.realmMax]) if (r !== undefined) has(realmIds, r, `${from} 的 conditions`, "realms.json");
    for (const s of c.schedules ?? []) has(scheduleIds, s, `${from} 的 conditions.schedules`, "schedules.json");
    for (const id of c.origins ?? []) has(originIds, id, `${from} 的 conditions.origins`, "origins.json");
    for (const id of c.roots ?? []) has(rootIds, id, `${from} 的 conditions.roots`, "spiritRoots.json");
    if (c.acquaintance) has(new Set(data.acquaintances.map((a) => a.id)), c.acquaintance.id, `${from} 的 conditions.acquaintance`, "acquaintances.json");
    for (const s of Object.keys(ev.scheduleWeights ?? {})) has(scheduleIds, s, `${from} 的 scheduleWeights`, "schedules.json");
    // 要求的旗標必須有某個結果會設定，抓拼字錯誤
    for (const f of c.flags ?? []) {
      if (!setFlags.has(f)) throw new Error(`${from}：conditions.flags 的 ${f} 沒有任何事件結果會設定它`);
    }
    for (const e of allEffects(ev)) {
      for (const id of Object.keys(e.items ?? {})) has(itemIds, id, `${from} 的 effects.items`, "items.json");
      if (e.fragment && "id" in e.fragment) has(fragmentIds, e.fragment.id, `${from} 的 effects.fragment`, "fragments.json");
    }
    for (const ch of ev.choices ?? []) {
      for (const id of Object.keys(ch.requires?.items ?? {})) has(itemIds, id, `${from} 的 requires.items`, "items.json");
      for (const id of ch.requires?.fragments ?? []) has(fragmentIds, id, `${from} 的 requires.fragments`, "fragments.json");
    }
  });
  data.goals.forEach((g, i) => {
    const w = `goals.json 第 ${i + 1} 筆（${g.id}）`;
    const c = g.condition;
    if (c.kind === "realm") {
      has(realmIds, c.realmId, `${w} 的 condition`, "realms.json");
      const realm = data.realms.find((r) => r.id === c.realmId)!;
      if (c.stage !== undefined && c.stage >= realm.stageNames.length) throw new Error(`${w}：condition.stage ${c.stage} 超出 ${realm.name} 的階段數`);
    }
    if (c.kind === "flag" && !setFlags.has(c.flagId)) throw new Error(`${w}：condition.flagId ${c.flagId} 沒有任何事件結果會設定它`);
    for (const id of g.tilt?.eventIds ?? []) has(new Set(data.events.map((ev) => ev.id)), id, `${w} 的 tilt.eventIds`, "events");
    for (const f of g.tilt?.flags ?? []) if (!setFlags.has(f)) throw new Error(`${w}：tilt.flags 的 ${f} 沒有任何事件結果會設定它`);
    for (const id of g.tilt?.acquaintances ?? []) has(new Set(data.acquaintances.map((a) => a.id)), id, `${w} 的 tilt.acquaintances`, "acquaintances.json");
  });
  for (const k of Object.keys(data.text.log.stageMilestone)) {
    const [rid, st] = k.split(":");
    const realm = data.realms.find((r) => r.id === rid);
    if (!realm || !/^\d+$/.test(st ?? "") || Number(st) >= realm.stageNames.length) {
      throw new Error(`text.json：log.stageMilestone 的鍵 ${k} 必須是「境界 id:階段索引」且存在於 realms.json`);
    }
  }
  for (const r of sj.ranks.slice(1)) {
    if (!data.text.log.sect.promote[r.id]) throw new Error(`text.json：log.sect.promote 缺少位階 ${r.id} 的文字`);
  }
  for (const k of Object.keys(data.text.log.sect.promote)) {
    if (!sj.ranks.some((r) => r.id === k)) throw new Error(`text.json：log.sect.promote 的 ${k} 不是 sects.json 裡的位階 id`);
  }
  const duty = data.schedules.find((s) => s.id === sj.dutySchedule);
  if (!duty) throw new Error(`sects.json：dutySchedule ${sj.dutySchedule} 不是 schedules.json 裡的 id`);
  if (!duty.requiresSect) throw new Error(`schedules.json（${duty.id}）：宗門差事必須設定 requiresSect`);
  // 同門名稱欄位只能出現在宗門事件，否則沒入宗時只會顯示通用稱呼
  data.events.forEach((ev, i) => {
    const text = JSON.stringify([ev.title, ev.text, ev.choices, ev.effects]);
    if (/\{(peer|steward|elder)\}/.test(text) && ev.conditions.sect !== true) {
      throw new Error(`events 第 ${i + 1} 筆（${ev.id}）：用了同門名稱欄位 {peer}、{steward}、{elder}，conditions.sect 必須是 true`);
    }
  });
  for (const cause of REVIEW_CAUSES) {
    for (const v of data.text.review[cause]) {
      const flag = v.ifFlag;
      if (flag !== undefined && !setFlags.has(flag)) throw new Error(`text.json 的 review.${cause}：ifFlag 的 ${flag} 沒有任何事件結果會設定它`);
    }
  }
  return data;
  for (const id of Object.keys(data.text.era.origin)) has(originIds, id, "text.json 的 era.origin", "origins.json");
  for (const id of Object.keys(data.text.era.root)) has(rootIds, id, "text.json 的 era.root", "spiritRoots.json");
}

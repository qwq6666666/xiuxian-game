import { type NumOpts, type Obj } from "../check";
import {
  type SectsData,
  type SectRankDef,
} from "../types";
import { fail, obj, list, num, str, strList, uniqueIds } from "./common";

/** 宗門數值（sects.json）：位階由低到高，晉升條件逐級提高，各種宗門的上限不超過位階數 */
export function validateSects(raw: unknown, file = "sects.json"): SectsData {
  const o = obj(raw, file);
  const kinds = ["great", "school"] as const;
  const rec = <K extends string>(parent: Obj, key: string, keys: readonly K[], where: string, opts: NumOpts): Record<K, number> => {
    const r = obj(parent[key], `${where} 欄位 ${key}`);
    const out = {} as Record<K, number>;
    for (const k of keys) out[k] = num(r, k, `${where} 欄位 ${key}`, opts);
    return out;
  };
  const j = obj(o.join, `${file} 欄位 join`);
  const jw = `${file} 欄位 join`;
  const rootRaw = obj(j.rootBonus, `${jw} 欄位 rootBonus`);
  const rootBonus: Record<string, number> = {};
  for (const k of Object.keys(rootRaw)) rootBonus[k] = num(rootRaw, k, `${jw} 欄位 rootBonus`, { min: 0 });
  const ranks = list(o.ranks, `${file} 欄位 ranks`).map((r, i): SectRankDef => {
    const rw = `${file} 欄位 ranks[${i}]`;
    const ro = obj(r, rw);
    const rank: SectRankDef = {
      id: str(ro, "id", rw),
      name: str(ro, "name", rw),
      bonus: num(ro, "bonus", rw, { min: 0 }),
      stipend: num(ro, "stipend", rw, { min: 0, integer: true }),
      duty: num(ro, "duty", rw, { min: 0, integer: true }),
    };
    if (ro.promote !== undefined) {
      const po = obj(ro.promote, `${rw} 欄位 promote`);
      rank.promote = { realm: str(po, "realm", `${rw} 欄位 promote`), contribution: num(po, "contribution", `${rw} 欄位 promote`, { min: 0, integer: true }) };
    } else if (i > 0) {
      fail(rw, "promote", "外門以外的位階都要寫晉升條件");
    }
    return rank;
  });
  uniqueIds(ranks, file);
  for (let i = 2; i < ranks.length; i++) {
    if (ranks[i].promote!.contribution <= ranks[i - 1].promote!.contribution) {
      fail(`${file} 欄位 ranks[${i}]`, "promote.contribution", "必須比前一個位階更高");
    }
  }
  const maxRank = rec(o, "maxRank", kinds, file, { min: 0, max: ranks.length - 1, integer: true });
  const d = obj(o.discount, `${file} 欄位 discount`);
  return {
    join: {
      minRealm: str(j, "minRealm", jw),
      minStage: num(j, "minStage", jw, { min: 0, integer: true }),
      baseRate: rec(j, "baseRate", kinds, jw, { min: 0, max: 1 }),
      stateMult: rec(j, "stateMult", ["prosper", "stable", "decline"] as const, jw, { min: 0 }),
      insightBonus: num(j, "insightBonus", jw, { min: 0 }),
      boneBonus: num(j, "boneBonus", jw, { min: 0 }),
      rootBonus,
    },
    scale: rec(o, "scale", kinds, file, { gt: 0 }),
    maxRank,
    bonusState: rec(o, "bonusState", ["prosper", "stable", "decline"] as const, file, { gt: 0 }),
    ranks,
    discount: { itemIds: strList(d, "itemIds", `${file} 欄位 discount`), mult: num(d, "mult", `${file} 欄位 discount`, { gt: 0, max: 1 }) },
    dutySchedule: str(o, "dutySchedule", file),
  };
}

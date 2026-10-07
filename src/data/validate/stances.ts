import type { StanceDef, StancesData } from "../types";
import { fail, list, num, obj, str, uniqueIds } from "./common";

/** 年度行止（stances.json） */
export function validateStances(raw: unknown, file = "stances.json"): StancesData {
  const o = obj(raw, file);
  const rw = `${file} 欄位 rules`;
  const r = obj(o.rules, rw);
  const stances = list(o.stances, `${file} 欄位 stances`).map((item, i): StanceDef => {
    const where = `${file} 第 ${i + 1} 筆`;
    const e = obj(item, where);
    const def: StanceDef = {
      id: str(e, "id", where),
      name: str(e, "name", where),
      desc: str(e, "desc", where),
      cultivationMult: num(e, "cultivationMult", where, { gt: 0 }),
      eventRateMult: num(e, "eventRateMult", where, { gt: 0 }),
    };
    if (e.endText !== undefined) def.endText = str(e, "endText", where);
    if (e.yearEnd !== undefined) {
      const yw = `${where} 欄位 yearEnd`;
      const y = obj(e.yearEnd, yw);
      def.yearEnd = {};
      if (y.stones !== undefined) {
        def.yearEnd.stones = num(y, "stones", yw, { min: 1, integer: true });
        if (e.endText === undefined) fail(where, "endText", "有 stones 的行止必須寫 endText");
      }
      if (y.risk !== undefined) {
        const rk = obj(y.risk, `${yw}.risk`);
        def.yearEnd.risk = { chance: num(rk, "chance", `${yw}.risk`, { gt: 0, max: 1 }), lossMonths: num(rk, "lossMonths", `${yw}.risk`, { gt: 0 }) };
        if (e.hitText === undefined) fail(where, "hitText", "有 risk 的行止必須寫 hitText");
      }
    }
    if (e.hitText !== undefined) def.hitText = str(e, "hitText", where);
    return def;
  });
  uniqueIds(stances, file);
  return { rules: { intervalYears: num(r, "intervalYears", rw, { min: 1, integer: true }) }, stances };
}

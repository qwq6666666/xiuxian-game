import { describe, expect, it } from "vitest";
import { createInitialState, startLife } from "../src/core/life";
import { eventAvailable } from "../src/core/events";
import { fiefsFor } from "../src/core/fiefs";
import { territoriesAt, territoryAt } from "../src/core/territory";
import { localRelation, marketRelation, placeRelation, placesAt, routeTo } from "../src/core/travel";
import { itemPrice } from "../src/core/worldeffects";
import { worldFor } from "../src/core/world";
import { gameData as data } from "../src/data/load";
import { validateWorldRelations } from "../src/data/validate";

const E = data.worldRelations.effects;

/** 入宗者：讓玩家屬於指定宗門，並把該宗門與出生坊市所在國的關係設成指定值 */
function inSect(seed: number, relation: "ally" | "feud" | "none") {
  const base = startLife(createInitialState(seed));
  const world = worldFor(base.worldSeed, data, base.nationCount);
  const age = Math.floor(base.ageMonths / 12);
  const fiefs = fiefsFor(world.seed, data);
  const region = data.map.regions.find((r) => r.id === world.birth.region)!;
  const marketOwner = territoryAt(territoriesAt(world, age, data), region.ferries![0]).ownerId;
  const sect = world.sects.find((s) => s.state !== "closed" && s.state !== "fallen")!;
  const entry = world.relations.find((r) => r.sect === sect.id)!;
  const saved = { ally: entry.ally, feud: entry.feud };
  entry.ally = relation === "ally" ? marketOwner : null;
  entry.feud = relation === "feud" ? marketOwner : null;
  const state = { ...base, sect: { id: sect.id, rank: 0, contribution: 0, joinedAge: age } };
  return { state, world, fiefs, marketOwner, restore: () => Object.assign(entry, saved) };
}

describe("關係進入判定（M53）", () => {
  it("沒入宗時關係沒有任何影響", () => {
    const state = startLife(createInitialState(3));
    expect(marketRelation(state)).toBeNull();
    expect(localRelation(state)).toBeNull();
    expect(placeRelation(state, [200, 200])).toBeNull();
  });

  it("入宗者：坊市所在國與自己的宗門世仇則物價略貴、互惠則略便宜、否則不變", () => {
    const item = data.items.find((i) => i.price >= 20)!.id;
    for (const seed of [3, 5, 8]) {
      const none = inSect(seed, "none");
      const plain = itemPrice(none.state, item);
      none.restore();
      const feud = inSect(seed, "feud");
      expect(marketRelation(feud.state)).toBe("feud");
      const dear = itemPrice(feud.state, item);
      feud.restore();
      const ally = inSect(seed, "ally");
      expect(marketRelation(ally.state)).toBe("ally");
      const cheap = itemPrice(ally.state, item);
      ally.restore();
      expect(dear).toBe(Math.max(1, Math.round(data.items.find((i) => i.id === item)!.price * E.feudPriceMult * (plain / data.items.find((i) => i.id === item)!.price))));
      expect(cheap).toBeLessThan(plain);
      expect(dear).toBeGreaterThan(plain);
    }
  });

  it("入宗者前往世仇國境內的地點，路程多一個月的盤查；互惠國與一般地點不變", () => {
    const f = inSect(3, "feud");
    const capital = placesAt(f.state).find((p) => p.id === `capital:${f.marketOwner}`)!;
    // 目的地在世仇國境內：多出盤查月數
    const route = routeTo({ ...f.state, travel: { ...f.state.travel, locationId: "village" } }, capital.id);
    f.restore();
    const plainState = inSect(3, "none");
    const plainRoute = routeTo({ ...plainState.state, travel: { ...plainState.state.travel, locationId: "village" } }, capital.id);
    plainState.restore();
    expect(route).not.toBeNull();
    expect(plainRoute).not.toBeNull();
    expect(route!.inspectionMonths).toBe(E.feudTravelMonths);
    expect(route!.months).toBe(plainRoute!.months + E.feudTravelMonths);
    expect(plainRoute!.inspectionMonths).toBe(0);
    const a = inSect(3, "ally");
    const allyRoute = routeTo({ ...a.state, travel: { ...a.state.travel, locationId: "village" } }, capital.id);
    a.restore();
    expect(allyRoute?.inspectionMonths ?? 0).toBe(0);
  });

  it("事件條件 territoryRelation：只在入宗且所在地國家與宗門互惠（或世仇）時成立", () => {
    const ev = data.events.find((e) => e.id === "relation_feud_border_001")!;
    const ally = data.events.find((e) => e.id === "relation_ally_guest_001")!;
    const f = inSect(3, "feud");
    // 出生村就在坊市所在國境內；把位置放在出生村
    const here = { ...f.state, realmId: "lianqi", travel: { ...f.state.travel, locationId: "market" } };
    expect(localRelation(here)).toBe("feud");
    expect(eventAvailable(here, ev)).toBe(true);
    expect(eventAvailable(here, ally)).toBe(false);
    f.restore();
    const a = inSect(3, "ally");
    const there = { ...a.state, realmId: "lianqi", travel: { ...a.state.travel, locationId: "market" } };
    expect(eventAvailable(there, ally)).toBe(true);
    expect(eventAvailable(there, ev)).toBe(false);
    a.restore();
    expect(eventAvailable({ ...startLife(createInitialState(3)), realmId: "lianqi" }, ev)).toBe(false);
  });

  it("資料驗證：影響的上限由驗證守住", () => {
    const base = JSON.parse(JSON.stringify(data.worldRelations));
    expect(() => validateWorldRelations(base)).not.toThrow();
    const bad = JSON.parse(JSON.stringify(base));
    bad.effects.feudPriceMult = 1.5;
    expect(() => validateWorldRelations(bad)).toThrow(/feudPriceMult/);
    const bad2 = JSON.parse(JSON.stringify(base));
    bad2.effects.allyPriceMult = 0.5;
    expect(() => validateWorldRelations(bad2)).toThrow(/allyPriceMult/);
    const bad3 = JSON.parse(JSON.stringify(base));
    bad3.influence.mergeAlly = 0;
    expect(() => validateWorldRelations(bad3)).toThrow(/mergeAlly/);
  });
});

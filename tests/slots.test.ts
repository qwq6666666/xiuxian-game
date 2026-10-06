import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateWorld, worldSlots } from "../src/core/world";
import { gameData as data } from "../src/data/load";
import { DEFAULT_SLOTS, fillSlots, REFERENCE_NAMES, slotProblems, SLOT_NAMES } from "../src/data/slots";
import { validateGameData } from "../src/data/validate";
import { formatChanges, formatLogEntry } from "../src/ui/format";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("名稱欄位", () => {
  it("fillSlots：換成當世名稱，不認得的欄位直接丟錯", () => {
    const slots = worldSlots(generateWorld(7));
    expect(fillSlots("{guard}與{wanderers}在{market}相遇。", slots)).toBe(`${slots.guard}與${slots.wanderers}在${slots.market}相遇。`);
    expect(fillSlots("沒有欄位。", slots)).toBe("沒有欄位。");
    expect(() => fillSlots("{ghost}來了。", slots)).toThrow("ghost");
  });

  it("所有欄位在當世都有值，且彼此不同", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const slots = worldSlots(generateWorld(seed * 17));
      const values = SLOT_NAMES.map((k) => slots[k]);
      expect(values.every((v) => v.length > 0)).toBe(true);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("slotProblems：抓出直接寫的參考名與不認得的欄位", () => {
    expect(slotProblems("太衡宗的弟子。")[0]).toContain("太衡宗");
    expect(slotProblems("{guard}的弟子。")).toEqual([]);
    expect(slotProblems("{ghost}的弟子。")[0]).toContain("ghost");
    // 不允許欄位的資料檔，連欄位都不該出現
    expect(slotProblems("{guard}", false)).toEqual([]);
  });
});

describe("資料檔不得寫死參考名", () => {
  it("事件與殘卷都用欄位，載入時已檢查；這裡再掃一次所有資料檔（名庫除外）", () => {
    const dir = new URL("../src/data/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "worldNames.json");
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      for (const name of REFERENCE_NAMES) expect(text.includes(name), `${f} 直接寫了 ${name}`).toBe(false);
    }
  });

  it("src/data/events/ 底下的事件檔同樣不得寫死參考名", () => {
    const dir = new URL("../src/data/events/", import.meta.url);
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const text = readFileSync(new URL(f, dir), "utf8");
      for (const name of REFERENCE_NAMES) expect(text.includes(name), `events/${f} 直接寫了 ${name}`).toBe(false);
    }
  });

  it("名庫裡才有參考名（名庫本來就是它們的來源）", () => {
    const all = Object.values(data.worldNames).flat();
    for (const name of REFERENCE_NAMES) expect(all, name).toContain(name);
  });

  it("載入檢查：事件、殘卷、其他資料檔寫死名字時指出是哪一筆的哪個欄位", () => {
    const withEvent = (patch: (e: (typeof data.events)[number]) => void) => () => {
      const d = clone(data);
      patch(d.events[3]);
      validateGameData(d);
    };
    expect(withEvent((e) => (e.text = "太衡宗的人來了。"))).toThrow("太衡宗");
    expect(withEvent((e) => (e.text = "太衡宗的人來了。"))).toThrow(`第 4 筆（${data.events[3].id}）`);
    expect(withEvent((e) => (e.text = "太衡宗的人來了。"))).toThrow("text");
    expect(withEvent((e) => (e.title = "{nobody}來訪"))).toThrow("{nobody}");
    const choiceEvent = data.events.findIndex((e) => e.choices);
    const bad = () => {
      const d = clone(data);
      d.events[choiceEvent].choices![0].outcomes[0].text = "在垣下遇見一個人。";
      validateGameData(d);
    };
    expect(bad).toThrow("choices[0].outcomes[0].text");

    const badFragment = () => {
      const d = clone(data);
      d.fragments.items[2].title = "野渡口訣";
      validateGameData(d);
    };
    expect(badFragment).toThrow("fragments.json 第 3 筆");

    const badItem = () => {
      const d = clone(data);
      d.items[0].desc = "通濟行出品。";
      validateGameData(d);
    };
    expect(badItem).toThrow("items.json");
    // 物品說明連欄位都不該用
    const slotInItem = () => {
      const d = clone(data);
      d.items[0].desc = "{merchant}出品。";
      validateGameData(d);
    };
    expect(slotInItem).not.toThrow();
  });
});

describe("顯示時填入當世名稱", () => {
  const slots = worldSlots(generateWorld(2024));

  it("日誌：事件文字用當世的名稱，沒有任何未填的欄位", () => {
    for (const ev of data.events) {
      const base = { month: 400, kind: "event" as const, realmId: "lianqi", stage: 2, eventId: ev.id };
      const entries = ev.type === "anecdote"
        ? [base]
        : ev.choices!.flatMap((c, ci) => c.outcomes.map((_, oi) => ({ ...base, choice: ci, outcome: oi })));
      for (const entry of entries) {
        const line = formatLogEntry(entry, data, "某人", slots);
        expect(line, ev.id).not.toMatch(/[{}]/);
        for (const name of REFERENCE_NAMES) {
          // 當世名稱剛好等於參考名時（名庫裡有）才可能出現
          if (!Object.values(slots).includes(name)) expect(line, `${ev.id} 出現參考名 ${name}`).not.toContain(name);
        }
      }
    }
  });

  it("日誌：不同世界的同一個事件，名稱不同", () => {
    const ev = data.events.find((e) => e.text.includes("{market}"))!;
    const lines = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      lines.add(formatLogEntry({ month: 400, kind: "event", realmId: "lianqi", stage: 2, eventId: ev.id }, data, "某人", worldSlots(generateWorld(seed * 31))));
    }
    expect(lines.size).toBeGreaterThan(3);
  });

  it("殘卷：標題用當世的名稱；沒給名稱時退回參考名", () => {
    const f02 = data.fragments.items.find((f) => f.id === "f02")!;
    expect(f02.title).toContain("{wanderers}");
    const withSlots = formatChanges({ fragment: "f02" }, data, slots);
    expect(withSlots).toEqual([`得殘卷《${slots.wanderers}口訣》`]);
    expect(formatChanges({ fragment: "f02" }, data)).toEqual([`得殘卷《${DEFAULT_SLOTS.wanderers}口訣》`]);
  });

  it("殘卷的立場名稱也是欄位：守梯大宗與散修一脈永遠是兩個不同的名字", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = worldSlots(generateWorld(seed * 13));
      const stances = ["taiheng", "yedu", "tongji"].map((k) => fillSlots(data.fragments.stances[k], s));
      expect(new Set(stances).size).toBe(3);
    }
  });
});

import { lifeIndex } from "../core/era";
import type { GoalProgress } from "../core/goals";
import { goalStatuses } from "../core/goals";
import type { GameState } from "../core/state";
import { polityLabel, worldFor, worldSlots } from "../core/world";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { attributeGuide } from "./derived";
import { ATTR_LABEL, eraTransition, talentSummary } from "./format";
import { methodRows } from "./methodinfo";
import type { UiHandlers } from "./render";

export const statsHtml = (state: GameState): string =>
  `<dl class="stats">${ATTRIBUTE_KEYS.map(
    (k) => `<div><dt>${ATTR_LABEL[k]}</dt><dd>${state.attributes[k]}</dd></div>`,
  ).join("")}</dl>`;

/** 這一世的目標：只作收藏，不給任何數值，所以措辭上不強求 */
export const goalLine = (g: GoalProgress): string => {
  // 境界與旗標的進度數字沒有意義，只有年歲、殘卷、見聞才顯示
  const counted = ["age", "fragments", "events"].includes(g.def.condition.kind) && !g.done;
  return `${g.done ? "✓ " : ""}${g.def.name}｜${g.def.desc}${counted ? `（${g.current} / ${g.target}）` : ""}`;
};

export const goalsHtml = (state: GameState, data: GameData): string => {
  const items = goalStatuses(state, data);
  if (items.length === 0) return "";
  return `<section class="goals-box"><h3>這一世的目標</h3><ul class="goals">${items.map((g) => `<li>${goalLine(g)}</li>`).join("")}</ul><p class="desc">只記入收藏，不強求。</p></section>`;
};

/** 屬性與靈根各自影響什麼，收在可展開的說明裡 */
export const guideHtml = (data: GameData): string => {
  const g = attributeGuide(data);
  return `<details class="guide"><summary>屬性說明</summary><ul>${ATTRIBUTE_KEYS.map(
    (k) => `<li><strong>${g.attributes[k].label}</strong>　${g.attributes[k].text}</li>`,
  ).join("")}<li><strong>靈根</strong>　${g.spiritRoot}</li></ul></details>`;
};

export const identityHtml = (state: GameState, data: GameData): string => {
  const spiritRoot = data.spiritRoots.find((r) => r.id === state.spiritRootId);
  const origin = data.origins.find((o) => o.id === state.originId);
  return `
    <p><span class="tag">靈根</span>${spiritRoot?.name ?? "—"}</p>
    <p><span class="tag">出身</span>${origin?.name ?? "—"}</p>
    <p class="desc">${origin?.desc ?? ""}</p>`;
};

/** 擲骰畫面的出生地：國家與村名，讓玩家看見每次重擲世界都不一樣 */
export const birthHtml = (state: GameState, data: GameData): string => {
  const world = worldFor(state.worldSeed, data);
  const slots = worldSlots(world);
  const polity = world.polities.find((p) => p.id === world.owners[world.birth.region])!;
  const region = data.map.regions.find((r) => r.id === world.birth.region)!;
  return `<p><span class="tag">出生地</span>${polityLabel(polity)}・${slots.village}（${region.name}）</p>`;
};

export interface RollContext {
  stageEl: HTMLElement;
  data: GameData;
  handlers: Pick<UiHandlers, "onRename" | "onMethod" | "onReroll" | "onStart">;
  /** 目前舞台畫的是擲骰還是修行畫面；由 render.ts 持有 */
  getBuilt(): "roll" | "life" | null;
  setBuilt(view: "roll"): void;
}

/** 擲骰畫面（開局與每次轉世後） */
export function createRoll(ctx: RollContext): { render(state: GameState): void } {
  const { stageEl, data, handlers, getBuilt, setBuilt } = ctx;
  let rollKey = "";
  let currentName = "";

  /** 擲骰畫面的心法選擇：未解鎖的列出條件，已選的標示 */
  function methodHtml(state: GameState): string {
    const all = methodRows(state, data);
    // 還沒解鎖任何心法時只留一行提示，第一世的擲骰畫面不要被四個選項塞滿
    if (all.filter((m) => m.unlocked).length <= 1) {
      const next = data.methods.find((m) => m.unlock.fragments > state.meta.fragments.length);
      return next ? `<p class="desc methods">殘卷錄集到 ${next.unlock.fragments} 份，可解鎖第一個心法（目前 ${state.meta.fragments.length} 份）。</p>` : "";
    }
    const rows = all
      .map(
        (m) =>
          `<button type="button" data-method="${m.id}" aria-pressed="${m.selected}" class="${m.selected ? "active" : ""}"${m.unlocked ? "" : " disabled"}><strong>${m.name}</strong><small>${m.desc}</small><small>${m.effectText}</small>${m.unlocked ? "" : `<small>${m.lockText}</small>`}</button>`,
      )
      .join("");
    return `<section class="methods"><h2>心法</h2><p class="desc">每世選一種，開始後不可換。</p><div class="choices">${rows}</div></section>`;
  }

  function renderRoll(state: GameState): void {
    const key = `${state.worldSeed}|${state.name}|${JSON.stringify(state.attributes)}|${state.rerolls}|${state.methodId}|${state.meta.fragments.length}|${state.spiritRootId}|${state.originId}|${state.meta.lives}|${JSON.stringify(state.meta.talents)}`;
    if (getBuilt() === "roll" && key === rollKey) return;
    setBuilt("roll");
    rollKey = key;
    currentName = state.name;
    const perks = talentSummary(state.meta.talents, data);
    stageEl.innerHTML = `
      <main class="card roll">
        <h1>一念輪迴</h1>
        <div class="scene-art scene-art-opening" role="img" aria-label="晨霧村舍外，一名旅人走向遠山"></div>
        <p class="sub">第 ${state.meta.lives + 1} 世。命盤已擲。</p>
        ${eraTransition(lifeIndex(state), data) !== "" ? `<p class="desc">${eraTransition(lifeIndex(state), data)}</p>` : ""}
        <label class="namebox">姓名 <input id="name" type="text" maxlength="${data.config.nameMaxLength}" /></label>
        ${perks.length > 0 ? `<ul class="perks">${perks.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
        ${statsHtml(state)}
        ${guideHtml(data)}
        ${identityHtml(state, data)}
        ${birthHtml(state, data)}
        ${goalsHtml(state, data)}
        ${methodHtml(state)}
        <div class="actions">
          <button id="reroll" type="button" ${state.rerolls > 0 ? "" : "disabled"}>重擲（剩 ${state.rerolls} 次）</button>
          <button id="start" type="button" class="primary">開始修行</button>
        </div>
      </main>`;
    const nameInput = stageEl.querySelector<HTMLInputElement>("#name")!;
    nameInput.value = state.name;
    // 改完（按 Enter 或離開欄位）才送出；不合格時由狀態還原欄位內容
    nameInput.addEventListener("change", () => {
      handlers.onRename(nameInput.value);
      nameInput.value = currentName;
    });
    stageEl.querySelectorAll<HTMLButtonElement>("[data-method]").forEach((b) => b.addEventListener("click", () => handlers.onMethod(b.dataset.method!)));
    stageEl.querySelector("#reroll")!.addEventListener("click", () => handlers.onReroll());
    stageEl.querySelector("#start")!.addEventListener("click", () => handlers.onStart());
  }

  return { render: renderRoll };
}

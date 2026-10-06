import { lifeIndex } from "../core/era";
import type { GoalProgress } from "../core/goals";
import { goalStatuses } from "../core/goals";
import { wishChoices, wishLevel } from "../core/wish";
import type { GameState } from "../core/state";
import { polityLabel, worldFor, worldSlots } from "../core/world";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import { attributeGuide } from "./derived";
import { ATTR_LABEL, eraTransition, talentSummary } from "./format";
import { esc } from "./dom";
import { methodRows } from "./methodinfo";
import type { UiHandlers } from "./render";

export const statsHtml = (state: GameState): string =>
  `<dl class="stats">${ATTRIBUTE_KEYS.map(
    (k) => `<div><dt>${esc(ATTR_LABEL[k])}</dt><dd>${state.attributes[k]}</dd></div>`,
  ).join("")}</dl>`;

/** 這一世的目標：只作收藏，不給任何數值，所以措辭上不強求 */
export const goalLine = (g: GoalProgress, wished = false): string => {
  // 境界與旗標的進度數字沒有意義，只有年歲、殘卷、見聞才顯示
  const counted = ["age", "fragments", "events"].includes(g.def.condition.kind) && !g.done;
  return `${g.done ? "✓ " : ""}${wished ? "【夙願】" : ""}${g.def.name}｜${g.def.desc}${counted ? `（${g.current} / ${g.target}）` : ""}`;
};

export const goalsHtml = (state: GameState, data: GameData): string => {
  const items = goalStatuses(state, data);
  if (items.length === 0) return "";
  return `<section class="goals-box"><h3>這一世的目標</h3><ul class="goals">${items.map((g) => `<li>${esc(goalLine(g, g.def.id === state.wishId))}</li>`).join("")}</ul><p class="desc">只記入收藏，不強求。</p></section>`;
};

/** 屬性與靈根各自影響什麼，收在可展開的說明裡 */
export const guideHtml = (data: GameData): string => {
  const g = attributeGuide(data);
  return `<details class="guide"><summary>屬性說明</summary><ul>${ATTRIBUTE_KEYS.map(
    (k) => `<li><strong>${esc(g.attributes[k].label)}</strong>　${esc(g.attributes[k].text)}</li>`,
  ).join("")}<li><strong>靈根</strong>　${esc(g.spiritRoot)}</li></ul></details>`;
};

export const identityHtml = (state: GameState, data: GameData): string => {
  const spiritRoot = data.spiritRoots.find((r) => r.id === state.spiritRootId);
  const origin = data.origins.find((o) => o.id === state.originId);
  return `
    <p><span class="tag">靈根</span>${esc(spiritRoot?.name ?? "—")}</p>
    <p><span class="tag">出身</span>${esc(origin?.name ?? "—")}</p>
    <p class="desc">${esc(origin?.desc ?? "")}</p>`;
};

/** 擲骰畫面的出生地：國家與村名，讓玩家看見每次重擲世界都不一樣 */
export const birthHtml = (state: GameState, data: GameData): string => {
  const world = worldFor(state.worldSeed, data, state.nationCount);
  const slots = worldSlots(world);
  const polity = world.polities.find((p) => p.id === world.owners[world.birth.fief])!;
  const region = data.map.regions.find((r) => r.id === world.birth.region)!;
  return `<p><span class="tag">出生地</span>${esc(polityLabel(polity))}・${esc(slots.village)}（${esc(region.name)}）</p>`;
};

export interface RollContext {
  stageEl: HTMLElement;
  data: GameData;
  handlers: Pick<UiHandlers, "onRename" | "onMethod" | "onReroll" | "onStart" | "onPickChart" | "onSetWish">;
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
          `<button type="button" data-method="${esc(m.id)}" aria-pressed="${m.selected}" class="${m.selected ? "active" : ""}"${m.unlocked ? "" : " disabled"}><strong>${esc(m.name)}</strong><small>${esc(m.desc)}</small><small>${esc(m.effectText)}</small>${m.unlocked ? "" : `<small>${esc(m.lockText)}</small>`}</button>`,
      )
      .join("");
    return `<section class="methods"><h2>心法</h2><p class="desc">每世選一種，開始後不可換。</p><div class="choices">${rows}</div></section>`;
  }

  /** 擇身：備選命盤，一份一個鈕；改選後原本的命盤會換到這裡 */
  function chartsHtml(state: GameState): string {
    if (state.altCharts.length === 0) return "";
    const rows = state.altCharts
      .map((c, i) => {
        const root = data.spiritRoots.find((r) => r.id === c.spiritRootId)?.name ?? c.spiritRootId;
        const origin = data.origins.find((o) => o.id === c.originId);
        const attrs = ATTRIBUTE_KEYS.map((k) => `${ATTR_LABEL[k]} ${c.attributes[k]}`).join("　");
        return `<button type="button" data-chart="${i}"><strong>${esc(root)}・${esc(origin?.name ?? c.originId)}</strong><small>${esc(attrs)}　靈石 ${c.spiritStones}</small><small>${esc(origin?.desc ?? "")}</small></button>`;
      })
      .join("");
    return `<section class="charts"><h2>備選命盤</h2><p class="desc">擇身讓你多得幾份功率相近的命盤，各有各的脾性。改選之後，原本的命盤會換到這裡。</p><div class="choices">${rows}</div></section>`;
  }

  /** 夙願：指定這一世的一個目標；再按一次取消 */
  function wishHtml(state: GameState): string {
    if (wishLevel(state, data) <= 0) return "";
    // 有掛鉤事件的排前面，只是記號的排後面
    const rows = [...wishChoices(state, data)]
      .sort((a, b) => Number(b.tilt !== undefined) - Number(a.tilt !== undefined))
      .map((g) => {
        const on = g.id === state.wishId;
        return `<button type="button" data-wish="${esc(g.id)}" aria-pressed="${on}" class="${on ? "active" : ""}"><strong>${esc(g.name)}</strong><small>${esc(g.desc)}</small><small>${g.tilt ? "相關的際遇會多一些" : "只是記號，不影響際遇"}</small></button>`;
      })
      .join("");
    return `<section class="wishes"><h2>夙願</h2><p class="desc">指定這一世的一個目標，不給任何數值；再按一次取消。</p><div class="choices">${rows}</div></section>`;
  }

  function renderRoll(state: GameState): void {
    const key = `${state.worldSeed}|${state.name}|${JSON.stringify(state.attributes)}|${state.rerolls}|${state.methodId}|${state.meta.fragments.length}|${state.spiritRootId}|${state.originId}|${state.meta.lives}|${JSON.stringify(state.meta.talents)}|${JSON.stringify(state.altCharts)}|${state.wishId}|${state.goalIds.join(",")}`;
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
        ${eraTransition(lifeIndex(state), data) !== "" ? `<p class="desc">${esc(eraTransition(lifeIndex(state), data))}</p>` : ""}
        <label class="namebox">姓名 <input id="name" type="text" maxlength="${data.config.nameMaxLength}" /></label>
        ${perks.length > 0 ? `<ul class="perks">${perks.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${statsHtml(state)}
        ${guideHtml(data)}
        ${identityHtml(state, data)}
        ${birthHtml(state, data)}
        ${goalsHtml(state, data)}
        ${wishHtml(state)}
        ${chartsHtml(state)}
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
    stageEl.querySelectorAll<HTMLButtonElement>("[data-chart]").forEach((b) => b.addEventListener("click", () => handlers.onPickChart(Number(b.dataset.chart))));
    stageEl.querySelectorAll<HTMLButtonElement>("[data-wish]").forEach((b) => b.addEventListener("click", () => handlers.onSetWish(b.classList.contains("active") ? null : b.dataset.wish!)));
    stageEl.querySelectorAll<HTMLButtonElement>("[data-method]").forEach((b) => b.addEventListener("click", () => handlers.onMethod(b.dataset.method!)));
    stageEl.querySelector("#reroll")!.addEventListener("click", () => handlers.onReroll());
    stageEl.querySelector("#start")!.addEventListener("click", () => handlers.onStart());
  }

  return { render: renderRoll };
}

import { lifespanMonths, splitAge, stageNeed } from "../core/formulas";
import type { GameState } from "../core/state";
import { atBottleneck, realmOf } from "../core/tick";
import { ATTRIBUTE_KEYS, type AttributeKey, type GameData } from "../data/types";
import { formatLogEntry, realmLabel } from "./format";

export interface UiHandlers {
  onSpeed(speed: number): void;
  onReset(): void;
  onReroll(): void;
  onStart(): void;
  onNewLife(): void;
}

export interface Ui {
  render(state: GameState): void;
  notice(message: string): void;
}

const ATTR_LABEL: Record<AttributeKey, string> = {
  bone: "根骨",
  insight: "悟性",
  fortune: "氣運",
  mind: "心性",
};

export function mountUi(root: HTMLElement, data: GameData, handlers: UiHandlers): Ui {
  root.innerHTML = `
    <header class="bar">
      <span class="speeds"></span>
      <button id="reset" type="button">重新開始</button>
    </header>
    <p id="notice" hidden></p>
    <div id="stage"></div>
  `;
  const stageEl = root.querySelector<HTMLElement>("#stage")!;
  const noticeEl = root.querySelector<HTMLElement>("#notice")!;
  const speedBox = root.querySelector<HTMLElement>(".speeds")!;

  const speedButtons = data.config.speeds.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `×${s}`;
    b.addEventListener("click", () => handlers.onSpeed(s));
    speedBox.appendChild(b);
    return { s, b };
  });
  root.querySelector("#reset")!.addEventListener("click", () => {
    if (confirm("確定要清除存檔並重新開始嗎？")) handlers.onReset();
  });

  const statsHtml = (state: GameState): string =>
    `<dl class="stats">${ATTRIBUTE_KEYS.map(
      (k) => `<div><dt>${ATTR_LABEL[k]}</dt><dd>${state.attributes[k]}</dd></div>`,
    ).join("")}</dl>`;

  const identityHtml = (state: GameState): string => {
    const root = data.spiritRoots.find((r) => r.id === state.spiritRootId);
    const origin = data.origins.find((o) => o.id === state.originId);
    return `
      <p><span class="tag">靈根</span>${root?.name ?? "—"}</p>
      <p><span class="tag">出身</span>${origin?.name ?? "—"}</p>
      <p class="desc">${origin?.desc ?? ""}</p>`;
  };

  // ---- 擲骰畫面 ----
  let built: "roll" | "life" | null = null;
  let rollKey = "";

  function renderRoll(state: GameState): void {
    const key = `${JSON.stringify(state.attributes)}|${state.rerolls}|${state.spiritRootId}|${state.originId}`;
    if (built === "roll" && key === rollKey) return;
    built = "roll";
    rollKey = key;
    stageEl.innerHTML = `
      <main class="card roll">
        <h1>一念輪迴</h1>
        <p class="sub">命盤已擲，是好是壞，且看天意。</p>
        ${statsHtml(state)}
        ${identityHtml(state)}
        <div class="actions">
          <button id="reroll" type="button" ${state.rerolls > 0 ? "" : "disabled"}>重擲（剩 ${state.rerolls} 次）</button>
          <button id="start" type="button" class="primary">開始修行</button>
        </div>
      </main>`;
    stageEl.querySelector("#reroll")!.addEventListener("click", () => handlers.onReroll());
    stageEl.querySelector("#start")!.addEventListener("click", () => handlers.onStart());
  }

  // ---- 修行畫面（含死亡彈窗）----
  let els: {
    realm: HTMLElement;
    age: HTMLElement;
    stones: HTMLElement;
    fill: HTMLElement;
    barText: HTMLElement;
    log: HTMLElement;
    modal: HTMLElement;
    summary: HTMLElement;
  } | null = null;
  let logKey = "";

  function buildLife(state: GameState): void {
    built = "life";
    logKey = "";
    stageEl.innerHTML = `
      <section class="status">
        <div class="line"><strong id="realm"></strong><span id="age"></span><span id="stones"></span></div>
        <div class="progress"><div id="fill"></div><span id="barText"></span></div>
      </section>
      <div class="cols">
        <section class="log"><h2>修仙日誌</h2><ul id="log"></ul></section>
        <aside class="side"><h2>角色</h2>${statsHtml(state)}${identityHtml(state)}</aside>
      </div>
      <div class="modal" id="modal" hidden>
        <div class="card">
          <h2>此生已盡</h2>
          <p id="summary"></p>
          <div class="actions"><button id="newlife" type="button" class="primary">重新開局</button></div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;
    els = {
      realm: q("#realm"),
      age: q("#age"),
      stones: q("#stones"),
      fill: q("#fill"),
      barText: q("#barText"),
      log: q("#log"),
      modal: q("#modal"),
      summary: q("#summary"),
    };
    q("#newlife").addEventListener("click", () => handlers.onNewLife());
  }

  function renderLife(state: GameState): void {
    if (built !== "life" || !els) buildLife(state);
    const e = els!;
    const realm = realmOf(state, data);
    const need = stageNeed(realm, state.stage);
    const [years, months] = splitAge(state.ageMonths);
    e.realm.textContent = realmLabel(realm, state.stage);
    e.age.textContent = `${years} 歲 ${months} 個月 ／ 壽元 ${lifespanMonths(realm) / 12}`;
    e.stones.textContent = `靈石 ${state.spiritStones}`;
    e.fill.style.width = `${Math.min(100, (state.cultivation / need) * 100)}%`;
    e.barText.textContent = `修為 ${Math.floor(state.cultivation)} / ${need}${atBottleneck(state, data) ? "　瓶頸" : ""}`;

    const last = state.log[state.log.length - 1];
    const key = `${state.log.length}:${last?.month ?? ""}:${last?.kind ?? ""}`;
    if (key !== logKey) {
      logKey = key;
      e.log.innerHTML = "";
      for (const entry of [...state.log].reverse()) {
        const li = document.createElement("li");
        li.textContent = formatLogEntry(entry, data);
        e.log.appendChild(li);
      }
    }

    e.modal.hidden = state.phase !== "dead";
    if (state.phase === "dead") {
      e.summary.textContent = `享年 ${years} 歲，最高境界${realmLabel(realm, state.stage)}。`;
    }
  }

  return {
    render(state) {
      for (const { s, b } of speedButtons) b.disabled = s === state.speed;
      if (state.phase === "rolling") renderRoll(state);
      else renderLife(state);
    },
    notice(message) {
      noticeEl.textContent = message;
      noticeEl.hidden = message === "";
    },
  };
}

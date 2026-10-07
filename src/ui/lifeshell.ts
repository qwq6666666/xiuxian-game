import { statsHtml, guideHtml, identityHtml } from "./panels/rollview";
import { caveHtml, firstPersonArt } from "./scene/cave";
import { sceneHtml } from "./scene/scene";
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";
import { esc } from "./dom";
import { itemIcon, scheduleIcon } from "./icons";
import { SIDE_TABS, type LifeEls, type UiHandlers } from "./types";

/**
 * 修行畫面的整體骨架（只有字串，不碰 DOM）。
 * 桌面：日誌在左、側欄在右；手機（≤640px）改單欄，日誌在前、分頁區塊在後。
 * 側欄分四頁（修行、煉製、行囊、角色），一次只顯示一頁；分頁列在手機固定在畫面底部。
 */
export function lifeShellHtml(state: GameState, data: GameData): string {
  return `      ${caveHtml()}
      <section class="status" aria-label="狀態">
        ${sceneHtml()}
        <div class="line"><strong id="name"></strong><strong id="realm"></strong><span id="age"></span><span id="stones"></span><span id="sched"></span><button id="focusBtn" type="button" class="focus-btn" hidden></button><button id="travelOpen" type="button" hidden></button><span id="life" class="muted"></span></div>
        <div class="progress" id="progress" role="progressbar" aria-label="修為"><div id="fill"></div><span id="barText"></span></div>
        <div id="yearPips" class="year-pips" aria-hidden="true">${"<i></i>".repeat(12)}</div>
        <p id="pace" class="pace"></p>
        <div id="paceFix" class="pace-fix" hidden></div>
        <div id="resbar" class="resbar" aria-label="隨身"></div>
        <div id="todo" class="todo" hidden><span id="todoText"></span><button id="todoGo" type="button" class="primary">前往突破</button></div>
      </section>
      <div class="sr-only" id="live" aria-live="polite"></div>
      <div class="cols">
        <details class="log fold" id="foldLog" open><summary>日誌</summary><ul id="log"></ul></details>
        <aside class="side" data-active="play">
          <nav id="sideTabs" class="tabs" role="tablist" aria-label="分頁">${SIDE_TABS.map((t) => `<button type="button" role="tab" data-go="${t.id}" aria-selected="${t.id === "play"}">${t.label}</button>`).join("")}</nav>
          ${SIDE_TABS.map((t) => `<section class="s-locked" data-tab="${t.id}" data-locked-for="${t.id}" hidden><h2>尚未開放</h2><p class="desc"></p></section>`).join("")}
          <section id="schedSection" class="s-sched" data-tab="play"><h2>日常安排</h2>${firstPersonArt("wilderness")}<div id="schedules" class="choices"></div></section>
          <section id="btSection" class="s-bt" data-tab="play"><h2>突破</h2>
            ${firstPersonArt("breakthrough")}
            <p id="btInfo" class="desc"></p>
            <label id="pillRow" hidden><input type="checkbox" id="pill" /> <span id="pillText"></span></label>
            <div class="actions"><button id="breakthrough" type="button" class="primary">突破</button></div>
          </section>
          <section id="stanceBox" class="s-stance" data-tab="play" hidden></section>
          <section id="sectBox" class="s-sect" data-tab="play" hidden></section>
          <section id="trialBox" class="s-trial" data-tab="play" hidden></section>
          <section id="alchemyBox" class="s-alchemy" data-tab="make" hidden></section>
          <section id="zuohuaBox" class="s-zuohua" data-tab="play" hidden>
            <h2>閉關坐化</h2>
            <p id="zuohuaInfo" class="desc"></p>
            <div class="actions"><button id="zuohua" type="button">坐化</button></div>
          </section>
          <details class="fold s-goals" id="goalsFold" data-tab="me" open><summary>目標</summary><ul id="goals" class="goals"></ul><p id="goalHint" class="desc"></p><button id="goalGo" type="button" hidden></button></details>
          <details class="fold s-role" data-tab="me" open><summary>角色</summary>${statsHtml(state)}<div id="statDetail" class="stat-detail"></div>${guideHtml(data)}${identityHtml(state, data)}</details>
          <details class="fold s-bag" data-tab="pack" open><summary>背包</summary><ul id="bag" class="items"></ul></details>
          <details class="fold s-market" data-tab="pack" open><summary>坊市</summary>${firstPersonArt("market")}<ul id="market" class="items"></ul><p id="marketNote" class="market-note" hidden></p><button id="marketLink" type="button" hidden>世局</button></details>
        </aside>
      </div>
      <div class="modal" id="eventModal" role="dialog" aria-modal="true" aria-labelledby="eventTitle" hidden>
        <div class="card event">
          <div id="eventArt"></div>
          <h2 id="eventTitle"></h2>
          <p id="eventText"></p>
          <div id="eventHistory" class="event-history" hidden></div>
          <div id="eventChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="tribModal" role="dialog" aria-modal="true" aria-labelledby="tribTitle" hidden>
        <div class="card event">
          <h2 id="tribTitle"></h2>
          <p id="tribText"></p>
          <div id="tribRing" class="trib-ring" aria-hidden="true"><span class="ring-target"></span><span class="ring-close"></span></div>
          <p id="tribInfo" class="desc"></p>
          <div id="tribChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="huntModal" role="dialog" aria-modal="true" aria-labelledby="huntTitle" hidden>
        <div class="card event">
          <div id="huntArt"></div>
          <h2 id="huntTitle"></h2>
          <div id="huntTrial" class="hunt-trial" hidden></div>
          <p id="huntText"></p>
          <div id="huntBars" class="hunt-bars"></div>
          <p id="huntInfo" class="desc"></p>
          <div id="huntChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="trialResultModal" role="dialog" aria-modal="true" aria-labelledby="trialResultTitle" hidden>
        <div class="card event trial-result-card">
          <div id="trialResultMark" class="trial-result-mark" aria-hidden="true"></div>
          <h2 id="trialResultTitle"></h2>
          <p id="trialResultText"></p>
          <div id="trialResultRewards" class="trial-result-rewards"></div>
          <div class="actions"><button id="trialResultClose" type="button" class="primary">收起</button></div>
        </div>
      </div>
      <div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="一生回顧" hidden>
        <div class="card review life-review-card"><div id="modalBody"></div></div>
      </div>`;
}

/** 把修行畫面骨架裡的節點收成 LifeEls，並建立日常安排與坊市的按鈕列 */
export function queryLifeEls(stageEl: HTMLElement, data: GameData, handlers: UiHandlers): LifeEls {
  const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;
  const schedBox = q("#schedules");
  const schedules = data.schedules.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<strong>${scheduleIcon(s.id)}${esc(s.name)}</strong><small>${esc(s.desc)}</small><small class="sched-facts"></small><small class="sched-hint"></small>`;
    b.addEventListener("click", () => handlers.onSchedule(s.id));
    schedBox.appendChild(b);
    return { id: s.id, b, facts: b.querySelector<HTMLElement>(".sched-facts")!, hint: b.querySelector<HTMLElement>(".sched-hint")! };
  });

  const marketBox = q("#market");
  // 材料與只能煉製的法寶（價錢 0）不在坊市賣
  const market = data.items.filter((item) => item.effect.kind !== "material" && item.price > 0).map((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<div><strong>${itemIcon(data, item.id)}${esc(item.name)}</strong> <span class="price"></span><small>${esc(item.desc)}</small></div>`;
    const owned = document.createElement("span");
    owned.className = "owned";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "購買";
    b.addEventListener("click", () => handlers.onBuyItem(item.id));
    li.append(owned, b);
    marketBox.appendChild(li);
    return { id: item.id, price: li.querySelector<HTMLElement>(".price")!, owned, b };
  });

  return {
    realm: q("#realm"),
    name: q("#name"),
    age: q("#age"),
    stones: q("#stones"),
    fill: q("#fill"),
    barText: q("#barText"),
    progress: q("#progress"),
    sched: q("#sched"),
    travelOpen: q<HTMLButtonElement>("#travelOpen"),
    pace: q("#pace"),
    paceFix: q("#paceFix"),
    todo: q("#todo"),
    todoText: q("#todoText"),
    todoGo: q<HTMLButtonElement>("#todoGo"),
    live: q("#live"),
    log: q("#log"),
    eventModal: q("#eventModal"),
    tribModal: q("#tribModal"),
    tribTitle: q("#tribTitle"),
    tribText: q("#tribText"),
    tribInfo: q("#tribInfo"),
    tribChoices: q("#tribChoices"),
    huntModal: q("#huntModal"),
    huntArt: q("#huntArt"),
    huntTitle: q("#huntTitle"),
    huntText: q("#huntText"),
    huntBars: q("#huntBars"),
    huntInfo: q("#huntInfo"),
    huntChoices: q("#huntChoices"),
    huntTrial: q("#huntTrial"),
    trialResultModal: q("#trialResultModal"),
    trialResultMark: q("#trialResultMark"),
    trialResultTitle: q("#trialResultTitle"),
    trialResultText: q("#trialResultText"),
    trialResultRewards: q("#trialResultRewards"),
    trialResultClose: q("#trialResultClose"),
    eventTitle: q("#eventTitle"),
    eventText: q("#eventText"),
    eventHistory: q("#eventHistory"),
    eventChoices: q("#eventChoices"),
    life: q("#life"),
    goalsFold: q("#goalsFold"),
    goals: q("#goals"),
    goalHint: q("#goalHint"),
    goalGo: q<HTMLButtonElement>("#goalGo"),
    modal: q("#modal"),
    modalBody: q("#modalBody"),
    schedules,
    zuohuaBox: q("#zuohuaBox"),
    sectBox: q("#sectBox"),
    stanceBox: q("#stanceBox"),
    trialBox: q("#trialBox"),
    alchemyBox: q("#alchemyBox"),
    zuohuaInfo: q("#zuohuaInfo"),
    btSection: q("#btSection"),
    btInfo: q("#btInfo"),
    btButton: q<HTMLButtonElement>("#breakthrough"),
    pillRow: q("#pillRow"),
    pill: q<HTMLInputElement>("#pill"),
    pillText: q("#pillText"),
    bag: q("#bag"),
    market,
    marketNote: q("#marketNote"),
    marketLink: q<HTMLButtonElement>("#marketLink"),
  };
}

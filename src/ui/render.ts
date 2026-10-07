import { canBuyItem, canZuohua, pillsTaken, zuohuaDaoYun } from "../core/actions";
import {
  breakthroughRuleOf,
  canBreakthrough,
  type WaveChoice,
  missingTalent,
  pillAvailable,
} from "../core/breakthrough";
import { eventOf } from "../core/events";
import { placesAt } from "../core/travel";
import { activeWorldEffects, itemPrice } from "../core/worldeffects";
import { marketRelation, marketTerritory } from "../core/travel";
import { fillSlots, type SlotValues } from "../data/slots";
import { goalStatuses } from "../core/goals";
import { slotsFor } from "../core/sect";
import { canFocus, focusCharges, focusGain, focusWait } from "../core/focus";
import { burstScene, sceneHtml, updateScene } from "./scene";
import { createVeil } from "./veil";
import { neighbourOf, onSwipe } from "./gesture";
import { resetRolls, rollNumber } from "./tween";
import { haptic, hapticsEnabled, setHapticsEnabled } from "./haptics";
import { canPeek } from "../core/omen";
import { collapseRoutineRetreats, groupByDecade, logMarks, MARK_LABEL } from "./logGroups";
import { lockedNote } from "./tabinfo";
import { esc } from "./dom";
import { statsHtml, goalLine, guideHtml, identityHtml, createRoll } from "./rollview";
import { createPanels } from "./panels";
import { installModalFocus, createReviewModal } from "./modals";
import { createOverlays } from "./overlays";
import { itemIcon, scheduleIcon } from "./icons";
import { vignetteHtml } from "./vignette";
import { type HuntChoice } from "../core/encounter";
import { formatDuration, formatGain, paceHint, scheduleFactLines, scheduleFacts, scheduleHints, yearsLeft } from "./derived";
import { eraName, lifeIndex } from "../core/era";
import { pillPower, splitAge, stageNeed } from "../core/formulas";
import type { GameState } from "../core/state";
import { CLEARED_FLAG, YUANYING_FLAG } from "../core/review";
import { atBottleneck, lifespanYears, realmOf, scheduleOpen } from "../core/tick";
import { type ArtifactSlot, type GameData } from "../data/types";
import {
  choiceBlockReason,
  choiceOdds,
  eraBorn,
  eraTransition,
  formatChanges,
  formatLogEntry,
  formatReviewSummary,
  realmLabel,
  reviewTitle,
} from "./format";

const OMEN_LABEL: Record<"good" | "neutral" | "bad", string> = { good: "靈犀：吉兆", neutral: "靈犀：平", bad: "靈犀：凶兆" };

export interface UiHandlers {
  onBuyTalent(talentId: string): void;
  onAutoChoice(enabled: boolean): void;
  onChoose(choiceIndex: number): void;
  onPeek(choiceIndex: number): void;
  onPickChart(index: number): void;
  onSetWish(goalId: string | null): void;
  onSetNations(count: number): void;
  onSpeed(speed: number): void;
  onReset(): void;
  onExport(): void;
  onImport(text: string): void;
  onReroll(): void;
  onRename(name: string): void;
  onStart(): void;
  onNewLife(): void;
  onSchedule(scheduleId: string): void;
  onBreakthrough(usePill: boolean): void;
  onUseItem(itemId: string): void;
  onUseAll(itemId: string): void;
  onBuyItem(itemId: string): void;
  onZuohua(): void;
  onTravel(targetId: string): void;
  onWave(choice: WaveChoice, focused: boolean): void;
  onHunt(choice: HuntChoice): void;
  onFocus(): void;
  onMethod(methodId: string): void;
  onForge(recipeId: string): void;
  onEquip(itemId: string): void;
  onUnequip(slot: ArtifactSlot): void;
  onStartBrew(recipeId: string): void;
  onCancelBrew(): void;
  onJoinSect(): void;
  onLeaveSect(): void;
  onPromoteSect(): void;
}

export interface Ui {
  render(state: GameState): void;
  notice(message: string): void;
}

/** 側欄的分頁；每個區塊以 data-tab 歸屬其中一頁 */
export const SIDE_TABS = [
  { id: "play", label: "修行" },
  { id: "make", label: "煉製" },
  { id: "pack", label: "行囊" },
  { id: "me", label: "角色" },
] as const;
export type SideTab = (typeof SIDE_TABS)[number]["id"];

export interface LifeEls {
  name: HTMLElement;
  realm: HTMLElement;
  age: HTMLElement;
  stones: HTMLElement;
  fill: HTMLElement;
  barText: HTMLElement;
  progress: HTMLElement;
  sched: HTMLElement;
  travelOpen: HTMLButtonElement;
  pace: HTMLElement;
  todo: HTMLElement;
  todoText: HTMLElement;
  todoGo: HTMLButtonElement;
  live: HTMLElement;
  log: HTMLElement;
  eventModal: HTMLElement;
  tribModal: HTMLElement;
  tribTitle: HTMLElement;
  tribText: HTMLElement;
  tribInfo: HTMLElement;
  tribChoices: HTMLElement;
  huntModal: HTMLElement;
  huntArt: HTMLElement;
  huntTitle: HTMLElement;
  huntText: HTMLElement;
  huntBars: HTMLElement;
  huntInfo: HTMLElement;
  huntChoices: HTMLElement;
  eventTitle: HTMLElement;
  eventText: HTMLElement;
  eventHistory: HTMLElement;
  eventChoices: HTMLElement;
  life: HTMLElement;
  goalsFold: HTMLElement;
  goals: HTMLElement;
  goalHint: HTMLElement;
  goalGo: HTMLButtonElement;
  modal: HTMLElement;
  modalBody: HTMLElement;
  schedules: { id: string; b: HTMLButtonElement; facts: HTMLElement; hint: HTMLElement }[];
  zuohuaBox: HTMLElement;
  sectBox: HTMLElement;
  alchemyBox: HTMLElement;
  zuohuaInfo: HTMLElement;
  btSection: HTMLElement;
  btInfo: HTMLElement;
  btButton: HTMLButtonElement;
  pillRow: HTMLElement;
  pill: HTMLInputElement;
  pillText: HTMLElement;
  bag: HTMLElement;
  market: { id: string; price: HTMLElement; owned: HTMLElement; b: HTMLButtonElement }[];
  marketNote: HTMLElement;
  marketLink: HTMLButtonElement;
}

export function mountUi(root: HTMLElement, data: GameData, handlers: UiHandlers): Ui {
  /** 目前的側欄分頁；重建畫面（轉世、匯入）後沿用 */
  let sideTab: SideTab = "play";
  /** 整頁沒有任何可見區塊（例如凡人的「煉製」）時，顯示開放條件並把分頁鈕標成未開放 */
  function syncLockedTabs(): void {
    const side = root.querySelector<HTMLElement>(".side");
    if (!side) return;
    for (const { id } of SIDE_TABS) {
      const note = side.querySelector<HTMLElement>(`[data-locked-for="${id}"]`);
      if (!note) continue;
      const empty = !Array.from(side.querySelectorAll<HTMLElement>(`:scope > [data-tab="${id}"]`)).some((s) => s !== note && !s.hidden);
      if (note.hidden !== !empty) note.hidden = !empty;
      if (empty && note.querySelector("p")!.textContent === "") note.querySelector("p")!.textContent = lockedNote(id, data);
      const btn = side.querySelector<HTMLElement>(`#sideTabs button[data-go="${id}"]`);
      if (btn) {
        if (empty) btn.dataset.locked = "true";
        else delete btn.dataset.locked;
      }
    }
  }

  function showSideTab(tab: SideTab): void {
    sideTab = tab;
    const side = root.querySelector<HTMLElement>(".side");
    if (!side) return;
    side.dataset.active = tab;
    side.querySelectorAll<HTMLElement>("#sideTabs button").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.go === tab));
      // 看過這一頁就清掉提示點
      if (b.dataset.go === tab) b.removeAttribute("data-badge");
    });
  }

  root.innerHTML = `
    <header class="bar">
      <div class="bar-left">
        <span class="speeds" role="group" aria-label="流速"></span>
        <label class="auto"><input type="checkbox" id="auto" /> 自動抉擇</label>
      </div>
      <div class="bar-right">
        <button id="codex-open" type="button"></button>
        <button id="map-open" type="button"></button>
        <button id="collection-open" type="button">收藏</button>
        <details class="menu" id="menu">
          <summary>更多</summary>
          <div class="menu-list">
            <button id="mobile-codex-open" class="menu-mobile-only" type="button"></button>
            <button id="mobile-map-open" class="menu-mobile-only" type="button"></button>
            <button id="mobile-collection-open" class="menu-mobile-only" type="button">收藏</button>
            <button id="odds-toggle" type="button" aria-pressed="false">機率提示：關</button>
            <button id="haptics-toggle" type="button" aria-pressed="true">觸覺回饋：開</button>
            <button id="export" type="button">匯出存檔</button>
            <button id="import" type="button">匯入存檔</button>
            <button id="reset" type="button" class="danger">重新開始</button>
          </div>
        </details>
      </div>
    </header>
    <div id="notice" role="status" hidden><span id="noticeText"></span><button id="noticeGo" type="button" hidden></button><button id="noticeClose" type="button" aria-label="關閉提示">關閉</button></div>
    <div id="stage"></div>
    <div class="modal codex" id="codex" role="dialog" aria-modal="true" aria-label="殘卷錄" hidden><div class="card review" id="codex-card"></div></div>
    <div class="modal codex" id="map" role="dialog" aria-modal="true" aria-label="天下圖" hidden><div class="card review map-card" id="map-card"></div></div>
    <div class="modal codex" id="collection" role="dialog" aria-modal="true" aria-label="收藏" hidden><div class="card review" id="collection-card"></div></div>
  `;
  const stageEl = root.querySelector<HTMLElement>("#stage")!;
  const noticeEl = root.querySelector<HTMLElement>("#notice")!;
  const noticeText = root.querySelector<HTMLElement>("#noticeText")!;
  const noticeGo = root.querySelector<HTMLButtonElement>("#noticeGo")!;
  root.querySelector<HTMLButtonElement>("#noticeClose")!.addEventListener("click", () => { noticeEl.hidden = true; });
  const speedBox = root.querySelector<HTMLElement>(".speeds")!;
  // 手機左右滑動切換側欄分頁；沒開放的分頁略過，到頭不循環
  onSwipe(stageEl, (dir) => {
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const open = SIDE_TABS.map((t) => t.id).filter((id) => !stageEl.querySelector(`#sideTabs button[data-go="${id}"][data-locked]`) || id === sideTab);
    const next = neighbourOf(open, sideTab, dir);
    if (next) showSideTab(next);
  });

  const speedButtons = data.config.speeds.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `×${s}`;
    b.addEventListener("click", () => handlers.onSpeed(s));
    speedBox.appendChild(b);
    return { s, b };
  });
  const autoEl = root.querySelector<HTMLInputElement>("#auto")!;
  autoEl.addEventListener("change", () => handlers.onAutoChoice(autoEl.checked));

  // 「更多」選單：點選項、點選單外面或按 Escape 都會收起
  const menuEl = root.querySelector<HTMLDetailsElement>("#menu")!;
  // 機率提示：偏好存在瀏覽器，不進存檔；預設關閉，維持原本的氣質
  const ODDS_KEY = "xiuxian-odds";
  let showOdds = false;
  try {
    showOdds = localStorage.getItem(ODDS_KEY) === "1";
  } catch {
    showOdds = false;
  }
  let renderRef: ((state: GameState) => void) | null = null;
  const oddsBtn = root.querySelector<HTMLButtonElement>("#odds-toggle")!;
  const paintOddsBtn = (): void => {
    oddsBtn.textContent = `機率提示：${showOdds ? "開" : "關"}`;
    oddsBtn.setAttribute("aria-pressed", String(showOdds));
  };
  paintOddsBtn();
  oddsBtn.addEventListener("click", () => {
    showOdds = !showOdds;
    try {
      localStorage.setItem(ODDS_KEY, showOdds ? "1" : "0");
    } catch {
      /* 無法儲存也不影響本次顯示 */
    }
    paintOddsBtn();
    menuEl.open = false;
    if (lastState && renderRef) renderRef(lastState);
  });
  const hapticsBtn = root.querySelector<HTMLButtonElement>("#haptics-toggle")!;
  const paintHapticsBtn = (): void => {
    const on = hapticsEnabled();
    hapticsBtn.textContent = `觸覺回饋：${on ? "開" : "關"}`;
    hapticsBtn.setAttribute("aria-pressed", String(on));
  };
  paintHapticsBtn();
  hapticsBtn.addEventListener("click", () => {
    setHapticsEnabled(!hapticsEnabled());
    paintHapticsBtn();
    haptic("tap");
  });
  // 所有可按的按鈕都帶一下輕震（手機）；不支援的裝置與已關閉時什麼都不做
  root.addEventListener("click", (ev) => {
    const b = (ev.target as Element | null)?.closest("button");
    if (b && !b.disabled && b !== hapticsBtn) haptic("tap");
  });
  document.addEventListener("click", (ev) => {
    if (menuEl.open && !menuEl.contains(ev.target as Node)) menuEl.open = false;
  });
  menuEl.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    menuEl.open = false;
    menuEl.querySelector("summary")!.focus();
    ev.stopPropagation();
  });
  root.querySelector("#export")!.addEventListener("click", () => {
    menuEl.open = false;
    handlers.onExport();
  });
  root.querySelector("#import")!.addEventListener("click", () => {
    menuEl.open = false;
    const text = prompt("請貼上先前匯出的存檔文字：");
    if (text === null || text.trim() === "") return;
    if (confirm("匯入會覆蓋目前的存檔，確定嗎？")) handlers.onImport(text);
  });
  root.querySelector("#reset")!.addEventListener("click", () => {
    menuEl.open = false;
    if (confirm("確定要清除存檔並重新開始嗎？道韻與輪迴天賦也會一併清除。")) handlers.onReset();
  });

  const watchModal = installModalFocus(root, ["codex", "map", "collection"]);

  /** 當世的名稱欄位值，用來填入事件、殘卷、日誌裡的名稱 */
  // 名稱欄位含入宗者的同門名字，所以走 slotsFor
  const slotsOf = (state: GameState): SlotValues => slotsFor(state, data);

  const itemName = (id: string) => data.items.find((i) => i.id === id)?.name ?? id;

  const overlays = createOverlays({
    root,
    data,
    handlers,
    menuEl,
    getState: () => lastState,
    slotsOf: (state) => slotsOf(state),
    jumpTo: (target) => jumpTo(target),
  });

  function jumpTo(target: "market" | "schedules" | "breakthrough" | "goals" | "bag"): void {
    if (!els) return;
    const node = stageEl.querySelector<HTMLElement>({
      market: ".s-market", schedules: "#schedSection", breakthrough: "#btSection", goals: "#goalsFold", bag: ".s-bag",
    }[target]);
    if (!node) return;
    if (node instanceof HTMLDetailsElement) node.open = true;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    (node.querySelector<HTMLElement>("button:not([disabled]), summary") ?? node).focus({ preventScroll: true });
  }

  // 只用已有的旗標定義找前情，不額外記錄或預告尚未發生的事件。
  function relatedEvents(eventId: string): string[] {
    const ev = data.events.find((item) => item.id === eventId);
    if (!ev) return [];
    const needed = new Set(ev.conditions.flags ?? []);
    const produced = new Set([...(ev.effects?.flags ?? []), ...(ev.choices ?? []).flatMap((choice) => choice.outcomes.flatMap((outcome) => outcome.effects.flags ?? []))]);
    return data.events.filter((candidate) => candidate.id !== eventId && (
      (candidate.effects?.flags ?? []).some((flag) => needed.has(flag)) ||
      (candidate.choices ?? []).some((choice) => choice.outcomes.some((outcome) => (outcome.effects.flags ?? []).some((flag) => needed.has(flag)))) ||
      (candidate.conditions.flags ?? []).some((flag) => produced.has(flag))
    )).map((candidate) => candidate.id);
  }

  const rollView = createRoll({
    stageEl,
    data,
    handlers,
    getBuilt: () => built,
    setBuilt: (view) => { built = view; },
  });
  let built: "roll" | "life" | null = null;

  // ---- 修行畫面（含死亡與通關彈窗）----
  let els: LifeEls | null = null;
  let lastState: GameState | null = null;
  const veil = createVeil();
  let logKey = "";
  let logLen = 0;
  let prevStones: number | null = null;
  let prevCultivation: number | null = null;
  let prevStageKey = "";
  let eventKey = "";

  function buildLife(state: GameState): void {
    built = "life";
    logKey = "";
    resetRolls();
    panels.reset();
    logLen = 0;
    prevStones = null;
    prevCultivation = null;
    prevStageKey = "";
    eventKey = "";
    // 桌面：日誌在左、側欄在右；手機（≤640px）改單欄，日誌在前、分頁區塊在後。
    // 側欄分四頁（修行、煉製、行囊、角色），一次只顯示一頁；分頁列在手機固定在畫面底部。
    stageEl.innerHTML = `
      <section class="status" aria-label="狀態">
        ${sceneHtml()}
        <div class="line"><strong id="name"></strong><strong id="realm"></strong><span id="age"></span><span id="stones"></span><span id="sched"></span><button id="focusBtn" type="button" class="focus-btn" hidden></button><button id="travelOpen" type="button" hidden></button><span id="life" class="muted"></span></div>
        <div class="progress" id="progress" role="progressbar" aria-label="修為"><div id="fill"></div><span id="barText"></span></div>
        <div id="yearPips" class="year-pips" aria-hidden="true">${"<i></i>".repeat(12)}</div>
        <p id="pace" class="pace"></p>
        <div id="resbar" class="resbar" aria-label="隨身"></div>
        <div id="todo" class="todo" hidden><span id="todoText"></span><button id="todoGo" type="button" class="primary">前往突破</button></div>
      </section>
      <div class="sr-only" id="live" aria-live="polite"></div>
      <div class="cols">
        <details class="log fold" id="foldLog" open><summary>日誌</summary><ul id="log"></ul></details>
        <aside class="side" data-active="play">
          <nav id="sideTabs" class="tabs" role="tablist" aria-label="分頁">${SIDE_TABS.map((t) => `<button type="button" role="tab" data-go="${t.id}" aria-selected="${t.id === "play"}">${t.label}</button>`).join("")}</nav>
          ${SIDE_TABS.map((t) => `<section class="s-locked" data-tab="${t.id}" data-locked-for="${t.id}" hidden><h2>尚未開放</h2><p class="desc"></p></section>`).join("")}
          <section id="schedSection" class="s-sched" data-tab="play"><h2>日常安排</h2><div class="scene-art scene-art-wilderness" role="img" aria-label="雲霧山野間，一名旅人沿石徑前行"></div><div id="schedules" class="choices"></div></section>
          <section id="btSection" class="s-bt" data-tab="play"><h2>突破</h2>
            <div class="scene-art scene-art-breakthrough" role="img" aria-label="修士在石室中靜坐，雲氣緩緩匯聚"></div>
            <p id="btInfo" class="desc"></p>
            <label id="pillRow" hidden><input type="checkbox" id="pill" /> <span id="pillText"></span></label>
            <div class="actions"><button id="breakthrough" type="button" class="primary">突破</button></div>
          </section>
          <section id="sectBox" class="s-sect" data-tab="play" hidden></section>
          <section id="alchemyBox" class="s-alchemy" data-tab="make" hidden></section>
          <section id="zuohuaBox" class="s-zuohua" data-tab="play" hidden>
            <h2>閉關坐化</h2>
            <p id="zuohuaInfo" class="desc"></p>
            <div class="actions"><button id="zuohua" type="button">坐化</button></div>
          </section>
          <details class="fold s-goals" id="goalsFold" data-tab="me" open><summary>目標</summary><ul id="goals" class="goals"></ul><p id="goalHint" class="desc"></p><button id="goalGo" type="button" hidden></button></details>
          <details class="fold s-role" data-tab="me" open><summary>角色</summary>${statsHtml(state)}<div id="statDetail" class="stat-detail"></div>${guideHtml(data)}${identityHtml(state, data)}</details>
          <details class="fold s-bag" data-tab="pack" open><summary>背包</summary><ul id="bag" class="items"></ul></details>
          <details class="fold s-market" data-tab="pack" open><summary>坊市</summary><div class="scene-art scene-art-market" role="img" aria-label="暮色中的坊市，攤棚下陳列藥材與器物"></div><ul id="market" class="items"></ul><p id="marketNote" class="market-note" hidden></p><button id="marketLink" type="button" hidden>世局</button></details>
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
          <p id="huntText"></p>
          <div id="huntBars" class="hunt-bars"></div>
          <p id="huntInfo" class="desc"></p>
          <div id="huntChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="一生回顧" hidden>
        <div class="card review life-review-card"><div id="modalBody"></div></div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;
    watchModal(q("#eventModal"));
    watchModal(q("#tribModal"));
    watchModal(q("#huntModal"));
    watchModal(q("#modal"));

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
    // 材料不在坊市賣
    const market = data.items.filter((item) => item.effect.kind !== "material").map((item) => {
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

    els = {
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
    els.btButton.addEventListener("click", () => handlers.onBreakthrough(els!.pill.checked));
    const doFocus = (): void => {
      if (!lastState || !canFocus(lastState, data)) return;
      panels.floatDelta(els!.progress, Math.max(1, Math.round(focusGain(lastState, data))), "bar");
      stageEl.querySelector<HTMLElement>("#scene")?.classList.add("pulse");
      window.setTimeout(() => stageEl.querySelector<HTMLElement>("#scene")?.classList.remove("pulse"), 600);
      handlers.onFocus();
    };
    q("#focusBtn").addEventListener("click", doFocus);
    q("#scene").addEventListener("click", doFocus);
    stageEl.querySelectorAll<HTMLButtonElement>("#sideTabs button").forEach((b) => b.addEventListener("click", () => showSideTab(b.dataset.go as SideTab)));
    showSideTab(sideTab);
    els.marketLink.addEventListener("click", overlays.openMap);
    els.travelOpen.addEventListener("click", overlays.openMap);
    els.goalGo.addEventListener("click", () => {
      const target = els!.goalGo.dataset.target;
      if (target === "codex") overlays.openCodex();
      else if (target === "schedules" || target === "market" || target === "breakthrough") jumpTo(target);
    });
    els.todoGo.addEventListener("click", () => {
      els!.btSection.scrollIntoView({ block: "nearest" });
      els!.btButton.focus();
    });
    q("#zuohua").addEventListener("click", () => {
      // 結束這一世不可回頭，先問一聲
      if (lastState && confirm("閉關坐化會立刻結束這一世，確定嗎？")) handlers.onZuohua();
    });
    // 勾選丹藥後立刻更新成功率，不用等下一個月
    els.pill.addEventListener("change", () => lastState && panels.renderBreakthrough(lastState, els!));
  }

  const panels = createPanels({
    stageEl,
    data,
    handlers,
    slotsOf: (state) => slotsOf(state),
    itemName: (id) => itemName(id),
    getSideTab: () => sideTab,
    showSideTab: (tab) => showSideTab(tab),
  });

  function renderLife(state: GameState): void {
    if (built !== "life" || !els) buildLife(state);
    const e = els!;
    const realm = realmOf(state, data);
    const need = stageNeed(realm, state.stage);
    const [years, months] = splitAge(state.ageMonths);
    e.realm.textContent =
      realmLabel(realm, state.stage) +
      (state.flags.includes(YUANYING_FLAG) ? "（已結嬰）" : state.flags.includes(CLEARED_FLAG) ? "（已通關）" : "");
    e.name.textContent = `${state.name}（${eraName(lifeIndex(state), data)}年間）`;
    const lifespan = lifespanYears(state, data);
    const left = yearsLeft(state.ageMonths, lifespan);
    e.age.textContent = `${years} 歲 ${months} 個月 ／ 壽元 ${lifespan}（餘 ${left} 年）`;
    // 只改文字節點，避免把進行中的浮字一併清掉
    // 靈石數字順著過渡滾到新值（短過渡，讓大額進帳看得出來）
    rollNumber("stones", state.spiritStones, data.config.msPerMonth / Math.max(1, state.speed), (v) => {
      const text = `靈石 ${v}`;
      if (e.stones.firstChild?.nodeType === Node.TEXT_NODE) e.stones.firstChild.nodeValue = text;
      else e.stones.prepend(text);
    });
    // 一年十二格：目前的月份亮起，讓「一個月一秒」有看得見的刻度
    const pips = stageEl.querySelectorAll<HTMLElement>("#yearPips i");
    const monthNow = state.ageMonths % 12;
    pips.forEach((p, i) => {
      p.classList.toggle("on", i <= monthNow);
      p.classList.toggle("now", i === monthNow);
    });
    if (prevStones !== null && state.spiritStones !== prevStones && !document.hidden) {
      panels.floatDelta(e.stones, state.spiritStones - prevStones, "");
    }
    prevStones = state.spiritStones;
    e.sched.textContent = `安排：${data.schedules.find((s) => s.id === state.schedule)?.name ?? ""}`;
    const travelTarget = state.travel.targetId ? placesAt(state, data).find((place) => place.id === state.travel.targetId) : null;
    e.travelOpen.hidden = travelTarget === null;
    if (travelTarget) e.travelOpen.textContent = `行至${travelTarget.name}・餘 ${state.travel.remainingMonths} 月`;
    // 進度條過渡長度 = 一個月的現實時間；換階段或歸零時不做倒退動畫
    const stageKey = `${realm.id}:${state.stage}`;
    const width = Math.min(100, (state.cultivation / need) * 100);
    const resets = stageKey !== prevStageKey || width < parseFloat(e.fill.style.width || "0");
    e.fill.style.setProperty("--dur-tick", `${Math.max(1, data.config.msPerMonth / state.speed)}ms`);
    if (resets) {
      e.fill.style.transition = "none";
      e.fill.style.width = `${width}%`;
      void e.fill.offsetWidth;
      e.fill.style.transition = "";
    } else {
      e.fill.style.width = `${width}%`;
    }
    // 修為浮字：只在同一階段內出現跳升或損失（服藥、事件、突破失敗），日常累積不顯示
    const gainNow = Math.floor(state.cultivation);
    if (prevCultivation !== null && stageKey === prevStageKey && !document.hidden) {
      const d = gainNow - prevCultivation;
      const perMonth = paceHint(state, data);
      const step = perMonth.kind === "eta" ? perMonth.perMonth * Math.max(1, state.speed) * 2 + 1 : Infinity;
      if (d < 0 || d > step) panels.floatDelta(e.progress, d, "bar");
    }
    prevCultivation = gainNow;
    prevStageKey = stageKey;
    const cultivation = Math.floor(state.cultivation);
    const stuck = atBottleneck(state, data);
    // 修為數字與進度條同步爬升；換階段或歸零時不滾動
    const barMs = resets ? 0 : data.config.msPerMonth / Math.max(1, state.speed);
    rollNumber("cultivation", cultivation, barMs, (v) => {
      e.barText.textContent = `修為 ${v} / ${need}${stuck ? "　瓶頸" : ""}`;
    });
    e.progress.setAttribute("aria-valuemin", "0");
    e.progress.setAttribute("aria-valuemax", String(need));
    e.progress.setAttribute("aria-valuenow", String(Math.min(cultivation, need)));

    const pace = paceHint(state, data);
    if (pace.kind === "eta") {
      const lianqi = data.realms.find((r) => r.id === "lianqi")!;
      // 練氣階段提示離突破還差幾層（M32：讓前期有看得見的目標）
      const toBreakthrough = state.realmId === lianqi.id ? lianqi.stageNames.length - 1 - state.stage : 0;
      const tail = toBreakthrough > 0 ? `再 ${toBreakthrough} 層築基。` : "";
      e.pace.textContent = `每月約 +${formatGain(pace.perMonth)}，約 ${formatDuration(pace.seconds)}後升階。${tail}`;
    } else if (pace.kind === "bottleneck") {
      e.pace.textContent = "修為已圓滿，不再增長，要靠突破才能再進一步。";
    } else {
      e.pace.textContent = "";
    }

    // 待辦：此刻最需要玩家處理的一件事（抉擇事件另以彈窗處理）
    const canBt = canBreakthrough(state, data);
    // 修為圓滿且能突破時，進度條微微呼吸，提醒玩家這一刻該動手
    e.progress.classList.toggle("ready", canBt && stuck);
    const gated = stuck && !canBt && breakthroughRuleOf(state, data) !== null && missingTalent(state, data) !== null;
    if (canBt && stuck) {
      e.todoText.textContent = "修為圓滿，可以嘗試突破。";
    } else if (gated) {
      e.todoText.textContent = breakthroughRuleOf(state, data)?.gateText ?? data.text.breakthroughGate;
    } else if (state.phase === "living" && left < lifespan * 0.1) {
      e.todoText.textContent = `壽元將盡，只剩 ${left} 年。`;
    } else {
      e.todoText.textContent = "";
    }
    e.todo.hidden = e.todoText.textContent === "";
    e.todoGo.hidden = !(canBt && stuck);
    if (stuck && canBt) {
      const rule = breakthroughRuleOf(state, data);
      if (rule?.pillId && !pillAvailable(state, data)) {
        const pill = data.items.find((item) => item.id === rule.pillId);
        if (pill) {
          const shortfall = Math.max(0, itemPrice(state, pill.id, data) - state.spiritStones);
          e.todoText.textContent += ` ${pill.name}可在坊市購得${shortfall > 0 ? `，尚缺 ${shortfall} 靈石` : ""}。`;
        }
      }
    }

    for (const { id, b, facts, hint } of e.schedules) {
      const sched = data.schedules.find((s) => s.id === id)!;
      b.classList.toggle("active", id === state.schedule);
      b.setAttribute("aria-pressed", String(id === state.schedule));
      b.hidden = !scheduleOpen(state, sched, data);
      if (b.hidden) continue;
      facts.textContent = scheduleFactLines(scheduleFacts(state, sched, data)).join("・");
      hint.textContent = scheduleHints(state, sched, slotsOf(state), data).join("　");
      hint.hidden = hint.textContent === "";
    }
    updateScene(stageEl.querySelector<HTMLElement>("#scene"), state, data);
    const fb = stageEl.querySelector<HTMLButtonElement>("#focusBtn");
    if (fb) {
      const ok = canFocus(state, data);
      fb.hidden = state.phase !== "living" || atBottleneck(state, data);
      fb.disabled = !ok;
      const charges = focusCharges(state, data);
      fb.textContent = ok ? `運功×${charges} +${Math.max(1, Math.round(focusGain(state, data)))}` : charges > 0 ? `運功×${charges}` : `運功・${focusWait(state, data)}`;
    }
    panels.renderStatDetail(state);
    panels.renderResources(state);
    panels.renderSect(state, e);
    panels.renderAlchemy(state, e);
    panels.renderTribulation(state, e);
    panels.renderHunt(state, e);
    e.zuohuaBox.hidden = !canZuohua(state, data);
    if (!e.zuohuaBox.hidden) {
      e.zuohuaInfo.textContent = `把剩餘壽元一次坐完，結束這一世，額外換得道韻 +${zuohuaDaoYun(state, data)}。已達階段的道韻照常結算。`;
    }
    panels.renderBreakthrough(state, e);
    panels.renderBag(state, e);
    for (const m of e.market) {
      const item = data.items.find((i) => i.id === m.id)!;
      const price = itemPrice(state, m.id, data);
      m.price.textContent = `${price} 靈石${price > item.price ? "　↑ 較平日貴" : price < item.price ? "　↓ 較平日便宜" : ""}`;
      m.price.classList.toggle("price-up", price > item.price);
      m.price.classList.toggle("price-down", price < item.price);
      m.owned.textContent = `持有 ${state.items[m.id] ?? 0}`;
      m.b.disabled = !canBuyItem(state, m.id, data);
      const used = state.itemsUsed[m.id] ?? 0;
      if (item.effect.kind === "lifespan") m.owned.textContent += `／已服 ${used}`;
      if (item.effect.kind === "cultivationFraction") {
        const taken = pillsTaken(state);
        if (taken > 0) m.owned.textContent += `／此階段已服 ${taken}，藥力 ${Math.round(pillPower(item.effect.falloff, taken) * 100)}%`;
      }
    }

    // 世局讓價格變動時，說明原因
    const reasons = activeWorldEffects(state, data).map((x) => fillSlots(x.reason, slotsOf(state)));
    if (marketTerritory(state, data)?.contested) reasons.push(`坊市一帶國界正在易手，商路不穩，物價約漲 ${Math.round((data.map.territoryRules.marketMultiplier - 1) * 100)}%。`);
    const marketRel = marketRelation(state, data);
    if (marketRel === "feud") reasons.push(`坊市所在的國與你的宗門有舊怨，物價約漲 ${Math.round((data.worldRelations.effects.feudPriceMult - 1) * 100)}%。`);
    if (marketRel === "ally") reasons.push(`坊市所在的國與你的宗門互惠，物價約減 ${Math.round((1 - data.worldRelations.effects.allyPriceMult) * 100)}%。`);
    e.marketNote.hidden = reasons.length === 0;
    e.marketNote.textContent = reasons.join("　");
    e.marketLink.hidden = reasons.length === 0;

    const last = state.log[state.log.length - 1];
    const key = `${state.log.length}:${last?.month ?? ""}:${last?.kind ?? ""}`;
    if (key !== logKey) {
      logKey = key;
      // 只有少量新增時才淡入；離線補算、匯入存檔一次多筆就不播
      const added = state.log.length - logLen;
      const fresh = logLen > 0 && added >= 1 && added <= 3 ? added : 0;
      logLen = state.log.length;
      // 突破與升階的短暫回饋：成功金框、失敗朱砂框，升階只讓進度條亮一下
      for (const entry of state.log.slice(state.log.length - fresh)) {
        if (entry.kind === "breakthroughSuccess" || entry.kind === "realmUp") {
          panels.flash(".status", "flash-up");
          burstScene(stageEl.querySelector<HTMLElement>("#scene"));
          if (entry.kind === "breakthroughSuccess") veil.play("success", formatLogEntry(entry, data, state.name, slotsOf(state)));
        }
        else if (entry.kind === "breakthroughFail") {
          panels.flash(".status", "flash-down");
          veil.play("fail", formatLogEntry(entry, data, state.name, slotsOf(state)));
        }
        else if (entry.kind === "stageUp") panels.flash(".progress", "flash-up");
        else if (entry.kind === "alchemyDone" || entry.kind === "forgeDone") panels.markMake("flash-up");
        else if (entry.kind === "alchemyFail" || entry.kind === "forgeFail" || entry.kind === "alchemyStop") panels.markMake("flash-down");
      }
      if (last) e.live.textContent = formatLogEntry(last, data, state.name, slotsOf(state));
      e.log.innerHTML = "";
      let shown = 0;
      for (const group of groupByDecade([...state.log].reverse())) {
      const heading = document.createElement("li");
      heading.className = "log-decade";
      heading.textContent = group.label;
      e.log.appendChild(heading);
      for (const row of collapseRoutineRetreats(group.entries, data)) {
        const li = document.createElement("li");
        const rowLength = row.kind === "retreats" ? row.entries.length : 1;
        if (shown < fresh) li.className = "log-new";
        shown += rowLength;
        if (row.kind === "retreats") {
          li.classList.add("log-retreat-summary");
          li.textContent = row.label;
          e.log.appendChild(li);
          continue;
        }
        const entry = row.entry;
        const marks = logMarks(entry, data);
        for (const m of marks) li.classList.add(`log-${m}`);
        li.textContent = formatLogEntry(entry, data, state.name, slotsOf(state));
        const changes = formatChanges(entry.changes, data, slotsOf(state));
        if (changes.length > 0) {
          const small = document.createElement("small");
          small.className = "changes";
          small.textContent = changes.join("　");
          li.appendChild(small);
        }
        if (entry.kind === "event" && entry.eventId) {
          const related = relatedEvents(entry.eventId);
          const earlier = state.log.filter((prior) => prior.kind === "event" && prior.eventId && related.includes(prior.eventId) && prior.month < entry.month);
          if (earlier.length > 0) {
            const history = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = `回看前情（${earlier.length}）`;
            history.append(summary);
            for (const prior of earlier) {
              const p = document.createElement("p");
              p.textContent = formatLogEntry(prior, data, state.name, slotsOf(state));
              history.append(p);
            }
            li.append(history);
          }
        }
        // 標記不只靠顏色：文字也寫出來
        if (marks.length > 0) {
          const tag = document.createElement("small");
          tag.className = "log-mark";
          tag.textContent = marks.map((m) => MARK_LABEL[m]).join("・");
          li.prepend(tag);
        }
        e.log.appendChild(li);
      }
      }
    }

    // 抉擇事件：時間暫停，等玩家選擇
    const pendingKey = state.pendingEvent === null ? "" : `${state.pendingEvent}|${state.spiritStones}|${JSON.stringify(state.items)}|${showOdds}|${JSON.stringify(state.attributes)}|${state.omenLeft}|${JSON.stringify(state.omen)}`;
    if (pendingKey !== eventKey) {
      eventKey = pendingKey;
      e.eventModal.hidden = state.pendingEvent === null;
      e.eventChoices.innerHTML = "";
      if (state.pendingEvent !== null) {
        const ev = eventOf(state.pendingEvent, data);
        const slots = slotsOf(state);
        e.eventModal.dataset.tone = ev.tone;
        e.eventTitle.textContent = fillSlots(ev.title, slots);
        stageEl.querySelector<HTMLElement>("#eventArt")!.innerHTML = vignetteHtml(ev, state.realmId);
        e.eventText.textContent = fillSlots(ev.text, slots);
        const earlier = state.log.filter((entry) => entry.kind === "event" && entry.eventId && relatedEvents(ev.id).includes(entry.eventId));
        e.eventHistory.hidden = earlier.length === 0;
        e.eventHistory.replaceChildren();
        if (earlier.length > 0) {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = `先前的因緣（${earlier.length}）`;
          details.append(summary);
          for (const entry of earlier) {
            const p = document.createElement("p");
            p.textContent = formatLogEntry(entry, data, state.name, slots);
            details.append(p);
          }
          e.eventHistory.append(details);
        }
        (ev.choices ?? []).forEach((choice, i) => {
          const reason = choiceBlockReason(choice.requires, state, data);
          const b = document.createElement("button");
          b.type = "button";
          b.disabled = reason !== null;
          const odds = showOdds ? choiceOdds(choice, state.attributes) : [];
          b.innerHTML = `<strong></strong>${reason || odds.length > 0 ? "<small></small>" : ""}`;
          b.querySelector("strong")!.textContent = fillSlots(choice.text, slots);
          if (reason) b.querySelector("small")!.textContent = reason;
          else if (odds.length > 0) b.querySelector("small")!.textContent = `結果機率約 ${odds.map((p) => `${p}%`).join("／")}`;
          b.addEventListener("click", () => handlers.onChoose(i));
          // 靈犀：已窺看的顯示吉凶，還有次數且能窺看的多一個「窺看」鈕
          const seen = state.omen.find((o) => o.choice === i);
          if (seen) {
            const tag = document.createElement("small");
            tag.className = `omen omen-${seen.omen}`;
            tag.textContent = OMEN_LABEL[seen.omen];
            b.appendChild(tag);
          }
          if (state.omenLeft > 0 && canPeek(state, i, data)) {
            const row = document.createElement("div");
            row.className = "choice-row";
            const peek = document.createElement("button");
            peek.type = "button";
            peek.className = "peek";
            peek.textContent = "窺看";
            peek.setAttribute("aria-label", `以靈犀窺看「${fillSlots(choice.text, slots)}」的吉凶，本世還剩 ${state.omenLeft} 次`);
            peek.addEventListener("click", () => handlers.onPeek(i));
            row.append(b, peek);
            e.eventChoices.appendChild(row);
          } else e.eventChoices.appendChild(b);
        });
        if (state.omenLeft > 0 || state.omen.length > 0) {
          const hint = document.createElement("p");
          hint.className = "desc omen-hint";
          hint.textContent = `靈犀：本世還能窺看 ${state.omenLeft} 次，只看吉凶，不看內容。`;
          e.eventChoices.prepend(hint);
        }
      }
    }

    {
      const items = goalStatuses(state, data);
      e.goalsFold.hidden = items.length === 0;
      e.goals.replaceChildren(
        ...items.map((g) => {
          const li = document.createElement("li");
          li.textContent = goalLine(g, g.def.id === state.wishId);
          li.classList.toggle("done", g.done);
          return li;
        }),
      );
      const pending = items.find((g) => !g.done);
      e.goalGo.hidden = !pending;
      if (!pending) e.goalHint.textContent = items.length ? "本世目標已盡數達成。" : "";
      else {
        const kind = pending.def.condition.kind;
        e.goalHint.textContent = kind === "fragments" || kind === "events" ? "想多見些人事，可考慮外出歷練或走訪渡口；修為進度會放慢。" :
          kind === "realm" ? "想推進修為，可考慮閉關；遇到瓶頸仍須親自突破。" :
          kind === "age" ? "壽元不足時，可留意延壽丹與背包。" : "此事自有後續，留意往後見聞。";
        const target = kind === "age" ? "market" : kind === "fragments" && state.meta.fragments.length > 0 ? "codex" : kind === "realm" && stuck ? "breakthrough" : "schedules";
        e.goalGo.dataset.target = target;
        e.goalGo.textContent = { market: "查看坊市", codex: "閱讀殘卷", breakthrough: "查看突破", schedules: "查看安排" }[target];
      }
    }
    e.life.textContent = `第 ${state.meta.lives + (state.review === null ? 1 : 0)} 世`;
    syncLockedTabs();
    reviewModal.render(state, e);
  }

  // ---- 一生回顧與輪迴天賦（死亡或通關後的彈窗）----
  const reviewModal = createReviewModal(data, handlers, slotsOf, () => {
    if (lastState && els) reviewModal.render(lastState, els);
  });

  const ui: Ui = {
    render(state) {
      const arrivedAt = lastState?.travel.targetId && !state.travel.targetId && state.travel.locationId === lastState.travel.targetId
        ? placesAt(state, data).find((place) => place.id === state.travel.locationId)?.name : null;
      const before = lastState;
      lastState = state;
      overlays.update(state);
      autoEl.checked = state.autoChoice;
      for (const { s, b } of speedButtons) b.setAttribute("aria-pressed", String(s === state.speed));
      if (state.phase === "rolling") rollView.render(state);
      else renderLife(state);
      // 死亡與轉世的全螢幕過場；只在狀態剛切換的那一次播，載入與匯入存檔不播
      const ended = state.phase === "dead" || state.phase === "cleared";
      if (before?.phase === "living" && ended) {
        veil.play("death", state.review ? formatReviewSummary(state.review, data) : "此生已了，且入輪迴。", reviewTitle(state.review));
      } else if ((before?.phase === "dead" || before?.phase === "cleared") && state.phase === "rolling") {
        veil.play("rebirth", eraTransition(lifeIndex(state), data) || eraBorn(lifeIndex(state), data));
      }
      if (arrivedAt) {
        noticeText.textContent = `已抵達${arrivedAt}。此處的風物，總算不只在圖上。`;
        noticeGo.hidden = true;
        noticeEl.hidden = false;
      }
      if (!noticeEl.hidden && noticeText.textContent.startsWith("閉關 ")) {
        let target: "breakthrough" | "bag" | "schedules" | null = null;
        if (state.phase === "living" && atBottleneck(state, data) && canBreakthrough(state, data)) target = "breakthrough";
        else if (state.phase === "living" && yearsLeft(state.ageMonths, lifespanYears(state, data)) < lifespanYears(state, data) * 0.1) target = "bag";
        else if (state.phase === "living") target = "schedules";
        noticeGo.hidden = target === null;
        if (target) {
          noticeGo.textContent = { breakthrough: "查看突破", bag: "查看背包", schedules: "查看安排" }[target];
          noticeGo.onclick = () => { noticeEl.hidden = true; jumpTo(target); };
        }
      }
    },
    notice(message) {
      noticeText.textContent = message;
      noticeGo.hidden = true;
      noticeEl.hidden = message === "";
    },
  };
  renderRef = (state) => ui.render(state);
  return ui;
}

import { canBuyItem, canZuohua, pillsTaken, zuohuaDaoYun } from "../core/actions";
import {
  breakthroughRuleOf,
  canBreakthrough,
  missingTalent,
  pillAvailable,
} from "../core/character/breakthrough";
import { eventOf } from "../core/events";
import { placesAt } from "../core/world/travel";
import { activeWorldEffects, freightRate, itemFreight, itemPrice } from "../core/world/worldeffects";
import { marketRelation, marketTerritory } from "../core/world/travel";
import { fillSlots, type SlotValues } from "../data/slots";
import { goalStatuses } from "../core/character/goals";
import { slotsFor } from "../core/character/sect";
import { canFocus, focusCharges, focusGain, focusWait } from "../core/character/focus";
import { burstScene, updateScene } from "./scene/scene";
import { gameNavHtml, mountGameMode } from "./gamemode";
import { CAVE_DEFS, mountCave, toggleSchedulePicker, updateCave } from "./scene/cave";
import { QUICK_PILL, type CaveAction } from "./scene/caveLogic";
import { createVeil } from "./scene/veil";
import { neighbourOf, onSwipe } from "./gesture";
import { resetRolls, rollNumber } from "./tween";
import { keepView } from "./keepview";
import { createAchievementWatch } from "./achievementWatch";
import { createSlotsModal } from "./slotsModal";

const reducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
import { haptic, hapticsEnabled, setHapticsEnabled } from "./haptics";
import { setSoundEnabled, soundEnabled } from "./sound";
import { canPeek } from "../core/character/omen";
import { collapseRoutineRetreats, groupByDecade, logMarks, MARK_LABEL } from "./panels/logGroups";
import { lockedNote } from "./panels/tabinfo";
import { goalLine, createRoll } from "./panels/rollview";
import { createPanels } from "./panels/panels";
import { installModalFocus, createReviewModal } from "./modals";
import { createOverlays } from "./overlays";
import { vignetteHtml } from "./scene/vignette";
import { formatDuration, formatForecast, formatGain, lifeForecast, paceHint, scheduleFactLines, scheduleFacts, scheduleHints, yearsLeft } from "./derived";
import { eraName, lifeIndex } from "../core/character/era";
import { pillPower, splitAge, stageNeed } from "../core/formulas";
import type { GameState } from "../core/state";
import { CLEARED_FLAG, YUANYING_FLAG } from "../core/character/review";
import { atBottleneck, lifespanYears, realmOf, scheduleOpen } from "../core/tick";
import type { GameData } from "../data/types";
import {
  choiceBlockReason,
  choiceOdds,
  choiceSureCost,
  choiceRequireLine,
  choiceHasFollowUp,
  eraBorn,
  eraTransition,
  formatChanges,
  formatLogEntry,
  formatReviewSummary,
  realmLabel,
  reviewTitle,
} from "./format";

import { SIDE_TABS, type LifeEls, type SideTab, type Ui, type UiHandlers } from "./types";
import { lifeShellHtml, queryLifeEls } from "./lifeshell";

const OMEN_LABEL: Record<"good" | "neutral" | "bad", string> = { good: "靈犀：吉兆", neutral: "靈犀：平", bad: "靈犀：凶兆" };



export function mountUi(root: HTMLElement, data: GameData, handlers: UiHandlers, holdPref = true): Ui {
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
    ${CAVE_DEFS}
    <header class="bar">
      <div class="bar-left">
        <span class="speeds" role="group" aria-label="流速"></span>
        <label class="auto"><input type="checkbox" id="auto" /> 自動抉擇</label>
        <label class="auto"><input type="checkbox" id="hold" checked /> 關鍵時刻暫停</label>
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
            <button id="ui-toggle" type="button" aria-pressed="false">介面：經典</button>
            <button id="odds-toggle" type="button" aria-pressed="false">機率提示：關</button>
            <button id="haptics-toggle" type="button" aria-pressed="true">觸覺回饋：開</button>
            <button id="sound-toggle" type="button" aria-pressed="false">音效：關</button>
            <button id="slots-open" type="button">存檔槽</button>
            <button id="export" type="button">匯出存檔</button>
            <button id="import" type="button">匯入存檔</button>
            <button id="reset" type="button" class="danger">重新開始</button>
          </div>
        </details>
      </div>
    </header>
    <div id="notice" role="status" hidden><span id="noticeText"></span><button id="noticeGo" type="button" hidden></button><button id="noticeClose" type="button" aria-label="關閉提示">關閉</button></div>
    <div id="stage"></div>
    <p id="logTicker" class="log-ticker" role="button" tabindex="0" aria-label="開啟日誌"></p>
    ${gameNavHtml()}
    <div class="modal codex" id="codex" role="dialog" aria-modal="true" aria-label="殘卷錄" hidden><div class="card review" id="codex-card"></div></div>
    <div class="modal codex" id="map" role="dialog" aria-modal="true" aria-label="天下圖" hidden><div class="card review map-card" id="map-card"></div></div>
    <div class="modal codex" id="slots" role="dialog" aria-modal="true" aria-label="存檔槽" hidden><div class="card review" id="slots-card"></div></div>
    <div class="modal codex" id="collection" role="dialog" aria-modal="true" aria-label="收藏" hidden><div class="card review" id="collection-card"></div></div>
  `;
  const stageEl = root.querySelector<HTMLElement>("#stage")!;
  // 遊戲介面：場景全螢幕、功能由底部導航列開抽屜；經典介面維持原樣
  const game = mountGameMode(root, stageEl, { showSideTab: (tab) => showSideTab(tab), openMap: () => overlays.openMap(), refresh: () => { if (lastState && renderRef) renderRef(lastState); } }, window.matchMedia("(max-width: 640px)").matches);
  const noticeEl = root.querySelector<HTMLElement>("#notice")!;
  const noticeText = root.querySelector<HTMLElement>("#noticeText")!;
  const noticeGo = root.querySelector<HTMLButtonElement>("#noticeGo")!;
  let noticeAction: (() => void) | null = null;
  const finishNotice = (): void => {
    noticeEl.hidden = true;
    const run = noticeAction;
    noticeAction = null;
    run?.();
  };
  root.querySelector<HTMLButtonElement>("#noticeClose")!.addEventListener("click", finishNotice);
  const speedBox = root.querySelector<HTMLElement>(".speeds")!;
  // 手機左右滑動切換側欄分頁；沒開放的分頁略過，到頭不循環
  onSwipe(stageEl, (dir) => {
    if (game.isGame() || !window.matchMedia("(max-width: 640px)").matches) return;
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
  const holdEl = root.querySelector<HTMLInputElement>("#hold")!;
  holdEl.checked = holdPref;
  holdEl.addEventListener("change", () => handlers.onHold(holdEl.checked));

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
  const soundBtn = root.querySelector<HTMLButtonElement>("#sound-toggle")!;
  const paintSoundBtn = (): void => {
    const on = soundEnabled();
    soundBtn.textContent = `音效：${on ? "開" : "關"}`;
    soundBtn.setAttribute("aria-pressed", String(on));
  };
  paintSoundBtn();
  soundBtn.addEventListener("click", () => {
    setSoundEnabled(!soundEnabled());
    paintSoundBtn();
    haptic("good");
  });
  // 所有可按的按鈕都帶一下輕震（手機）；不支援的裝置與已關閉時什麼都不做
  root.addEventListener("click", (ev) => {
    const b = (ev.target as Element | null)?.closest("button");
    if (b && !b.disabled && b !== hapticsBtn && b !== soundBtn) haptic("tap");
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
  createSlotsModal({ root, handlers, menuEl, watchModal });

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

  let paceFixKey = "";
  function renderPaceFix(e: LifeEls, fixes: { key: string; label: string; run: () => void }[]): void {
    const key = fixes.map((f) => f.key + f.label).join("|");
    if (key === paceFixKey) return;
    paceFixKey = key;
    e.paceFix.hidden = fixes.length === 0;
    e.paceFix.replaceChildren(...fixes.map((f) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = f.label;
      b.addEventListener("click", f.run);
      return b;
    }));
  }

  function jumpTo(target: "market" | "schedules" | "breakthrough" | "goals" | "bag"): void {
    if (!els) return;
    if (game.isGame()) game.openSheet(target === "schedules" || target === "breakthrough" ? "play" : target === "goals" ? "me" : "pack");
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
  /** 上一次畫出的抉擇事件；同一個事件內容更新（窺看、靈石變動）才保住捲動與折疊，換新事件就不保 */
  let keptEvent: string | null = null;

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
    stageEl.innerHTML = lifeShellHtml(state, data);
    const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;
    watchModal(q("#eventModal"));
    watchModal(q("#tribModal"));
    watchModal(q("#huntModal"));
    watchModal(q("#trialResultModal"));
    watchModal(q("#modal"));

    els = queryLifeEls(stageEl, data, handlers);
    els.btButton.addEventListener("click", () => handlers.onBreakthrough(els!.pill.checked));
    const doFocus = (): void => {
      if (!lastState || !canFocus(lastState, data)) return;
      panels.floatDelta(els!.progress, Math.max(1, Math.round(focusGain(lastState, data))), "bar");
      for (const id of ["#scene", "#cave"]) {
        stageEl.querySelector<HTMLElement>(id)?.classList.add("pulse");
        window.setTimeout(() => stageEl.querySelector<HTMLElement>(id)?.classList.remove("pulse"), 600);
      }
      handlers.onFocus();
    };
    q("#focusBtn").addEventListener("click", doFocus);
    q("#scene").addEventListener("click", doFocus);
    // 洞府第一人稱視角：熱點只是面板操作的另一個入口，共用同一組 handler
    const caveEl = q("#cave");
    const showTab = (tab: SideTab): void => {
      if (game.isGame()) return game.openSheet(tab);
      showSideTab(tab);
      stageEl.querySelector<HTMLElement>(".side")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    const runCave = (action: CaveAction): void => {
      switch (action) {
        case "focus": return doFocus();
        case "brew": return showTab("make");
        case "bag": return showTab("pack");
        case "market": return showTab("pack");
        case "pill": return handlers.onUseItem(QUICK_PILL);
        case "scrolls": return overlays.openCodex();
        case "map": return overlays.openMap();
        case "schedule": return toggleSchedulePicker(caveEl);
      }
    };
    mountCave(caveEl, runCave, () => { if (lastState) updateCave(caveEl, stageEl.querySelector<HTMLElement>("#scene"), lastState, data, handlers.onSchedule, game.isGame()); });
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
      game.openSheet("play");
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
      const forecast = lifeForecast(state, data);
      e.pace.textContent = `每月約 +${formatGain(pace.perMonth)}，約 ${formatDuration(pace.seconds)}後升階。${tail}${forecast ? formatForecast(forecast) : ""}`;
      // 來不及圓滿：警告旁直接給下一步（內容沒變就不重畫，免得按鈕在每個 tick 被換掉）
      const fixes: { key: string; label: string; run: () => void }[] = [];
      if (forecast && forecast.leftAtFull < 0) {
        if (state.schedule !== "retreat") fixes.push({ key: "retreat", label: "改回閉關", run: () => handlers.onSchedule("retreat") });
        if ((state.items[QUICK_PILL] ?? 0) > 0) fixes.push({ key: "pill", label: `服用${itemName(QUICK_PILL)}`, run: () => handlers.onUseItem(QUICK_PILL) });
        fixes.push({ key: "market", label: "查看延壽丹", run: () => jumpTo("market") });
      }
      renderPaceFix(e, fixes);
    } else {
      renderPaceFix(e, []);
      e.pace.textContent = pace.kind === "bottleneck" ? "修為已圓滿，不再增長，要靠突破才能再進一步。" : "";
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
    updateCave(stageEl.querySelector<HTMLElement>("#cave"), stageEl.querySelector<HTMLElement>("#scene"), state, data, handlers.onSchedule, game.isGame());
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
    panels.renderStance(state, e);
    panels.renderTrial(state, e);
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
      const freight = itemFreight(state, m.id, data);
      const goods = price - freight; // 不含運費，才好和平日價比
      m.price.textContent = `${price} 靈石${goods > item.price ? "　↑ 較平日貴" : goods < item.price ? "　↓ 較平日便宜" : ""}${freight > 0 ? `　（含運費 ${freight}）` : ""}`;
      m.price.classList.toggle("price-up", goods > item.price);
      m.price.classList.toggle("price-down", goods < item.price);
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
    if (marketRel === "feud") reasons.push(`坊市所在的國與我的宗門有舊怨，物價約漲 ${Math.round((data.worldRelations.effects.feudPriceMult - 1) * 100)}%。`);
    if (marketRel === "ally") reasons.push(`坊市所在的國與我的宗門互惠，物價約減 ${Math.round((1 - data.worldRelations.effects.allyPriceMult) * 100)}%。`);
    const freight = freightRate(state, data);
    if (freight > 0) reasons.push(`人不在坊市，貨由行腳商送來，運費約 ${Math.round(freight * 100)}%；親自到坊市或商行買，就不用付。`);
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
          burstScene(stageEl.querySelector<HTMLElement>("#cave"));
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
      // 日誌每次新增都整段重畫：先記下捲動與「回看前情」的展開狀態
      const logTop = e.log.scrollTop;
      const logHeight = e.log.scrollHeight;
      const keepLog = keepView(e.log);
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
      keepLog();
      // 新日誌插在最上面：玩家正往下讀舊的就補上新增的高度，畫面才不會被往下推；停在最上面就繼續跟著最新
      e.log.scrollTop = logTop > 0 ? logTop + (e.log.scrollHeight - logHeight) : 0;
    }

    // 抉擇事件：時間暫停，等玩家選擇
    const pendingKey = state.pendingEvent === null ? "" : `${state.pendingEvent}|${state.spiritStones}|${JSON.stringify(state.items)}|${showOdds}|${JSON.stringify(state.attributes)}|${state.omenLeft}|${JSON.stringify(state.omen)}`;
    if (pendingKey !== eventKey) {
      eventKey = pendingKey;
      e.eventModal.hidden = state.pendingEvent === null;
      const evCard = e.eventModal.querySelector<HTMLElement>(".card");
      const keepEvent = evCard && state.pendingEvent !== null && state.pendingEvent === keptEvent ? keepView(evCard, [evCard]) : null;
      keptEvent = state.pendingEvent;
      e.eventChoices.innerHTML = "";
      e.eventChoices.classList.remove("picked");
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
          const sure = choiceSureCost(choice);
          const note = reason || ([...choiceRequireLine(choice.requires, data), ...sure, ...(choiceHasFollowUp(choice, data) ? ["會留下後續"] : []), odds.length > 0 ? `結果機率約 ${odds.map((p) => `${p}%`).join("／")}` : ""].filter(Boolean).join("　") || null);
          b.innerHTML = `<strong></strong>${note ? "<small></small>" : ""}`;
          b.querySelector("strong")!.textContent = fillSlots(choice.text, slots);
          if (note) b.querySelector("small")!.textContent = note;
          b.addEventListener("click", () => {
            // 選中的選項亮起、其餘淡出，停一小下再結算，讓「選了什麼」有個落點
            // 已選定、正等結算時，再按任何選項（含鍵盤）一律忽略，不能改掉先前的選擇
            if (e.eventChoices.classList.contains("picked")) return;
            if (reducedMotion()) return void handlers.onChoose(i);
            e.eventChoices.classList.add("picked");
            b.classList.add("pick");
            window.setTimeout(() => handlers.onChoose(i), 170);
          });
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
            peek.addEventListener("click", () => {
              if (!e.eventChoices.classList.contains("picked")) handlers.onPeek(i);
            });
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
      keepEvent?.();
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
      const newest = state.log[state.log.length - 1];
      game.setTicker(newest ? formatLogEntry(newest, data, state.name, slotsOf(state)) : "");
      if (state.phase !== "living") game.closeSheet();
      overlays.update(state);
      autoEl.checked = state.autoChoice;
      for (const { s, b } of speedButtons) b.setAttribute("aria-pressed", String(s === state.speed));
      if (state.phase === "rolling") rollView.render(state);
      else renderLife(state);
      watchAchievements(state.meta);
      // 秘境可能逐層手動打，也可能由自動抉擇在一次更新裡跑到底；兩種路徑都從新增日誌找最終結算。
      if (before && els) {
        const result = state.log[state.log.length - 1];
        const previous = before.log[before.log.length - 1];
        const resultKey = result ? `${result.month}:${result.kind}:${result.trialId ?? ""}:${result.outcome ?? ""}` : "";
        const previousKey = previous ? `${previous.month}:${previous.kind}:${previous.trialId ?? ""}:${previous.outcome ?? ""}` : "";
        if (resultKey !== previousKey && (result?.kind === "trialClear" || result?.kind === "trialFail")) panels.showTrialResult(state, result, els);
      }
      // 死亡與轉世的全螢幕過場；只在狀態剛切換的那一次播，載入與匯入存檔不播
      const ended = state.phase === "dead" || state.phase === "cleared";
      if (before?.phase === "living" && ended) {
        veil.play("death", state.review ? formatReviewSummary(state.review, data) : "此生已了，且入輪迴。", reviewTitle(state.review));
      } else if ((before?.phase === "dead" || before?.phase === "cleared") && state.phase === "rolling") {
        veil.play("rebirth", eraTransition(lifeIndex(state), data) || eraBorn(lifeIndex(state), data));
      }
      if (arrivedAt) {
        noticeAction?.(); // 暫停提示被蓋掉就當作已看過，不讓時間卡死
        noticeAction = null;
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
    notice(message, action) {
      const replaced = noticeAction;
      noticeText.textContent = message;
      noticeAction = action?.run ?? null;
      noticeGo.hidden = action === undefined;
      if (action) {
        noticeGo.textContent = action.label;
        noticeGo.onclick = finishNotice;
      }
      noticeEl.hidden = message === "";
      replaced?.();
    },
    reading() {
      // 修行抽屜是操作安排用的，開著不算閱讀；其餘抽屜與所有彈窗都算
      const sheet = stageEl.dataset.sheet;
      const reading = root.querySelector(".modal:not([hidden])") !== null || (sheet !== undefined && sheet !== "play");
      root.toggleAttribute("data-reading", reading);
      return reading;
    },
  };
  const watchAchievements = createAchievementWatch(data, (message) => {
    if (!noticeEl.hidden) return false;
    ui.notice(message);
    haptic("good");
    return true;
  });
  renderRef = (state) => ui.render(state);
  return ui;
}

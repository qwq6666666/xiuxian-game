import { canBuyItem, canBuyTalent, canUseItem, canZuohua, pillsTaken, zuohuaDaoYun } from "../core/actions";
import {
  breakthroughRuleOf,
  canBreakthrough,
  currentBreakthroughRate,
  missingTalent,
  currentFailLoss,
  pillAvailable,
} from "../core/breakthrough";
import { eventOf } from "../core/events";
import { placesAt } from "../core/travel";
import { CLEAR_FRAGMENT_ID } from "../core/fragments";
import { activeWorldEffects, itemPrice } from "../core/worldeffects";
import { marketTerritory } from "../core/travel";
import { polityLabel, worldFor, worldSlots } from "../core/world";
import { fillSlots, type SlotValues } from "../data/slots";
import { compareLives, goalStatuses, type GoalProgress } from "../core/goals";
import { attributeGuide, recommendTalent, talentPreview, formatDuration, formatGain, paceHint, scheduleFactLines, scheduleFacts, scheduleHints, yearsLeft } from "./derived";
import type { MapTarget } from "./mapinfo";
import { buildWorldMap, mapStamp } from "./worldmap";
import { eraName, lifeIndex } from "../core/era";
import { pillPower, splitAge, stageNeed, talentCost } from "../core/formulas";
import type { GameState } from "../core/state";
import { CLEARED_FLAG, YUANYING_FLAG } from "../core/review";
import { atBottleneck, lifespanYears, realmOf, scheduleOpen } from "../core/tick";
import { ATTRIBUTE_KEYS, type GameData } from "../data/types";
import {
  ATTR_LABEL,
  choiceBlockReason,
  describeTalent,
  eraBorn,
  eraTransition,
  collectionSummary,
  formatChanges,
  formatLogEntry,
  formatReviewSummary,
  formatVersus,
  realmLabel,
  reviewTitle,
  talentSummary,
} from "./format";

export interface UiHandlers {
  onBuyTalent(talentId: string): void;
  onAutoChoice(enabled: boolean): void;
  onChoose(choiceIndex: number): void;
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
  onBuyItem(itemId: string): void;
  onZuohua(): void;
  onTravel(targetId: string): void;
}

export interface Ui {
  render(state: GameState): void;
  notice(message: string): void;
}

export function mountUi(root: HTMLElement, data: GameData, handlers: UiHandlers): Ui {
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

  // ---- 彈窗的鍵盤與焦點：開啟時移入、Tab 圈在最上層彈窗內、關閉時還原 ----
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';
  const visibleModals = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(".modal")).filter((m) => !m.hidden);
  const lastFocus = new WeakMap<HTMLElement, HTMLElement | null>();
  function watchModal(modal: HTMLElement): void {
    const card = modal.querySelector<HTMLElement>(".card")!;
    card.tabIndex = -1;
    new MutationObserver(() => {
      if (!modal.hidden) {
        if (!lastFocus.has(modal)) {
          lastFocus.set(modal, document.activeElement as HTMLElement | null);
          card.focus({ preventScroll: true });
          card.scrollTop = 0;
        }
      } else if (lastFocus.has(modal)) {
        const back = lastFocus.get(modal);
        lastFocus.delete(modal);
        if (back && back.isConnected) back.focus({ preventScroll: true });
      }
    }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab") return;
    const open = visibleModals();
    const top = open[open.length - 1];
    if (!top) return;
    const items = Array.from(top.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => !x.hidden && x.offsetParent !== null);
    const card = top.querySelector<HTMLElement>(".card")!;
    if (items.length === 0) {
      ev.preventDefault();
      card.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!top.contains(active) || active === card) {
      ev.preventDefault();
      (ev.shiftKey ? last : first).focus();
    } else if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  });
  for (const id of ["codex", "map", "collection"]) watchModal(root.querySelector<HTMLElement>(`#${id}`)!);

  // ---- 殘卷錄 ----
  const SEEN_KEY = "xiuxian-fragments-seen";
  const readSeen = (): string[] => {
    try {
      const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const writeSeen = (ids: string[]): void => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {
      // 無法記住也沒關係，只是標記會一直亮著
    }
  };
  const codexEl = root.querySelector<HTMLElement>("#codex")!;
  const codexCard = root.querySelector<HTMLElement>("#codex-card")!;
  const codexBtn = root.querySelector<HTMLButtonElement>("#codex-open")!;
  const mobileCodexBtn = root.querySelector<HTMLButtonElement>("#mobile-codex-open")!;
  const totalFragments = data.fragments.items.length;

  function updateCodexButton(state: GameState): void {
    const seen = readSeen();
    const fresh = state.meta.fragments.some((id) => !seen.includes(id));
    const label = `殘卷錄 ${state.meta.fragments.length}／${totalFragments}${fresh ? " ●" : ""}`;
    codexBtn.textContent = label;
    mobileCodexBtn.textContent = label;
  }

  function buildCodex(state: GameState): void {
    const slots = slotsOf(state);
    const held = new Set(state.meta.fragments);
    const box = document.createDocumentFragment();
    const head = document.createElement("div");
    head.className = "codex-head";
    const title = document.createElement("h2");
    title.textContent = `殘卷錄　${held.size}／${totalFragments}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "關閉";
    close.addEventListener("click", closeCodex);
    head.append(title, close);
    const note = document.createElement("p");
    note.className = "desc";
    note.textContent = "這些你都讀過，只是不記得了。";
    box.append(head, note);
    for (const [topicId, topicName] of Object.entries(data.fragments.topics)) {
      const h = document.createElement("h3");
      h.textContent = topicName;
      box.append(h);
      for (const f of data.fragments.items.filter((x) => x.topic === topicId)) {
        const art = document.createElement("article");
        art.className = held.has(f.id) ? "fragment" : "fragment missing";
        if (held.has(f.id)) {
          const t = document.createElement("strong");
          t.textContent = fillSlots(f.title, slots);
          const meta = document.createElement("small");
          meta.className = "changes";
          meta.textContent = `${f.source}｜${fillSlots(data.fragments.stances[f.stance] ?? f.stance, slots)}｜${f.era}`;
          const body = document.createElement("p");
          body.className = "fragment-text";
          body.textContent = fillSlots(f.text, slots);
          art.append(t, meta, body);
        } else {
          art.textContent = "（未得）";
        }
        box.append(art);
      }
    }
    codexCard.replaceChildren(box);
  }

  // ---- 天下圖 ----
  const MAP_SEEN_KEY = "xiuxian-map-seen";
  const readMapSeen = (): string => {
    try {
      return localStorage.getItem(MAP_SEEN_KEY) ?? "";
    } catch {
      return "";
    }
  };
  const writeMapSeen = (stamp: string): void => {
    try {
      localStorage.setItem(MAP_SEEN_KEY, stamp);
    } catch {
      // 無法記住也沒關係，只是標記會一直亮著
    }
  };
  const mapEl = root.querySelector<HTMLElement>("#map")!;
  const mapCard = root.querySelector<HTMLElement>("#map-card")!;
  const mapBtn = root.querySelector<HTMLButtonElement>("#map-open")!;
  const mobileMapBtn = root.querySelector<HTMLButtonElement>("#mobile-map-open")!;
  let mapSelected: MapTarget | null = null;

  function updateMapButton(state: GameState): void {
    // 擲骰時不提示：重擲會一直換世界，提示只會吵
    const fresh = state.phase !== "rolling" && mapStamp(state, data) !== readMapSeen();
    const label = `天下圖${fresh ? " ●" : ""}`;
    mapBtn.textContent = label;
    mobileMapBtn.textContent = label;
  }

  function buildMap(state: GameState): void {
    const focusedOnDestination = document.activeElement?.classList.contains("map-destination") ?? false;
    const content = buildWorldMap(state, data, mapSelected, {
        onSelect(target) {
          mapSelected = target;
          if (lastState) buildMap(lastState);
        },
        onClose: closeMap,
        onTravel(targetId) { handlers.onTravel(targetId); },
      });
    const marketLink = document.createElement("button");
    marketLink.type = "button";
    marketLink.textContent = "查看坊市物價";
    marketLink.addEventListener("click", () => { closeMap(); requestAnimationFrame(() => jumpTo("market")); });
    if (state.phase !== "rolling") content.append(marketLink);
    mapCard.replaceChildren(content);
    if (focusedOnDestination) mapCard.querySelector<HTMLSelectElement>(".map-destination")?.focus({ preventScroll: true });
  }

  function openMap(): void {
    if (!lastState) return;
    closeCodex();
    closeCollection();
    mapSelected = null;
    buildMap(lastState);
    mapEl.hidden = false;
    writeMapSeen(mapStamp(lastState, data));
    updateMapButton(lastState);
  }
  function closeMap(): void {
    mapEl.hidden = true;
  }
  mapBtn.addEventListener("click", openMap);
  mobileMapBtn.addEventListener("click", () => { menuEl.open = false; openMap(); });
  mapEl.addEventListener("click", (ev) => {
    if (ev.target === mapEl) closeMap();
  });

  // ---- 通關收藏 ----
  const collectionEl = root.querySelector<HTMLElement>("#collection")!;
  const collectionCard = root.querySelector<HTMLElement>("#collection-card")!;
  const collectionBtn = root.querySelector<HTMLButtonElement>("#collection-open")!;
  const mobileCollectionBtn = root.querySelector<HTMLButtonElement>("#mobile-collection-open")!;

  function buildCollection(state: GameState): void {
    const sum = collectionSummary(state.meta, data);
    const box = document.createDocumentFragment();
    const head = document.createElement("div");
    head.className = "codex-head";
    const title = document.createElement("h2");
    title.textContent = `收藏　通關 ${sum.total} 次${sum.yuanyingTotal > 0 ? `　元嬰 ${sum.yuanyingTotal} 次` : ""}`;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "關閉";
    close.addEventListener("click", closeCollection);
    head.append(title, close);
    const note = document.createElement("p");
    note.className = "desc";
    note.textContent = data.text.collection.note;
    box.append(head, note);
    for (const row of sum.rows) {
      const art = document.createElement("article");
      art.className = row.count > 0 ? "fragment" : "fragment missing";
      const name = document.createElement("strong");
      name.textContent = row.name;
      const count = document.createElement("small");
      count.className = "changes";
      count.textContent =
        (row.count > 0 ? `通關 ${row.count} 次` : `（${data.text.collection.empty}）`) +
        (row.yuanying > 0 ? `　元嬰 ${row.yuanying} 次` : "");
      const desc = document.createElement("p");
      desc.className = "fragment-text";
      desc.textContent = row.desc;
      art.append(name, count, desc);
      box.append(art);
    }
    const goalHead = document.createElement("h3");
    goalHead.textContent = "目標收藏";
    const goalList = document.createElement("ul");
    goalList.className = "goals";
    for (const g of data.goals) {
      const n = state.meta.goals[g.id] ?? 0;
      const li = document.createElement("li");
      li.textContent = n > 0 ? `✓ ${g.name}　達成 ${n} 次` : `　${g.name}　（尚未達成）`;
      li.classList.toggle("done", n > 0);
      goalList.append(li);
    }
    box.append(goalHead, goalList);
    if (sum.allCleared) {
      const done = document.createElement("p");
      done.className = "desc";
      done.textContent = data.text.collection.allCleared;
      box.append(done);
    }
    collectionCard.replaceChildren(box);
  }
  function openCollection(): void {
    if (!lastState) return;
    closeCodex();
    closeMap();
    buildCollection(lastState);
    collectionEl.hidden = false;
  }
  function closeCollection(): void {
    collectionEl.hidden = true;
  }
  collectionBtn.addEventListener("click", openCollection);
  mobileCollectionBtn.addEventListener("click", () => { menuEl.open = false; openCollection(); });
  collectionEl.addEventListener("click", (ev) => {
    if (ev.target === collectionEl) closeCollection();
  });

  function openCodex(): void {
    if (!lastState) return;
    closeMap();
    closeCollection();
    buildCodex(lastState);
    codexEl.hidden = false;
    writeSeen(lastState.meta.fragments);
    updateCodexButton(lastState);
  }
  function closeCodex(): void {
    codexEl.hidden = true;
  }
  codexBtn.addEventListener("click", openCodex);
  mobileCodexBtn.addEventListener("click", () => { menuEl.open = false; openCodex(); });
  codexEl.addEventListener("click", (ev) => {
    if (ev.target === codexEl) closeCodex();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !codexEl.hidden) closeCodex();
    if (ev.key === "Escape" && !mapEl.hidden) closeMap();
    if (ev.key === "Escape" && !collectionEl.hidden) closeCollection();
  });

  /** 當世的名稱欄位值，用來填入事件、殘卷、日誌裡的名稱 */
  const slotsOf = (state: GameState): SlotValues => worldSlots(worldFor(state.worldSeed, data));

  const itemName = (id: string) => data.items.find((i) => i.id === id)?.name ?? id;

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

  const statsHtml = (state: GameState): string =>
    `<dl class="stats">${ATTRIBUTE_KEYS.map(
      (k) => `<div><dt>${ATTR_LABEL[k]}</dt><dd>${state.attributes[k]}</dd></div>`,
    ).join("")}</dl>`;

  /** 這一世的目標：只作收藏，不給任何數值，所以措辭上不強求 */
  const goalLine = (g: GoalProgress): string => {
    // 境界與旗標的進度數字沒有意義，只有年歲、殘卷、見聞才顯示
    const counted = ["age", "fragments", "events"].includes(g.def.condition.kind) && !g.done;
    return `${g.done ? "✓ " : ""}${g.def.name}｜${g.def.desc}${counted ? `（${g.current} / ${g.target}）` : ""}`;
  };

  const goalsHtml = (state: GameState): string => {
    const items = goalStatuses(state, data);
    if (items.length === 0) return "";
    return `<section class="goals-box"><h3>這一世的目標</h3><ul class="goals">${items.map((g) => `<li>${goalLine(g)}</li>`).join("")}</ul><p class="desc">不強求，達成了記進收藏，沒達成也無妨。</p></section>`;
  };

  /** 屬性與靈根各自影響什麼，收在可展開的說明裡 */
  const guideHtml = (): string => {
    const g = attributeGuide(data);
    return `<details class="guide"><summary>屬性與靈根有什麼用</summary><ul>${ATTRIBUTE_KEYS.map(
      (k) => `<li><strong>${g.attributes[k].label}</strong>　${g.attributes[k].text}</li>`,
    ).join("")}<li><strong>靈根</strong>　${g.spiritRoot}</li></ul></details>`;
  };

  const identityHtml = (state: GameState): string => {
    const spiritRoot = data.spiritRoots.find((r) => r.id === state.spiritRootId);
    const origin = data.origins.find((o) => o.id === state.originId);
    return `
      <p><span class="tag">靈根</span>${spiritRoot?.name ?? "—"}</p>
      <p><span class="tag">出身</span>${origin?.name ?? "—"}</p>
      <p class="desc">${origin?.desc ?? ""}</p>`;
  };

  /** 擲骰畫面的出生地：國家與村名，讓玩家看見每次重擲世界都不一樣 */
  const birthHtml = (state: GameState): string => {
    const world = worldFor(state.worldSeed, data);
    const slots = worldSlots(world);
    const polity = world.polities.find((p) => p.id === world.owners[world.birth.region])!;
    const region = data.map.regions.find((r) => r.id === world.birth.region)!;
    return `<p><span class="tag">出生地</span>${polityLabel(polity)}・${slots.village}（${region.name}）</p>`;
  };

  // ---- 擲骰畫面 ----
  let built: "roll" | "life" | null = null;
  let rollKey = "";
  let currentName = "";

  function renderRoll(state: GameState): void {
    const key = `${state.worldSeed}|${state.name}|${JSON.stringify(state.attributes)}|${state.rerolls}|${state.spiritRootId}|${state.originId}|${state.meta.lives}|${JSON.stringify(state.meta.talents)}`;
    if (built === "roll" && key === rollKey) return;
    built = "roll";
    rollKey = key;
    currentName = state.name;
    const perks = talentSummary(state.meta.talents, data);
    stageEl.innerHTML = `
      <main class="card roll">
        <h1>一念輪迴</h1>
        <p class="sub">第 ${state.meta.lives + 1} 世。命盤已擲，是好是壞，且看天意。</p>
        ${eraTransition(lifeIndex(state), data) !== "" ? `<p class="desc">${eraTransition(lifeIndex(state), data)}</p>` : ""}
        <label class="namebox">姓名 <input id="name" type="text" maxlength="${data.config.nameMaxLength}" /></label>
        ${perks.length > 0 ? `<ul class="perks">${perks.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
        ${statsHtml(state)}
        ${guideHtml()}
        ${identityHtml(state)}
        ${birthHtml(state)}
        ${goalsHtml(state)}
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
    stageEl.querySelector("#reroll")!.addEventListener("click", () => handlers.onReroll());
    stageEl.querySelector("#start")!.addEventListener("click", () => handlers.onStart());
  }

  // ---- 修行畫面（含死亡與通關彈窗）----
  interface LifeEls {
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
  let els: LifeEls | null = null;
  let lastState: GameState | null = null;
  let logKey = "";
  let bagKey = "";
  let eventKey = "";

  function buildLife(state: GameState): void {
    built = "life";
    logKey = "";
    bagKey = "";
    eventKey = "";
    // 桌面：日誌在左、側欄在右；手機（≤640px）改單欄，順序由 CSS 排：安排、突破、坐化、日誌、角色、背包、坊市。
    // 日誌、角色、背包、坊市可收合；桌面預設全開，手機只開日誌。
    const wide = window.matchMedia("(min-width: 641px)").matches;
    stageEl.innerHTML = `
      <section class="status" aria-label="狀態">
        <div class="line"><strong id="name"></strong><strong id="realm"></strong><span id="age"></span><span id="stones"></span><span id="sched"></span><button id="travelOpen" type="button" hidden></button><span id="life" class="muted"></span></div>
        <div class="progress" id="progress" role="progressbar" aria-label="修為"><div id="fill"></div><span id="barText"></span></div>
        <p id="pace" class="pace"></p>
        <div id="todo" class="todo" hidden><span id="todoText"></span><button id="todoGo" type="button" class="primary">前往突破</button></div>
      </section>
      <div class="sr-only" id="live" aria-live="polite"></div>
      <div class="cols">
        <details class="log fold" id="foldLog" open><summary>修仙日誌</summary><ul id="log"></ul></details>
        <aside class="side">
          <section id="schedSection" class="s-sched"><h2>日常安排</h2><div id="schedules" class="choices"></div></section>
          <section id="btSection" class="s-bt"><h2>突破</h2>
            <p id="btInfo" class="desc"></p>
            <label id="pillRow" hidden><input type="checkbox" id="pill" /> <span id="pillText"></span></label>
            <div class="actions"><button id="breakthrough" type="button" class="primary">突破</button></div>
          </section>
          <section id="zuohuaBox" class="s-zuohua" hidden>
            <h2>閉關坐化</h2>
            <p id="zuohuaInfo" class="desc"></p>
            <div class="actions"><button id="zuohua" type="button">坐化</button></div>
          </section>
          <details class="fold s-goals" id="goalsFold"${wide ? " open" : ""}><summary>本世目標</summary><ul id="goals" class="goals"></ul><p id="goalHint" class="desc"></p><button id="goalGo" type="button" hidden></button></details>
          <details class="fold s-role"${wide ? " open" : ""}><summary>角色</summary>${statsHtml(state)}${guideHtml()}${identityHtml(state)}</details>
          <details class="fold s-bag"${wide ? " open" : ""}><summary>背包</summary><ul id="bag" class="items"></ul></details>
          <details class="fold s-market"${wide ? " open" : ""}><summary>坊市</summary><ul id="market" class="items"></ul><p id="marketNote" class="market-note" hidden></p><button id="marketLink" type="button" hidden>查看世局原因</button></details>
        </aside>
      </div>
      <div class="modal" id="eventModal" role="dialog" aria-modal="true" aria-labelledby="eventTitle" hidden>
        <div class="card event">
          <h2 id="eventTitle"></h2>
          <p id="eventText"></p>
          <div id="eventHistory" class="event-history" hidden></div>
          <div id="eventChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="modal" role="dialog" aria-modal="true" aria-label="一生回顧" hidden>
        <div class="card review"><div id="modalBody"></div></div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;
    watchModal(q("#eventModal"));
    watchModal(q("#modal"));

    const schedBox = q("#schedules");
    const schedules = data.schedules.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = `<strong>${s.name}</strong><small>${s.desc}</small><small class="sched-facts"></small><small class="sched-hint"></small>`;
      b.addEventListener("click", () => handlers.onSchedule(s.id));
      schedBox.appendChild(b);
      return { id: s.id, b, facts: b.querySelector<HTMLElement>(".sched-facts")!, hint: b.querySelector<HTMLElement>(".sched-hint")! };
    });

    const marketBox = q("#market");
    const market = data.items.map((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<div><strong>${item.name}</strong> <span class="price"></span><small>${item.desc}</small></div>`;
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
    els.marketLink.addEventListener("click", openMap);
    els.travelOpen.addEventListener("click", openMap);
    els.goalGo.addEventListener("click", () => {
      const target = els!.goalGo.dataset.target;
      if (target === "codex") openCodex();
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
    els.pill.addEventListener("change", () => lastState && renderBreakthrough(lastState, els!));
  }

  function renderBreakthrough(state: GameState, e: LifeEls): void {
    const rule = breakthroughRuleOf(state, data);
    e.btSection.hidden = !rule;
    if (!rule) return;
    const can = canBreakthrough(state, data);
    const pillId = rule.pillId;
    const hasPill = pillAvailable(state, data);
    e.pillRow.hidden = !pillId || !hasPill;
    if (!hasPill) e.pill.checked = false;
    if (pillId) e.pillText.textContent = `服用${itemName(pillId)}（持有 ${state.items[pillId] ?? 0} 顆）`;
    e.btButton.disabled = !can;
    if (can) {
      const rate = Math.round(currentBreakthroughRate(state, e.pill.checked, data) * 100);
      const loss = Math.round(currentFailLoss(state, data) * 100);
      e.btInfo.textContent = `成功率 ${rate}%，失敗將損失 ${loss}% 修為。`;
    } else if (atBottleneck(state, data) && missingTalent(state, data) !== null) {
      e.btInfo.textContent = data.text.breakthroughGate;
    } else {
      e.btInfo.textContent = "修為圓滿，遇上瓶頸時方可突破。";
    }
  }

  function renderBag(state: GameState, e: LifeEls): void {
    const owned = data.items.filter((i) => (state.items[i.id] ?? 0) > 0);
    const key = owned.map((i) => `${i.id}:${state.items[i.id]}:${canUseItem(state, i.id, data)}`).join("|");
    if (key === bagKey) return;
    bagKey = key;
    e.bag.innerHTML = "";
    if (owned.length === 0) {
      const li = document.createElement("li");
      li.className = "desc";
      li.textContent = "囊中空空。";
      e.bag.appendChild(li);
      return;
    }
    for (const item of owned) {
      const li = document.createElement("li");
      li.innerHTML = `<div><strong>${item.name}</strong> ×${state.items[item.id]}</div>`;
      if (item.effect.kind !== "breakthrough") {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "服用";
        b.disabled = !canUseItem(state, item.id, data);
        b.addEventListener("click", () => handlers.onUseItem(item.id));
        li.appendChild(b);
      }
      e.bag.appendChild(li);
    }
  }

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
    e.stones.textContent = `靈石 ${state.spiritStones}`;
    e.sched.textContent = `安排：${data.schedules.find((s) => s.id === state.schedule)?.name ?? ""}`;
    const travelTarget = state.travel.targetId ? placesAt(state, data).find((place) => place.id === state.travel.targetId) : null;
    e.travelOpen.hidden = travelTarget === null;
    if (travelTarget) e.travelOpen.textContent = `行至${travelTarget.name}・餘 ${state.travel.remainingMonths} 月`;
    e.fill.style.width = `${Math.min(100, (state.cultivation / need) * 100)}%`;
    const cultivation = Math.floor(state.cultivation);
    const stuck = atBottleneck(state, data);
    e.barText.textContent = `修為 ${cultivation} / ${need}${stuck ? "　瓶頸" : ""}`;
    e.progress.setAttribute("aria-valuemin", "0");
    e.progress.setAttribute("aria-valuemax", String(need));
    e.progress.setAttribute("aria-valuenow", String(Math.min(cultivation, need)));

    const pace = paceHint(state, data);
    if (pace.kind === "eta") {
      e.pace.textContent = `每月約 +${formatGain(pace.perMonth)} 修為，約 ${formatDuration(pace.seconds)}後進入下一階段（依目前安排與速度估算）。`;
    } else if (pace.kind === "bottleneck") {
      e.pace.textContent = "修為已圓滿，不再增長，要靠突破才能再進一步。";
    } else {
      e.pace.textContent = "";
    }

    // 待辦：此刻最需要玩家處理的一件事（抉擇事件另以彈窗處理）
    const canBt = canBreakthrough(state, data);
    const gated = stuck && !canBt && breakthroughRuleOf(state, data) !== null && missingTalent(state, data) !== null;
    if (canBt && stuck) {
      e.todoText.textContent = "修為圓滿，可以嘗試突破。";
    } else if (gated) {
      e.todoText.textContent = data.text.breakthroughGate;
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
      facts.textContent = scheduleFactLines(scheduleFacts(state, sched, data)).join("　｜　");
      hint.textContent = scheduleHints(state, sched, slotsOf(state), data).join("　");
      hint.hidden = hint.textContent === "";
    }
    e.zuohuaBox.hidden = !canZuohua(state, data);
    if (!e.zuohuaBox.hidden) {
      e.zuohuaInfo.textContent = `把剩餘壽元一次坐完，結束這一世，額外換得道韻 +${zuohuaDaoYun(state, data)}。已達階段的道韻照常結算。`;
    }
    renderBreakthrough(state, e);
    renderBag(state, e);
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
    e.marketNote.hidden = reasons.length === 0;
    e.marketNote.textContent = reasons.join("　");
    e.marketLink.hidden = reasons.length === 0;

    const last = state.log[state.log.length - 1];
    const key = `${state.log.length}:${last?.month ?? ""}:${last?.kind ?? ""}`;
    if (key !== logKey) {
      logKey = key;
      if (last) e.live.textContent = formatLogEntry(last, data, state.name, slotsOf(state));
      e.log.innerHTML = "";
      for (const entry of [...state.log].reverse()) {
        const li = document.createElement("li");
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
        e.log.appendChild(li);
      }
    }

    // 抉擇事件：時間暫停，等玩家選擇
    const pendingKey = state.pendingEvent === null ? "" : `${state.pendingEvent}|${state.spiritStones}|${JSON.stringify(state.items)}`;
    if (pendingKey !== eventKey) {
      eventKey = pendingKey;
      e.eventModal.hidden = state.pendingEvent === null;
      e.eventChoices.innerHTML = "";
      if (state.pendingEvent !== null) {
        const ev = eventOf(state.pendingEvent, data);
        const slots = slotsOf(state);
        e.eventTitle.textContent = fillSlots(ev.title, slots);
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
          b.innerHTML = `<strong></strong>${reason ? "<small></small>" : ""}`;
          b.querySelector("strong")!.textContent = fillSlots(choice.text, slots);
          if (reason) b.querySelector("small")!.textContent = reason;
          b.addEventListener("click", () => handlers.onChoose(i));
          e.eventChoices.appendChild(b);
        });
      }
    }

    {
      const items = goalStatuses(state, data);
      e.goalsFold.hidden = items.length === 0;
      e.goals.replaceChildren(
        ...items.map((g) => {
          const li = document.createElement("li");
          li.textContent = goalLine(g);
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
    renderModal(state, e);
  }

  // ---- 一生回顧與輪迴天賦（死亡或通關後的彈窗）----
  let modalView: "review" | "talents" = "review";
  let modalKey = "";

  const el = (tag: string, className?: string, text?: string): HTMLElement => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (primary) b.className = "primary";
    b.addEventListener("click", onClick);
    return b;
  };

  function showView(view: "review" | "talents"): void {
    modalView = view;
    if (lastState && els) renderModal(lastState, els);
  }

  function buildReview(state: GameState): HTMLElement {
    const box = el("div");
    const review = state.review;
    box.append(el("h2", undefined, reviewTitle(review)));
    if (review === null) {
      // 輪迴功能加入前存下的死亡存檔沒有回顧，直接進入輪迴即可
      box.append(el("p", undefined, "此生已了，且入輪迴。"));
    } else {
      box.append(el("p", "desc", eraBorn(lifeIndex(state), data)));
      box.append(el("p", "summary", formatReviewSummary(review, data)));
      // 通關時固定得到的殘卷，直接讀給玩家
      const clearFragment = review.cause === "cleared" ? data.fragments.items.find((f) => f.id === CLEAR_FRAGMENT_ID) : undefined;
      if (clearFragment && state.meta.fragments.includes(clearFragment.id)) {
        const quote = el("blockquote", "fragment-text", fillSlots(clearFragment.text, slotsOf(state)));
        quote.append(el("small", "changes", `《${fillSlots(clearFragment.title, slotsOf(state))}》`));
        box.append(quote);
      }
      const origin = data.origins.find((o) => o.id === review.originId);
      const root = data.spiritRoots.find((r) => r.id === review.spiritRootId);
      const facts = el("dl", "facts");
      for (const [k, v] of [
        ["出身", origin?.name ?? review.originId],
        ["靈根", root?.name ?? review.spiritRootId],
        ["突破次數", `${review.breakthroughs} 次`],
      ] as const) {
        const row = el("div");
        row.append(el("dt", undefined, k), el("dd", undefined, v));
        facts.append(row);
      }
      box.append(facts);
      if (review.goals.length > 0) {
        box.append(el("h3", undefined, "這一世的目標"));
        const gl = el("ul", "goals");
        for (const g of review.goals) {
          const def = data.goals.find((x) => x.id === g.id)!;
          gl.append(el("li", g.done ? "done" : undefined, `${g.done ? "✓ " : "　"}${def.name}`));
        }
        box.append(gl);
      }
      const versus = compareLives(review, data);
      if (versus.length > 0) {
        box.append(el("h3", undefined, "與上一世相比"));
        for (const line of versus) box.append(el("p", "versus", formatVersus(line, data)));
      }
      box.append(el("h3", undefined, "此生所記"));
      const ul = el("ul", "highlights");
      if (review.highlights.length === 0) ul.append(el("li", "desc", "平平淡淡，無甚可記。"));
      for (const entry of review.highlights) {
        const li = el("li", undefined, formatLogEntry(entry, data, state.name, slotsOf(state)));
        const changes = formatChanges(entry.changes, data, slotsOf(state));
        if (changes.length > 0) li.append(el("small", "changes", changes.join("　")));
        ul.append(li);
      }
      box.append(ul);
      const gained = review.daoYunBase + review.daoYunBonus;
      const bonus = review.daoYunBonus > 0 ? `（其中首次達成 +${review.daoYunBonus}）` : "";
      box.append(el("p", "daoyun", `獲得道韻 +${gained}${bonus}　道韻餘額 ${state.meta.daoYun}`));
    }
    const actions = el("div", "actions");
    actions.append(button("前往輪迴", () => showView("talents"), true));
    box.append(actions);
    return box;
  }

  function buildTalents(state: GameState): HTMLElement {
    const box = el("div");
    box.append(el("h2", undefined, "輪迴天賦"), el("p", "daoyun", `道韻餘額 ${state.meta.daoYun}`));
    const ul = el("ul", "items talents");
    const advice = recommendTalent(state.meta, data);
    for (const talent of data.talents) {
      const level = state.meta.talents[talent.id] ?? 0;
      const maxed = level >= talent.maxLevel;
      const recommended = advice?.talentId === talent.id && !maxed;
      const li = el("li", recommended ? "recommended" : undefined);
      const info = el("div");
      info.append(el("strong", undefined, `${talent.name} ${level}／${talent.maxLevel}${recommended ? "　推薦" : ""}`));
      info.append(el("small", undefined, talent.desc));
      info.append(el("small", "changes", level > 0 ? `目前：${describeTalent(talent, level)}` : `每級：${describeTalent(talent, 1)}`));
      if (recommended) info.append(el("small", "advice", advice!.reason));
      for (const line of talentPreview(talent, level, state.meta.daoYun, data)) info.append(el("small", "preview", line));
      li.append(info);
      const buy = button(maxed ? "已滿" : `提升（${talentCost(talent, level)} 道韻）`, () => handlers.onBuyTalent(talent.id));
      buy.disabled = !canBuyTalent(state, talent.id, data);
      li.append(buy);
      ul.append(li);
    }
    box.append(ul);
    const actions = el("div", "actions");
    actions.append(button("返回", () => showView("review")), button("轉世", () => handlers.onNewLife(), true));
    box.append(actions);
    return box;
  }

  function renderModal(state: GameState, e: LifeEls): void {
    const ended = state.phase === "dead" || state.phase === "cleared";
    e.modal.hidden = !ended;
    if (!ended) {
      modalView = "review";
      modalKey = "";
      return;
    }
    const key = `${state.phase}|${modalView}|${state.meta.daoYun}|${JSON.stringify(state.meta.talents)}`;
    if (key === modalKey) return;
    modalKey = key;
    e.modalBody.replaceChildren(modalView === "review" ? buildReview(state) : buildTalents(state));
  }

  return {
    render(state) {
      const arrivedAt = lastState?.travel.targetId && !state.travel.targetId && state.travel.locationId === lastState.travel.targetId
        ? placesAt(state, data).find((place) => place.id === state.travel.locationId)?.name : null;
      lastState = state;
      updateCodexButton(state);
      updateMapButton(state);
      if (!codexEl.hidden) buildCodex(state);
      if (!collectionEl.hidden) buildCollection(state);
      if (!mapEl.hidden && !document.activeElement?.classList.contains("map-destination")) buildMap(state);
      autoEl.checked = state.autoChoice;
      for (const { s, b } of speedButtons) b.setAttribute("aria-pressed", String(s === state.speed));
      if (state.phase === "rolling") renderRoll(state);
      else renderLife(state);
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
}

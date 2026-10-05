import { canBuyItem, canBuyTalent, canUseItem } from "../core/actions";
import {
  breakthroughRuleOf,
  canBreakthrough,
  currentBreakthroughRate,
  missingTalent,
  currentFailLoss,
  pillAvailable,
} from "../core/breakthrough";
import { eventOf } from "../core/events";
import { CLEAR_FRAGMENT_ID } from "../core/fragments";
import { polityLabel, worldFor, worldSlots } from "../core/world";
import { fillSlots, type SlotValues } from "../data/slots";
import type { MapTarget } from "./mapinfo";
import { buildWorldMap, mapStamp } from "./worldmap";
import { eraName, lifeIndex } from "../core/era";
import { splitAge, stageNeed, talentCost } from "../core/formulas";
import type { GameState } from "../core/state";
import { CLEARED_FLAG } from "../core/review";
import { atBottleneck, lifespanYears, realmOf } from "../core/tick";
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
}

export interface Ui {
  render(state: GameState): void;
  notice(message: string): void;
}

export function mountUi(root: HTMLElement, data: GameData, handlers: UiHandlers): Ui {
  root.innerHTML = `
    <header class="bar">
      <span class="speeds"></span>
      <label class="auto"><input type="checkbox" id="auto" /> 自動抉擇</label>
      <button id="codex-open" type="button"></button>
      <button id="map-open" type="button"></button>
      <button id="collection-open" type="button">收藏</button>
      <button id="export" type="button">匯出存檔</button>
      <button id="import" type="button">匯入存檔</button>
      <button id="reset" type="button">重新開始</button>
    </header>
    <p id="notice" hidden></p>
    <div id="stage"></div>
    <div class="modal codex" id="codex" hidden><div class="card review" id="codex-card"></div></div>
    <div class="modal codex" id="map" hidden><div class="card review" id="map-card"></div></div>
    <div class="modal codex" id="collection" hidden><div class="card review" id="collection-card"></div></div>
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
  const autoEl = root.querySelector<HTMLInputElement>("#auto")!;
  autoEl.addEventListener("change", () => handlers.onAutoChoice(autoEl.checked));
  root.querySelector("#export")!.addEventListener("click", () => handlers.onExport());
  root.querySelector("#import")!.addEventListener("click", () => {
    const text = prompt("請貼上先前匯出的存檔文字：");
    if (text === null || text.trim() === "") return;
    if (confirm("匯入會覆蓋目前的存檔，確定嗎？")) handlers.onImport(text);
  });
  root.querySelector("#reset")!.addEventListener("click", () => {
    if (confirm("確定要清除存檔並重新開始嗎？道韻與輪迴天賦也會一併清除。")) handlers.onReset();
  });

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
  const totalFragments = data.fragments.items.length;

  function updateCodexButton(state: GameState): void {
    const seen = readSeen();
    const fresh = state.meta.fragments.some((id) => !seen.includes(id));
    codexBtn.textContent = `殘卷錄 ${state.meta.fragments.length}／${totalFragments}${fresh ? " ●" : ""}`;
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
  let mapSelected: MapTarget | null = null;

  function updateMapButton(state: GameState): void {
    // 擲骰時不提示：重擲會一直換世界，提示只會吵
    const fresh = state.phase !== "rolling" && mapStamp(state, data) !== readMapSeen();
    mapBtn.textContent = `天下圖${fresh ? " ●" : ""}`;
  }

  function buildMap(state: GameState): void {
    mapCard.replaceChildren(
      buildWorldMap(state, data, mapSelected, {
        onSelect(target) {
          mapSelected = target;
          if (lastState) buildMap(lastState);
        },
        onClose: closeMap,
      }),
    );
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
  mapEl.addEventListener("click", (ev) => {
    if (ev.target === mapEl) closeMap();
  });

  // ---- 通關收藏 ----
  const collectionEl = root.querySelector<HTMLElement>("#collection")!;
  const collectionCard = root.querySelector<HTMLElement>("#collection-card")!;
  const collectionBtn = root.querySelector<HTMLButtonElement>("#collection-open")!;

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

  const statsHtml = (state: GameState): string =>
    `<dl class="stats">${ATTRIBUTE_KEYS.map(
      (k) => `<div><dt>${ATTR_LABEL[k]}</dt><dd>${state.attributes[k]}</dd></div>`,
    ).join("")}</dl>`;

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
        ${identityHtml(state)}
        ${birthHtml(state)}
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
    log: HTMLElement;
    eventModal: HTMLElement;
    eventTitle: HTMLElement;
    eventText: HTMLElement;
    eventChoices: HTMLElement;
    life: HTMLElement;
    modal: HTMLElement;
    modalBody: HTMLElement;
    schedules: { id: string; b: HTMLButtonElement }[];
    btSection: HTMLElement;
    btInfo: HTMLElement;
    btButton: HTMLButtonElement;
    pillRow: HTMLElement;
    pill: HTMLInputElement;
    pillText: HTMLElement;
    bag: HTMLElement;
    market: { id: string; owned: HTMLElement; b: HTMLButtonElement }[];
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
    stageEl.innerHTML = `
      <section class="status">
        <div class="line"><strong id="name"></strong><strong id="realm"></strong><span id="age"></span><span id="stones"></span><span id="life" class="muted"></span></div>
        <div class="progress"><div id="fill"></div><span id="barText"></span></div>
      </section>
      <div class="cols">
        <section class="log"><h2>修仙日誌</h2><ul id="log"></ul></section>
        <aside class="side">
          <section><h2>角色</h2>${statsHtml(state)}${identityHtml(state)}</section>
          <section><h2>日常安排</h2><div id="schedules" class="choices"></div></section>
          <section id="btSection"><h2>突破</h2>
            <p id="btInfo" class="desc"></p>
            <label id="pillRow" hidden><input type="checkbox" id="pill" /> <span id="pillText"></span></label>
            <div class="actions"><button id="breakthrough" type="button" class="primary">突破</button></div>
          </section>
          <section><h2>背包</h2><ul id="bag" class="items"></ul></section>
          <section><h2>坊市</h2><ul id="market" class="items"></ul></section>
        </aside>
      </div>
      <div class="modal" id="eventModal" hidden>
        <div class="card event">
          <h2 id="eventTitle"></h2>
          <p id="eventText"></p>
          <div id="eventChoices" class="choices"></div>
        </div>
      </div>
      <div class="modal" id="modal" hidden>
        <div class="card review"><div id="modalBody"></div></div>
      </div>`;
    const q = <T extends HTMLElement>(sel: string) => stageEl.querySelector<T>(sel)!;

    const schedBox = q("#schedules");
    const schedules = data.schedules.map((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<strong>${s.name}</strong><small>${s.desc}</small>`;
      b.addEventListener("click", () => handlers.onSchedule(s.id));
      schedBox.appendChild(b);
      return { id: s.id, b };
    });

    const marketBox = q("#market");
    const market = data.items.map((item) => {
      const li = document.createElement("li");
      li.innerHTML = `<div><strong>${item.name}</strong> <span class="price">${item.price} 靈石</span><small>${item.desc}</small></div>`;
      const owned = document.createElement("span");
      owned.className = "owned";
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "購買";
      b.addEventListener("click", () => handlers.onBuyItem(item.id));
      li.append(owned, b);
      marketBox.appendChild(li);
      return { id: item.id, owned, b };
    });

    els = {
      realm: q("#realm"),
      name: q("#name"),
      age: q("#age"),
      stones: q("#stones"),
      fill: q("#fill"),
      barText: q("#barText"),
      log: q("#log"),
      eventModal: q("#eventModal"),
      eventTitle: q("#eventTitle"),
      eventText: q("#eventText"),
      eventChoices: q("#eventChoices"),
      life: q("#life"),
      modal: q("#modal"),
      modalBody: q("#modalBody"),
      schedules,
      btSection: q("#btSection"),
      btInfo: q("#btInfo"),
      btButton: q<HTMLButtonElement>("#breakthrough"),
      pillRow: q("#pillRow"),
      pill: q<HTMLInputElement>("#pill"),
      pillText: q("#pillText"),
      bag: q("#bag"),
      market,
    };
    els.btButton.addEventListener("click", () => handlers.onBreakthrough(els!.pill.checked));
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
    e.realm.textContent = realmLabel(realm, state.stage) + (state.flags.includes(CLEARED_FLAG) ? "（已通關）" : "");
    e.name.textContent = `${state.name}（${eraName(lifeIndex(state), data)}年間）`;
    e.age.textContent = `${years} 歲 ${months} 個月 ／ 壽元 ${lifespanYears(state, data)}`;
    e.stones.textContent = `靈石 ${state.spiritStones}`;
    e.fill.style.width = `${Math.min(100, (state.cultivation / need) * 100)}%`;
    e.barText.textContent = `修為 ${Math.floor(state.cultivation)} / ${need}${atBottleneck(state, data) ? "　瓶頸" : ""}`;

    for (const { id, b } of e.schedules) b.classList.toggle("active", id === state.schedule);
    renderBreakthrough(state, e);
    renderBag(state, e);
    for (const m of e.market) {
      const item = data.items.find((i) => i.id === m.id)!;
      m.owned.textContent = `持有 ${state.items[m.id] ?? 0}`;
      m.b.disabled = !canBuyItem(state, m.id, data);
      const used = state.itemsUsed[m.id] ?? 0;
      if (item.effect.kind === "lifespan") m.owned.textContent += `／已服 ${used}`;
    }

    const last = state.log[state.log.length - 1];
    const key = `${state.log.length}:${last?.month ?? ""}:${last?.kind ?? ""}`;
    if (key !== logKey) {
      logKey = key;
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
      box.append(facts, el("h3", undefined, "此生所記"));
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
    for (const talent of data.talents) {
      const level = state.meta.talents[talent.id] ?? 0;
      const maxed = level >= talent.maxLevel;
      const li = el("li");
      const info = el("div");
      info.append(el("strong", undefined, `${talent.name} ${level}／${talent.maxLevel}`));
      info.append(el("small", undefined, talent.desc));
      info.append(el("small", "changes", level > 0 ? `目前：${describeTalent(talent, level)}` : `每級：${describeTalent(talent, 1)}`));
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
      lastState = state;
      updateCodexButton(state);
      updateMapButton(state);
      if (!codexEl.hidden) buildCodex(state);
      if (!collectionEl.hidden) buildCollection(state);
      if (!mapEl.hidden) buildMap(state);
      autoEl.checked = state.autoChoice;
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

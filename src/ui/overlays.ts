import type { GameState } from "../core/state";
import { fillSlots, type SlotValues } from "../data/slots";
import type { GameData } from "../data/types";
import { revealIn } from "./dom";
import { keepView } from "./keepview";
import { acquaintanceRows, bestiarySummary, collectionSummary } from "./format";
import type { MapTarget } from "./map/mapinfo";
import type { UiHandlers } from "./types";
import { buildWorldMap, mapStamp, resetMapView } from "./map/worldmap";

export interface OverlayContext {
  root: HTMLElement;
  data: GameData;
  handlers: Pick<UiHandlers, "onTravel" | "onJoinSect">;
  menuEl: HTMLDetailsElement;
  getState(): GameState | null;
  slotsOf(state: GameState): SlotValues;
  jumpTo(target: "market" | "schedules" | "breakthrough" | "goals" | "bag"): void;
}

export interface Overlays {
  /** 每次狀態更新：刷新三顆按鈕的標記，並重畫已開啟的面板 */
  update(state: GameState): void;
  openMap(): void;
  openCodex(): void;
}

/** 殘卷錄、天下圖、通關收藏三個彈出面板；彼此互斥，開一個會關掉另外兩個 */
export function createOverlays(ctx: OverlayContext): Overlays {
  const { root, data, handlers, menuEl, getState, slotsOf, jumpTo } = ctx;
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
    note.textContent = "這些我都讀過，只是不記得了。";
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
    // 殘卷錄開著時每次狀態更新都會重畫：保住捲動位置
    const keep = keepView(codexCard, [codexCard]);
    codexCard.replaceChildren(box);
    keep();
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

  /** 重新開啟天下圖時要回到預設，不沿用上次的展開狀態 */
  let resetFolds = true;

  function buildMap(state: GameState): void {
    // 每次都整張重建：捲動位置與折疊區的展開狀態都要在這裡記下、重建後還原，否則按鈕一按就跳回上方
    const keep = resetFolds ? null : keepView(mapCard, [mapCard]);
    resetFolds = false;
    const focusedOnDestination = document.activeElement?.classList.contains("map-destination") ?? false;
    const focusedSlider = document.activeElement?.classList.contains("map-tl-slider") ?? false;
    const focusedMapLabel = document.activeElement?.classList.contains("map-hit")
      ? document.activeElement.getAttribute("aria-label")
      : null;
    const content = buildWorldMap(state, data, mapSelected, {
        onSelect(target) {
          mapSelected = target;
          const current = getState();
          if (current) buildMap(current);
        },
        onClose: closeMap,
        onTravel(targetId) { handlers.onTravel(targetId); },
        onJoinSect() { handlers.onJoinSect(); },
        onRefresh() {
          const current = getState();
          if (current) buildMap(current);
        },
      });
    const marketLink = document.createElement("button");
    marketLink.type = "button";
    marketLink.textContent = "查看坊市物價";
    marketLink.addEventListener("click", () => { closeMap(); requestAnimationFrame(() => jumpTo("market")); });
    // 此生已盡時坊市不能再看，不要把人帶回回顧畫面
    if (state.phase === "living") content.append(marketLink);
    mapCard.replaceChildren(content);
    keep?.();
    if (focusedSlider) mapCard.querySelector<HTMLInputElement>(".map-tl-slider")?.focus({ preventScroll: true });
    if (focusedOnDestination) mapCard.querySelector<HTMLSelectElement>(".map-destination")?.focus({ preventScroll: true });
    if (focusedMapLabel) {
      Array.from(mapCard.querySelectorAll<SVGElement>(".map-hit"))
        .find((el) => el.getAttribute("aria-label") === focusedMapLabel)
        ?.focus({ preventScroll: true });
    }
  }

  function openMap(): void {
    const state = getState();
    if (!state) return;
    closeCodex();
    closeCollection();
    mapSelected = null;
    resetMapView();
    resetFolds = true;
    buildMap(state);
    mapEl.hidden = false;
    writeMapSeen(mapStamp(state, data));
    updateMapButton(state);
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
    title.textContent = `收藏　通關 ${sum.total} 次${sum.yuanyingTotal > 0 ? `　元嬰 ${sum.yuanyingTotal} 次` : ""}${sum.huashenTotal > 0 ? `　化神 ${sum.huashenTotal} 次` : ""}${state.meta.sectBest > 0 ? `　宗門最高 ${data.sects.ranks[state.meta.sectBest - 1].name}` : ""}`;
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
        (row.yuanying > 0 ? `　元嬰 ${row.yuanying} 次` : "") +
        (row.huashen > 0 ? `　化神 ${row.huashen} 次` : "");
      const fastest = [["通關", row.fastest.cleared], ["結嬰", row.fastest.yuanying], ["化神", row.fastest.huashen]]
        .filter((x): x is [string, number] => x[1] !== undefined)
        .map(([k, months]) => `最快 ${Math.floor(months / 12)} 歲${k}`);
      if (fastest.length > 0) count.textContent += `　${fastest.join("、")}`;
      const desc = document.createElement("p");
      desc.className = "fragment-text";
      desc.textContent = row.desc;
      art.append(name, count, desc);
      box.append(art);
    }
    const bestiary = bestiarySummary(state.meta, data);
    const beastHead = document.createElement("h3");
    beastHead.textContent = `怪物圖鑑　已見 ${bestiary.seen}／${bestiary.rows.length} 種`;
    box.append(beastHead);
    for (const row of bestiary.rows) {
      const art = document.createElement("article");
      art.className = row.entry ? "fragment" : "fragment missing";
      const name = document.createElement("strong");
      name.textContent = row.entry ? row.name : "？？？";
      const count = document.createElement("small");
      count.className = "changes";
      count.textContent = row.entry ? `${row.realm}　勝 ${row.entry.win}　敗 ${row.entry.lose}　逃 ${row.entry.flee}　平 ${row.entry.draw}` : `（${row.realm}，尚未遇見）`;
      art.append(name, count);
      if (row.lore) {
        const lore = document.createElement("p");
        lore.className = "fragment-text";
        lore.textContent = row.lore;
        art.append(lore);
      }
      box.append(art);
    }
    const folk = acquaintanceRows(state.meta, data);
    const folkHead = document.createElement("h3");
    folkHead.textContent = `故人　已識 ${folk.filter((r) => r.firstLife !== null).length}／${folk.length} 位`;
    box.append(folkHead);
    for (const row of folk) {
      const art = document.createElement("article");
      art.className = row.firstLife !== null ? "fragment" : "fragment missing";
      const name = document.createElement("strong");
      name.textContent = row.firstLife !== null ? row.name : "？？？";
      const note = document.createElement("small");
      note.className = "changes";
      note.textContent = row.firstLife !== null ? `初遇於第 ${row.firstLife} 世${row.gap! > 0 ? `，至今隔了 ${row.gap} 世` : ""}` : "（尚未遇見）";
      art.append(name, note);
      if (row.firstLife !== null) {
        const desc = document.createElement("p");
        desc.className = "fragment-text";
        desc.textContent = row.desc;
        art.append(desc);
      }
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
    revealIn(collectionCard, 8);
  }
  function openCollection(): void {
    const state = getState();
    if (!state) return;
    closeCodex();
    closeMap();
    buildCollection(state);
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
    const state = getState();
    if (!state) return;
    closeMap();
    closeCollection();
    buildCodex(state);
    codexEl.hidden = false;
    writeSeen(state.meta.fragments);
    updateCodexButton(state);
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

  return {
    update(state) {
      updateCodexButton(state);
      updateMapButton(state);
      if (!codexEl.hidden) buildCodex(state);
      if (!collectionEl.hidden) buildCollection(state);
      if (!mapEl.hidden && !document.activeElement?.classList.contains("map-destination")) buildMap(state);
    },
    openMap,
    openCodex,
  };
}

import { canUseItem } from "../core/actions";
import {
  breakthroughRuleOf,
  canBreakthrough,
  canChooseWave,
  currentBreakthroughRate,
  waveChance,
  waveImage,
  wardItem,
  type WaveChoice,
  missingTalent,
  currentFailLoss,
  pillAvailable,
} from "../core/breakthrough";
import { canHunt, fleeChance, actionHit, monsterOf, powerRatio, type HuntChoice, huntTalisman } from "../core/encounter";
import type { GameState } from "../core/state";
import { atBottleneck } from "../core/tick";
import { ARTIFACT_SLOTS, type GameData } from "../data/types";
import type { SlotValues } from "../data/slots";
import { alchemyPanel } from "./alchemyinfo";
import { button, el, esc } from "./dom";
import { BESTIARY_LORE_WINS } from "./format";
import { icon, itemIcon } from "./icons";
import { sectPanel } from "./sectinfo";
import { statPanel } from "./statinfo";
import { huntVignetteHtml } from "./vignette";
import type { LifeEls, SideTab, UiHandlers } from "./render";

/** 天劫光圈一輪的長度（毫秒），要與 styles/layout.css 的 trib-close 動畫一致 */
const RING_MS = 1600;

export interface PanelContext {
  stageEl: HTMLElement;
  data: GameData;
  handlers: UiHandlers;
  slotsOf(state: GameState): SlotValues;
  itemName(id: string): string;
  getSideTab(): SideTab;
  showSideTab(tab: SideTab): void;
}

export interface Panels {
  renderBreakthrough(state: GameState, e: LifeEls): void;
  renderBag(state: GameState, e: LifeEls): void;
  renderTribulation(state: GameState, e: LifeEls): void;
  renderHunt(state: GameState, e: LifeEls): void;
  renderSect(state: GameState, e: LifeEls): void;
  renderResources(state: GameState): void;
  renderStatDetail(state: GameState): void;
  renderAlchemy(state: GameState, e: LifeEls): void;
  markMake(cls: "flash-up" | "flash-down"): void;
  flash(selector: string, cls: string): void;
  floatDelta(anchor: HTMLElement, delta: number, extra: string): void;
  /** 重建修行畫面時清掉會跳過重畫的快取 */
  reset(): void;
}

/** 修行畫面側欄與彈窗的各個面板；每個 render 函式在內容沒變時不重畫 */
export function createPanels(ctx: PanelContext): Panels {
  const { stageEl, data, handlers, slotsOf, itemName, getSideTab, showSideTab } = ctx;
  let bagKey = "";

  function renderBreakthrough(state: GameState, e: LifeEls): void {
    const rule = breakthroughRuleOf(state, data);
    e.btSection.hidden = !rule;
    if (!rule) return;
    const can = canBreakthrough(state, data);
    const pillId = rule.pillId;
    const hasPill = pillAvailable(state, data);
    e.pillRow.hidden = !pillId || !hasPill;
    if (!hasPill) e.pill.checked = false;
    if (pillId) e.pillText.textContent = `服用${itemName(pillId)}（持有 ${state.items[pillId] ?? 0}）`;
    e.btButton.disabled = !can;
    if (can) {
      const rate = Math.round(currentBreakthroughRate(state, e.pill.checked, data) * 100);
      const loss = Math.round(currentFailLoss(state, data) * 100);
      const waves = breakthroughRuleOf(state, data)?.tribulation?.waves;
      e.btInfo.textContent = `成功率 ${rate}%・失敗損失 ${loss}%${waves ? `・${waves} 道天劫，可逐道準備` : ""}`;
    } else if (atBottleneck(state, data) && missingTalent(state, data) !== null) {
      e.btInfo.textContent = breakthroughRuleOf(state, data)?.gateText ?? data.text.breakthroughGate;
    } else {
      e.btInfo.textContent = "修為圓滿後可突破。";
    }
  }

  function renderBag(state: GameState, e: LifeEls): void {
    const owned = data.items.filter((i) => (state.items[i.id] ?? 0) > 0);
    const key = owned.map((i) => `${i.id}:${state.items[i.id]}:${canUseItem(state, i.id, data)}`).join("|") + `#${state.equipment.weapon}|${state.equipment.ward}`;
    if (key === bagKey) return;
    bagKey = key;
    e.bag.innerHTML = "";
    // 身上裝備：兩個欄位，可卸下
    const SLOT_LABEL = { weapon: "法器", ward: "護身" } as const;
    for (const slot of ARTIFACT_SLOTS) {
      const id = state.equipment[slot];
      const li = document.createElement("li");
      const name = id ? (data.items.find((i) => i.id === id)?.name ?? id) : "（空）";
      li.innerHTML = `<div><strong>${SLOT_LABEL[slot]}</strong> ${id ? itemIcon(data, id) : ""}${esc(name)}</div>`;
      if (id) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "卸下";
        b.addEventListener("click", () => handlers.onUnequip(slot));
        li.appendChild(b);
      }
      e.bag.appendChild(li);
    }
    if (owned.length === 0) {
      const li = document.createElement("li");
      li.className = "desc";
      li.textContent = "囊中空空。";
      e.bag.appendChild(li);
      return;
    }
    // 背包分「丹藥」「符籙」「材料」三段，每段第一項前放小標
    const groupOf = (kind: string): number => (kind === "material" ? 3 : kind === "artifact" ? 2 : kind === "tribulationWard" ? 1 : 0);
    const GROUP_NAMES = ["丹藥", "符籙", "法寶", "材料"];
    let lastGroup = -1;
    for (const item of [...owned].sort((x, y) => groupOf(x.effect.kind) - groupOf(y.effect.kind))) {
      const group = groupOf(item.effect.kind);
      if (group !== lastGroup) {
        lastGroup = group;
        const head = document.createElement("li");
        head.className = "desc bag-group";
        head.textContent = GROUP_NAMES[group];
        e.bag.appendChild(head);
      }
      const li = document.createElement("li");
      li.innerHTML = `<div><strong>${itemIcon(data, item.id)}${esc(item.name)}</strong> ×${state.items[item.id]}</div>`;
      if (item.effect.kind === "cultivationFraction" || item.effect.kind === "lifespan") {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "服用";
        b.disabled = !canUseItem(state, item.id, data);
        b.addEventListener("click", () => handlers.onUseItem(item.id));
        li.appendChild(b);
        if (item.effect.kind === "cultivationFraction" && state.items[item.id] > 1) {
          const all = document.createElement("button");
          all.type = "button";
          all.textContent = "連服";
          all.disabled = !canUseItem(state, item.id, data);
          all.addEventListener("click", () => handlers.onUseAll(item.id));
          li.appendChild(all);
        }
      } else if (item.effect.kind === "artifact") {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "裝備";
        b.addEventListener("click", () => handlers.onEquip(item.id));
        li.appendChild(b);
      }
      e.bag.appendChild(li);
    }
  }

  /** 天劫的光圈：這一刻是否在收攏的時間窗內（凝神）；偏好減少動態時一律算中，不靠反應速度 */
  let ringStart = 0;
  function ringHit(): boolean {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const phase = ((performance.now() - ringStart) % RING_MS) / RING_MS;
    return phase >= 0.5 && phase <= 0.82;
  }

  /** 煉丹、煉器有結果：煉製頁閃一下，人在別的分頁時分頁列亮提示點 */
  function markMake(cls: "flash-up" | "flash-down"): void {
    flash("#alchemyBox", cls);
    if (getSideTab() !== "make") stageEl.querySelector<HTMLElement>('#sideTabs [data-go="make"]')?.setAttribute("data-badge", "1");
  }

  /** 重播一次樣式動畫：移除再加回 class，動畫結束自行拿掉 */
  function flash(selector: string, cls: string): void {
    const el = stageEl.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
  }

  /** 數值變動浮字：放在 anchor 內，aria-hidden，動畫結束自行移除 */
  function floatDelta(anchor: HTMLElement, delta: number, extra: string): void {
    if (delta === 0) return;
    const span = document.createElement("span");
    span.className = `float-delta ${delta > 0 ? "up" : "down"} ${extra}`.trim();
    span.setAttribute("aria-hidden", "true");
    span.textContent = delta > 0 ? `+${delta}` : `${delta}`;
    anchor.appendChild(span);
    span.addEventListener("animationend", () => span.remove());
    // 動畫被關閉（reduced-motion）時不會觸發 animationend，保險起見定時移除
    setTimeout(() => span.remove(), 1200);
  }

  /** 天劫面板：進行中時顯示，逐道選擇；時間暫停。內容沒變就不重畫 */
  let tribKey = "";
  function renderTribulation(state: GameState, e: LifeEls): void {
    const t = state.tribulation;
    const have = wardItem(data) ? (state.items[wardItem(data)!.id] ?? 0) : 0;
    const key = t ? JSON.stringify([t, have, state.attributes.mind]) : "";
    if (key === tribKey) return;
    tribKey = key;
    e.tribModal.hidden = t === null;
    e.tribChoices.replaceChildren();
    if (!t) return;
    ringStart = performance.now();
    const image = waveImage(state, data);
    e.tribTitle.textContent = `${image.name}劫・第 ${t.wave + 1} 道，共 ${t.waves} 道`;
    e.tribText.textContent = image.arrive;
    e.tribInfo.textContent = t.wave === 0 ? "劫雲已聚。光圈收攏時選擇，把握再高一分。" : `已度過 ${t.wave} 道。`;
    const pct = (c: WaveChoice): string => `${Math.round(waveChance(state, c, data) * 100)}%`;
    const ward = wardItem(data);
    const rows: { choice: WaveChoice; name: string; note: string }[] = [
      { choice: "brace", name: "硬抗", note: `這一道的把握約 ${pct("brace")}` },
      { choice: "guard", name: "運功護體", note: `把握約 ${pct("guard")}・失敗多損 ${Math.round(data.tribulation.guard.extraLoss * 100)}%` },
      { choice: "ward", name: `祭出${ward ? itemName(ward.id) : "符籙"}`, note: have > 0 ? `把握約 ${pct("ward")}・持有 ${have}` : "沒有符籙，坊市可買" },
    ];
    for (const r of rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<strong>${esc(r.name)}</strong><small>${esc(r.note)}</small>`;
      b.disabled = !canChooseWave(state, r.choice, data);
      b.addEventListener("click", () => handlers.onWave(r.choice, ringHit()));
      e.tribChoices.append(b);
    }
  }

  /** 遇怪視窗：時間暫停，選穩打、強攻、符籙或逃。內容沒變就不重畫 */
  let huntKey = "";
  function renderHunt(state: GameState, e: LifeEls): void {
    const h = state.encounter;
    const talisman = huntTalisman(data);
    const have = talisman ? (state.items[talisman] ?? 0) : 0;
    const key = h ? JSON.stringify([h, have, state.realmId, state.stage, state.attributes, state.meta.bestiary[h.monsterId]]) : "";
    if (key === huntKey) return;
    huntKey = key;
    e.huntModal.hidden = h === null;
    e.huntChoices.replaceChildren();
    if (!h) return;
    const rules = data.monsters.rules;
    const m = monsterOf(h.monsterId, data);
    const ratio = powerRatio(state, m, data);
    e.huntArt.innerHTML = huntVignetteHtml(m.id, state.realmId);
    e.huntTitle.textContent = `遭遇${m.name}`;
    e.huntText.textContent = m.lore !== undefined && (state.meta.bestiary[m.id]?.win ?? 0) >= BESTIARY_LORE_WINS ? `${m.appear}${m.lore}` : m.appear;
    const bar = (label: string, hp: number, cls: string): string =>
      `<div class="hunt-bar ${cls}"><span>${esc(label)}</span><i><b style="width:${Math.max(0, Math.round(hp * 100))}%"></b></i></div>`;
    e.huntBars.innerHTML = bar(m.name, h.monsterHp, "foe") + bar("你", h.myHp, "me");
    const power = ratio >= 1.2 ? "你的修為勝過牠" : ratio >= rules.autoMinRatio ? "與你勢均力敵" : "牠比你強，小心";
    e.huntInfo.textContent = `${power}・第 ${h.round + 1} 回合，共 ${rules.rounds} 回合・勝了有修為與靈石，打不贏可以逃。`;
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const rows: { choice: HuntChoice; name: string; note: string }[] = [
      { choice: "steady", name: rules.actions.steady.name, note: `命中約 ${pct(actionHit(state, "steady", data))}・傷己較輕` },
      { choice: "fierce", name: rules.actions.fierce.name, note: `命中約 ${pct(actionHit(state, "fierce", data))}・傷勢更重` },
      { choice: "ward", name: `祭出${talisman ? itemName(talisman) : "符籙"}`, note: have > 0 ? `必中・傷己最輕・持有 ${have}` : "沒有符籙，坊市可買" },
      { choice: "flee", name: "逃", note: `成功約 ${pct(fleeChance(state, data))}・失敗損 ${Math.round(rules.flee.failLoss * 100)}% 修為` },
    ];
    for (const r of rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<strong>${esc(r.name)}</strong><small>${esc(r.note)}</small>`;
      b.disabled = !canHunt(state, r.choice, data);
      b.addEventListener("click", () => handlers.onHunt(r.choice));
      e.huntChoices.append(b);
    }
  }

  /** 宗門面板：只有入宗者才顯示；內容沒變就不重畫，避免按鈕在每個 tick 被換掉 */
  let sectKey = "";
  function renderSect(state: GameState, e: LifeEls): void {
    const panel = sectPanel(state, data);
    const key = JSON.stringify(panel);
    if (key === sectKey) return;
    sectKey = key;
    e.sectBox.hidden = panel === null;
    e.sectBox.replaceChildren();
    if (!panel) return;
    const box = e.sectBox;
    box.append(el("h2", undefined, "宗門"));
    box.append(el("p", undefined, `${panel.sectName}（${panel.stateText}）・${panel.rankName}`));
    const facts = el("dl", "facts");
    for (const [k, v] of [
      ["貢獻", String(panel.contribution)],
      ["修煉加成", `+${panel.bonusPct}%`],
      ["年度月例", `${panel.stipend} 靈石`],
    ] as const) {
      const row = el("div");
      row.append(el("dt", undefined, k), el("dd", undefined, v));
      facts.append(row);
    }
    box.append(facts);
    const names = slotsOf(state);
    box.append(el("p", "desc", `同門：${names.peer}、執事${names.steward}、長老${names.elder}。`));
    if (panel.next) {
      const n = panel.next;
      box.append(el("p", "desc", `晉升${n.name}：需${n.realmName}${n.realmMet ? "（已達）" : ""}、貢獻 ${n.contribution}${n.contributionMet ? "（已達）" : `（還差 ${n.contribution - panel.contribution}）`}。`));
    } else {
      box.append(el("p", "desc", "在這個宗門裡已無更高的位階。"));
    }
    box.append(el("p", "desc", "貢獻來自差事與宗門事件。離宗後這一世不可再入。"));
    const actions = el("div", "actions");
    const promote = button("晉升", () => handlers.onPromoteSect(), true);
    promote.disabled = !panel.canPromote || panel.next === null;
    const leave = button("離宗", () => {
      if (confirm(`確定要離開${panel.sectName}嗎？會失去身分與貢獻，這一世不能再入同一宗。`)) handlers.onLeaveSect();
    });
    leave.classList.add("danger");
    actions.append(promote, leave);
    box.append(actions);
  }

  /** 常駐資源列：靈石、常用丹藥、法寶、材料、爐火，點一下跳到對應分頁 */
  let resKey = "";
  function renderResources(state: GameState): void {
    const box = stageEl.querySelector<HTMLElement>("#resbar");
    if (!box) return;
    const name = (id: string): string => data.items.find((i) => i.id === id)?.name ?? id;
    const chips: { text: string; tab: SideTab; icon?: string }[] = [];
    for (const id of ["juqi_dan", "zhuji_dan", "huxin_dan", "bilei_fu"]) {
      const n = state.items[id] ?? 0;
      if (n > 0) chips.push({ text: `${name(id)} ${n}`, tab: "pack", icon: itemIcon(data, id) });
    }
    const worn = ARTIFACT_SLOTS.map((s) => state.equipment[s]).filter((x): x is string => x !== null);
    if (worn.length > 0) chips.push({ text: worn.map(name).join("、"), tab: "pack", icon: itemIcon(data, worn[0]) });
    const mats = data.items.filter((i) => i.effect.kind === "material").reduce((n, i) => n + (state.items[i.id] ?? 0), 0);
    if (mats > 0) chips.push({ text: `材料 ${mats}`, tab: "make", icon: icon("herb") });
    if (state.alchemy) {
      const r = data.recipes.recipes.find((x) => x.id === state.alchemy!.recipeId);
      chips.push({ text: `煉${name(r?.output ?? "")} ${state.alchemy.progress}／${r?.months ?? 0}`, tab: "make", icon: icon("alchemy") });
    }
    // 材料夠了可以開爐或煉器時提示（最多兩個，免得資源列太長）
    const ready = alchemyPanel(state, data);
    if (ready) {
      const names = [...(ready.brewing ? [] : ready.recipes.filter((r) => r.canStart)), ...ready.forge.filter((f) => f.canForge)].map((x) => x.name);
      for (const n of names.slice(0, 2)) chips.push({ text: `可煉${n}`, tab: "make", icon: icon("alchemy") });
    }
    const method = data.methods.find((m) => m.id === state.methodId);
    if (method && method.id !== data.methods[0].id) chips.push({ text: method.name, tab: "me", icon: icon("method") });
    const key = JSON.stringify(chips);
    if (key === resKey) return;
    resKey = key;
    box.replaceChildren();
    for (const c of chips) {
      const b = button(c.text, () => showSideTab(c.tab));
      b.className = "chip";
      if (c.icon) b.insertAdjacentHTML("afterbegin", c.icon);
      box.append(b);
    }
  }

  /** 當前數值：主要數字加每月修為的乘數明細；內容沒變就不重畫 */
  let statKey = "";
  function renderStatDetail(state: GameState): void {
    const box = stageEl.querySelector<HTMLElement>("#statDetail");
    if (!box) return;
    const panel = statPanel(state, data);
    const key = JSON.stringify(panel);
    if (key === statKey && box.childElementCount > 0) return;
    statKey = key;
    // 重畫時保留「怎麼算」的展開狀態
    const wasOpen = box.querySelector("details")?.open ?? false;
    box.replaceChildren();
    const dl = el("dl", "facts");
    for (const r of panel.main) {
      const row = el("div");
      row.append(el("dt", undefined, r.label), el("dd", undefined, r.value));
      dl.append(row);
    }
    box.append(dl);
    const det = document.createElement("details");
    det.className = "guide";
    det.open = wasOpen;
    det.append(el("summary", undefined, "明細"));
    const list = el("ul");
    for (const r of panel.breakdown) list.append(el("li", undefined, `${r.label}　${r.value}`));
    det.append(list);
    box.append(det);
  }

  /** 圖示加名稱的標題（名稱來自資料檔，不含使用者輸入） */
  function iconTitle(itemId: string, name: string): HTMLElement {
    const s = el("strong");
    s.innerHTML = itemIcon(data, itemId);
    s.append(name);
    return s;
  }

  /** 煉丹面板：內容沒變就不重畫，避免按鈕在每個 tick 被換掉 */
  let alchemyKey = "";
  function renderAlchemy(state: GameState, e: LifeEls): void {
    const panel = alchemyPanel(state, data);
    const key = JSON.stringify(panel);
    if (key === alchemyKey) return;
    alchemyKey = key;
    e.alchemyBox.hidden = panel === null;
    e.alchemyBox.replaceChildren();
    if (!panel) return;
    const box = e.alchemyBox;
    box.append(el("h2", undefined, "煉丹"));
    const b = panel.brewing;
    if (b) {
      box.append(el("p", undefined, `爐中：${b.name}・成功率 ${b.ratePct}%`));
      const bar = el("div", "brew-bar");
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(b.months));
      bar.setAttribute("aria-valuenow", String(b.progress));
      const fill = el("div", "brew-fill");
      fill.style.width = `${(b.progress / b.months) * 100}%`;
      bar.append(fill, el("span", undefined, b.paid ? `${b.progress}／${b.months} 個月` : "下個月投料"));
      box.append(bar);
      if (b.paused) box.append(el("p", "desc", "爐火暫歇，切回「煉丹」即可續煉。"));
      const off = button("熄爐", () => handlers.onCancelBrew());
      off.classList.add("danger");
      const actions = el("div", "actions");
      actions.append(off);
      box.append(actions);
    } else {
      box.append(el("p", "desc", "備齊材料即可開爐。"));
    }
    const list = el("ul", "items");
    for (const r of panel.recipes) {
      const li = document.createElement("li");
      const need = r.inputs.map((i) => `${i.name} ${i.have}／${i.need}`).join("、");
      const info = el("div");
      info.append(iconTitle(r.itemId, r.name), el("small", undefined, `${need}・${r.months} 個月・成功率 ${r.ratePct}%${r.reason && !r.canStart ? `　${r.reason}` : ""}`));
      const start = button("開爐", () => handlers.onStartBrew(r.id), true);
      start.disabled = !r.canStart;
      li.append(info, start);
      list.append(li);
    }
    box.append(list);
    box.append(el("h2", undefined, "煉器"));
    box.append(el("p", "desc", "靈石加材料，即時煉成。失敗退回一半材料。"));
    const forgeList = el("ul", "items");
    for (const f of panel.forge) {
      const li = document.createElement("li");
      const need = f.inputs.map((i) => `${i.name} ${i.have}／${i.need}`).join("、");
      const info = el("div");
      info.append(iconTitle(f.itemId, f.name), el("small", undefined, `${f.kind}：${f.effect}`), el("small", undefined, `${need}、靈石 ${f.stones}・成功率 ${f.ratePct}%${f.reason ? `　${f.reason}` : ""}`));
      const go = button("煉製", () => handlers.onForge(f.id), true);
      go.disabled = !f.canForge;
      li.append(info, go);
      forgeList.append(li);
    }
    box.append(forgeList);
  }

  function reset(): void {
    sectKey = "";
    tribKey = "";
    bagKey = "";
  }

  return { renderBreakthrough, renderBag, renderTribulation, renderHunt, renderSect, renderResources, renderStatDetail, renderAlchemy, markMake, flash, floatDelta, reset };
}

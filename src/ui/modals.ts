import { canBuyTalent } from "../core/actions";
import { lifeIndex } from "../core/era";
import { CLEAR_FRAGMENT_ID } from "../core/fragments";
import { compareLives } from "../core/goals";
import { talentCost } from "../core/formulas";
import type { GameState } from "../core/state";
import type { GameData } from "../data/types";
import { fillSlots, type SlotValues } from "../data/slots";
import { button, el, revealIn } from "./dom";
import { rollNumber } from "./tween";
import { keepView } from "./keepview";

/** 一生回顧每一項浮現的間隔，需與 tokens.css 的 --reveal 一致 */
const REVEAL_MS = 140;
import { recommendTalent, talentPreview } from "./derived";
import {
  describeTalent,
  eraBorn,
  formatChanges,
  formatLogEntry,
  formatReviewSummary,
  formatVersus,
  reviewTitle,
} from "./format";
import type { UiHandlers } from "./render";

// ---- 彈窗的鍵盤與焦點：開啟時移入、Tab 圈在最上層彈窗內、關閉時還原 ----
/** 綁好 Tab 圈選並監看初始彈窗；回傳 watchModal 供之後重建的彈窗使用 */
export function installModalFocus(root: HTMLElement, ids: string[]): (modal: HTMLElement) => void {
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
  for (const id of ids) watchModal(root.querySelector<HTMLElement>(`#${id}`)!);
  return watchModal;
}

// ---- 一生回顧與輪迴天賦（死亡或通關後的彈窗）----
export interface ReviewModal {
  render(state: GameState, e: { modal: HTMLElement; modalBody: HTMLElement }): void;
}

/** rerender：切換回顧與天賦兩頁時，請外部用最新狀態重畫 */
export function createReviewModal(
  data: GameData,
  handlers: Pick<UiHandlers, "onBuyTalent" | "onNewLife">,
  slotsOf: (state: GameState) => SlotValues,
  rerender: () => void,
): ReviewModal {
  let modalView: "review" | "talents" = "review";
  let modalKey = "";
  /** 上一次畫出的是回顧還是天賦；買天賦只重畫同一頁，要保住捲動位置 */
  let lastView: string | null = null;

  function showView(view: "review" | "talents"): void {
    modalView = view;
    rerender();
  }

  function buildReview(state: GameState): HTMLElement {
    const box = el("div");
    const review = state.review;
    box.append(el("h2", undefined, reviewTitle(review)));
    const scene = el("div", "scene-art scene-art-reincarnation");
    scene.setAttribute("role", "img");
    scene.setAttribute("aria-label", "月輪映照群山與靜水，遠方小徑通向晨光");
    box.append(scene);
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
      if (review.sectPeak > 0) {
        const row = el("div");
        row.append(el("dt", undefined, "宗門"), el("dd", undefined, `最高到${data.sects.ranks[review.sectPeak - 1].name}`));
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
      const daoyun = el("p", "daoyun", `獲得道韻 +${gained}${bonus}　道韻餘額 ${state.meta.daoYun}`);
      box.append(daoyun);
      // 道韻數字在這一行浮現的同時從 0 滾上去
      const delay = Math.min(box.children.length - 1, 10) * REVEAL_MS;
      window.setTimeout(() => {
        rollNumber("review-daoyun", gained, 800, (v) => { daoyun.textContent = `獲得道韻 +${v}${bonus}　道韻餘額 ${state.meta.daoYun}`; }, 0);
      }, delay);
    }
    const actions = el("div", "actions review-actions");
    actions.append(button("前往輪迴", () => showView("talents"), true));
    box.append(actions);
    return revealIn(box);
  }

  function buildTalents(state: GameState): HTMLElement {
    const box = el("div");
    box.append(el("h2", undefined, "輪迴天賦"), el("p", "daoyun", `道韻餘額 ${state.meta.daoYun}`));
    const scene = el("div", "scene-art scene-art-reincarnation");
    scene.setAttribute("role", "img");
    scene.setAttribute("aria-label", "月輪映照群山與靜水，遠方小徑通向晨光");
    box.append(scene);
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
    const actions = el("div", "actions review-actions");
    actions.append(button("返回", () => showView("review")), button("轉世", () => handlers.onNewLife(), true));
    box.append(actions);
    return box;
  }

  function render(state: GameState, e: { modal: HTMLElement; modalBody: HTMLElement }): void {
    const ended = state.phase === "dead" || state.phase === "cleared";
    e.modal.hidden = !ended;
    if (!ended) {
      modalView = "review";
      modalKey = "";
      lastView = null;
      return;
    }
    const key = `${state.phase}|${modalView}|${state.meta.daoYun}|${JSON.stringify(state.meta.talents)}`;
    if (key === modalKey) return;
    modalKey = key;
    const card = e.modalBody.closest(".card");
    const keep = lastView === modalView ? keepView(e.modalBody, [card]) : null;
    lastView = modalView;
    e.modalBody.replaceChildren(modalView === "review" ? buildReview(state) : buildTalents(state));
    keep?.();
  }

  return { render };
}

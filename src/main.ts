import "./ui/style.css";
import { msToMonths } from "./core/formulas";
import { buyItem, setSchedule, useItem } from "./core/actions";
import { attemptBreakthrough } from "./core/breakthrough";
import { createInitialState, newLife, reroll, startLife } from "./core/life";
import { deserialize, serialize } from "./core/save";
import type { GameState } from "./core/state";
import { tick } from "./core/tick";
import { gameData as data } from "./data/load";
import { mountUi } from "./ui/render";

const SAVE_KEY = "xiuxian-save";

function newGame(): GameState {
  // 種子由外部（這裡）決定，core 不讀時間
  return createInitialState(Date.now(), data);
}

let notice = "";
function load(): GameState {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text !== null) return deserialize(text, data);
  } catch (e) {
    notice = `存檔無法讀取，已重新開始。（${(e as Error).message}）`;
  }
  return newGame();
}

function save(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
  } catch {
    // 存檔失敗（空間不足或被禁用）時不中斷遊戲
  }
}

let state = load();

function update(next: GameState): void {
  state = next;
  save(state);
  ui.render(state);
}

const ui = mountUi(document.getElementById("app")!, data, {
  onSpeed: (speed) => update({ ...state, speed }),
  onReroll: () => update(reroll(state, data)),
  onStart: () => update(startLife(state)),
  onNewLife: () => update(newLife(state, data)),
  onSchedule: (id) => update(setSchedule(state, id, data)),
  onBreakthrough: (usePill) => update(attemptBreakthrough(state, usePill, data)),
  onUseItem: (id) => update(useItem(state, id, data)),
  onBuyItem: (id) => update(buyItem(state, id, data)),
  onReset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // 忽略
    }
    ui.notice("");
    update(newGame());
  },
});
ui.notice(notice);
ui.render(state);

// 時間迴圈：累積現實經過的時間，每滿一個月呼叫一次 tick
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (state.phase === "living") {
    acc += msToMonths(dt, state.speed, data.config.msPerMonth);
    const months = Math.min(Math.floor(acc), data.config.maxCatchUpMonths);
    if (months > 0) {
      acc -= Math.floor(acc); // 超過補算上限的部分直接捨棄
      update(tick(state, months, data));
    }
  } else {
    acc = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) save(state);
});
window.addEventListener("beforeunload", () => save(state));

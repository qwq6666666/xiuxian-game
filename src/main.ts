import { msToMonths } from "./core/formulas";
import { deserialize, serialize } from "./core/save";
import { createInitialState, type GameState } from "./core/state";
import { tick } from "./core/tick";
import { config } from "./data/load";
import { mountUi } from "./ui/render";

const SAVE_KEY = "xiuxian-save";

function newGame(): GameState {
  // 種子由外部（這裡）決定，core 不讀時間
  return createInitialState(Date.now(), config.startAgeYears);
}

let notice = "";
function load(): GameState {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (text !== null) return deserialize(text);
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

const ui = mountUi(document.getElementById("app")!, config.speeds, {
  onSpeed(speed) {
    state = { ...state, speed };
    save(state);
    ui.render(state);
  },
  onReset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // 忽略
    }
    state = newGame();
    ui.notice("");
    ui.render(state);
  },
});
ui.notice(notice);
ui.render(state);

// 時間迴圈：累積現實經過的時間，每滿一個月呼叫一次 tick
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += msToMonths(now - last, state.speed, config.msPerMonth);
  last = now;
  let months = Math.floor(acc);
  if (months > 0) {
    acc -= months;
    months = Math.min(months, config.maxCatchUpMonths);
    state = tick(state, months);
    save(state);
    ui.render(state);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) save(state);
});
window.addEventListener("beforeunload", () => save(state));

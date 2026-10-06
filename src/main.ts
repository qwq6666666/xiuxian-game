import "./ui/style.css";
import { msToMonths } from "./core/formulas";
import { buyItem, renameCharacter, buyTalent, setSchedule, useAll, useItem, zuohua } from "./core/actions";
import { equip, forge, unequip } from "./core/forge";
import { focus } from "./core/focus";
import { setMethod } from "./core/method";
import { cancelBrew, startBrew } from "./core/alchemy";
import { attemptBreakthrough, faceWave } from "./core/breakthrough";
import { chooseEvent, setAutoChoice } from "./core/events";
import { applyOffline } from "./core/offline";
import { createInitialState, newLife, reroll, startLife } from "./core/life";
import { deserialize, importSave, serialize } from "./core/save";
import type { GameState } from "./core/state";
import { tick } from "./core/tick";
import { joinSect, leaveSect, promoteSect } from "./core/sect";
import { beginTravel } from "./core/travel";
import { gameData as data } from "./data/load";
import { formatOffline } from "./ui/format";
import { mountUi } from "./ui/render";

const SAVE_KEY = "xiuxian-save";
// 最後一次存檔的現實時間，離線進度由此計算（不放進存檔本體，core 不碰時間）
const SEEN_KEY = "xiuxian-last-seen";

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
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // 存檔失敗（空間不足或被禁用）時不中斷遊戲
  }
}

/** 距離上次存檔過了多久（毫秒）；沒有紀錄時為 0 */
function elapsedSinceSeen(): number {
  try {
    const seen = Number(localStorage.getItem(SEEN_KEY));
    return seen > 0 ? Date.now() - seen : 0;
  } catch {
    return 0;
  }
}

let state = load();
{
  const off = applyOffline(state, elapsedSinceSeen(), data);
  state = off.state;
  if (notice === "") notice = formatOffline(off.summary);
}

function update(next: GameState): void {
  state = next;
  save(state);
  ui.render(state);
}

const ui = mountUi(document.getElementById("app")!, data, {
  onSpeed: (speed) => update({ ...state, speed }),
  onReroll: () => update(reroll(state, data)),
  onRename: (name) => update(renameCharacter(state, name, data)),
  onStart: () => update(startLife(state, data)),
  onAutoChoice: (enabled) => update(setAutoChoice(state, enabled, data)),
  onChoose: (i) => update(chooseEvent(state, i, data)),
  onNewLife: () => update(newLife(state, data)),
  onBuyTalent: (id) => update(buyTalent(state, id, data)),
  onSchedule: (id) => update(setSchedule(state, id, data)),
  onBreakthrough: (usePill) => update(attemptBreakthrough(state, usePill, data)),
  onUseItem: (id) => update(useItem(state, id, data)),
  onUseAll: (id) => update(useAll(state, id, data)),
  onZuohua: () => update(zuohua(state, data)),
  onTravel: (targetId) => update(beginTravel(state, targetId, data)),
  onBuyItem: (id) => update(buyItem(state, id, data)),
  onWave: (choice, focused) => update(faceWave(state, choice, data, focused)),
  onFocus: () => update(focus(state, data)),
  onMethod: (id) => update(setMethod(state, id, data)),
  onForge: (id) => update(forge(state, id, data)),
  onEquip: (id) => update(equip(state, id, data)),
  onUnequip: (slot) => update(unequip(state, slot)),
  onStartBrew: (id) => update(startBrew(state, id, data)),
  onCancelBrew: () => update(cancelBrew(state, data)),
  onJoinSect: () => update(joinSect(state, data)),
  onLeaveSect: () => update(leaveSect(state, data)),
  onPromoteSect: () => update(promoteSect(state, data)),
  onExport() {
    const text = serialize(state);
    navigator.clipboard.writeText(text).then(
      () => ui.notice("存檔已複製到剪貼簿，貼到安全的地方即可。"),
      // 剪貼簿不可用（權限或非安全網址）時退回手動複製
      () => prompt("請自行複製以下存檔文字：", text),
    );
  },
  onImport(text) {
    try {
      const imported = importSave(text, data);
      ui.notice("存檔已匯入。");
      update(imported);
    } catch (e) {
      ui.notice(`存檔無法匯入，目前的進度沒有動。（${(e as Error).message}）`);
    }
  },
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
  // 等待抉擇時時間暫停
  if (state.phase === "living" && state.pendingEvent === null && state.tribulation === null) {
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
  if (document.hidden) {
    save(state);
    return;
  }
  // 分頁被凍結或電腦休眠後回到前景：補算離開的時間
  const off = applyOffline(state, elapsedSinceSeen(), data);
  if (off.summary.months > 0) {
    ui.notice(formatOffline(off.summary));
    last = performance.now();
    acc = 0;
    update(off.state);
  } else {
    save(state);
  }
});
window.addEventListener("beforeunload", () => save(state));

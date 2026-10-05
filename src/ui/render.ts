import { splitAge } from "../core/formulas";
import type { GameState } from "../core/state";

export interface UiHandlers {
  onSpeed(speed: number): void;
  onReset(): void;
}

export interface Ui {
  render(state: GameState): void;
  notice(message: string): void;
}

export function mountUi(root: HTMLElement, speeds: number[], handlers: UiHandlers): Ui {
  root.innerHTML = `
    <header class="bar">
      <span id="age"></span>
      <span class="speeds"></span>
      <button id="reset" type="button">重新開始</button>
    </header>
    <p id="notice" hidden></p>
  `;
  const ageEl = root.querySelector<HTMLElement>("#age")!;
  const noticeEl = root.querySelector<HTMLElement>("#notice")!;
  const speedBox = root.querySelector<HTMLElement>(".speeds")!;

  const buttons = speeds.map((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `×${s}`;
    b.addEventListener("click", () => handlers.onSpeed(s));
    speedBox.appendChild(b);
    return { s, b };
  });
  root.querySelector("#reset")!.addEventListener("click", () => {
    if (confirm("確定要清除存檔並重新開始嗎？")) handlers.onReset();
  });

  return {
    render(state) {
      const [years, months] = splitAge(state.ageMonths);
      ageEl.textContent = `${years} 歲 ${months} 個月`;
      for (const { s, b } of buttons) b.disabled = s === state.speed;
    },
    notice(message) {
      noticeEl.textContent = message;
      noticeEl.hidden = message === "";
    },
  };
}

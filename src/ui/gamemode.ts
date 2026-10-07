// 遊戲介面模式：場景佔滿畫面，狀態變成頂部抬頭顯示，原本的側欄與日誌變成由底部導航列滑出的抽屜。
// 只換排版與開關，面板的內容與事件綁定都沿用原本的 DOM；經典介面不受影響。
const KEY = "xiuxian-ui";

export type Sheet = "play" | "make" | "pack" | "me" | "log";
export const SHEETS: { id: Sheet | "map"; label: string }[] = [
  { id: "play", label: "修行" },
  { id: "make", label: "煉製" },
  { id: "pack", label: "行囊" },
  { id: "me", label: "角色" },
  { id: "log", label: "日誌" },
  { id: "map", label: "天下" },
];

/** 偏好：沒存過時，手機預設遊戲介面，桌面預設經典 */
export function readUiPref(isPhone: boolean): "game" | "classic" {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "game" || v === "classic") return v;
  } catch {
    // 讀不到就用預設
  }
  return isPhone ? "game" : "classic";
}

function writeUiPref(v: "game" | "classic"): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 無法記住也沒關係
  }
}

export function gameNavHtml(): string {
  return `<nav id="gameNav" class="game-nav" aria-label="功能">${SHEETS.map((s) => `<button type="button" data-sheet="${s.id}" aria-pressed="false">${s.label}</button>`).join("")}</nav>`;
}

export interface GameModeHooks {
  /** 開啟側欄某一頁（沿用原本的分頁切換） */
  showSideTab(tab: "play" | "make" | "pack" | "me"): void;
  openMap(): void;
  /** 切換介面後重畫（第一人稱場景是否顯示依介面而定） */
  refresh(): void;
}

export interface GameMode {
  isGame(): boolean;
  /** 開啟抽屜；經典介面時不做事 */
  openSheet(sheet: Sheet): void;
  closeSheet(): void;
  /** 更新底部一行日誌 */
  setTicker(text: string): void;
}

export function mountGameMode(root: HTMLElement, stage: HTMLElement, hooks: GameModeHooks, isPhone: boolean): GameMode {
  let mode = readUiPref(isPhone);
  const nav = root.querySelector<HTMLElement>("#gameNav")!;
  const toggle = root.querySelector<HTMLButtonElement>("#ui-toggle")!;
  const ticker = root.querySelector<HTMLElement>("#logTicker")!;

  // 遊戲介面與手機把「自動抉擇」「關鍵時刻暫停」收進「更多」選單，
  // 避免 375px 的經典介面被兩個長標籤撐出橫向捲軸；桌面經典介面仍放在工具列。
  const autos = Array.from(root.querySelectorAll<HTMLElement>(".bar-left > label.auto"));
  const barLeft = root.querySelector<HTMLElement>(".bar-left")!;
  const menuList = root.querySelector<HTMLElement>(".menu-list")!;
  const placeAutos = (): void => {
    if (mode === "game" || isPhone) for (const el of autos.slice().reverse()) menuList.prepend(el);
    else for (const el of autos) barLeft.append(el);
  };
  const sync = (): void => {
    placeAutos();
    root.dataset.ui = mode;
    toggle.textContent = `介面：${mode === "game" ? "遊戲" : "經典"}`;
    toggle.setAttribute("aria-pressed", String(mode === "game"));
    if (mode !== "game") delete stage.dataset.sheet;
    nav.querySelectorAll<HTMLButtonElement>("button[data-sheet]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sheet === stage.dataset.sheet)));
  };
  const openSheet = (sheet: Sheet): void => {
    if (mode !== "game") return;
    if (sheet !== "log") hooks.showSideTab(sheet);
    stage.dataset.sheet = sheet;
    sync();
  };
  const closeSheet = (): void => {
    delete stage.dataset.sheet;
    sync();
  };

  nav.addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("button[data-sheet]");
    if (!b) return;
    const id = b.dataset.sheet as Sheet | "map";
    if (id === "map") {
      closeSheet();
      hooks.openMap();
    } else if (stage.dataset.sheet === id) closeSheet();
    else openSheet(id);
  });
  toggle.addEventListener("click", () => {
    mode = mode === "game" ? "classic" : "game";
    writeUiPref(mode);
    root.querySelector<HTMLDetailsElement>("#menu")!.open = false;
    sync();
    hooks.refresh();
  });
  // 點場景（抽屜以外的地方）收起抽屜
  stage.addEventListener("click", (ev) => {
    if (mode !== "game" || !stage.dataset.sheet) return;
    if ((ev.target as Element).closest(".cols, .status, .modal")) return;
    closeSheet();
  });
  // 點頂部那一行日誌，直接開日誌抽屜
  ticker.addEventListener("click", () => openSheet("log"));
  sync();

  return {
    isGame: () => mode === "game",
    openSheet,
    closeSheet,
    setTicker(text) {
      if (ticker.textContent !== text) ticker.textContent = text;
    },
  };
}

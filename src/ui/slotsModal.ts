// 存檔槽視窗（M68）：列出各槽摘要，可切換或清空。換槽由 main 存檔後重新載入頁面。
import type { UiHandlers } from "./types";

export function createSlotsModal(deps: { root: HTMLElement; handlers: UiHandlers; menuEl: HTMLDetailsElement; watchModal: (modal: HTMLElement) => void }): void {
  const { root, handlers, menuEl, watchModal } = deps;
  const slots = handlers.slots;
  const openBtn = root.querySelector<HTMLButtonElement>("#slots-open")!;
  const modal = root.querySelector<HTMLElement>("#slots")!;
  const card = root.querySelector<HTMLElement>("#slots-card")!;
  if (!slots) {
    openBtn.hidden = true;
    return;
  }
  watchModal(modal);

  const close = (): void => {
    modal.hidden = true;
  };

  function build(): void {
    const box = document.createDocumentFragment();
    const head = document.createElement("div");
    head.className = "codex-head";
    const title = document.createElement("h2");
    title.textContent = "存檔槽";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "關閉";
    closeBtn.addEventListener("click", close);
    head.append(title, closeBtn);
    const note = document.createElement("p");
    note.className = "desc";
    note.textContent = "各槽的進度互不影響，只存在這個瀏覽器裡。換槽時目前的進度會先存好。";
    box.append(head, note);
    for (const info of slots!.list()) {
      const art = document.createElement("article");
      art.className = info.status === "empty" ? "fragment missing" : "fragment";
      const name = document.createElement("strong");
      name.textContent = `第 ${info.slot} 槽${info.active ? "（使用中）" : ""}`;
      const text = document.createElement("small");
      text.className = "changes";
      text.textContent = info.status === "empty" ? "（空）" : info.status === "broken" ? "（存檔無法讀取）" : info.summary;
      const actions = document.createElement("div");
      actions.className = "actions";
      if (!info.active) {
        const go = document.createElement("button");
        go.type = "button";
        go.textContent = info.status === "empty" ? "開新局" : "切換";
        go.addEventListener("click", () => {
          if (info.status === "ok" || confirm("要換到這一槽嗎？目前的進度會先存好。")) slots!.onSwitch(info.slot);
        });
        actions.append(go);
      }
      if (info.status !== "empty") {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "danger";
        del.textContent = "清空";
        del.addEventListener("click", () => {
          if (!confirm(`確定要清空第 ${info.slot} 槽嗎？這一槽的進度無法復原。`)) return;
          slots!.onClear(info.slot);
          build();
        });
        actions.append(del);
      }
      art.append(name, text, actions);
      box.append(art);
    }
    card.replaceChildren(box);
  }

  openBtn.addEventListener("click", () => {
    menuEl.open = false;
    build();
    modal.hidden = false;
  });
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !modal.hidden) close();
  });
}

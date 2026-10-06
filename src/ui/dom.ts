// 共用的 DOM 小工具

export const el = (tag: string, className?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
export const button = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  if (primary) b.className = "primary";
  b.addEventListener("click", onClick);
  return b;
};

/** 把文字放進 innerHTML 模板前先跳脫；資料檔的字串一律走這裡，避免 < 或 & 破壞畫面 */
export const esc = (text: string | number): string =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

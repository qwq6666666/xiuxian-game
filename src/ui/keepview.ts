// 重建一塊畫面時保住玩家的位置：外層的捲動、折疊區（details）的展開狀態、鍵盤焦點。
// 畫面很多地方是「清空再重畫」：內容清空又長回來時，折疊區會蓋回預設、高度變短，捲動被夾回上方，
// 剛按下的按鈕也會被換成新節點而失去焦點。用法：重建前呼叫 keepView 拿到還原函式，重建完呼叫它。

type Scroller = Element | null | undefined;

interface FocusKey {
  tag: string;
  id: string;
  data: string;
  text: string;
  /** 在同樣特徵的元素中排第幾個 */
  nth: number;
  /** 從 root 往下的子節點索引路徑；文字變了（例如價格更新）時用它找同位置的元素 */
  path: number[];
}

const textOf = (el: Element | null | undefined): string => (el?.textContent ?? "").trim().slice(0, 40);
const dataOf = (el: Element): string => JSON.stringify(Object.entries((el as HTMLElement).dataset ?? {}).sort());

/** 折疊區的身分：標題字加所在處的前幾個字，同樣的再依出現順序編號 */
function foldKeys(root: Element): { el: HTMLDetailsElement; key: string }[] {
  const seen = new Map<string, number>();
  return Array.from(root.querySelectorAll("details")).map((el) => {
    const base = `${textOf(el.querySelector(":scope > summary"))}|${textOf(el.parentElement)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { el, key: `${base}#${n}` };
  });
}

function sameKind(el: Element, k: FocusKey): boolean {
  return el.tagName === k.tag && el.id === k.id && dataOf(el) === k.data && textOf(el) === k.text;
}

function pathOf(root: Element, el: Element): number[] {
  const path: number[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) path.unshift(Array.from(n.parentElement?.children ?? []).indexOf(n));
  return path;
}

function atPath(root: Element, path: number[]): Element | null {
  let n: Element | undefined = root;
  for (const i of path) n = n?.children[i];
  return n ?? null;
}

function focusKeyOf(root: Element, active: Element): FocusKey | null {
  if (active === root || !root.contains(active)) return null;
  const k: FocusKey = { tag: active.tagName, id: active.id, data: dataOf(active), text: textOf(active), nth: 0, path: pathOf(root, active) };
  k.nth = Array.from(root.querySelectorAll(k.tag)).filter((el) => sameKind(el, k)).indexOf(active);
  return k.nth < 0 ? null : k;
}

/**
 * 記下 root 內的折疊區展開狀態、focus 的位置，以及 scrollers 的捲動位置；回傳還原函式。
 * 重建後呼叫還原函式：先還原折疊區（高度才會對），再還原捲動，最後還原焦點（不再捲動頁面）。
 * 頁面本身的捲動用 document.scrollingElement。
 */
export function keepView(root: Element, scrollers: Scroller[] = []): () => void {
  const folds = new Map(foldKeys(root).map((f) => [f.key, f.el.open] as const));
  const scrolls = scrollers.map((s) => s?.scrollTop ?? 0);
  const focus = document.activeElement ? focusKeyOf(root, document.activeElement) : null;
  return () => {
    for (const f of foldKeys(root)) {
      const was = folds.get(f.key);
      if (was !== undefined && f.el.open !== was) f.el.open = was;
    }
    scrollers.forEach((s, i) => {
      if (s) s.scrollTop = scrolls[i];
    });
    if (!focus) return;
    const candidates = Array.from(root.querySelectorAll(focus.tag)).filter((el) => sameKind(el, focus));
    // 先找特徵相同的；文字變了找不到就退回同位置、同種類的元素
    const byPath = atPath(root, focus.path);
    const target = (candidates[focus.nth] ?? candidates[0] ?? (byPath?.tagName === focus.tag ? byPath : undefined)) as HTMLElement | undefined;
    if (target && target !== document.activeElement) target.focus({ preventScroll: true });
  };
}

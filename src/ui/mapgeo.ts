// 天下圖的小標籤避讓：依重要度由高到低放，與已放的重疊就隱藏。不碰 DOM，方便測試。
export interface LabelItem {
  key: string;
  x: number;
  y: number;
  text: string;
  anchor: "start" | "middle";
  /** 數字越小越優先；被選取的標籤用 0 */
  priority: number;
}

const CHAR_W = 10.5;
const CHAR_H = 11;

function labelRect(l: LabelItem): [number, number, number, number] {
  const w = [...l.text].length * CHAR_W;
  const x0 = l.anchor === "middle" ? l.x - w / 2 : l.x;
  return [x0, l.y - CHAR_H, x0 + w, l.y + 2];
}

export function placeLabels(items: LabelItem[]): { shown: LabelItem[]; hidden: LabelItem[] } {
  const shown: LabelItem[] = [];
  const hidden: LabelItem[] = [];
  const rects: [number, number, number, number][] = [];
  for (const item of [...items].sort((a, b) => a.priority - b.priority)) {
    const r = labelRect(item);
    if (rects.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) {
      hidden.push(item);
      continue;
    }
    rects.push(r);
    shown.push(item);
  }
  return { shown, hidden };
}

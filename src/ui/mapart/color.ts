// 地圖繪製的顏色格式化：色值全部來自 data/mapart.json 與世局的國家顏色，這裡只負責轉成 canvas 認得的字串。
// 這是 src/ui 底下唯一允許寫 rgba() 的地方（tests/style.test.ts 的白名單）。
export type Rgb = [number, number, number];

export function tint(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scaleRgb(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** 國家顏色是 #rrggbb（來自 map.json 的色盤），讀進來轉成三個數字 */
export function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

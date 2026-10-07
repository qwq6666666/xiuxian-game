// 羊皮紙底：低頻斑駁加細顆粒加邊緣暈染。每個尺寸只畫一次。
import { fbm, hash2 } from "../../../core/util/noise";
import type { Rgb } from "./color";

const cache = new Map<string, HTMLCanvasElement>();

export function paperCanvas(width: number, height: number, base: Rgb): HTMLCanvasElement {
  const key = `${width}x${height}:${base.join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(width, height);
  const px = img.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const mott = (fbm(x / 70, y / 70, 901, 3) - 0.5) * 0.16 + (hash2(x, y, 77) - 0.5) * 0.045;
      const vx = (x / width - 0.5) * 2;
      const vy = (y / height - 0.5) * 2;
      const vig = Math.pow(Math.max(Math.abs(vx), Math.abs(vy)), 4) * 0.2 + (vx * vx + vy * vy) * 0.05;
      const k = 1 + mott - vig;
      px[p] = base[0] * k;
      px[p + 1] = base[1] * k;
      px[p + 2] = base[2] * k;
      px[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, canvas);
  return canvas;
}

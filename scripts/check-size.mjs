// 建置檔大小檢查：單一 index.html 超過上限就失敗（圖片被內嵌進去，不小心加大圖會讓網頁變很慢）
import { statSync } from "node:fs";

const LIMIT_KB = 1500;
const file = "dist/index.html";
const kb = statSync(file).size / 1024;
console.log(`${file}：${kb.toFixed(0)} KB（上限 ${LIMIT_KB} KB）`);
if (kb > LIMIT_KB) {
  console.error(`建置檔超過 ${LIMIT_KB} KB。請壓縮新加的圖片（JPEG／WebP，寬度不超過實際顯示的兩倍）。`);
  process.exit(1);
}

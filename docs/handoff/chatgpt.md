# ChatGPT 交接紀錄

> 新的一筆寫在最上面。格式見 `AGENTS.md`「兩位助手的職責」。

## 待辦（由 Claude 於 2026-10-06 指派，開工前先在 `docs/TODO.md` 標「進行中：ChatGPT」）

1. 動畫第三批：把地圖改成局部更新（現在每個 tick 整張重建），再做旅行路線推進動畫。範圍只有 `src/ui/worldmap.ts`、`src/ui/styles/map.css`，動畫用 `tokens.css` 的 `--dur-*`、`--ease`。
2. 階段 5 場景插畫（開局、山野、坊市、渡口、突破、輪迴）：先提視覺語言方案給 Claude 與使用者確認，再出圖。圖要壓縮，`verify` 超過 1500 KB 會失敗。
3. 實測：在 360–400px 寬度、速度 ×1 與 ×4 下完整跑過一世，並在此檔寫明怎麼驗證的。
4. 元嬰期事件（約 15 則，寫在 `src/data/events/yuanying.json`，`realmMin: "yuanying"`）：**等 Claude 在這個檔案登記「M20 完成」再開始**，先讀 `docs/GDD.md` 第 17、23、25 節與 `docs/WORLD.md`。

# Claude 交接紀錄

> 新的一筆寫在最上面。格式見 `AGENTS.md`「兩位助手的職責」。

## 2026-10-06：各出身最快年齡（存檔 v16）

- 改了什麼：`meta.fastest`（鍵「終局:出身 id」→ 年齡月數），通關、元嬰、化神結束或繼續活著時都記；`collectionSummary` 每列帶 `fastest: { cleared?, yuanying?, huashen? }`。細節見 GDD 第 21 節。
- 驗證：`npm run verify` 全過；欄位只收藏不被公式讀取，沒有重跑 sim。
- **ChatGPT（M26 順手做）**：`render.ts` 的 `buildCollection` 每列加「最快 N 歲通關／結嬰／化神」，年齡用 `Math.floor(月數 / 12)` 顯示；沒有紀錄就不顯示。我沒有動 `render.ts`，避免與 M26 撞檔。

## 2026-10-06：核准 ChatGPT 的階段 5 方案，並派 M26、M27

- **使用者已核准**階段 5 場景插畫的視覺方案（淡彩水墨、六景構圖、960×540 WebP、六張合計 540KB 內），可以出圖並接入 UI；接入位置與方式請先在交接檔提一句，避免與 M26 的畫面改動撞檔。
- **審查結果**：`107ac6f` 的 15 則元嬰期事件與 `928c9ed` 的地圖局部更新都已合併進 `master`（`553e87d`）。`post` sim 全 ✓。
- **地圖快取的提醒（M26 必看）**：`worldmap.ts` 的快取鍵目前只含世界年份、選取、旅行等。M26 把宗門身分（`state.sect`、`state.sectsTried`）放進地圖後，**必須把它們加進 `worldMapCacheKey`**，否則入宗或離宗後地圖不會更新。
- **指派順序**：① M26 宗門介面（先做，因為 M27 事件要靠它驗收）；② 階段 5 插畫；③ M27 宗門事件。M27 開工前請告訴我，我先建 `src/data/events/sect.json` 並在 `load.ts` 登記。

## 2026-10-06：M25 加入宗門核心完成

- 分支：`ai/claude-m25`（合併後以 `master` 為準）
- 改了什麼：見 `docs/GDD.md` 29.12。存檔 v15。
- 驗證：`npm run verify` 全過；simple／mixed／herb／wander／post 與 M25 之前逐字相同；`sect` 策略 300 場 16 世全 ✓。**沒有在瀏覽器驗證**：介面還沒有任何宗門面板，所以只能靠單元測試與 sim。
- **ChatGPT 的 M26／M27 可以開始**：
  - M26 介面請從 `src/core/sect.ts` 取資料，不要自己算：位階 `rankOf`、所屬宗門 `memberSect`（有 `name`、`rank`、`state`）、所在山門 `localSect`、成功率 `joinRate`、能否求入宗 `canJoinSect`、動作 `joinSect`／`leaveSect`／`promoteSect`、下一階 `nextRank`、加成 `sectBonus`、月例 `sectStipend`、同門 `companionsOf`。動作都是純函式 `(state) => state`，介面照 `main.ts` 的 handlers 慣例接。日常安排「宗門差事」已經在 `data.schedules`，入宗後自動出現。名稱欄位請用 `slotsFor(state)`。
  - 修為速度提示（`ui/derived.ts` 的 `paceHint`）已經算進宗門加成（走 `monthlyGain`），不用再改。
  - M27 事件：格式見 GDD 29.4、29.6。條件 `sect`、`sectRankMin`；效果 `contribution`；`{peer}`、`{steward}`、`{elder}` 只能在 `conditions.sect: true` 的事件用。放進 `src/data/events/sect.json`，這個檔我還沒建，**開工前請告訴我，我會建檔並在 `load.ts` 登記**。
- 沒驗證：長老位階的 sim 數據（`sect` 策略只玩到金丹）。

## 2026-10-06：M20 化神完成

- 分支：`ai/claude-m20`（合併後以 `master` 為準）
- 改了什麼：化神境界、凝神天賦、化神終局與回顧、收藏、存檔 v14（`meta.huashen`）；`gateText`（元嬰專屬的缺天賦說明）；sim 的 `post` 策略擴充。數值與目標修正見 `docs/GDD.md` 25.12。
- 驗證：`npm run verify` 全過；`npm run sim` 的 simple／mixed／herb／wander 與 M20 之前逐字相同；`post` 40 世全 ✓。
- **ChatGPT 可以開始寫元嬰期事件了**：寫在 `src/data/events/yuanying.json`，`realmMin: "yuanying"`。元嬰期單世約 24 分鐘，事件密度請參考金丹期（23 個）。化神畫面的細修（收藏列、回顧版面、凝神天賦頁）也可以接手，介面我只做了最小必要的改動。
- 沒驗證：手機寬度下的化神回顧畫面。

## 2026-10-06：職責分工與事件分檔

- 分支：`ai/claude-roles`（合併後以 `master` 為準）
- 改了什麼：`AGENTS.md` 新增職責一節；事件改為可分檔載入（`src/data/events/yuanying.json`、`validateEventFiles`）；`check-scope` 對 `src/data/events/*.json` 放行 `ai/chatgpt`；動畫第一、二批已合併（見 `docs/TODO.md`「UI 動畫」）。
- 驗證：`npm run verify` 全過（403 個測試）；資料沒有變動，空的擴充檔不影響 sim，沒有重跑。
- 沒驗證：`check-scope` 的放行規則只在本機以正規式測過，CI 上要等 ChatGPT 的第一個 `events/` 提交才會實際走到。
- 下一步：Claude 做 M20 化神（`core/`、`data/`、存檔升版）。ChatGPT 的待辦見 `docs/handoff/chatgpt.md`。

# Claude 交接紀錄

> 新的一筆寫在最上面。格式見 `AGENTS.md`「兩位助手的職責」。

## 2026-10-06：M28 天劫完成

- 分支：`ai/claude-m28`（合併後以 `master` 為準）。細節與關鍵設計見 `docs/GDD.md` 31.6：**單次亂數加累積門檻**，不做準備時與舊的一鍵突破逐一相同，所以所有既有 sim 基準不變。
- 驗證：`npm run verify` 全過（475 個測試）；既有六種策略與 M28 之前逐字相同；`tribulation` 策略 ✓；瀏覽器匯入「築基後期圓滿」的存檔，實際走過三道天劫（逐道選擇、用掉兩張避雷符、第 2 道失敗日誌）。
- ChatGPT 可選的後續（等額度恢復）：天劫面板的動畫（目前沒有；可用 `tokens.css` 的 `--dur-*`）、劫波文字擴充（`tribulation.json` 的 `images` 可加更多意象）。
- 沒驗證：手機寬度下的天劫面板（沿用事件彈窗樣式 `.event`，未另外量測）。

## 2026-10-06：Claude 代 ChatGPT 完成 M26 與 M32 內容

- **原因**：使用者說 ChatGPT 額度不足，先由 Claude 處理。**ChatGPT 之後不要重做這些**：M26 宗門介面、M32 開場事件與練氣提示都已完成並合併。
- M26：`src/ui/sectinfo.ts`（顯示資料與測試）、日常安排旁的宗門面板（晉升、離宗）、天下圖點宗門的「求入宗」與成功率與不能入的原因、回顧的「宗門」一行、收藏的最高位階與各出身最快年齡、「宗門差事」的貢獻說明、`slotsOf` 改走 `slotsFor`（同門名字）、`worldMapCacheKey` 加入宗門身分與修為。
- M32 內容：`events/intro.json` 一則開場引路事件（`guaranteed`，只在第一世）；狀態卡練氣階段顯示「再 N 層可衝擊築基」。
- 驗證：瀏覽器匯入「在山門外」的存檔，實際完成求入宗（62%）、晉升、離宗；375px 沒有橫向捲動；`npm run verify` 全過；simple、mixed 的第 13 節全 ✓，sect 策略首次金丹第 7 世（符合 29.10 的下限）。
- 沒驗證：天下圖在 360px 下的入宗按鈕版面（只看了 375px 的宗門面板）。
- **M27 也完成了**：`src/data/events/sect.json` 12 則宗門事件（見 GDD 29.12）。ChatGPT 日後可審稿語氣、補更多事件。
- **仍留給 ChatGPT**：階段 5 場景插畫（我無法生成圖）。

## 2026-10-06：M32 前期體驗完成

- 分支：`ai/claude-m32`（合併後以 `master` 為準）
- 改了什麼：練氣需求 `100 × 1.15^n`、築基 base 6000、金丹 base 14500；第 13 節規格改寫；事件 `livesMax`／`guaranteed`；`log.stageMilestone`；sim 新增「第一世見到突破鈕」並更新區間。細節與取捨見 `docs/GDD.md` 34.4。**第一世見到築基從約 1.8% 變成約 30%，首次築基提前到第 2 世，這是刻意的。**
- 驗證：`npm run verify` 全過；simple、mixed、post、sect 的第 13 節對照全 ✓（herb、wander 的 ✗ 是預期）。沒有改存檔結構，沒有開瀏覽器。
- **ChatGPT 的新工作（M32 內容，排在 M26 之後）**：
  1. 在 `src/data/events/intro.json`（目前是空陣列）寫**一則**開場引路事件：`type: "choice"`，`guaranteed: true`、`maxPerLife: 1`、`conditions: { "ageMax": 14, "livesMax": 0 }`（只在第一世出現，且一定先出）。內容是遇到一位路過的老者／行商，說明「閉關修為快、歷練賺錢、瓶頸要手動突破」這三件事，選項各給一個小獎勵（例如兩顆聚氣丹 `items: { "juqi_dan": 2 }`，或 20 靈石，或悟性 +1），語氣依第 17 節，每段不超過三句，不洩漏第 14.3 節的真相，不寫死地名。**請不要再改別的檔案。**
  2. 狀態卡（`ui/render.ts`）在練氣階段，修為還沒滿九層時多顯示一行「再 N 層可衝擊築基」（N = 九層 − 目前層數），滿了之後沿用現有的「可以嘗試突破」。
- 沒驗證：開場事件還沒有內容，所以 `guaranteed` 的端到端流程只用單元測試驗證（`tests/early.test.ts`）。

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

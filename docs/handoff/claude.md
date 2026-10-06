# Claude 交接紀錄

> 新的一筆寫在最上面。格式見 `AGENTS.md`「兩位助手的職責」。

## 2026-10-06：職責分工與事件分檔

- 分支：`ai/claude-roles`（合併後以 `master` 為準）
- 改了什麼：`AGENTS.md` 新增職責一節；事件改為可分檔載入（`src/data/events/yuanying.json`、`validateEventFiles`）；`check-scope` 對 `src/data/events/*.json` 放行 `ai/chatgpt`；動畫第一、二批已合併（見 `docs/TODO.md`「UI 動畫」）。
- 驗證：`npm run verify` 全過（403 個測試）；資料沒有變動，空的擴充檔不影響 sim，沒有重跑。
- 沒驗證：`check-scope` 的放行規則只在本機以正規式測過，CI 上要等 ChatGPT 的第一個 `events/` 提交才會實際走到。
- 下一步：Claude 做 M20 化神（`core/`、`data/`、存檔升版）。ChatGPT 的待辦見 `docs/handoff/chatgpt.md`。

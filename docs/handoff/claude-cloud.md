# Claude（雲端）交接紀錄

> 雲端工作階段專用，新的一筆寫在最上面；本機的紀錄在 `claude.md`。規則見 `AGENTS.md`「本機與雲端並行」。
> 雲端只推 `ai/claude-cloud`，由本機整合者合併進 `master`。

### 2026-10-06 怪物擴充（GDD 38.1）
- 分支：master-mxid6d（PR #1）。`monsters.json` 新增 10 種怪（各境界 2 種，凡人到元嬰），格式不變；`tests/opening.test.ts` 加怪物池檢查。
- 驗證：`npm run verify` 全過；`sim` mixed 單世／16 世、hunt 16 世（數字見 GDD 38.1）。對照：只還原 `monsters.json` 的 mixed 抉擇 16.1、首次金丹第 8 世、通關 4.6 小時。
- 沒驗證：simple／post／herb／wander／alchemy／forge 沒再跑（不涉及歷練，預期只因亂數路徑微移）；遊戲內顯示；怪物圖（沒有圖）。
- 注意：mixed 的抉擇 16.5 貼近上限 17，建議本機再跑 `post` 與 3 個種子確認。

### 2026-10-06 設計提案：怪物圖鑑、隔世重逢
- 分支：master-mxid6d（PR #1）。只改文件：`docs/GDD.md` 新增 16.3（怪物圖鑑）與 16.4（隔世重逢的故人），`docs/TODO.md` 兩條待確認項目。沒動程式與存檔。
- 驗證：只有文件，未跑測試。
- 下一步：等使用者確認；兩案共用一次存檔升版（v23），本機動手前先登記並行預約表。16.4 需先開第 15 節例外。

### 2026-10-06 事件條件 origins／roots 與開場回憶事件（GDD 第 39 節）
- 分支：master-mxid6d（PR #1）。`EventConditions` 加 `origins`、`roots`（`types.ts`、`core/events.ts`、`data/validate.ts`），新檔 `src/data/events/opening.json`（12 則）並在 `load.ts` 登記；`tests/opening.test.ts`。沒動存檔結構。
- 驗證：`npm run verify` 全過（569 測試）；`npm run sim -- 300 1 1 simple|mixed` 全 ✓；`300 1 16 simple` 只有「f01 與 f02 都到手」貼邊（空檔對照組在種子 2 也是 ✗，判定為雜訊，換種子 2、3 加入後皆 ✓）。
- 沒驗證：遊戲內顯示；未跑 `post`、`herb`、`wander` 等其他策略（建議本機補跑）。
- 注意：用 `guaranteed` 會被開場引路事件擠掉（首次事件多在 14–17 歲），故用一般權重。真正的 `era` 開場句要依出身分流需改存檔，未做。

### 2026-10-06 勝利文字移除掉落描述
- 分支：master-mxid6d（PR #1）。`monsters.json` 十隻怪的 `win` 改成只寫結局：勝利文字每次都顯示，掉落卻是機率制，且 AGENTS.md 規定物品變化由介面顯示。另把戰敗句「繳了學費」改為「破財消災」。
- 驗證：`npm run verify` 全過（564 測試）。未跑 sim（不涉數值）；未開瀏覽器。

### 2026-10-06 歷練遇怪文字潤飾
- 分支：master-mxid6d（本次雲端指定分支）。改 `src/data/monsters.json` 四句文字：赤尾狐登場、古猿勝利、戰敗、逃脫成功，補上冷面吐槽並移除含糊句。
- 驗證：`npm run verify`（tsc、測試、build、大小）全過。不涉數值、存檔，未跑 sim。
- 沒驗證：遊戲內實際顯示（雲端無瀏覽器）。
- 下一步：文字不改格式；若要每隻怪各自的敗北／逃脫文字，需擴充 `monsters.json` 格式，請本機決定。

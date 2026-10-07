# 專案說明

文字修仙遊戲，放置掛機 × 人生模擬。完整設計見 `docs/GDD.md`，開始任何功能前先讀對應章節。世界觀見 `docs/WORLD.md`。進度與待辦見 `docs/TODO.md`，新的工作階段先讀它。

這份檔案是所有 AI 助手（Claude Code、ChatGPT／Codex 等）與人共用的規則，`CLAUDE.md` 只是引用它。

## 技術棧

- TypeScript + Vite，不使用 UI 框架，直接操作 DOM
- 測試：Vitest
- 存檔：localStorage
- 純前端，沒有後端

## 常用指令

```
npm run dev     # 開發伺服器
npm run test    # 單元測試
npm run sim     # 無介面模擬 N 局並輸出統計
npm run build   # 正式建置
```

## 目錄結構

```
src/
  core/      遊戲邏輯，純函式，不得碰 DOM、不得讀取時間
  data/      JSON 資料：境界、事件（主檔 events.json 與 events/ 擴充檔）、物品、輪迴天賦、設定
  ui/        畫面繪製與事件綁定
  main.ts    進入點，負責計時與串接 core 和 ui
scripts/
  simulate.ts   模擬腳本
tests/
docs/
  GDD.md     系統規格
  WORLD.md   世界觀：寫作指南、三界、位階、歷史、殘卷
  TODO.md    待辦與進度
```

## 架構規則

- `core/` 的形式是 `(狀態, 輸入) → 新狀態`，要能在沒有瀏覽器的情況下跑完一整世
- `core/` 內禁止使用 `Math.random()` 與 `Date.now()`；亂數走可設種子的產生器，時間由外部傳入
- 世界生成不得消耗 `rngSeed`（用 `deriveSeed`）；世局效果是年齡的函式，不進存檔
- 所有數值（倍率、機率、需求量、價格）放在 `src/data/` 或 `src/core/formulas.ts`，不要散落在邏輯裡
- 新增事件、物品、天賦只改 JSON，不改程式；如果做不到，代表資料格式要擴充，先提出來
- 存檔帶 `version` 欄位；改動存檔結構時一併寫遷移函式
- 載入 JSON 資料時做格式檢查，錯誤訊息要指出是哪一筆資料的哪個欄位
- UI 只改 `src/ui/`；色碼只能寫在 `src/ui/styles/tokens.css`（`tests/style.test.ts` 守住）

## 語言規則

- 玩家看得到的文字一律用繁體中文，採台灣用語
- 程式碼識別字、檔名、commit 訊息用英文
- 註解用繁體中文
- 事件文字每段不超過三句
- 語氣是正經仙俠帶一點冷面吐槽，寫任何玩家可見的文字前先讀 `docs/GDD.md` 第 17 節的規則與範例
- 數值變化（獲得物品、修為增減）由介面另外顯示，不要寫進敘述文字裡
- 寫事件、日誌、物品說明、殘卷前先讀 `docs/WORLD.md`；地名、勢力名、位階只用該文件列出的，要新增先提出來
- `docs/WORLD.md` 第 14.3 節的真相只能經由殘卷揭露，不得寫進事件敘述、日誌或一生回顧
- M7 之後，太衡宗、通濟行、野渡、垣下、渡頭集、青垣山只是參考名；玩家可見的文字改用 `{guard}` 等名稱欄位（見 `docs/WORLD.md` 第 20 節），不得寫死；載入時會檢查
- 少年事件不能限定「凡人」；事件池很大時，權重低的連鎖後段幾乎看不到，要拉高

## 工作方式

- 依 `docs/GDD.md` 第 14 節的里程碑順序進行，一次只做一個
- 開始一個里程碑或新的資料格式前先提出實作計畫，確認後再寫程式
- 每個里程碑結束前：測試全過、實際在瀏覽器操作過驗收條件、commit
- `core/` 的每個公式都要有單元測試
- GDD 第 15 節列為「不做」的系統不要實作；有好點子就寫進第 16 節
- GDD 的數值是初始猜測，第 13 節的節奏目標才是規格；調數值時用 `npm run sim` 的結果佐證，並同步更新 GDD

## 調數值後的模擬檢查

動任何數值、事件、間隔之後：

1. `npm run sim -- 300 1 1|16 simple`，再跑 `mixed`，再跑 `... 40 post`（約 30 秒），第 13 節對照全部 ✓ 才算通過。
2. `herb`（永遠採藥吃丹）、`wander`（永遠走訪渡口）與 `alchemy`（採藥吃丹再加自煉聚氣丹）是回歸檢查；`forge`、`hunt`（永遠外出歷練遇怪）、`method:<id>` 是疊加加成的上限檢查（首次金丹中位數不得低於第 7 世）：第一世止步不得高於 `simple`（M32 之後 `simple` 約 8.4 層，這三者實測約 4.4–4.8 層）。它們的第 13 節對照顯示 ✗ 是預期。
3. 指標貼著區間邊緣，要特別留意：首次金丹中位數 8–10 世、通關時間、集滿 14 份殘卷、每世抉擇事件（M32 之後 `mixed` 約 15.9，上限 17）、第一世見到突破鈕（約 33%，下限 30%）、首次築基第 2–3 世、`post` 的首次元嬰累計約 12.4 小時（上限 13）。

## 推送到 GitHub（origin）

完成一個里程碑或階段、commit 之後，**要** push 到 `origin`。但必須先符合下面全部前提，任何一項不成立就不要 push，先處理並回報原因：

1. 要推的內容都已 commit，且是一個完整的單位（一個里程碑、階段或功能），不推做到一半的東西。
2. `npx tsc --noEmit` 沒有錯誤，`npm run test` 全過，`npm run build` 成功；以上三項加上建置檔大小檢查可用 `npm run verify` 一次跑完。
3. 動過數值、事件或間隔的，`npm run sim` 的檢查已照「調數值後的模擬檢查」跑過且全部 ✓；改了存檔結構的，遷移函式與測試都在。
4. 工作區沒有不是自己改的未提交變更。多個助手並行時，`git status` 看到別人的檔案就不要動它們，只 push 自己的 commit；無法分辨誰改的，先問使用者。
5. push 前先 `git fetch`。若遠端有新 commit，先 rebase（或 merge）並重跑第 2 點，再 push。
6. 不 force push（`--force`、`--force-with-lease` 都不用），不改寫已 push 的歷史。
7. 不 push 金鑰、個人資料、`node_modules`、`dist`；commit 訊息用英文。
8. 多個助手並行時各用自己的分支並 push 該分支，合併進 `master` 前再跑第 2 點；一般單人作業可直接 push `master`。
9. 使用者說「先不要 push」或這段對話沒有明確要做 push 的工作時，以使用者為準，不自行 push。

## 協作守則（多個助手並行時）

- 同一個資料夾、同一個分支一次只讓一個工具動。要並行，一律用 git worktree（見下節），不要兩個工具共用同一個工作目錄。
- 進度與設計只認 repo 裡的檔案（`docs/`），不要靠對話記憶；做完一個階段就更新 `docs/TODO.md`。
- 換行符號統一用 LF（見 `.gitattributes`）。在 Windows 用 Python 讀寫檔案時要用 `open(..., newline='')`；改完用 `git diff --stat` 檢查行數是否合理，整檔重寫代表換行被改了。
- 沒有瀏覽器預覽工具的助手，驗收時用 `npm run dev` 自己開頁面操作，或請人看。
- 驗證時若要手動改 localStorage 的存檔（`xiuxian-save`），頁面卸載會用目前狀態覆蓋它；改用遊戲內的「匯入存檔」。

## 兩位助手的職責（Claude／ChatGPT）

原則：按**檔案區域**分，不按功能分；同一個檔案同時只有一位負責，就不需要檔案鎖。

| | Claude（核心與整合者） | ChatGPT（介面與內容） |
|---|---|---|
| 負責寫 | `src/core/`、`src/data/` 的結構與數值（`types.ts`、`validate/`、`load.ts`、各 JSON）、`scripts/`、`tests/`、`.github/`、`AGENTS.md`、`docs/GDD.md` | `src/ui/`、圖片資產、`src/data/events/*.json` 的事件文字 |
| 負責做 | 里程碑設計與實作計畫、存檔升版與遷移、`npm run sim` 與數值調整、審查與合併進 `master`、部署 | 畫面、樣式、動畫、地圖繪製、手機與鍵盤實測、事件與日誌文字草稿 |
| 只提案不直接改 | — | `docs/WORLD.md`、`docs/GDD.md`、`src/data/` 結構檔 |

- **互審**：誰寫的不自己合併。ChatGPT 的分支由 Claude 審後合併；Claude 動到 `src/ui/` 時請 ChatGPT 看一眼。
- **交接紀錄**：每位助手維護自己的 `docs/handoff/<名字>.md`（`claude.md`、`chatgpt.md`），完成一段就**在最上面**追加一筆：分支與 commit、改了什麼與為什麼、**怎麼驗證的**（跑了哪些指令、有沒有開瀏覽器、什麼寬度與速度）、**沒驗證的**、下一步與需要對方注意的事。開工先讀對方的檔案與 `docs/TODO.md`。只改自己的檔案，避免衝突。
- **UI 需要新資料欄位**：ChatGPT 在交接檔寫需求，Claude 加欄位與驗證並回報，ChatGPT 再畫。兩邊不要同時動。
- **事件分檔**：`src/data/events.json` 是主檔，只有 Claude 改。新事件寫在 `src/data/events/*.json`（目前有 `yuanying.json`，元嬰期事件，起初是空陣列），格式與主檔相同，id 全域不得重複，載入時逐筆檢查。新增檔案要在 `src/data/load.ts` 的 `validateEventFiles` 清單加一行，這步由 Claude 做。ChatGPT 只能改 `events/` 底下已存在的 `.json`；`check-scope` 對這個路徑放行。事件文字仍受「語言規則」約束，Claude 審稿時會對照 `docs/GDD.md` 第 17 節與 `docs/WORLD.md`。
- 需要跨區域時（例如畫面改動必須小改 `core/`）：先在交接檔提計畫，經 Claude 同意，commit 訊息再加 `[scope-ok]`。
- 數值、存檔、sim 的疑問一律歸 Claude。不確定時先問使用者，不要順手改對方的檔案。

## 多助手的整合與部署

- 各助手做完一小段就 `git push origin <自己的分支>`（`ai/claude`、`ai/chatgpt`），不要只留在本機；推分支不會部署，GitHub 會自動跑 `verify`。
- 整合者（使用者指定一位，預設是 Claude Code）負責合併進 `master`：`git fetch --all`、`git log master..origin/<分支>` 看新內容、合併、解衝突、跑 `npm run verify`，通過後**一次**推上 `master`。其他助手不直接推 `master`。
- 部署只由 `master` 的推送觸發。連續推 `master` 會讓排隊中的部署被後一次取代，整合完再推一次即可。
- 開工前先在 `docs/TODO.md` 預約下一個里程碑編號與章節編號（寫上助手名），避免兩邊撞號。
- 範圍由 CI 檢查（`scripts/check-scope.mjs`）：`ai/chatgpt` 不得動 `src/core/`、`src/data/`（`src/data/events/*.json` 除外）、`scripts/`、`.github/`、`package.json`、`AGENTS.md`、`tests/save-shape.json`；確實需要時，先在 `docs/TODO.md` 或對話提出計畫並經整合者同意，再於 commit 訊息加 `[scope-ok]`。
- 架構規則由 `tests/architecture.test.ts` 守住：`core/` 不得使用 `Math.random`、`Date.now`、DOM、不得 import `ui/`；改存檔欄位必須升 `SAVE_VERSION`、寫遷移函式並更新 `tests/save-shape.json`。
- `docs/GDD.md`、`docs/TODO.md` 最容易衝突：只在自己的章節新增內容，不整檔改寫、不改換行符號。
- 新增圖片要壓縮（JPEG／WebP，寬度不超過實際顯示的兩倍）；圖會被內嵌進單一 `index.html`，`verify` 在超過 1500 KB 時會失敗。

## 識別與整合紀錄

- 所有助手的 commit 作者可能都是同一個 git 使用者，因此每個 commit 訊息結尾必須有 `Co-Authored-By` 標記：Claude 依系統提示加；ChatGPT 加 `Co-Authored-By: ChatGPT <noreply@openai.com>`。`check-scope.mjs` 會檢查 `ai/chatgpt` 的 commit。
- 開工前先 `git fetch && git rebase origin/master`；`.gitattributes` 已強制 LF，不要手動改行尾。
- 合併者要確認分支內沒有 `live.html` 這類建置產物或暫存檔。

## 本機與雲端並行（Claude Code）

同一位助手（Claude）同時在本機與雲端工作階段做事時，視為兩個獨立的工作者，只透過 `origin` 交換：

- 本機是整合者：唯一合併並推 `master` 的地方；本機開發用 `ai/claude-local`（或沿用 `ai/claude-m<編號>` 的功能分支）。
- 雲端只推自己的分支 `ai/claude-cloud`，不推 `master`，不合併。
- 開工前 `git fetch && git rebase origin/master`；收工前 `git push origin <自己的分支>`，不要把 commit 只留在其中一邊。
- 交接檔分開寫：本機 `docs/handoff/claude.md`，雲端 `docs/handoff/claude-cloud.md`，各改各的。
- 動存檔結構（`SAVE_VERSION`、`tests/save-shape.json`）、`src/core/` 共用函式或 `types.ts` 前，先在 `docs/TODO.md` 的「並行預約表」登記，另一邊不得同時動。
- 建議分區：雲端做 `src/data/` 內容、文件、測試與 sim 調數值；本機做存檔結構、核心邏輯與介面。
- 雲端沒有瀏覽器預覽，改了畫面的內容要在合併前由本機看過。
- 合併前（本機）：`git fetch --all`、`git log master..origin/ai/claude-cloud` 看內容、合併、`npm run verify`、推 `master`、查 GitHub Actions 部署結果。

## 並行作業流程（git worktree）

兩個以上的助手同時做事時，各自在獨立的工作目錄與分支，互不影響檔案：

```bash
git worktree add ../xiuxian-claude -b ai/claude
git worktree add ../xiuxian-chatgpt -b ai/chatgpt
```

- 各助手在自己的 worktree 裡改檔、commit（Claude：`ai/claude`、ChatGPT：`ai/chatgpt`）。主資料夾 `xiuxian-game` 的 `master` 只由**整合者**（預設 Claude）操作：合併、文件與流程維護、小修；整合者做功能開發請用 `ai/claude`。其他助手不直接改主資料夾。
- 每個 worktree 第一次要 `npm install`。
- 開工前先 `git fetch && git rebase origin/master`；每完成一個小單位就 commit 並再同步一次，不要讓分支放太久。
- 合併進 `master` 前跑「推送到 GitHub」那節的前提 2、3；合併由使用者或使用者指定的一個助手負責，不要兩邊同時往 `master` 推。
- 開在別處的 worktree 用完後以 `git worktree remove ../xiuxian-claude` 清掉。

### 分工與認領

- 開工前在 `docs/TODO.md` 要做的項目後面標上 `（進行中：助手名）`，完成勾選時一併拿掉。看到別人已標的項目就不要碰。
- 大型資料檔（尤其 `src/data/events.json`）同一時間只讓一個助手改；要改的先認領。
- 建議的切法：一個做 `src/ui/` 與 `src/core/`，另一個做 `src/data/` 的文字與事件。同一個檔案要兩邊都改時，先商量誰先。
- 發現工作區有不是自己改的未提交變更，不要動也不要順手 commit，先回報使用者。


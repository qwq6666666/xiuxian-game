# 專案說明

文字修仙遊戲，放置掛機 × 人生模擬。純前端，無後端。

- 設計：`docs/GDD.md`。開工前先讀對應章節。
- 世界觀：`docs/WORLD.md`。
- 進度與待辦：`docs/TODO.md`。新工作階段先讀它。
- 交接：`docs/handoff/claude.md`，完成一段就在最上面追加一筆。

## 技術棧

- TypeScript + Vite，不用 UI 框架，直接操作 DOM。
- 測試用 Vitest，存檔用 localStorage。

## 指令

```
npm run dev      # 開發伺服器
npm run test     # 單元測試
npm run sim      # 無介面模擬並輸出統計
npm run build    # 型別檢查加建置
npm run verify   # 測試、建置、建置檔大小檢查
```

## 目錄

```
src/core/        遊戲邏輯，純函式
  根目錄         主迴圈：state、save、events、tick、life、actions、offline、formulas、rng
  character/     角色與修行：突破、年號、回顧、目標、疲勞、運功、行止、心法、宗門、殘卷
  craft/         煉丹、煉器
  combat/        遇怪、秘境
  world/         世界生成：地形、格網、領土、關係、旅行
  util/          雜訊、堆
src/data/        JSON 資料（境界、事件、物品、天賦、設定）；事件在 events/
src/ui/          畫面與事件綁定
  scene/         洞府、戶外、手部、過場
  map/           天下圖與地圖繪製
  panels/        側欄面板與資訊卡
  styles/        CSS，色碼只在 tokens.css
src/main.ts      計時，串接 core 與 ui
scripts/         sim 模擬腳本與策略
tests/           測試；core/、ui/ 為分區，根目錄是架構、風格、視角等全域檢查
docs/            GDD、WORLD、TODO、handoff、prototypes、archive
```

## 架構規則

- `core/` 形式是 `(狀態, 輸入) → 新狀態`，沒有瀏覽器也能跑完一世。
- `core/` 禁用 `Math.random`、`Date.now`、DOM，也不得 import `ui/`。亂數走種子產生器，時間由外部傳入。
- 世界生成不消耗 `rngSeed`，用 `deriveSeed`。世局效果是年齡的函式，不進存檔。
- 數值放 `src/data/` 或 `src/core/formulas.ts`，不寫死在邏輯裡。
- 新增事件、物品、天賦只改 JSON。做不到代表資料格式要擴充，先提出來。
- 載入 JSON 要做格式檢查，錯誤訊息指出哪一筆的哪個欄位。
- 存檔帶 `version`。改存檔結構必須升 `SAVE_VERSION`、寫遷移函式、更新 `tests/save-shape.json`。
- UI 只改 `src/ui/`。色碼只寫在 `src/ui/styles/tokens.css`。
- `core/` 每個公式都要有單元測試。
- 上述規則由 `tests/architecture.test.ts`、`tests/style.test.ts` 守住。

## 語言規則

- 玩家可見文字用繁體中文、台灣用語。
- 敘述一律第一人稱「我」。別人說的話放進「」，裡面才可稱「你」。
- 識別字、檔名、commit 訊息用英文；註解用繁體中文。
- 事件文字每段不超過三句。
- 語氣是正經仙俠帶一點冷面吐槽。寫前先讀 GDD 第 17 節。
- 數值變化由介面顯示，不寫進敘述。
- 地名、勢力、位階只用 `docs/WORLD.md` 列出的。要新增先提出來。
- WORLD 第 14.3 節的真相只能經由殘卷揭露。
- 地名勢力用 `{guard}` 等名稱欄位，不寫死（見 WORLD 第 20 節）。
- 少年事件不能限定「凡人」。事件池大時，連鎖後段權重要拉高。
- 抉擇事件的第一個選項必須是無成本、無風險的預設。

## 工作方式

- 依 GDD 第 14 節里程碑順序，一次只做一個。
- 開工前先提實作計畫，確認後再寫程式。
- 沒有「不做」清單。新系統照上面流程提案即可。
- 里程碑結束前：測試全過、瀏覽器實測驗收條件、commit。
- 動存檔欄位、`types.ts`、共用核心函式前，先在 `docs/TODO.md` 並行預約表登記。
- GDD 數值是初始猜測，第 13 節節奏目標才是規格。調數值要用 `npm run sim` 佐證並更新 GDD。
- 瀏覽器驗證用 `preview_start`（`.claude/launch.json` 的 `dev`），不要用 Bash 跑開發伺服器。
- 要改 localStorage 存檔時，用遊戲內「匯入存檔」，否則頁面卸載會覆蓋。
- 換行一律 LF。Windows 用 Python 讀寫要 `newline=''`。改完看 `git diff --stat`，整檔重寫代表換行被改了。

## 調數值後的模擬檢查

動任何數值、事件、間隔之後：

1. 跑 `npm run sim -- 300 1 1 simple` 與 `... 300 1 16 simple`。再跑 `mixed`，再跑 `... 300 1 40 post`（約 30 秒）。第 13 節對照全 ✓ 才算過。
2. 回歸：`herb`、`wander`、`alchemy`。第一世止步不得高於 `simple`。
3. 上限：`forge`、`hunt`、`trial`、`method:<id>`。首次金丹中位數不得低於第 7 世。第 13 節顯示 ✗ 是預期。
4. 貼邊指標要留意：
   - 首次金丹中位數 8–10 世
   - 通關時間
   - 集滿 14 份殘卷
   - `mixed` 每世抉擇事件約 15.9（上限 17）
   - 第一世見到突破鈕約 33%（下限 30%）
   - 首次築基第 2–3 世
   - `post` 首次元嬰累計約 12.4 小時（上限 13）

輸出很長，可交給 `sim-checker`。

## 子代理分工

主助手負責設計、審查、合併、決定 push。

| Agent | 用途 |
|---|---|
| `core-dev` | 改 core、data 結構、存檔遷移、測試 |
| `ui-dev` | 改 `src/ui/`，瀏覽器實測 |
| `content-writer` | 寫事件與文字 JSON |
| `content-reviewer` | 審文字是否合語言規則 |
| `sim-checker` | 跑完整 sim 檢查 |
| `verify-runner` | 跑 verify 並濃縮結果 |
| `doc-keeper` | 同步 TODO、GDD、交接檔 |

- 兩個寫檔 agent 同時工作，要用 worktree 隔離（`isolation: "worktree"`），不共用工作目錄。
- 一個檔案同時只讓一個 agent 改。大型資料檔先認領。

## Git

- commit 訊息用英文，結尾加系統提示指定的 `Co-Authored-By`。
- 功能分支用 `ai/claude-m<編號>`。平行作業用 git worktree。
- 工作區有不是自己改的變更時，不動也不 commit，先回報。
- 不 force push，不改寫已 push 的歷史。
- 不 commit 金鑰、個人資料、`node_modules`、`dist`、`live.html` 等產物。
- 圖片要壓縮（JPEG／WebP，寬度不超過顯示的兩倍）。圖會內嵌進單一 `index.html`，超過 1500 KB `verify` 會失敗。

### 何時 push 到 origin

完成一個里程碑或階段並 commit 後要 push，但必須全部符合：

1. 內容已 commit，是完整單位，不推做到一半的東西。
2. `npm run verify` 全過（含 `npx tsc --noEmit`）。
3. 動過數值、事件、間隔的，sim 檢查全 ✓。改存檔結構的，遷移與測試都在。
4. push 前先 `git fetch`；遠端有新 commit 就先 rebase 並重跑第 2 點。
5. 使用者說「先不要 push」，或這段對話沒有明確要 push 的工作時，不自行 push。

`master` 推送會觸發部署，整合完再推一次，推完查 GitHub Actions。

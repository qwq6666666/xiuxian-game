# Claude 交接紀錄

> 新的一筆寫在最上面。格式見 `AGENTS.md`「兩位助手的職責」。

## 2026-10-06：改變玩法的輪迴天賦（M44，GDD 第 46 節）

- 分支 `master`（本機，尚未 push）。擇身、夙願、靈犀三個天賦；存檔 v26。核心：`core/chart.ts`、`wish.ts`、`omen.ts`，`life.ts` 把抽命盤抽成 `drawChart`，`events.ts` 加 `pickOutcome` 與夙願權重；資料：`talents.json`（新增三個並重排推薦順序）、`goals.json`（`tilt`、新目標「遇見故人」）、`reunion.json`（設 `reunion_met`）、`config.json` 三個數值。介面：擲骰畫面夙願與備選命盤區塊、抉擇彈窗窺看鈕（`rollview.ts`、`render.ts`、`components.css`）。sim 新增 `chart`／`wish`／`omen`。
- 驗證：`npm run verify`；`tests/talents44.test.ts` 與 `ui-smoke.test.ts` 新增測試；`simple` 1／16 世、`mixed` 1 世在改核心前後逐字相同；瀏覽器看過擲骰畫面（兩份備選命盤、九個夙願選項、改選命盤會清夙願）與抉擇彈窗窺看。sim：三個策略首次金丹不低於第 8 世（見 GDD 第 46 節）。
- 沒驗證：手機寬度的擲骰畫面（區塊變長）；2 級夙願的清單很長（九個，只是記號的排後面）；靈犀實際玩起來的手感；`method:*`。
- 給 ChatGPT（請看一眼）：擲骰畫面兩個新區塊的版面與文案、窺看鈕與「吉兆／凶兆」標示、夙願清單太長時要不要收合。

## 2026-10-06：介面表現強化（M43，GDD 第 45 節）

- 分支 `master`（本機，尚未 push），五個 commit：場景、過場、日誌、事件彈窗、未開放分頁。新增 `ui/sceneLogic.ts`、`veil.ts`、`logGroups.ts`、`tabinfo.ts`、`styles/transition.css`；改 `scene.ts`、`render.ts`、`vignette.ts`、`format.ts`（修為變化小數）、`tokens.css`（`--veil-ink`、`--veil-ms`、`--z-veil`、`--scene-hair`）。
- 驗證：`npm run verify` 全過（624 個測試，建置檔 1152 KB）；`simple` 1／16 世與 `mixed` 1 世的 sim 輸出與動工前（`ebea0b3`）逐字相同；瀏覽器：桌面與 375px 看過場景（少年、老年、各境界、四種背景）、四種過場的畫面與跳過、日誌分段與標記、好壞事件彈窗、凡人的「煉製」頁。
- 沒驗證：過場的動畫只用 Web Animations 暫停在指定時間點截圖（真實播放在背景窗格會被節流）；`prefers-reduced-motion` 只有單元測試，沒用系統設定實測；低階手機效能；iOS Safari 的 `mask-size` 動畫。
- 給 ChatGPT（請看一眼，這些是你的區域）：場景景物的形狀與顏色（`scene.ts`、`scene.css` 的 `.sc-set-*`）、過場的節奏與字距（`veil.ts` 的 `VEIL_MS`）、「代價」「後續」的視覺。事件彈窗的 `color-mix` 底色需要你看手機實機。
- 已知：頁面卡頓（兩影格相隔超過 `frameGapSeconds`）時 `main.ts` 走離線補算；壽元剩不到 10% 時補算不動，期間遊戲時間會被捨棄。內建瀏覽器窗格背景時 rAF 被節流，會看到遊戲在壽元將盡時停住，一般瀏覽器不會。

## 2026-10-06：日常安排的價值（M42，GDD 第 44 節）

- 分支 `master`（本機，尚未 push）。`scripts/simulate.ts` 新增 `rotate` 策略；`schedules.json` 採藥靈石 3→2；`events/reunion.json`、`chains.json` 加 `scheduleWeights: { wander: 3 }`。核心與存檔不動。
- 驗證：`npm run verify`；sim（種子 1、2）simple、mixed 1／16 世逐項不變，`post` 全 ✓（元嬰累計 12.2 小時 ✗ 是 PLAYTEST 舊問題），`rotate` 首次金丹第 7 世，`herb`／`wander`／`alchemy`／`forge`／`hunt`／`focus` 與預期一致。測試中寫死「採藥 3 靈石」的三處改成讀資料。
- 沒驗證：玩家實際輪流出門的手感；走訪掛故人後實際遇到的頻率（只改權重，沒單獨量測）；`method:*`。
- 給 ChatGPT（UI 需求）：安排卡（`src/ui/derived.ts` 的 `scheduleFacts`、`render.ts` 安排區）加一行「靈石可換修為」：例如採藥「每月 2 靈石，約可買 0.1 顆聚氣丹」。聚氣丹價格與效果在 `items.json`，換算不要寫死數字；畫面目前只顯示每月修為，容易讓玩家以為出門很虧。

## 2026-10-06：最後一次叩關（M41，GDD 第 43 節）

- 分支 `master`（本機，尚未 push）。事件 `lianqi_last_push`（`src/data/events/lianqi.json`，文字是我寫的草稿，請 ChatGPT 審稿）；格式擴充見 GDD 43，核心改動只在 `core/events.ts`（條件與兩個效果）與 `core/breakthrough.ts`（匯出 `forceBreakthrough`、`forceBreakthroughFail`）。存檔不升版。sim 新增 `最後一次叩關` 統計行。
- 驗證：`npm run verify`；`tests/lastpush.test.ts`（條件、必出、成敗、回顧排第一、格式錯誤）；瀏覽器匯入練氣八層、剩 5 年的存檔，彈窗與失敗路徑日誌正常。sim：種子 1、2 的 `simple`／`mixed`、`focus`、`forge`、`hunt`、`herb`、`wander`、`alchemy`、`post` 都跑了，首次築基中位數仍是第 2 世。
- 沒驗證：衝關成功路徑的畫面（只用單元測試驗）；手機寬度；成功率手感（12% 起算，實測 9–18%）；`method:*`。
- 注意：`post` 40 場樣本的邊緣指標會抖動（種子 2：突破鈕 27.5%、元嬰到化神 9.6 小時，加事件前是 30.0%、9.0）；100 場種子 2 回到 35.0% ✓、9.0 ✓。種子 3、4 的 40 場有「首次元嬰累計 12.5 小時」超標，與 PLAYTEST 記的舊問題一致（TODO 仍開著），不是這次造成；種子 4 的 40 場突破鈕 25% 是抽樣誤差，機制上事件不影響突破鈕。

## 2026-10-06：掛機體驗（M40，GDD 第 11、37 節）

- 分支 `master`（本機，尚未 push）。背景分頁回到前景用 `applyOffline(..., { minSeconds, speed })` 一次補算（離線閉關規則；`config.json` 新增 `backgroundMinSeconds` 5、`frameGapSeconds` 2）；畫面卡住也走同一條。運功改積蓄：存檔 v25 新增 `focusStored`、`config.focusMaxCharges` 10、`accrueFocus` 在 `tick` 與離線補算每月呼叫；一次用掉全部；v24 遷移補 1 次或維持計時。新的一世計時起點為起始年齡。介面：運功鈕「運功×N +gain」（`render.ts` 一行，請 ChatGPT 看一眼）。
- 驗證：`npm run verify`；單元測試新增積蓄、上限、離線積蓄、前景補算參數、v24 遷移；瀏覽器（桌面）：分頁背景約 40 秒回來，年齡 11歲2月→14歲8月、修為 9→36、日誌通知「閉關 3 年 4 個月」、鈕顯示「運功×10 +3」。sim（種子 1）：simple 1／16 世、mixed 1／16 世、`40 post` 全 ✓（`post` 首次元嬰 11.8 小時）；`focus` 首次金丹第 7 世（不得低於 7，✓）、`forge` 第 7 世 ✓、`hunt` 第 13 世 ✓、`herb`／`wander`／`alchemy` 預期的 ✗ 與回歸檢查一致。
- 沒驗證：實際切走整整 2 分鐘（只驗約 40 秒，機制相同）；手機寬度；`method:*` 策略（沒動到心法）；速度 ×4 的補算。注意 `focus` 策略首次金丹中位數是第 7 世（M33 紀錄為第 8 世，原因未查：M34–M39 的內容改動與這次都有可能）：仍在下限，但已貼邊，日後別再加修煉加成。
- 並行預約：存檔 v26 與 M41 未佔用。

## 2026-10-06：render.ts 拆檔（純搬移，不改行為）

- 分支 `ai/claude-render-split`，已合併進 `master`。`src/ui/render.ts` 由 1807 行拆成 836 行，搬出：`dom.ts`（`el`、`button`）、`modals.ts`（彈窗焦點、一生回顧、輪迴天賦）、`overlays.ts`（殘卷錄、天下圖、收藏）、`rollview.ts`（擲骰畫面與共用 HTML 片段）、`panels.ts`（突破、背包、天劫、歷練、宗門、資源列、屬性明細、煉丹）。
- 各模組都是 `createXxx(ctx)` 或純函式；`LifeEls`、`SIDE_TABS`、`SideTab`、`UiHandlers` 仍由 `render.ts` 匯出。`tests/style.test.ts` 改成讀 `src/ui/` 下所有 `.ts`（`worldmap.ts` 除外）。
- 驗證：`npm run verify` 全過（590 個測試，建置檔 1137 KB）；桌面寬度在瀏覽器掛測試狀態檢查了各彈窗、面板與按鈕觸發。
- 沒驗證：手機寬度、宗門面板、整世實跑。
- 給 ChatGPT：`render.ts` 預約已解除。你分支上若有動 `render.ts` 的改動，請先 `git fetch && git rebase origin/master`，把改動對到新檔案；衝突多的話先在交接檔說一聲。

## 2026-10-06：歷練遇怪（M34，GDD 第 38 節）

- 分支 `ai/claude-m34`。外出歷練每月 15% 遇怪（凡人到元嬰共 12 種，`src/data/monsters.json`），時間暫停，玩家選穩打、強攻、符籙（耗避雷符）或逃；3 回合內打倒得修為、靈石與靈砂／靈草，敗損 5% 修為，打滿平手。核心在 `src/core/encounter.ts`，亂數走派生種子；`monthlyGain` 抽到 `src/core/gain.ts` 避免循環匯入（`tick.ts` 仍匯出它）。存檔 v22 新增 `encounter`。介面：遭遇視窗（`render.ts` 的 `renderHunt`、`vignette.ts` 的 `huntVignetteHtml`）。
- 驗證：`npm run verify` 全過（564 個測試，新增 `tests/encounter.test.ts` 17 個）；sim：`simple`／`herb`／`wander`／`alchemy` 與 master 逐位元相同，`mixed`、`post`、`focus`、`forge` 全 ✓（`post` 的第一世突破鈕 40 場樣本 27.5%，同策略 `mixed` 300 場 35.7%，視為抽樣誤差）；`hunt` 首次金丹第 12 世、通關 6.2 小時；瀏覽器桌面與 375px：遭遇視窗、氣血條、回合推進、結束後日誌（修為 −1）。
- 沒驗證：玩家實際手感（強攻與穩打的取捨是否有意思）、勝率 58% 是否剛好；敗北在預設打法下為 0%（只穩打或逃），玩家手動強攻才會敗；怪物文字未經 ChatGPT 審稿；遇怪頻率（每 6–7 個月一次）在實際遊玩是否過密。
- 給 ChatGPT（可選）：怪物文字（`monsters.json` 的 `appear`、`win`、`rules.text`）與遭遇視窗的視覺（怪物剪影、命中時的閃動）可再細修；`monsters.json` 在 `src/data/`，要改請在這裡提需求。

## 2026-10-06：視覺與操作感強化（M33，GDD 第 37 節）

- 動態場景、圖示系統、事件配圖、運功（點擊加速，存檔 v21）、天劫凝神光圈；使用者回報純文字會疲乏，由他選定範圍。細節與數值見 GDD 37。
- 驗證：`npm run verify` 全過（547 個測試）；既有策略 sim 不變，`focus` 策略首次金丹第 8 世 ✓；瀏覽器桌面與 375px：場景（凡人到金丹的色調、煉丹的爐）、事件配圖、運功鈕、天劫光圈與三個選項。
- 沒驗證：場景動畫在低階手機的效能；天劫光圈的時間窗手感（只驗了結構與動畫存在，沒有用滑鼠實際計時）；元嬰與化神的場景色調只看了 CSS 變數；運功在 ×4 速度下的冷卻（以月計，快速時會更頻繁但整體上限不變）。
- 給 ChatGPT（可選）：場景構圖可再細修（山形、人物剪影、季節落物）、事件配圖可補更多主題；音效尚未做。
- 順手修正：開場引路事件的年齡上限 14→19（第一世原本只有約 36% 會出現）。

## 2026-10-06：介面階段 B（煉製回饋與捷徑）

- 煉丹面板：爐中進度條（`.brew-bar`）；煉丹或煉器有結果時煉製頁閃一下（金框＝成功、朱砂框＝失敗或收爐），人在別的分頁時「煉製」分頁列亮提示點，進入後清除。資源列材料夠時多出「可煉○○」提示（最多兩個）。行囊的聚氣丹多於一顆時有「連服」鈕（`useAll`，到丹毒上限或瓶頸為止）。分頁切換有淡入。
- 驗證：`npm run verify` 全過（533 個測試）；瀏覽器：資源列提示、連服鈕、收爐後提示點；375 與 360px 無橫向捲動；事件彈窗在 360px 蓋過固定分頁列。
- 沒驗證：進度條在煉丹「進行中」的實際畫面（測試時材料已被前一爐用盡，只驗了結構與單元測試）；天劫彈窗與分頁列疊層（與事件彈窗同層級，未另測）。

## 2026-10-06：介面階段 A（分頁、資源列、文字精簡）

- 側欄原本約 4800px 高，現在分四頁（修行／煉製／行囊／角色），一次只顯示一頁（約 660–1700px）；手機分頁列固定在底部。狀態卡下新增常駐資源列（丹藥、法寶、材料、煉丹進度、非預設心法，點了跳到對應分頁）。
- 文字精簡：效率行（「修為 3.2／月・5.3 年一事」）、物品說明、各面板提示與按鈕標籤（日誌、目標、明細、世局等）。事件文字沒動。
- 驗證：`npm run verify` 全過；瀏覽器桌面與 375px：四頁切換、資源列、無橫向捲動。沒有動數值與存檔。
- 沒驗證：360px；事件彈窗與天劫彈窗在固定底部分頁列下的疊層（`--z-menu` 低於彈窗，邏輯上沒問題，未實測）。
- 給 ChatGPT（可選）：行囊分頁的坊市清單仍偏長；煉器清單可再收合；分頁切換可加淡入動畫（沿用 `--dur-*`）。

## 2026-10-06：補築基期事件 15 則（Claude 代寫）

- 新增 `src/data/events/zhuji.json`（已在 `load.ts` 登記）：15 則**只在築基期出現**的事件（`realmMax: "zhuji"`），9 則抉擇、6 則見聞：還鄉、苦井、舊債、茶棚閒話、探問丹價、關隘不動（瓶頸時）、石壁刻痕（給二層殘卷）、山洪之後、講席請帖、夢中渡口、壽元過半、山中丹師、護一程、山門外的孩子與其後續「故人之後」（旗標 `zhuji_orphan_fed`，權重 30）。語氣依 GDD 17 與 WORLD 第 3 節（築基：鄭重、少吐槽）；沒寫戰鬥、拜師、第 14.3 節內容、寫死的地名。
- 驗證：`npm run verify` 全過（532 個測試，新增 `tests/zhujievents.test.ts`）；這會改變築基期之後的亂數序列，所以 sim 基準不再與先前逐字相同，改以第 13 節對照：simple、mixed 的 1 世與 16 世全 ✓（mixed 抉擇事件 16.6，上限 17，貼邊）；herb／wander 4.4–4.5 層、sect 與 forge 首次金丹第 7 世皆維持；`post` 元嬰累計 12.6 小時仍是上一筆提到的既有超標。
- 給 ChatGPT（可選）：日後審稿語氣、補更多築基期事件；注意 mixed 的每世抉擇事件已 16.6，再加抉擇型事件前要先降權重或改寫成見聞。

## 2026-10-06：M30 煉器與法寶、當前數值面板完成

- 分支：`ai/claude-m30`（合併後以 `master` 為準）。細節見 `docs/GDD.md` 33.6；存檔 v20。
- 驗證：`npm run verify` 全過（527 個測試）；既有七種策略 16 世與 master 逐字相同；`forge` 最壞情況 ✓（首次金丹第 7 世）；瀏覽器匯入帶材料存檔，實際裝備聚靈盤、煉出護心鏡，日誌、背包分段、375px 無橫向捲動。
- 新介面：角色區的「當前數值」（`src/ui/statinfo.ts`，每月修為連乘明細、突破率、失敗損失、壽元、事件間隔）；煉丹面板下方的「煉器」；背包頂端的裝備欄與「法寶」一段。
- 沒驗證：「本命」天賦在輪迴頁的顯示（走既有天賦列表，未實際點開）；轉世後法寶出現在擲骰畫面背包的實際畫面（單元測試涵蓋）；修行畫面沒有顯示目前心法。
- 給 ChatGPT（可選）：當前數值面板與煉器面板的樣式與動畫；法寶圖示；`WORLD.md` 第 11 節「神兵」條目我還沒改（法寶描述維持無名有姓、無上古傳說的語氣）。**我動了 `src/ui/render.ts`、`alchemyinfo.ts`，請看一眼。**

## 2026-10-06：M31 心法完成

- 分支：`ai/claude-m31`（合併後以 `master` 為準）。細節見 `docs/GDD.md` 35.6；存檔 v19（`methodId`）。
- 驗證：`npm run verify` 全過；既有七種策略 16 世與 master 逐字相同；`method:*` 四種策略都 ✓（疾行訣首次金丹第 7 世，剛好在下限）；瀏覽器匯入「集到 9 份殘卷」的擲骰存檔，選了疾行訣，遊塵訣顯示「集到 12 份才能選」；375px 沒有橫向捲動。
- 沒驗證：選了心法之後進入修行畫面的狀態卡沒有顯示目前心法（目前只在擲骰畫面可見）；ChatGPT 可在角色區補一行。
- 給 ChatGPT（可選）：心法區的樣式（`.methods`）沿用 `.choices` 按鈕；`WORLD.md` 第 11 節「功法」避免條目我還沒改，心法描述請維持「吐納法門」的語氣。

## 2026-10-06：M29 材料與煉丹完成

- 分支：`ai/claude-m29`（合併後以 `master` 為準）。設計取捨見 `docs/GDD.md` 32.6；存檔 v18（`alchemy`）。
- 重點：材料掉落走 `schedules.json` 的 `drops`，用 `deriveSeed` 衍生亂數，**不動 `rngSeed`**，所以既有六種策略 1 世與 16 世的 sim 與 master 逐字相同。新增 `alchemy` 策略（最壞情況）：聚氣丹的藥力遞減把它擋住，第一世止步 4.8 層（simple 8.3）、16 世通關 6%。
- 驗證：`npm run verify` 全過（498 個測試）；瀏覽器匯入帶材料的存檔，實際開爐、出丹、失敗退料、材料用盡收爐，日誌文字正確；375px 沒有橫向捲動。
- 沒驗證：360px 版面；煉丹期間遇到事件彈窗的畫面（邏輯上事件與煉丹互不干涉，未實測）；避雷符的煉製（需築基，單元測試有覆蓋開爐條件，沒在瀏覽器走完整一爐）。
- ChatGPT 可選的後續（等額度恢復）：煉丹面板的動畫（進度、出丹／失敗的短暫回饋）、材料與丹藥的圖示、`log.alchemy` 文字潤飾（`text.json`）。**我在 `src/ui/` 加了 `alchemyinfo.ts` 與 `render.ts` 的 `renderAlchemy`、背包分組，請 ChatGPT 之後看一眼。**

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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const UI = join(__dirname, "..", "src", "ui");
const tokensText = readFileSync(join(UI, "styles", "tokens.css"), "utf8");
const responsiveText = readFileSync(join(UI, "styles", "responsive.css"), "utf8");
// render.ts 拆檔後，畫面程式分散在 ui/ 下多個檔案，一併當作畫面原始碼檢查
const renderText = readdirSync(UI)
  .filter((f) => f.endsWith(".ts") && f !== "worldmap.ts")
  .map((f) => readFileSync(join(UI, f), "utf8"))
  .join("\n");
const mapText = readFileSync(join(UI, "styles", "map.css"), "utf8");
const worldMapText = readFileSync(join(UI, "worldmap.ts"), "utf8");

/** 讀出 tokens.css 裡 --name: #rrggbb 的色票 */
function colorTokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tokensText.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("樣式 token", () => {
  const c = colorTokens();

  it("文字色在頁面底、面板、凹陷處上的對比 ≥ 4.5:1", () => {
    for (const text of ["text", "muted", "accent", "warn", "bad", "good"]) {
      for (const ground of ["bg", "panel", "sunken"]) {
        expect(contrast(c[text], c[ground]), `${text} 在 ${ground} 上`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("進度條上的文字在填色上的對比 ≥ 4.5:1", () => {
    expect(contrast(c.text, c["accent-dim"])).toBeGreaterThanOrEqual(4.5);
  });

  it("邊線與底色要看得出來，但不能比文字更搶眼", () => {
    expect(contrast(c.line, c.panel)).toBeGreaterThan(1.2);
    expect(contrast(c.line, c.panel)).toBeLessThan(contrast(c.muted, c.panel));
  });

  it("地圖標記填色與共用描邊的對比 ≥ 3:1", () => {
    for (const marker of ["map-stairs", "map-ferry", "map-broken", "map-merchant", "map-mountain", "map-fallen", "map-gray"]) {
      expect(contrast(c[marker], c["map-marker-outline"]), marker).toBeGreaterThanOrEqual(3);
    }
  });

  it("除了 tokens.css，介面樣式與程式都不寫死色碼", () => {
    const files = [
      ...readdirSync(join(UI, "styles")).filter((f) => f !== "tokens.css").map((f) => join(UI, "styles", f)),
      join(UI, "style.css"),
      ...readdirSync(UI).filter((f) => f.endsWith(".ts")).map((f) => join(UI, f)),
      // 地圖繪製的子資料夾也要掃；只有 color.ts 負責把資料裡的色值格式化成 rgba()，其餘不得出現
      ...readdirSync(join(UI, "mapart")).filter((f) => f.endsWith(".ts") && f !== "color.ts").map((f) => join(UI, "mapart", f)),
    ];
    for (const f of files) {
      const hits = readFileSync(f, "utf8").match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
      expect(hits, `${f} 有寫死的色碼`).toEqual([]);
    }
  });

  it("所有 var(--名稱) 都有在 tokens.css 定義", () => {
    const defined = new Set([...tokensText.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const files = [...readdirSync(join(UI, "styles")).map((f) => join(UI, "styles", f)), join(UI, "style.css")];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/var\(--([a-z0-9-]+)/g)) {
        expect(defined.has(m[1]), `${f} 用了未定義的 --${m[1]}`).toBe(true);
      }
    }
  });
});

describe("手機工具列", () => {
  it("維持單列，並把次要入口收進更多選單", () => {
    expect(responsiveText).toMatch(/\.bar\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(responsiveText).toContain("#codex-open, #map-open, #collection-open { display: none; }");
    expect(renderText).toContain('mode === "game" || isPhone');
    for (const id of ["mobile-codex-open", "mobile-map-open", "mobile-collection-open"]) {
      expect(renderText).toContain(`id="${id}"`);
    }
  });
});

describe("長通知", () => {
  const layoutText = readFileSync(join(UI, "styles", "layout.css"), "utf8");

  it("保留 status 語意、提供關閉鈕，文字可換行且不擠掉按鈕", () => {
    expect(renderText).toMatch(/<div id="notice" role="status" hidden>/);
    expect(renderText).toContain('id="noticeClose" type="button" aria-label="關閉提示"');
    expect(renderText).toMatch(/finishNotice = [^]*?noticeEl\.hidden = true/);
    expect(renderText).toMatch(/#noticeClose[^\n]+finishNotice/);
    expect(layoutText).toMatch(/#noticeText\s*\{[^}]*flex:\s*1 1 20em[^}]*overflow-wrap:\s*anywhere/);
    expect(layoutText).toMatch(/#notice button\s*\{[^}]*flex:\s*0 0 auto/);
  });
});

describe("手機回顧彈窗", () => {
  const componentsText = readFileSync(join(UI, "styles", "components.css"), "utf8");

  it("內層可縮窄，操作列黏附底部且手機按鈕等寬", () => {
    expect(renderText).toContain('class="card review life-review-card"');
    expect(renderText.match(/actions review-actions/g)).toHaveLength(2);
    expect(componentsText).toMatch(/\.life-review-card, #modalBody\s*\{[^}]*min-width:\s*0/);
    expect(componentsText).toMatch(/\.review-actions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/);
    expect(responsiveText).toMatch(/\.review-actions button\s*\{[^}]*flex:\s*1 1 0/);
  });
});

describe("手機地圖旅行", () => {
  it("手機首屏只留地圖、圖層鈕與資訊卡，選單不溢出且啟程鈕可單手點擊", () => {
    expect(mapText).toMatch(/\.map-pane\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
    expect(mapText).toMatch(/@media \(max-width: 760px\)[\s\S]*\.map-card > \.map-sub[^{]*\{[^}]*display:\s*none/);
    expect(mapText).toMatch(/\.map-chip-toggle span\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(mapText).toMatch(/\.map-destination\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
    expect(mapText).toMatch(/\.map-travel-go\s*\{[^}]*width:\s*100%[^}]*min-height:\s*var\(--tap\)/);
    expect(worldMapText).toContain('"primary map-travel-go"');
  });
});

describe("地圖鍵盤操作", () => {
  it("每個可點標記可聚焦，並以 Enter 或空白鍵選取", () => {
    expect(worldMapText).toContain('action.setAttribute("role", "button")');
    expect(worldMapText).toContain('action.setAttribute("tabindex", "0")');
    expect(worldMapText).toContain('action.setAttribute("aria-label", describeTarget(target, world, snap, data).title)');
    expect(worldMapText).toContain('ev.key !== "Enter" && ev.key !== " "');
    expect(renderText).toContain('document.activeElement?.classList.contains("map-hit")');
    expect(renderText).toContain('el.getAttribute("aria-label") === focusedMapLabel');
    expect(mapText).toMatch(/\.map-hit:focus-visible\s*\{[^}]*map-marker-focus/);
  });
});

describe("遊戲介面的擲骰頁", () => {
  const css = readFileSync(join(UI, "styles", "gamemode.css"), "utf8");
  it("擲骰頁（一張長卡片）在遊戲介面時舞台可以捲動，導航列與日誌行先收起", () => {
    expect(css).toMatch(/#stage:has\(> \.roll\)\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/:has\(#stage > \.roll\) \.game-nav/);
  });
});

describe("M62 第一人稱場景動態", () => {
  const caveText = readFileSync(join(UI, "styles", "cave.css"), "utf8");
  const baseText = readFileSync(join(UI, "styles", "base.css"), "utf8");

  it("左右轉身使用相反方向的位移進退場", () => {
    for (const name of ["cave-leave-right", "cave-enter-right", "cave-leave-left", "cave-enter-left"]) {
      expect(caveText).toContain(`@keyframes ${name}`);
    }
    expect(caveText).toMatch(/\.cave-view\.turn-leave-right\s*\{[^}]*animation:[^;]*var\(--dur-turn\)/);
    expect(caveText).toMatch(/\.cave-view\.turn-enter-left\s*\{[^}]*animation:[^;]*var\(--dur-turn\)/);
  });

  it("六個場景動作共用手部層，動畫時間隨流速縮短且不延遲操作", () => {
    expect(renderText).toContain('import { sceneHands } from "./firstPersonHands"');
    expect(renderText).toContain('class="fp-overlay"');
    for (const action of ["focus", "brew", "pill", "bag", "scrolls", "schedule"]) {
      expect(renderText).toContain(`\"${action}\"`);
      expect(caveText).toContain(`data-action="${action}"`);
    }
    expect(renderText).toContain('run(action)');
    expect(renderText).toContain('ACTION_MS / Math.max(1, state.speed)');
  });

  it("手只在洞府前視角常駐，其餘面向與洞外淡出，操作時才淡入", () => {
    expect(caveText).toMatch(/\.cave:not\(\[data-facing="front"\]\) \.fp-hands/);
    expect(caveText).toMatch(/\.cave:not\(\[data-setting="cave"\]\) \.fp-hands\s*\{[^}]*opacity:\s*0/);
    expect(caveText).toMatch(/\.cave\.acting \.fp-hands\s*\{[^}]*opacity:\s*0\.86/);
  });

  it("減少動態效果時沿用全域規則關閉場景動畫與位移", () => {
    expect(baseText).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/);
  });
});

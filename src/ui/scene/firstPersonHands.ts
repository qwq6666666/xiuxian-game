// 第一人稱共用手部：主場景使用 450×600 座標，事件小景使用自己的 400×120 座標。
// 動作只由外層 class 控制，這裡不綁遊戲狀態，也不攔截任何操作。

/** 主場景常駐前景手部；光圈留在同一層，運功時才由 CSS 顯示。 */
export function sceneHands(): string {
  return `<g class="fp-hands" aria-hidden="true">
    <g class="fp-hand fp-hand-left">
      <path class="cv-sleeve" d="M61 600 Q101 530 175 496 L223 522 Q159 552 147 600Z" filter="url(#ink)"/>
      <path class="fp-fold" d="M95 580 Q129 542 175 516 M121 590 Q149 560 185 536"/>
      <ellipse class="cv-hand" cx="211" cy="510" rx="23" ry="12"/>
    </g>
    <g class="fp-hand fp-hand-right">
      <path class="cv-sleeve" d="M389 600 Q349 530 275 496 L227 522 Q291 552 303 600Z" filter="url(#ink)"/>
      <path class="fp-fold" d="M355 580 Q321 542 275 516 M329 590 Q301 560 265 536"/>
      <ellipse class="cv-hand" cx="239" cy="510" rx="23" ry="12"/>
    </g>
    <path class="fp-fingers" d="M203 504 Q225 492 247 504"/>
    <g class="fp-focus-mark">
      <ellipse cx="225" cy="522" rx="120" ry="60" fill="url(#seal)"/>
      <circle class="sc-aura" cx="225" cy="500" r="54"/>
      <circle class="sc-aura sc-aura-outer" cx="225" cy="500" r="80"/>
    </g>
  </g>`;
}

/** 事件與遇怪配圖共用的袖子，保持短幅插圖原有的低視角構圖。 */
export function vignetteHands(height = 120): string {
  return `<g class="fp-vignette-hands" aria-hidden="true">
    <path class="vg-dark" d="M146 ${height} Q160 106 188 98 L199 108 Q176 114 170 ${height}Z"/>
    <path class="vg-dark" d="M254 ${height} Q240 106 212 98 L201 108 Q224 114 230 ${height}Z"/>
    <ellipse class="vg-hand" cx="193" cy="101" rx="8" ry="4"/>
    <ellipse class="vg-hand" cx="207" cy="101" rx="8" ry="4"/>
  </g>`;
}

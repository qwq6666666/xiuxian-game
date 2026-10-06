import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打包成單一 index.html（JS、CSS 全內嵌），可直接雙擊用 file:// 開啟
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // 統計型測試在 CI 的小機器上會變慢，預設 5 秒不夠
  test: { testTimeout: 30000 },
});

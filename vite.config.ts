import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 打包成單一 index.html（JS、CSS 全內嵌），可直接雙擊用 file:// 開啟
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});

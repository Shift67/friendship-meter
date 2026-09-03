import { defineConfig } from 'vite';

// base: './' 讓打包後的資源用相對路徑，能放在任何子目錄（含 GitHub Pages）直接開。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // 字體檔一律輸出成獨立檔，避免把 woff2 塞成 base64
    chunkSizeWarningLimit: 1500,
  },
});

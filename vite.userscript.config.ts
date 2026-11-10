// ============================================================
// vite.userscript.config.ts —— 油猴版构建（单文件 IIFE）
// 产物：dist-userscript/lingualens-lite.user.js（头部由 userscript-header.mjs 拼接）
// 版本单一真源与扩展一致：public/manifest.json
// ============================================================

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-userscript',
    emptyOutDir: true,
    target: 'chrome100',
    lib: {
      entry: 'src/userscript/main.ts',
      name: 'LinguaLensLite',
      formats: ['iife'],
      fileName: () => 'lingualens-lite.user.js',
    },
    rollupOptions: {
      output: {
        // 单文件：把 content 的 Readability 依赖一并内联
        inlineDynamicImports: true,
      },
    },
  },
});

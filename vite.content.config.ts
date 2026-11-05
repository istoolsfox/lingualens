import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// content script 独立构建：单文件 IIFE（MV3 内容脚本不支持 ESM）
// 不引入任何 CSS 文件——浮动栏样式以字符串注入 Shadow DOM
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome114',
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
      },
    },
  },
});

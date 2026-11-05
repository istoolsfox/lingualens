import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./sidepanel.html', './options.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖灰阶梯（亮侧为暖纸灰，暗侧 = G 变体暖黑纵深：#121212→#2a2a2a）
        ink: {
          50: '#f6f5f3',
          100: '#ecebe8',
          200: '#d9d9d4',
          300: '#c2c2bc',
          400: '#a6a6a0',
          500: '#8f8f89',
          600: '#5c5c57',
          700: '#3a3a37',
          800: '#1e1e1e',
          900: '#181817',
          950: '#121212',
        },
        // 主色 = kimi 蓝（G 变体 --brand #1a88ff）
        accent: {
          50: '#0d1b2e',
          100: '#12283f',
          200: '#1a4d7d',
          300: '#66b3ff',
          400: '#4da6ff',
          500: '#2b96ff',
          600: '#1a88ff',
          700: '#0f7ae8',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
      },
    },
  },
  plugins: [],
} satisfies Config;

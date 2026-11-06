import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./sidepanel.html', './options.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 白底单色系（用户定案 v0.4）：slate 灰阶 + 单一蓝色主色
        ink: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      fontFamily: {
        // 中文排版纪律：西文字体在前，中文字体在后，sans-serif 兜底
        // （缺 Segoe UI 时 Windows 的拉丁字形会落进雅黑，观感明显掉档）
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;

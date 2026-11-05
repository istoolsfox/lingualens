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
    },
  },
  plugins: [],
} satisfies Config;

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'fawn-amber': 'var(--color-brand)',
        'fawn-amber-light': 'var(--color-brand-light)',
        'sage-green': 'var(--color-success)',
        'sage-green-light': 'var(--color-mint)',
        'soft-charcoal': 'var(--color-text-primary)',
        'dark-gray': 'var(--color-text-secondary)',
        'mid-gray': 'var(--color-text-placeholder)',
        'oat-border': 'var(--color-border)',
        'warm-gray': '#F5F8F3',
        'warm-cream': 'var(--color-canvas)',
        'safety-red': 'var(--color-safety)',
        'safety-red-light': 'var(--color-safety-bg)',
        'warning-amber': '#F0A030',
        'warning-amber-light': 'var(--color-butter)',
        'info-blue': '#567B9C',
        'info-blue-light': 'var(--color-sky-soft)',
        'chart-reference': '#C8D2C8',
        'nursery-mint': 'var(--color-mint)',
        'nursery-butter': 'var(--color-butter)',
        'nursery-powder': 'var(--color-powder)',
        'brand-strong': 'var(--color-brand-strong)',
        'role-mom': '#B9785C',
        'role-dad': '#567B9C',
        'role-grandma': '#B07CC6',
        'role-grandpa': '#6BAF8D',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        bubble: 'var(--radius-bubble)',
        input: 'var(--radius-input)',
        chip: '9999px',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['SF Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 45px rgba(13, 28, 46, 0.06)',
        float: '0 20px 50px rgba(13, 28, 46, 0.10)',
        modal: '0 28px 70px rgba(13, 28, 46, 0.16)',
        topbar: '0 10px 40px rgba(167, 185, 159, 0.12)',
        tabbar: '0 -15px 50px rgba(13, 28, 46, 0.06)',
      },
      maxWidth: {
        mobile: '428px',
      },
    },
  },
  plugins: [],
};

export default config;

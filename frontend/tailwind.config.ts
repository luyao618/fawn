import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'fawn-amber': '#D4956A',
        'fawn-amber-light': '#F2DFD0',
        'sage-green': '#7FB685',
        'sage-green-light': '#DFF0E2',
        'soft-charcoal': '#2C2C2E',
        'dark-gray': '#636366',
        'mid-gray': '#8E8E93',
        'oat-border': '#E5DED5',
        'warm-gray': '#F2EDE8',
        'warm-cream': '#FFF9F4',
        'safety-red': '#E25B45',
        'safety-red-light': '#FDEEEB',
        'warning-amber': '#F0A030',
        'warning-amber-light': '#FFF3E0',
        'info-blue': '#5B9BD5',
        'info-blue-light': '#EBF3FB',
        'chart-reference': '#C8C0B8',
        'role-mom': '#D4956A',
        'role-dad': '#5B9BD5',
        'role-grandma': '#B07CC6',
        'role-grandpa': '#6BAF8D',
      },
      borderRadius: {
        card: '16px',
        bubble: '20px',
        input: '20px',
        chip: '16px',
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
        card: '0 1px 3px rgba(0,0,0,0.04)',
        float: '0 4px 12px rgba(0,0,0,0.08)',
        modal: '0 8px 24px rgba(0,0,0,0.12)',
      },
      maxWidth: {
        mobile: '428px',
      },
    },
  },
  plugins: [],
};

export default config;

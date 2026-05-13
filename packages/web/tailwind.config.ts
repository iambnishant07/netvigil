import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          bg:     '#030d1a',
          panel:  '#061525',
          border: '#0d3050',
          accent: '#00c8e0',
          map:    '#02080f',
          land:   '#0a2240',
          coast:  '#1a4060',
          grid:   '#0d2540',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

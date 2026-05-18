import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // ── Legacy navy palette (ThreatMap + Dashboard panels) ──────────
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

        // ── Design-system semantic tokens ────────────────────────────────
        surface: {
          app:    '#0f172a',  // slate-900
          card:   '#1e293b',  // slate-800
          raised: '#334155',  // slate-700
        },
        fg: {
          1:        '#f1f5f9',
          2:        '#e2e8f0',
          3:        '#cbd5e1',
          4:        '#94a3b8',
          muted:    '#64748b',
          disabled: '#475569',
        },
        severity: {
          critical: { DEFAULT: '#b91c1c', fg: '#fecaca', accent: '#f87171', chart: '#dc2626' },
          high:     { DEFAULT: '#ea580c', fg: '#ffedd5', accent: '#fb923c', chart: '#ea580c' },
          medium:   { DEFAULT: '#ca8a04', fg: '#fef3c7', accent: '#fbbf24', chart: '#ca8a04' },
          low:      { DEFAULT: '#1d4ed8', fg: '#dbeafe', accent: '#60a5fa', chart: '#1d4ed8' },
          info:     { DEFAULT: '#475569', fg: '#f1f5f9', accent: '#94a3b8', chart: '#64748b' },
        },
        status: {
          open:             { bg: '#7f1d1d', fg: '#fecaca' },
          acknowledged:     { bg: '#713f12', fg: '#fde68a' },
          confirmed:        { bg: '#7c2d12', fg: '#fed7aa' },
          'false-positive': { bg: '#334155', fg: '#cbd5e1' },
        },
        accent: {
          DEFAULT: '#4f46e5',
          hover:   '#6366f1',
          link:    '#818cf8',
          chip:    '#a5b4fc',
          subtle:  '#312e81',
        },
        live: '#34d399',
        gradient: {
          cyan:    '#22d3ee',
          blue:    '#3b82f6',
          violet:  '#8b5cf6',
          magenta: '#c026d3',
        },
      },

      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },

      fontSize: {
        eyebrow: ['11px', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '500' }],
        kpi:     ['30px', { lineHeight: '1.05', fontWeight: '700' }],
        hero:    ['96px', { lineHeight: '0.95', letterSpacing: '-0.025em', fontWeight: '800' }],
      },

      borderRadius: {
        card:  '8px',
        modal: '12px',
        badge: '4px',
        pill:  '9999px',
      },

      transitionDuration: {
        fast: '120ms',
        base: '150ms',
        slow: '250ms',
      },

      boxShadow: {
        modal: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
      },

      backgroundImage: {
        'logo-gradient':
          'linear-gradient(90deg, #22d3ee 0%, #3b82f6 35%, #8b5cf6 65%, #c026d3 100%)',
      },

      animation: {
        'pulse-dot': 'pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

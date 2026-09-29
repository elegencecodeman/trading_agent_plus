/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Themeable surfaces (swap via CSS vars in index.css for light mode)
        app: {
          DEFAULT: 'rgb(var(--c-app) / <alpha-value>)',
          nav: 'rgb(var(--c-app-nav) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          2: 'rgb(var(--c-surface-2) / <alpha-value>)',
        },
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          secondary: 'rgb(var(--c-ink-2) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-3) / <alpha-value>)',
        },
        // Fixed brand colors (shared across themes)
        accent: {
          DEFAULT: '#6EA8FE',
          soft: '#3B82F6',
          faint: '#1D2A45',
        },
        positive: '#35C98A',
        negative: '#F06A7A',
        warning: '#F2B84B',
        ai: '#A78BFA',
        cyan: '#47D7E8',
        series: {
          portfolio: '#60A5FA',
          benchmark: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '12px',
        lg: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -12px rgba(0,0,0,0.5)',
        lift: '0 6px 16px -6px rgba(0,0,0,0.5)',
        'lift-positive': '0 6px 20px -8px rgba(53,201,138,0.35)',
        'lift-negative': '0 6px 20px -8px rgba(240,106,122,0.35)',
        'lift-accent': '0 6px 20px -8px rgba(110,168,254,0.35)',
        drawer: '-16px 0 40px -16px rgba(0,0,0,0.6)',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        breathe: 'breathe 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-in': 'fade-in 200ms cubic-bezier(0.4,0,0.2,1)',
        'slide-in-right': 'slide-in-right 240ms cubic-bezier(0.4,0,0.2,1)',
        'slide-in-left': 'slide-in-left 240ms cubic-bezier(0.4,0,0.2,1)',
      },
      transitionTimingFunction: {
        ui: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}

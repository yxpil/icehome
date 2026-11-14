/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        graphite: '#18181B',
        slate1: '#3F3F46',
        muted2: '#71717A',
        line: '#E4E4E7',
        line2: '#F0F0F1',
        mist: '#F7F7F8',
        paper: '#FFFFFF'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'JetBrains Mono', 'Consolas', 'monospace']
      },
      fontSize: {
        micro: ['10px', { lineHeight: '14px', letterSpacing: '0.12em' }],
        tiny: ['11px', { lineHeight: '16px' }]
      },
      boxShadow: {
        soft: '0 1px 2px rgba(10,10,10,0.04)',
        pop: '0 18px 48px -18px rgba(10,10,10,0.28)'
      },
      borderRadius: {
        xl2: '18px'
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        pulseDot: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' }
        }
      },
      animation: {
        fadeUp: 'fadeUp 0.22s ease-out both',
        pulseDot: 'pulseDot 2.4s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

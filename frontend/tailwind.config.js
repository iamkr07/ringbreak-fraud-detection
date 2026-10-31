/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Light theme slate palette
        ink: {
          950: '#f8fafc', // Slate 50 (Main canvas / App background)
          900: '#ffffff', // Pure white (Card / Panel surfaces)
          850: '#f1f5f9', // Slate 100 (Secondary containers / Hover states)
          800: '#e2e8f0', // Slate 200 (Borders & dividers)
          750: '#cbd5e1', // Slate 300 (Input borders / subtle lines)
          700: '#94a3b8', // Slate 400 (Muted icons & subtle text)
          600: '#64748b', // Slate 500 (Secondary text)
          500: '#475569', // Slate 600 (Body text)
          400: '#1e293b', // Slate 800 (Dark text)
          300: '#0f172a', // Slate 900 (Primary headings & title text)
        },
        // Accent info (Vibrant Indigo / Royal Blue)
        signal: {
          50: '#eff6ff',
          100: '#dbeafe',
          300: '#93c5fd',
          400: '#3b82f6',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        trace: {
          400: '#06b6d4',
          500: '#0891b2',
        },
        // Risk levels
        risk: {
          400: '#f87171',
          500: '#dc2626',
          600: '#b91c1c',
          700: '#991b1b',
        },
        warn: {
          400: '#fbbf24',
          500: '#d97706',
          600: '#b45309',
        },
        safe: {
          400: '#34d399',
          500: '#059669',
          600: '#047857',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.9rem' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      boxShadow: {
        'glow-signal': '0 0 0 1px rgba(37,99,235,0.2), 0 4px 12px -2px rgba(37,99,235,0.15)',
        'glow-risk': '0 0 0 1px rgba(220,38,38,0.2), 0 4px 12px -2px rgba(220,38,38,0.15)',
        'glow-warn': '0 0 0 1px rgba(217,119,6,0.2), 0 4px 12px -2px rgba(217,119,6,0.15)',
        'glow-safe': '0 0 0 1px rgba(5,150,105,0.2), 0 4px 12px -2px rgba(5,150,105,0.15)',
        panel: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        dash: {
          to: { strokeDashoffset: '-20' },
        },
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        scanline: 'scanline 6s linear infinite',
        dash: 'dash 1s linear infinite',
      },
    },
  },
  plugins: [],
};

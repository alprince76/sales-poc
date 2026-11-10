/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec3ff',
          400: '#59a1ff',
          500: '#337dfc',
          600: '#1d5ef1',
          700: '#1649d6',
          800: '#183dad',
          900: '#1a3888',
          950: '#142453',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        sheet: '0 -8px 30px rgb(15 23 42 / 0.12)',
        bar: '0 -1px 0 rgb(226 232 240), 0 -4px 16px rgb(15 23 42 / 0.04)',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'sheet-in': 'sheet-in 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 200ms ease-out',
        'toast-in': 'toast-in 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};

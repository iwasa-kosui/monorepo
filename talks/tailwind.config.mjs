/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        terracotta: {
          DEFAULT: '#C2785C',
          light: '#D49A82',
          dark: '#A65D42',
        },
        rust: '#8B5A42',
        sand: {
          DEFAULT: '#D4C4A8',
          light: '#E8DCC8',
        },
        sage: {
          DEFAULT: '#8FA88B',
          dark: '#6B8567',
        },
        cream: '#F8F6F1',
        'warm-white': '#FDF9F6',
        'warm-gray': {
          DEFAULT: '#E8E4DE',
          dark: '#D4CFC6',
        },
        charcoal: {
          DEFAULT: '#5A5450',
          light: '#7A746E',
        },
        'clay-bg': '#F0EEE9',
        gray: {
          50: '#F8F6F1',
          100: '#F0EEE9',
          200: '#E8E4DE',
          300: '#D4CFC6',
          400: '#A39E96',
          500: '#8c8579',
          600: '#5A5450',
          700: '#3D3835',
          800: '#2D2A28',
          900: '#1a1918',
          950: '#121110',
        },
      },
      boxShadow: {
        clay:
          'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 2px 8px rgba(60,50,45,0.04), 0 4px 16px rgba(60,50,45,0.06)',
        'clay-hover':
          'inset 0 -2px 6px rgba(0,0,0,0.02), inset 0 2px 8px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5), 0 4px 12px rgba(60,50,45,0.06), 0 8px 24px rgba(60,50,45,0.08)',
        'clay-dark':
          'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 2px 8px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.1)',
        'clay-dark-hover':
          'inset 0 -2px 6px rgba(0,0,0,0.15), inset 0 2px 6px rgba(255,255,255,0.03), inset 0 0 0 1px rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        clay: '16px',
      },
    },
  },
  plugins: [],
  darkMode: 'media',
};

import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    // Dynamic board column colors (COLUMN_COLOR_PALETTE from shared)
    'border-t-gray-400',
    'border-t-indigo-400',
    'border-t-blue-400',
    'border-t-yellow-400',
    'border-t-emerald-500',
    'border-t-red-400',
    'border-t-purple-400',
    'border-t-pink-400',
    'border-t-orange-400',
    'border-t-teal-400',
    // Color swatch backgrounds for BoardConfigDialog
    'bg-gray-400',
    'bg-indigo-400',
    'bg-blue-400',
    'bg-yellow-400',
    'bg-emerald-500',
    'bg-red-400',
    'bg-purple-400',
    'bg-pink-400',
    'bg-orange-400',
    'bg-teal-400',
  ],
  theme: {
    extend: {
      animation: {
        fadeIn: 'fadeIn 0.15s ease-out forwards',
        fadeInUp: 'fadeInUp 0.2s ease-out forwards',
        slideUp: 'slideUp 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'error-pop': 'error-pop 0.3s ease-out forwards',
        bottomSheetUp: 'bottomSheetUp 0.3s ease-out forwards',
        bottomSheetDown: 'bottomSheetDown 0.2s ease-in forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'error-pop': {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '40%': { opacity: '1', transform: 'scale(1.3)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bottomSheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        bottomSheetDown: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [typography],
};

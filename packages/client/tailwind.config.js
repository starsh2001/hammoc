import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out forwards',
        slideUp: 'slideUp 0.3s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out forwards',
        'error-pop': 'error-pop 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
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
      },
    },
  },
  plugins: [typography],
};

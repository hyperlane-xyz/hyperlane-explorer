/** @type {import('tailwindcss').Config} */

const colors = require('tailwindcss/colors');

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      sans: ['Neue Haas Grotesk', 'Helvetica', 'sans-serif'],
      serif: ['Garamond', 'serif'],
      mono: ['Courier New', 'monospace'],
    },
    extend: {
      colors: {
        black: '#010101',
        white: '#ffffff',
        beige: {
          100: '#F6F4F1',
          200: '#F5F2EF',
          300: '#F3F0ED',
          400: '#F2EEEB',
          500: '#F1EDE9',
          600: '#D8D5D1',
          700: '#C0BDBA',
          800: '#A8A5A3',
          900: '#908E8B',
        },
        red: {
          100: '#F28B84',
          200: '#F07770',
          300: '#EE645B',
          400: '#EC5147',
          500: '#EA3E33',
          600: '#D2372D',
          700: '#BB3128',
          800: '#A32B23',
          900: '#8C251E',
        },
        green: {
          50: '#CFD8CF',
          100: '#C1CCC1',
          200: '#B3C1B3',
          300: '#A5B5A5',
          400: '#97AA97',
          500: '#899E89',
          600: '#7B937B',
          700: '#6E866E',
          800: '#637863',
          900: '#576A57',
        },
        slate: {
          50: '#879CA2',
          100: '#789097',
          200: '#6B848B',
          300: '#60767D',
          400: '#55696E',
          500: '#4A5B60',
          600: '#3F4D52',
          700: '#344043',
          800: '#293235',
          900: '#1E2427',
        },
      },
      fontSize: {
        'md': '0.95rem'
      },
      spacing: {
        88: '22rem',
        100: '26rem',
        112: '28rem',
        128: '32rem',
        144: '36rem',
      },
      borderRadius: {
        none: '0',
        sm: '0.1rem',
        DEFAULT: '0.15rem',
        md: '0.2rem',
        lg: '0.4rem',
        full: '9999px',
      },
      blur: {
        xs: '3px',
      }
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */

const colors = require('tailwindcss/colors')

module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    fontFamily: {
      sans: ['Neue Haas Grotesk',  'Helvetica', 'sans-serif'],
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
          100: '#F4CFCC',
          200: '#EDAFAB',
          300: '#E58F89',
          400: '#DE6F67',
          500: '#DB5F57',
          600: '#C5554E',
          700: '#99423C',
          800: '#6D2F2B',
          900: '#411C1A',
        },
        green: {
          100: '#E9ECE7',
          200: '#D3DAD0',
          300: '#BDC8B8',
          400: '#A7B6A1',
          500: '#92A48A',
          600: '#83937C',
          700: '#667260',
          800: '#495245',
          900: '#2B3129',
        }
      },
      spacing: {
        100: '26rem',
        112: '28rem',
        128: '32rem',
        144: '36rem',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}

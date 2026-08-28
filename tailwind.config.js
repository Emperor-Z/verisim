/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    fontFamily: {
      display: ['var(--font-display)', 'sans-serif'],
      body: ['var(--font-body)', 'monospace'],
    },
    extend: {
      colors: {
        brown: {
          100: '#FFFFFF',
          200: '#DCEBF7',
          300: '#AEC9DE',
          500: '#5D84A6',
          600: '#446F8F',
          700: '#2F5C82',
          800: '#1D3B54',
          900: '#10151F',
        },
        clay: {
          100: '#C0CBDC',
          300: '#8B9BB4',
          500: '#5A6988',
          700: '#3A4466',
          900: '#181425',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

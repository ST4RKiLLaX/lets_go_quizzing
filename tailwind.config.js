/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pub: {
          dark: '#1a1a2e',
          darker: '#16213e',
          accent: '#e94560',
          gold: '#f4d03f',
          muted: '#a0aec0',
        },
      },
    },
  },
  plugins: [],
};

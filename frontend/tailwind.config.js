/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          bg: '#0b141a',
          sidebar: '#111b21',
          header: '#202c33',
          chatBg: '#0b141a',
          incomingBubble: '#202c33',
          outgoingBubble: '#005c4b',
          accent: '#00a884',
          hover: '#2a3942',
          textPrimary: '#e9edef',
          textSecondary: '#8696a0',
          border: '#222d34',
        },
      },
    },
  },
  plugins: [],
};

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
          bg: '#ffffff',
          sidebar: '#ffffff',
          header: '#f0f2f5',
          chatBg: '#efeae2',
          incomingBubble: '#ffffff',
          outgoingBubble: '#d9fdd3',
          accent: '#00a884',
          unreadBadge: '#25d366',
          hover: '#f0f2f5',
          textPrimary: '#111b21',
          textSecondary: '#667781',
          border: '#e9edef',
        },
      },
    },
  },
  plugins: [],
};

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
          bg: 'var(--wa-bg)',
          sidebar: 'var(--wa-sidebar)',
          header: 'var(--wa-header)',
          chatBg: 'var(--wa-chat-bg)',
          incomingBubble: 'var(--wa-incoming-bubble)',
          outgoingBubble: 'var(--wa-outgoing-bubble)',
          accent: 'var(--wa-accent)',
          hover: 'var(--wa-hover)',
          textPrimary: 'var(--wa-text-primary)',
          textSecondary: 'var(--wa-text-secondary)',
          border: 'var(--wa-border)',
        },
      },
    },
  },
  plugins: [],
};

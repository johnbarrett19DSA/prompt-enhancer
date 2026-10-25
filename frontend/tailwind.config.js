/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        oled: "#000000",
        charcoal: "#09090b",
        borderline: "#27272a",
      },
      spacing: {
        'safe-top-blur': 'max(calc(env(safe-area-inset-top, 0px) + 0.75rem), 2.75rem)',
        'safe-modal-top': 'max(calc(env(safe-area-inset-top, 0px) + 1rem), 3rem)',
      },
    },
  },
  plugins: [],
};

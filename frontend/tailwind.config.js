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
    },
  },
  plugins: [],
};

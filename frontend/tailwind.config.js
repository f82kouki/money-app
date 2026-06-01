/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"M PLUS Rounded 1c"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        primary: {
          light: "#FFF2F7",
          DEFAULT: "#FFE5EF",
          mid: "#F8A5C2",
          dark: "#FFD0E0",
          text: "#C2185B",
        },
      },
    },
  },
  plugins: [],
};

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
        // 主役ボタン(CTA)専用のローズ。淡い primary と差をつけて「押すボタン」を明確にする。
        // 少しだけ淡いローズ（旧 #EC4899 から1段やわらかく）。hover/active は旧色で軽く濃く。
        cta: {
          DEFAULT: "#F368A8",
          hover: "#EC4899",
          fg: "#FFFFFF",
        },
      },
    },
  },
  plugins: [],
};

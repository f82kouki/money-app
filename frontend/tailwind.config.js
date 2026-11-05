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
      // テーマカラーで切り替えるため、値は CSS 変数で持つ。標準の値は src/index.css の :root。
      // <alpha-value> は text-primary-text/70 のような透明度の指定に必要。
      colors: {
        page: "rgb(var(--color-page) / <alpha-value>)",
        primary: {
          light: "rgb(var(--color-primary-light) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          mid: "rgb(var(--color-primary-mid) / <alpha-value>)",
          text: "rgb(var(--color-primary-text) / <alpha-value>)",
        },
        // 主役ボタン(CTA)専用の色。淡い primary と差をつけて「押すボタン」を明確にする。
        cta: {
          DEFAULT: "rgb(var(--color-cta) / <alpha-value>)",
          hover: "rgb(var(--color-cta-hover) / <alpha-value>)",
          fg: "rgb(var(--color-cta-fg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

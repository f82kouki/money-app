// テーマカラー。保存するのは基準の1色だけで、画面で使う色はそこから作る。

const STORAGE_KEY = "warikan_theme"; // index.html の起動時スクリプトも読む

// どの色を選んでも読めるようにする下限。
const MIN_TEXT_CONTRAST = 4.5;
const MIN_BUTTON_TEXT_CONTRAST = 3;
const MIN_BUTTON_ON_CARD_CONTRAST = 1.6;

const WHITE = "#FFFFFF";
const DARK_TEXT = "#0F172A";

export interface ThemeColors {
  page: string;
  primaryLight: string;
  primary: string;
  primaryMid: string;
  primaryText: string;
  cta: string;
  ctaHover: string;
  ctaFg: string;
}

// src/index.css の :root とそろえる。
export const STANDARD_COLORS: ThemeColors = {
  page: "#FFF5F8",
  primaryLight: "#FFF2F7",
  primary: "#FFE5EF",
  primaryMid: "#F8A5C2",
  primaryText: "#C2185B",
  cta: "#F368A8",
  ctaHover: "#EC4899",
  ctaFg: WHITE,
};

const CSS_VARIABLES: Record<keyof ThemeColors, string> = {
  page: "--color-page",
  primaryLight: "--color-primary-light",
  primary: "--color-primary",
  primaryMid: "--color-primary-mid",
  primaryText: "--color-primary-text",
  cta: "--color-cta",
  ctaHover: "--color-cta-hover",
  ctaFg: "--color-cta-fg",
};

// color が null の「ピンク」は標準のテーマ。保存値を持たない。
export const THEME_PRESETS: { name: string; color: string | null }[] = [
  { name: "ピンク", color: null },
  { name: "ブルー", color: "#4A90E2" },
  { name: "グリーン", color: "#1F9E6E" },
  { name: "パープル", color: "#8B6FE8" },
  { name: "オレンジ", color: "#E0702A" },
  { name: "グレー", color: "#64748B" },
];

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function hexToHsl(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let sector: number;
  if (max === r) sector = ((g - b) / delta + 6) % 6;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;
  return [sector * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const sectors: Rgb[] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const channels = sectors[Math.floor(hue / 60) % 6];
  const hex = channels
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
  return `#${hex.toUpperCase()}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** 基準の1色から、画面で使う色を作る。淡い色でも文字とボタンが読めるように調整する。 */
export function deriveTheme(seed: string): ThemeColors {
  const [hue, seedSaturation, seedLightness] = hexToHsl(seed);
  const saturation = Math.min(seedSaturation, 0.9);
  const tint = (lightness: number, scale = 1) =>
    hslToHex(hue, saturation * scale, lightness);

  let ctaLightness = Math.min(Math.max(seedLightness, 0.22), 0.72);
  while (
    contrast(hslToHex(hue, seedSaturation, ctaLightness), WHITE) <
      MIN_BUTTON_ON_CARD_CONTRAST &&
    ctaLightness > 0.22
  ) {
    ctaLightness -= 0.01;
  }
  const cta = hslToHex(hue, seedSaturation, ctaLightness);

  const page = tint(0.98);
  const primary = tint(0.945);
  let textLightness = 0.43;
  let primaryText = tint(textLightness);
  while (
    Math.min(
      contrast(primaryText, primary),
      contrast(primaryText, page),
      contrast(primaryText, WHITE)
    ) < MIN_TEXT_CONTRAST &&
    textLightness > 0.05
  ) {
    textLightness -= 0.01;
    primaryText = tint(textLightness);
  }

  return {
    page,
    primaryLight: tint(0.97),
    primary,
    primaryMid: tint(0.81, 0.9),
    primaryText,
    cta,
    ctaHover: hslToHex(hue, seedSaturation, Math.max(ctaLightness - 0.08, 0.12)),
    ctaFg: contrast(WHITE, cta) >= MIN_BUTTON_TEXT_CONTRAST ? WHITE : DARK_TEXT,
  };
}

export function colorsOf(color: string | null): ThemeColors {
  return color ? deriveTheme(color) : STANDARD_COLORS;
}

/** 画面全体へテーマを当てる。null は標準の色へ戻す。 */
export function applyTheme(color: string | null): void {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const colors = colorsOf(color);
  meta?.setAttribute("content", colors.primary);

  const keys = Object.keys(CSS_VARIABLES) as (keyof ThemeColors)[];
  if (!color) {
    keys.forEach((key) => root.style.removeProperty(CSS_VARIABLES[key]));
    saveToDevice(null);
    return;
  }

  const variables: Record<string, string> = {};
  keys.forEach((key) => {
    const value = hexToRgb(colors[key]).join(" ");
    root.style.setProperty(CSS_VARIABLES[key], value);
    variables[CSS_VARIABLES[key]] = value;
  });
  saveToDevice(JSON.stringify({ variables, metaColor: colors.primary }));
}

// 起動時のちらつきを防ぐための控え。使えない環境では API の値が当たるまで標準の色になる。
function saveToDevice(value: string | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存できなくてもテーマ自体は動く
  }
}

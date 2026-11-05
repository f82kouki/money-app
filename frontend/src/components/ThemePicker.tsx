import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import { applyTheme, colorsOf, THEME_PRESETS } from "../theme";
import type { ThemeSettings } from "../types";

// 色選択を動かしている間は保存せず、止まってから保存する。
const SAVE_DELAY_MS = 300;
const INITIAL_CUSTOM_COLOR = "#F2C230";

/**
 * 設定画面のテーマカラー欄。選ぶとすぐ全体へ反映し、自動で保存する。
 * 色は各自の設定で、相手の画面は変わらない。
 */
export default function ThemePicker() {
  // undefined = 取得前。null = 標準の色。
  const [color, setColor] = useState<string | null | undefined>(undefined);
  const [customColor, setCustomColor] = useState(INITIAL_CUSTOM_COLOR);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saveTimer = useRef<number>();

  useEffect(() => {
    api
      .get<ThemeSettings>("/api/me/theme")
      .then((theme) => {
        setColor(theme.color);
        const isPreset = THEME_PRESETS.some((p) => p.color === theme.color);
        if (theme.color && !isPreset) setCustomColor(theme.color);
      })
      .catch(() => {
        /* 取得失敗時は選択なしの表示のまま。選べば保存はできる */
      });
  }, []);

  function choose(next: string | null, doneMessage: string) {
    setColor(next);
    setMessage("");
    setError("");
    applyTheme(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api
        .put<ThemeSettings>("/api/me/theme", { color: next })
        .then(() => setMessage(doneMessage))
        .catch(() => setError("保存できませんでした"));
    }, SAVE_DELAY_MS);
  }

  const isCustom =
    Boolean(color) && !THEME_PRESETS.some((p) => p.color === color);

  return (
    <section className="rounded-2xl bg-white p-4 shadow">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">テーマカラー</h2>

      {/* 幅の狭い端末でも 44px を保てるよう、列を固定せず折り返す */}
      <div className="flex flex-wrap gap-2">
        {THEME_PRESETS.map((preset) => {
          const selected = preset.color === color;
          const colors = colorsOf(preset.color);
          return (
            <button
              type="button"
              key={preset.name}
              onClick={() => choose(preset.color, `${preset.name}にしました`)}
              aria-label={preset.name}
              aria-pressed={selected}
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: colors.cta,
                boxShadow: selected
                  ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${colors.cta}`
                  : undefined,
              }}
            >
              {selected && (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={colors.ctaFg}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <label
        className={`mt-3 flex min-h-[50px] cursor-pointer items-center gap-3 rounded-xl border px-3 text-base text-slate-700 ${
          isCustom ? "border-primary-mid" : "border-slate-300"
        }`}
      >
        <input
          type="color"
          value={customColor}
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setCustomColor(next);
            choose(next, "好きな色にしました");
          }}
          className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        好きな色を選ぶ
      </label>

      <div className="mt-1 flex min-h-11 items-center justify-between gap-2">
        <span className="text-sm">
          {message && <span className="text-green-600">{message}</span>}
          {error && <span className="text-red-600">{error}</span>}
        </span>
        {color && (
          <button
            type="button"
            onClick={() => choose(null, "標準に戻しました")}
            className="min-h-11 shrink-0 px-1 text-sm font-bold text-primary-text"
          >
            標準に戻す
          </button>
        )}
      </div>
    </section>
  );
}

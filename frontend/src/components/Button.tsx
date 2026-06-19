import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";

// 共通ボタン。1画面の「主役」は variant="primary"（ローズ塗り）で、補助は secondary、
// 削除は danger に揃える。インラインのコピペを減らし、配色を一括で管理する。
const BASE =
  "rounded-xl px-4 py-3 text-base font-semibold transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cta text-cta-fg shadow-sm hover:bg-cta-hover active:bg-cta-hover",
  secondary: "bg-slate-100 text-slate-600 active:bg-slate-200",
  danger: "bg-red-500 text-white active:bg-red-600",
  ghost: "bg-transparent text-primary-text hover:bg-primary-light",
  // 白地＋ピンク枠線。塗りの primary と差をつけつつ「押せる」が分かる。
  // 2択トグルの未選択側・補助ボタンに使う。
  outline:
    "border-2 border-primary-mid bg-white text-primary-text hover:bg-primary-light active:bg-primary-light",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export default function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}

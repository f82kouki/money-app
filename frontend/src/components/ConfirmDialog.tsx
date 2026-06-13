import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  message: string;
  /** 確認ボタンのラベル（既定: 削除する） */
  confirmLabel?: string;
  /** キャンセルボタンのラベル（既定: キャンセル） */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const FADE_MS = 200; // フェードイン/アウトの長さ

/** ブラウザ標準の confirm() の代わりに使う、自前の確認ダイアログ。 */
export default function ConfirmDialog({
  message,
  confirmLabel = "削除する",
  cancelLabel = "キャンセル",
  onConfirm,
  onCancel,
}: Props) {
  const [shown, setShown] = useState(false);

  function close(after: () => void) {
    setShown(false);
    setTimeout(after, FADE_MS); // フェードアウト後に実際の処理を呼ぶ
  }

  useEffect(() => {
    // 初回描画は opacity-0 → 次フレームで opacity-100 にしてフェードイン
    const raf = requestAnimationFrame(() => setShown(true));
    // Esc キーでキャンセル
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(onCancel);
    }
    window.addEventListener("keydown", onKey);
    // 開いている間は背景（body）のスクロールを止める。
    // こうしないと裏のページが動いて暗転が画面全体に効かないように見える。
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      onClick={() => close(onCancel)}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 transition-opacity ease-out ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        className={`w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl transition-all ease-out ${
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        <p className="text-center text-base font-bold text-slate-800">
          {message}
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => close(onCancel)}
            className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-200"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => close(onConfirm)}
            className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-semibold text-white active:bg-red-600"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

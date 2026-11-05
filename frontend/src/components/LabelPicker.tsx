import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

import type { Label } from "../types";

interface Props {
  labels: Label[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * 記録に付けるラベルの選択欄（任意・複数可）。
 * ラベルは20個以上あるので、一覧はフォームに重ねて開くプルダウンにして、
 * 金額だけの記録で「記録する」を遠ざけない。
 * 選択中のラベルは欄の中に出し、タップで外せるようにする。
 */
export default function LabelPicker({ labels, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const selected = labels.filter((label) => selectedIds.includes(label.id));

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id]
    );
  }

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function closeWhenFocusLeaves(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  }

  // スマホでは欄が画面の下端近くにあり、選択が増えると欄が伸びてパネルも下へずれる。
  // 開いたときと選択数が変わったときに、「完了」まで見える位置へ動かす。
  useEffect(() => {
    if (open) {
      panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [open, selected.length]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideTap(e: PointerEvent) {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") closeAndRefocus();
    }
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} onBlur={closeWhenFocusLeaves} className="relative">
      {/* 欄全体を開閉のボタンにする。チップだけは上に重ねて、タップで外せるようにする */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          selected.length > 0 ? `ラベル ${selected.length}個` : "ラベル（任意）"
        }
        className="absolute inset-0 rounded-xl bg-white"
      />
      <div
        className={`pointer-events-none relative flex min-h-[50px] items-start rounded-xl border ${
          open ? "border-primary-mid" : "border-slate-300"
        }`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5 pl-2">
          {selected.length === 0 && (
            <span className="px-2 py-1.5 text-base text-slate-500">
              ラベル（任意）
            </span>
          )}
          {selected.map((label) => (
            <button
              type="button"
              key={label.id}
              onClick={() => toggle(label.id)}
              aria-label={`${label.name} を外す`}
              className="pointer-events-auto inline-flex min-h-9 max-w-full items-center gap-1 rounded-full bg-primary-light pl-3 pr-2 text-sm font-bold text-primary-text"
            >
              <span className="min-w-0 truncate">{label.name}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          ))}
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`m-[15px] shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="ラベル"
          className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg"
        >
          <div className="max-h-[220px] overflow-y-auto overscroll-contain py-1">
            {labels.map((label) => {
              const pressed = selectedIds.includes(label.id);
              return (
                <button
                  type="button"
                  key={label.id}
                  onClick={() => toggle(label.id)}
                  aria-pressed={pressed}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-[15px] ${
                    pressed
                      ? "bg-primary-light font-bold text-primary-text"
                      : "bg-white font-medium text-slate-700"
                  }`}
                >
                  <span className="min-w-0 truncate">{label.name}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 ${
                      pressed
                        ? "border-cta bg-cta text-cta-fg"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {pressed && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-slate-100 p-2.5">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selectedIds.length === 0}
              className="min-h-11 flex-1 rounded-[10px] bg-slate-100 text-[15px] font-bold text-slate-600 disabled:opacity-50"
            >
              すべて外す
            </button>
            <button
              type="button"
              onClick={closeAndRefocus}
              className="min-h-11 flex-1 rounded-[10px] bg-cta text-[15px] font-bold text-cta-fg"
            >
              完了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

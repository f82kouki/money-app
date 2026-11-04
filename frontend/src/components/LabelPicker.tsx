import { useState } from "react";

import type { Label } from "../types";

interface Props {
  labels: Label[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * 記録に付けるラベルの選択欄（任意・複数可）。
 * ラベルは20個以上あるので普段は閉じておき、金額だけの記録で「記録する」を遠ざけない。
 * 閉じている間は選択中のラベルだけを出し、タップで外せるようにする。
 */
export default function LabelPicker({ labels, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const selected = labels.filter((label) => selectedIds.includes(label.id));
  const visible = open ? labels : selected;

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id]
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-slate-300 px-4 py-3 text-left text-base text-slate-500"
      >
        <span>
          {selected.length > 0 ? `ラベル ${selected.length}個` : "ラベル（任意）"}
        </span>
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
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {visible.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {visible.map((label) => {
            const pressed = selectedIds.includes(label.id);
            return (
              <button
                type="button"
                key={label.id}
                onClick={() => toggle(label.id)}
                aria-pressed={pressed}
                className={`max-w-full truncate rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors ${
                  pressed
                    ? "border-cta bg-cta text-cta-fg"
                    : "border-primary-mid bg-white text-primary-text"
                }`}
              >
                {label.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

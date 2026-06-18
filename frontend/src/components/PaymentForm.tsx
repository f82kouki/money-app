import { useState, type FormEvent } from "react";

import type { Member, SplitType } from "../types";
import { playChari } from "../utils/sound";
import Button from "./Button";

export interface PaymentFormValues {
  payer_member_id: string;
  amount: number;
  category: string;
  paid_at: string;
  split_type: SplitType;
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Props {
  members: Member[];
  defaultPayerId: string;
  initial?: PaymentFormValues;
  submitLabel?: string;
  /** 送信ボタン押下（バリデーション通過時）に“チャリン”を鳴らす。新規記録のみで使う想定。 */
  playSoundOnSubmit?: boolean;
  onSubmit: (values: PaymentFormValues) => Promise<void>;
  onCancel?: () => void;
}

export default function PaymentForm({
  members,
  defaultPayerId,
  initial,
  submitLabel = "記録する",
  playSoundOnSubmit = false,
  onSubmit,
  onCancel,
}: Props) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [payer, setPayer] = useState(initial?.payer_member_id ?? defaultPayerId);
  const [category, setCategory] = useState(initial?.category ?? "");
  const [paidAt, setPaidAt] = useState(initial?.paid_at ?? todayStr());
  const [splitType, setSplitType] = useState<SplitType>(
    initial?.split_type ?? "warikan"
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const payerName =
    members.find((m) => m.id === payer)?.display_name ?? "払った人";
  const otherName =
    members.find((m) => m.id !== payer)?.display_name ?? "相手";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const value = parseInt(amount, 10);
    if (!value || value <= 0) {
      setError("金額を入力してください");
      return;
    }
    // バリデーション通過直後（＝有効な押下）に鳴らす。クリック起点なので自動再生制限もクリア。
    if (playSoundOnSubmit) playChari();
    setSaving(true);
    try {
      await onSubmit({
        payer_member_id: payer,
        amount: value,
        category: category.trim(),
        paid_at: paidAt,
        split_type: splitType,
      });
      if (!initial) {
        // 新規追加後はフォームをリセット（連続入力しやすく）
        setAmount("");
        setCategory("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-white p-4">
      {/* 金額 */}
      <div className="flex items-center rounded-xl border border-slate-300 px-3 focus-within:border-primary-mid">
        <span className="text-xl text-slate-400">¥</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent px-2 py-3 text-right text-2xl font-bold outline-none"
        />
      </div>

      {/* どちらが払ったか（大きなボタン） */}
      <div className="grid grid-cols-2 gap-2">
        {members.map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setPayer(m.id)}
            className={`truncate rounded-xl py-3 text-base font-semibold ${
              payer === m.id
                ? "bg-primary text-primary-text"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {m.display_name}
          </button>
        ))}
      </div>

      {/* 割り方（割り勘 / 立て替え） */}
      <div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "warikan", label: "割り勘" },
              { value: "tatekae", label: "立て替え" },
            ] as const
          ).map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setSplitType(opt.value)}
              aria-pressed={splitType === opt.value}
              className={`rounded-xl py-2.5 text-base font-semibold transition-colors ${
                splitType === opt.value
                  ? "bg-cta text-cta-fg shadow-sm"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {splitType === "tatekae" && (
          <p className="mt-1 px-1 text-xs text-slate-500">
            {payerName} が {otherName} の分を全額立て替え（{otherName} が満額返す）。
          </p>
        )}
      </div>

      {/* 項目・日付 */}
      <input
        placeholder="項目・メモ（例: 夕食）"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        maxLength={100}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
      />
      <input
        type="date"
        value={paidAt}
        onChange={(e) => setPaidAt(e.target.value)}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            キャンセル
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={saving} className="flex-1">
          {saving ? "保存中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

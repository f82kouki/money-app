import { useState } from "react";

import type { Member, Payment } from "../types";
import PaymentForm, { type PaymentFormValues } from "./PaymentForm";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function nameOf(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.display_name ?? "?";
}

interface Props {
  payments: Payment[];
  members: Member[];
  myMemberId: string;
  onUpdate: (id: string, values: PaymentFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PaymentList({
  payments,
  members,
  myMemberId,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (payments.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        まだ記録がありません。上から追加しましょう。
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {payments.map((p) => {
        if (editingId === p.id) {
          return (
            <li key={p.id}>
              <PaymentForm
                members={members}
                defaultPayerId={myMemberId}
                initial={{
                  payer_member_id: p.payer_member_id,
                  amount: p.amount,
                  category: p.category,
                  paid_at: p.paid_at,
                }}
                submitLabel="更新する"
                onCancel={() => setEditingId(null)}
                onSubmit={async (values) => {
                  await onUpdate(p.id, values);
                  setEditingId(null);
                }}
              />
            </li>
          );
        }
        return (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-800">
                {p.category || "（項目なし）"}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {nameOf(members, p.payer_member_id)} ・ {p.paid_at}
              </div>
            </div>
            <div className="flex items-center gap-3 pl-3">
              <span className="whitespace-nowrap text-base font-bold text-slate-800">
                {yen(p.amount)}
              </span>
              <button
                onClick={() => setEditingId(p.id)}
                className="text-sm text-indigo-500"
              >
                編集
              </button>
              <button
                onClick={() => {
                  if (confirm("この記録を削除しますか？")) onDelete(p.id);
                }}
                className="text-sm text-red-400"
              >
                削除
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

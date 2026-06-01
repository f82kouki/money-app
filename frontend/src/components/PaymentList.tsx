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

  // API は新しい順で来るので、チャットらしく「古い→新しい（最新が下）」に並べ替える
  const ordered = [...payments].reverse();

  return (
    <div className="space-y-3">
      {ordered.map((p) => {
        const mine = p.payer_member_id === myMemberId;

        // 編集中は吹き出しの代わりにフォームを表示（全幅）
        if (editingId === p.id) {
          return (
            <PaymentForm
              key={p.id}
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
          );
        }

        return (
          <div
            key={p.id}
            className={`flex ${mine ? "justify-end" : "justify-start"}`}
          >
            <div className="max-w-[80%]">
              {/* 名前（吹き出しの上） */}
              <div
                className={`mb-1 px-1 text-xs text-slate-400 ${
                  mine ? "text-right" : "text-left"
                }`}
              >
                {nameOf(members, p.payer_member_id)}
              </div>

              {/* 吹き出し */}
              <div
                className={`rounded-2xl px-4 py-3 shadow-sm ${
                  mine
                    ? "rounded-tr-sm bg-primary text-primary-text"
                    : "rounded-tl-sm bg-white text-slate-800"
                }`}
              >
                <div className="text-lg font-bold">{yen(p.amount)}</div>
                {p.category && (
                  <div className="mt-0.5 text-sm opacity-80">{p.category}</div>
                )}
              </div>

              {/* 日付・編集・削除（吹き出しの下） */}
              <div
                className={`mt-1 flex items-center gap-2 px-1 text-[11px] text-slate-400 ${
                  mine ? "justify-end" : "justify-start"
                }`}
              >
                <span>{p.paid_at}</span>
                <button
                  onClick={() => setEditingId(p.id)}
                  className="text-primary-text"
                >
                  編集
                </button>
                <button
                  onClick={() => {
                    if (confirm("この記録を削除しますか？")) onDelete(p.id);
                  }}
                  className="text-red-400"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

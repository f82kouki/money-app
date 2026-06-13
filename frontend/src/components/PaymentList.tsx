import { useState } from "react";

import type { Member, Payment } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import PaymentForm, { type PaymentFormValues } from "./PaymentForm";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const PAGE_SIZE = 5;

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (payments.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        まだ記録がありません。
      </p>
    );
  }

  // API は新しい順で来るので、そのまま「最新が一番上」に表示する
  const ordered = payments;

  // 新しい方から visibleCount 件（配列の先頭）だけ表示し、「もっと見る」で古い方を下に追加する
  const visible = ordered.slice(0, visibleCount);
  const hasMore = visibleCount < ordered.length;
  const remaining = ordered.length - visibleCount;

  return (
    <div className="space-y-3">
      {visible.map((p) => {
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
                  onClick={() => setDeletingId(p.id)}
                  className="text-red-400"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div className="flex justify-center">
          <button
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-primary-text shadow-sm active:bg-primary-light"
          >
            もっと見る（残り{remaining}件）
          </button>
        </div>
      )}

      {deletingId !== null && (
        <ConfirmDialog
          message="この記録を削除しますか？"
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            const id = deletingId;
            setDeletingId(null);
            onDelete(id);
          }}
        />
      )}
    </div>
  );
}

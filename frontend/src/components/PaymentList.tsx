import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import type { Label, Member, Payment } from "../types";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import PaymentForm, { type PaymentFormValues } from "./PaymentForm";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const PAGE_SIZE = 5;

function nameOf(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.display_name ?? "?";
}

// 全半角と大文字・小文字の違いは無視して探す（ｶﾌｪ と カフェ、abc と ＡＢＣ）。
function normalizeForSearch(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

interface Props {
  payments: Payment[];
  members: Member[];
  labels: Label[];
  myMemberId: string;
  onUpdate: (id: string, values: PaymentFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function PaymentList({
  payments,
  members,
  labels,
  myMemberId,
  onUpdate,
  onDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // draft は入力中の文字。検索ボタンか Enter で query へ確定し、そのときだけ絞り込む。
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  if (payments.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        まだ記録がありません。
      </p>
    );
  }

  // API は新しい順で来るので、そのまま「最新が一番上」に表示する。
  // 全件を取得済みなので、メモの検索もここで絞り込む。
  // 編集中の記録は、検索語が変わっても入力が消えないよう残す。
  const keyword = normalizeForSearch(query).trim();
  const ordered = keyword
    ? payments.filter(
        (p) =>
          p.id === editingId ||
          normalizeForSearch(p.category).includes(keyword)
      )
    : payments;

  // 新しい方から visibleCount 件（配列の先頭）だけ表示し、「もっと見る」で古い方を下に追加する
  const visible = ordered.slice(0, visibleCount);
  const hasMore = visibleCount < ordered.length;
  const remaining = ordered.length - visibleCount;

  function runSearch(e: FormEvent) {
    e.preventDefault();
    // 結果を描画してから動かす。先に動かすと、結果で変わるページの高さに合わない。
    flushSync(() => {
      setQuery(draft);
      setVisibleCount(PAGE_SIZE);
    });
    searchRef.current?.blur();
    searchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function clearSearch() {
    setDraft("");
    setQuery("");
    setVisibleCount(PAGE_SIZE);
    searchRef.current?.focus();
  }

  return (
    <div className="space-y-3">
      <form role="search" onSubmit={runSearch} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            enterKeyHint="search"
            placeholder="メモを検索"
            aria-label="メモを検索"
            className="h-full w-full scroll-mt-3 rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-11 text-base outline-none focus:border-primary-mid"
          />
          {(draft || query) && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="検索をクリア"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </div>
        <Button type="submit" variant="outline" className="shrink-0">
          検索
        </Button>
      </form>

      {ordered.length === 0 && (
        <p className="break-words py-10 text-center text-sm text-slate-400">
          「{query.trim()}」に一致する記録はありません。
        </p>
      )}

      {visible.map((p) => {
        const mine = p.payer_member_id === myMemberId;

        // 編集中は吹き出しの代わりにフォームを表示（全幅）
        if (editingId === p.id) {
          return (
            <PaymentForm
              key={p.id}
              members={members}
              labels={labels}
              defaultPayerId={myMemberId}
              initial={{
                payer_member_id: p.payer_member_id,
                amount: p.amount,
                category: p.category,
                paid_at: p.paid_at,
                split_type: p.split_type,
                label_ids: p.labels.map((label) => label.id),
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
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{yen(p.amount)}</span>
                  {p.split_type === "tatekae" && (
                    <span className="shrink-0 rounded-full border border-primary-mid px-1.5 py-0.5 text-[10px] font-bold text-primary-text">
                      立替
                    </span>
                  )}
                  {p.settlement_id && (
                    <span className="shrink-0 rounded-full bg-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                      精算済
                    </span>
                  )}
                </div>
                {p.category && (
                  <div className="mt-0.5 text-sm opacity-80">{p.category}</div>
                )}
                {/* 金額の行に足すと「立替」「精算済」と並んであふれるので別の行にする */}
                {p.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.labels.map((label) => (
                      <span
                        key={label.id}
                        className="max-w-full truncate rounded-full border border-primary-mid px-1.5 py-0.5 text-[10px] font-bold text-primary-text"
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
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
            className="rounded-full bg-cta px-5 py-2 text-sm font-bold text-cta-fg shadow-sm hover:bg-cta-hover active:bg-cta-hover"
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

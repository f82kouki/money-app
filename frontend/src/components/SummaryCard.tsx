import type { Summary } from "../types";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

interface Props {
  summary: Summary;
  /** 「精算する」ボタン押下時に呼ぶ（精算可能なときだけボタンを出す）。 */
  onSettle?: () => void;
  settling?: boolean;
}

export default function SummaryCard({ summary, onSettle, settling }: Props) {
  const nameOf = (id: string | null) =>
    summary.totals.find((t) => t.member_id === id)?.display_name ?? "";
  // 精算が必要なとき（誰が誰にいくら）は矢印表記、そうでなければメッセージ文を表示
  const hasSettlement =
    summary.from_member_id != null &&
    summary.to_member_id != null &&
    summary.settlement_amount > 0;

  return (
    <div className="rounded-2xl bg-primary p-5 text-primary-text">
      <div className="grid grid-cols-2 gap-3">
        {summary.totals.map((t) => (
          <div key={t.member_id} className="rounded-xl bg-white/60 p-3">
            <div className="truncate text-sm text-primary-text/70">{t.display_name}</div>
            <div className="mt-1 text-xl font-bold">{yen(t.total)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-primary-text/20 pt-3">
        <div className="flex items-center justify-between text-sm text-primary-text/80">
          <span>合計</span>
          <span>{yen(summary.grand_total)}</span>
        </div>
        {summary.difference > 0 && (
          <div className="flex items-center justify-between text-sm text-primary-text/80">
            <span>差額</span>
            <span>{yen(summary.difference)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-white/60 px-4 py-3 text-center">
        {hasSettlement ? (
          <div className="flex items-center justify-center gap-2 font-bold">
            <span className="max-w-[35%] truncate">
              {nameOf(summary.from_member_id)}
            </span>
            <span className="text-xl text-primary-text">→</span>
            <span className="max-w-[35%] truncate">
              {nameOf(summary.to_member_id)}
            </span>
            <span className="ml-1 whitespace-nowrap text-lg">
              {yen(summary.settlement_amount)}
            </span>
          </div>
        ) : (
          <span className="text-base font-semibold">{summary.message}</span>
        )}
      </div>

      {/* 精算（リセット）。貸し借りがあるときだけ出す。 */}
      {hasSettlement && onSettle && (
        <button
          type="button"
          onClick={onSettle}
          disabled={settling}
          className="mt-3 w-full rounded-xl bg-white py-3 text-base font-bold text-primary-text shadow-sm active:bg-primary-light disabled:opacity-50"
        >
          {settling ? "精算中…" : "精算する（リセット）"}
        </button>
      )}
    </div>
  );
}

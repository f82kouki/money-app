import type { Summary } from "../types";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export default function SummaryCard({ summary }: { summary: Summary }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-lg">
      <div className="grid grid-cols-2 gap-3">
        {summary.totals.map((t) => (
          <div key={t.member_id} className="rounded-xl bg-white/15 p-3">
            <div className="truncate text-sm text-white/80">{t.display_name}</div>
            <div className="mt-1 text-xl font-bold">{yen(t.total)}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-white/20 pt-3">
        <div className="flex items-center justify-between text-sm text-white/80">
          <span>合計</span>
          <span>{yen(summary.grand_total)}</span>
        </div>
        {summary.difference > 0 && (
          <div className="flex items-center justify-between text-sm text-white/80">
            <span>差額</span>
            <span>{yen(summary.difference)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-white/20 px-4 py-3 text-center text-base font-semibold">
        {summary.message}
      </div>
    </div>
  );
}

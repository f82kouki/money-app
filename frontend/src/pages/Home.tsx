import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import PaymentForm, { type PaymentFormValues } from "../components/PaymentForm";
import PaymentList from "../components/PaymentList";
import SummaryCard from "../components/SummaryCard";
import type { Group, Payment, Summary } from "../types";

export default function Home() {
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([
      api.get<Summary>("/api/summary"),
      api.get<Payment[]>("/api/payments"),
    ]);
    setSummary(s);
    setPayments(p);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const g = await api.get<Group>("/api/groups/me");
        setGroup(g);
        await refresh();
      } catch (err) {
        // グループ未所属(409) なら作成/参加画面へ
        if (err instanceof ApiError && err.status === 409) {
          navigate("/setup", { replace: true });
          return;
        }
        setError(err instanceof ApiError ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, refresh]);

  async function addPayment(values: PaymentFormValues) {
    await api.post<Payment>("/api/payments", values);
    await refresh();
  }

  async function updatePayment(id: string, values: PaymentFormValues) {
    await api.patch<Payment>(`/api/payments/${id}`, values);
    await refresh();
  }

  async function deletePayment(id: string) {
    await api.delete(`/api/payments/${id}`);
    await refresh();
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }
  if (!group || !summary) return null;

  return (
    <div className="min-h-screen pb-10">
      <header className="flex items-center justify-between px-4 py-4">
        <h1 className="text-lg font-bold text-slate-800">{group.name}</h1>
        <Link
          to="/settings"
          className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm"
        >
          設定
        </Link>
      </header>

      <div className="space-y-4 px-4">
        <SummaryCard summary={summary} />

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">支払いを記録</h2>
          <PaymentForm
            members={group.members}
            defaultPayerId={group.my_member_id}
            onSubmit={addPayment}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">履歴</h2>
          <PaymentList
            payments={payments}
            members={group.members}
            myMemberId={group.my_member_id}
            onUpdate={updatePayment}
            onDelete={deletePayment}
          />
        </section>
      </div>
    </div>
  );
}

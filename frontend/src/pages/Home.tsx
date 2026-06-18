import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import CelebrationDialog from "../components/CelebrationDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import PaymentForm, { type PaymentFormValues } from "../components/PaymentForm";
import PaymentList from "../components/PaymentList";
import SummaryCard from "../components/SummaryCard";
import type { CelebrationSettings, Group, Payment, Summary } from "../types";

export default function Home() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSettle, setConfirmingSettle] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState("");
  const [celebrationUrl, setCelebrationUrl] = useState<string | null>(null);
  // お祝い設定はマウント時に1回だけ取得して保持する（記録のたびに再取得しない）。
  // 設定変更は別ルート(/settings)でのみ起き、戻ると Home が再マウントされ再取得される。
  const [celebration, setCelebration] = useState<CelebrationSettings | null>(null);

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
        // 3本は相互依存が無い（いずれも所属メンバーにのみ依存）ので並列取得する。
        const [g, s, p] = await Promise.all([
          api.get<Group>("/api/groups/me"),
          api.get<Summary>("/api/summary"),
          api.get<Payment[]>("/api/payments"),
        ]);
        setGroup(g);
        setSummary(s);
        setPayments(p);
      } catch (err) {
        // グループ未所属なら 3本とも 409 を返すため、Promise.all が 409 で reject する。
        // その場合は作成/参加画面へ。
        if (err instanceof ApiError && err.status === 409) {
          navigate("/setup", { replace: true });
          return;
        }
        setError(err instanceof ApiError ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    // お祝い表示は付随機能なので、取得失敗は無視して記録機能には影響させない。
    api
      .get<CelebrationSettings>("/api/me/celebration")
      .then(setCelebration)
      .catch(() => {});
  }, []);

  async function addPayment(values: PaymentFormValues) {
    await api.post<Payment>("/api/payments", values);
    await refresh();
    // 記録成功後にお祝い画像ダイアログを表示（マウント時に取得済みの設定を使う）。
    // 編集(updatePayment)では表示しない。複数枚あればランダムに1枚選ぶ。
    if (celebration?.celebration_enabled && celebration.images.length > 0) {
      const pick =
        celebration.images[
          Math.floor(Math.random() * celebration.images.length)
        ];
      setCelebrationUrl(pick.url);
    }
  }

  async function updatePayment(id: string, values: PaymentFormValues) {
    await api.patch<Payment>(`/api/payments/${id}`, values);
    await refresh();
  }

  async function deletePayment(id: string) {
    await api.delete(`/api/payments/${id}`);
    await refresh();
  }

  // 現在の貸し借りを精算して集計をリセットする（履歴は残る）。
  async function doSettle() {
    setSettleError("");
    setSettling(true);
    try {
      await api.post("/api/settlements");
      await refresh();
    } catch (err) {
      setSettleError(err instanceof ApiError ? err.message : "精算に失敗しました");
    } finally {
      setSettling(false);
      setConfirmingSettle(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }
  if (!group || !summary) return null;

  const myName =
    group.members.find((m) => m.id === group.my_member_id)?.display_name ??
    "ユーザー";

  const closeMenu = () => setMenuOpen(false);

  // PayPayアプリをURLスキームで起動する。
  // 素の <a href="paypay://"> だと「未インストール時に何も起きない」「一部ブラウザで
  // 起動が不安定」なので、JSで起動を試みつつ未インストール時はストア/公式サイトへ誘導する。
  const openPayPay = (e: React.MouseEvent) => {
    e.preventDefault();
    closeMenu();

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    // モバイル以外(PC等)はアプリが無いので公式サイトを開く
    if (!isIOS && !isAndroid) {
      window.open("https://paypay.ne.jp/", "_blank", "noopener");
      return;
    }

    const storeUrl = isIOS
      ? "https://apps.apple.com/jp/app/id1435783608"
      : "https://play.google.com/store/apps/details?id=jp.ne.paypay.android.app";

    // 未インストールでアプリが起動しなかった場合はストアへフォールバック
    const fallback = window.setTimeout(() => {
      window.location.href = storeUrl;
    }, 1500);
    // アプリ起動でタブが非表示になったらフォールバックを取り消す
    const cancelFallback = () => {
      window.clearTimeout(fallback);
      document.removeEventListener("visibilitychange", cancelFallback);
    };
    document.addEventListener("visibilitychange", cancelFallback);

    window.location.href = "paypay://";
  };

  return (
    <div className="min-h-screen pb-10">
      <header className="flex items-center justify-between px-4 py-4">
        <img
          src="/favicon.png"
          alt="ねここあらの財布"
          className="h-9 w-9 rounded-xl object-cover"
        />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="メニュー"
          aria-expanded={menuOpen}
          className="rounded-full bg-white p-2 text-primary-text shadow-sm"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
      </header>

      {/* スライド式ドロワーメニュー */}
      <div
        onClick={closeMenu}
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[80%] max-w-xs flex-col bg-white transition-transform duration-300 ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* ロゴ + 閉じる */}
        <div className="flex items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={closeMenu}
            aria-label="閉じる"
            className="p-1 text-slate-400"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* プロフィール */}
        <div className="mx-3 flex items-center gap-3 rounded-2xl bg-primary-light px-4 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-text">
            {myName.charAt(0)}
          </div>
          <span className="flex-1 truncate font-bold text-slate-800">
            {myName}
          </span>
          <button
            type="button"
            onClick={() => {
              closeMenu();
              logout();
            }}
            className="text-sm text-slate-400"
          >
            ログアウト
          </button>
        </div>

        {/* メニュー項目 */}
        <nav className="mt-3 flex flex-col">
          <button
            type="button"
            onClick={closeMenu}
            className="flex items-center gap-4 px-6 py-3.5 text-left text-base font-medium text-slate-700 hover:bg-primary-light"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-500"
            >
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            </svg>
            ホーム
          </button>

          <Link
            to="/settings"
            onClick={closeMenu}
            className="flex items-center gap-4 px-6 py-3.5 text-base font-medium text-slate-700 hover:bg-primary-light"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-500"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            設定
          </Link>

          <Link
            to="/messages"
            onClick={closeMenu}
            className="flex items-center gap-4 px-6 py-3.5 text-base font-medium text-slate-700 hover:bg-primary-light"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-500"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
            </svg>
            メッセージ
          </Link>

          <div className="my-2 mx-6 border-t border-slate-200" />

          <a
            href="paypay://"
            onClick={openPayPay}
            className="flex items-center gap-4 px-6 py-3.5 text-base font-medium text-primary-text hover:bg-primary-light"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M16 12a2 2 0 0 0 2 2h4" />
              <path d="M2 10h14" />
            </svg>
            PayPayを開く
          </a>
        </nav>
      </aside>

      <div className="space-y-4 px-4">
        {/* ヒーロー: 使い方の案内 */}
        <section className="pt-1 text-center">
          <h2 className="text-xl font-bold text-primary-text">
            お会計の金額を入力してね
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            払った人と「お会計の全額」を入れるだけ。半分に割らなくてOK、精算額は自動で計算します。
          </p>
        </section>

        <SummaryCard
          summary={summary}
          settling={settling}
          onSettle={() => {
            setSettleError("");
            setConfirmingSettle(true);
          }}
        />
        {settleError && (
          <p className="px-1 text-sm text-red-600">{settleError}</p>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">支払いを記録</h2>
          <PaymentForm
            members={group.members}
            defaultPayerId={group.my_member_id}
            playSoundOnSubmit
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

      {celebrationUrl && (
        <CelebrationDialog
          image={celebrationUrl}
          onClose={() => setCelebrationUrl(null)}
        />
      )}

      {confirmingSettle && (
        <ConfirmDialog
          message="現在の貸し借りを精算して集計をリセットします。よろしいですか？（記録の履歴は残ります）"
          confirmLabel="精算する"
          onCancel={() => setConfirmingSettle(false)}
          onConfirm={doSettle}
        />
      )}
    </div>
  );
}

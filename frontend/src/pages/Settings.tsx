import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Group, Member } from "../types";

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<Group>("/api/groups/me")
      .then((g) => {
        setGroup(g);
        const me = g.members.find((m) => m.id === g.my_member_id);
        setDisplayName(me?.display_name ?? "");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          navigate("/setup", { replace: true });
        } else {
          setError("読み込みに失敗しました");
        }
      });
  }, [navigate]);

  async function saveName() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api.patch<Member>("/api/members/me", { display_name: displayName });
      setMessage("表示名を更新しました");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* クリップボード不可の環境は無視 */
    }
  }

  if (!group) {
    return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
  }

  const partnerCount = group.members.length;

  return (
    <div className="min-h-screen px-4 pb-10">
      <header className="flex items-center gap-3 py-4">
        <button onClick={() => navigate("/")} className="text-slate-500">
          ← 戻る
        </button>
        <h1 className="text-lg font-bold text-slate-800">設定</h1>
      </header>

      <div className="space-y-5">
        {/* 表示名編集 */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">あなたの表示名</h2>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
          />
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={saveName}
            disabled={saving}
            className="mt-3 w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </section>

        {/* 招待コード */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">招待コード</h2>
          {partnerCount >= 2 ? (
            <p className="text-sm text-slate-400">
              2人そろっています（{group.members.map((m) => m.display_name).join(" ・ ")}）
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">
                相手にこのコードを渡して参加してもらいましょう。
              </p>
              <button
                onClick={copyCode}
                className="w-full rounded-xl bg-slate-100 py-4 text-center text-2xl font-mono font-bold tracking-widest text-slate-800"
              >
                {group.invite_code}
              </button>
              <p className="mt-2 text-center text-xs text-indigo-500">
                {copied ? "コピーしました！" : "タップでコピー"}
              </p>
            </>
          )}
        </section>

        {/* ログアウト */}
        <button
          onClick={logout}
          className="w-full rounded-xl bg-white py-3 text-base font-semibold text-red-500 shadow"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}

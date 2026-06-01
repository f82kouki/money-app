import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Group } from "../types";

type Mode = "create" | "join";

export default function GroupSetup() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [mode, setMode] = useState<Mode>("create");
  const [displayName, setDisplayName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "create") {
        await api.post<Group>("/api/groups", {
          name: groupName,
          display_name: displayName,
        });
      } else {
        await api.post<Group>("/api/groups/join", {
          invite_code: inviteCode.trim().toUpperCase(),
          display_name: displayName,
        });
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-6 text-center text-2xl font-bold text-slate-800">
        割り勘グループ
      </h1>

      <div className="mb-6 flex rounded-xl bg-slate-200 p-1">
        <button
          onClick={() => setMode("create")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            mode === "create" ? "bg-white text-indigo-600 shadow" : "text-slate-500"
          }`}
        >
          新しく作る
        </button>
        <button
          onClick={() => setMode("join")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
            mode === "join" ? "bg-white text-indigo-600 shadow" : "text-slate-500"
          }`}
        >
          招待コードで参加
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-slate-500">あなたの表示名</label>
          <input
            placeholder="例: たろう"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={50}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
          />
        </div>

        {mode === "create" ? (
          <div>
            <label className="mb-1 block text-sm text-slate-500">グループ名</label>
            <input
              placeholder="例: 旅行費 / 家計"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm text-slate-500">招待コード</label>
            <input
              placeholder="6文字のコード"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              required
              maxLength={12}
              autoCapitalize="characters"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-indigo-500"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "処理中…" : mode === "create" ? "グループを作成" : "参加する"}
        </button>
      </form>

      <button
        onClick={logout}
        className="mt-6 text-center text-sm text-slate-400 underline"
      >
        ログアウト
      </button>
    </div>
  );
}

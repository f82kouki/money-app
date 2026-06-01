import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-8 text-center text-3xl font-bold text-indigo-600">新規登録</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="パスワード（6文字以上）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "登録中…" : "登録する"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        すでにアカウントがある？{" "}
        <Link to="/login" className="font-semibold text-indigo-600">
          ログイン
        </Link>
      </p>
    </div>
  );
}

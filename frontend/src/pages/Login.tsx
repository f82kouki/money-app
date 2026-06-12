import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-8 text-center text-3xl font-bold text-primary-text">warikan</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="text"
          autoComplete="username"
          placeholder="ユーザーID（メールでなくてもOK）"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary py-3 text-base font-semibold text-primary-text active:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "ログイン中…" : "ログイン"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        アカウントがない？{" "}
        <Link to="/register" className="font-semibold text-primary-text">
          新規登録
        </Link>
      </p>
    </div>
  );
}

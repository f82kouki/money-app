import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/Button";

type Mode = "password" | "aikotoba";

export default function Login() {
  const { login, loginWithAikotoba } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aikotoba, setAikotoba] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "aikotoba") {
        await loginWithAikotoba(email, aikotoba);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <h1 className="mb-8 text-center text-3xl font-bold text-primary-text">ログイン</h1>
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
        {mode === "password" ? (
          <input
            type="password"
            autoComplete="current-password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
          />
        ) : (
          <input
            type="text"
            autoComplete="off"
            placeholder="あいことば"
            value={aikotoba}
            onChange={(e) => setAikotoba(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
          />
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? "ログイン中…" : "ログイン"}
        </Button>
      </form>
      <button
        type="button"
        onClick={() =>
          switchMode(mode === "password" ? "aikotoba" : "password")
        }
        className="mt-4 text-center text-sm font-semibold text-primary-text"
      >
        {mode === "password"
          ? "あいことばでログイン"
          : "パスワードでログイン"}
      </button>
      <p className="mt-6 text-center text-sm text-slate-500">
        アカウントお持ちでない方　{" "}
        <Link to="/register" className="font-semibold text-primary-text">
          新規登録
        </Link>
      </p>
    </div>
  );
}

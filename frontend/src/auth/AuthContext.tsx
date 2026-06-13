import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ApiError, api, getToken, setToken } from "../api/client";

interface TokenOut {
  access_token: string;
}

interface AuthState {
  // 認証済みかどうか。null = 確認中（初回ロード）
  authed: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  // 起動時の認証判定。トークンがあれば楽観的に認証済みとして即UIを出し、
  // /me の応答待ちで「読み込み中…」を長く見せない。検証は背景で行う。
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    // 401（トークン無効/期限切れ）のときだけログアウトする。
    // ネットワーク/タイムアウト等の一時障害では楽観状態を維持する。
    api.get("/api/auth/me").catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setAuthed(false);
      }
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<TokenOut>("/api/auth/login", { email, password });
    setToken(res.access_token);
    setAuthed(true);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.post<TokenOut>("/api/auth/register", { email, password });
    setToken(res.access_token);
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, getToken, setToken } from "../api/client";

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

  // 起動時にトークンの有無を確認（/me で有効性チェック）
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    api
      .get("/api/auth/me")
      .then(() => setAuthed(true))
      .catch(() => {
        setToken(null);
        setAuthed(false);
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

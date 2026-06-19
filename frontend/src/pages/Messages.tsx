import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import Button from "../components/Button";
import type { Group, Message } from "../types";

const POLL_MS = 4000; // 表示中の新着取得間隔

function sameList(a: Message[], b: Message[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export default function Messages() {
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 初回ロード: グループ（メンバー名・自分の判定用）＋メッセージ
  useEffect(() => {
    (async () => {
      try {
        const [g, m] = await Promise.all([
          api.get<Group>("/api/groups/me"),
          api.get<Message[]>("/api/messages"),
        ]);
        setGroup(g);
        setMessages(m);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          navigate("/setup", { replace: true });
          return;
        }
        setError("読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // ポーリング: 表示中だけ定期取得。内容が変わらなければ state を据え置く
  // （無駄な再描画・自動スクロールを防ぐ）。
  useEffect(() => {
    const id = window.setInterval(() => {
      api
        .get<Message[]>("/api/messages")
        .then((m) => setMessages((prev) => (sameList(prev, m) ? prev : m)))
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  // 新着が来たら一番下へスクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError("");
    setSending(true);
    try {
      const msg = await api.post<Message>("/api/messages", { body: text });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  const myId = group?.my_member_id;
  const nameOf = (id: string) =>
    group?.members.find((m) => m.id === id)?.display_name ?? "";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 px-4 py-4">
        <button onClick={() => navigate("/")} className="text-slate-500">
          ← 戻る
        </button>
        <h1 className="text-lg font-bold text-slate-800">メッセージ</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            まだメッセージがありません。
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_member_id === myId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[80%]">
                  {!mine && (
                    <div className="mb-1 px-1 text-xs text-slate-400">
                      {nameOf(m.sender_member_id)}
                    </div>
                  )}
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 shadow-sm ${
                      mine
                        ? "rounded-tr-sm bg-cta text-cta-fg"
                        : "rounded-tl-sm bg-white text-slate-800"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-1 text-sm text-red-600">{error}</p>}

      <form
        onSubmit={send}
        className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-3"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="メッセージを入力…"
          maxLength={1000}
          className="flex-1 rounded-full border border-slate-300 px-4 py-2.5 text-base outline-none focus:border-primary-mid"
        />
        <Button
          type="submit"
          disabled={sending || body.trim().length === 0}
          className="shrink-0 px-5 py-2.5"
        >
          送信
        </Button>
      </form>
    </div>
  );
}

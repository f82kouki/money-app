import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import Button from "../components/Button";
import type {
  CelebrationImage,
  CelebrationSettings,
  Group,
  Member,
} from "../types";
import { downscaleImage } from "../utils/image";

const MAX_IMAGES = 5;

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // おさいふの名前（タイトル）
  const [walletName, setWalletName] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [walletError, setWalletError] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);

  // お祝い画像（記録時のダイアログ・複数枚）
  const [celebEnabled, setCelebEnabled] = useState(false);
  const [celebImages, setCelebImages] = useState<CelebrationImage[]>([]);
  const [celebMessage, setCelebMessage] = useState("");
  const [celebError, setCelebError] = useState("");
  const [celebBusy, setCelebBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<Group>("/api/groups/me")
      .then((g) => {
        setGroup(g);
        setWalletName(g.name);
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

  useEffect(() => {
    api
      .get<CelebrationSettings>("/api/me/celebration")
      .then((c) => {
        setCelebEnabled(c.celebration_enabled);
        setCelebImages(c.images);
      })
      .catch(() => {
        /* 取得失敗時はデフォルト(オフ・画像なし)のまま */
      });
  }, []);

  async function toggleCeleb(next: boolean) {
    setCelebError("");
    setCelebMessage("");
    setCelebEnabled(next); // 楽観的に反映
    try {
      const c = await api.patch<CelebrationSettings>("/api/me/celebration", {
        celebration_enabled: next,
      });
      setCelebEnabled(c.celebration_enabled);
    } catch (err) {
      setCelebEnabled(!next); // 失敗したら戻す
      setCelebError(err instanceof ApiError ? err.message : "更新に失敗しました");
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるようにリセット
    if (!file) return;
    setCelebError("");
    setCelebMessage("");
    setCelebBusy(true);
    try {
      const blob = await downscaleImage(file, 512, 0.85);
      const form = new FormData();
      form.append("file", blob, "celebration.jpg");
      const c = await api.postForm<CelebrationSettings>(
        "/api/me/celebration/image",
        form
      );
      setCelebImages(c.images);
      setCelebMessage("画像を追加しました");
    } catch (err) {
      setCelebError(err instanceof ApiError ? err.message : "画像の保存に失敗しました");
    } finally {
      setCelebBusy(false);
    }
  }

  async function deleteCelebImage(id: string) {
    setCelebError("");
    setCelebMessage("");
    setCelebBusy(true);
    try {
      const c = await api.delete<CelebrationSettings>(
        `/api/me/celebration/image/${id}`
      );
      setCelebImages(c.images);
      setCelebMessage("画像を削除しました");
    } catch (err) {
      setCelebError(err instanceof ApiError ? err.message : "削除に失敗しました");
    } finally {
      setCelebBusy(false);
    }
  }

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

  async function saveWalletName() {
    setWalletError("");
    setWalletMessage("");
    setWalletSaving(true);
    try {
      const g = await api.patch<Group>("/api/groups/me", { name: walletName });
      setGroup(g);
      setWalletName(g.name);
      setWalletMessage("おさいふの名前を更新しました");
    } catch (err) {
      setWalletError(err instanceof ApiError ? err.message : "更新に失敗しました");
    } finally {
      setWalletSaving(false);
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
  const canAddImage = celebImages.length < MAX_IMAGES;

  return (
    <div className="min-h-screen px-4 pb-10">
      <header className="flex items-center gap-3 py-4">
        <button onClick={() => navigate("/")} className="text-slate-500">
          ← 戻る
        </button>
        <h1 className="text-lg font-bold text-slate-800">設定</h1>
      </header>

      <div className="space-y-5">
        {/* おさいふの名前（タイトル） */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            おさいふの名前
          </h2>
          <input
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            maxLength={100}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
          />
          {walletMessage && (
            <p className="mt-2 text-sm text-green-600">{walletMessage}</p>
          )}
          {walletError && (
            <p className="mt-2 text-sm text-red-600">{walletError}</p>
          )}
          <Button
            fullWidth
            onClick={saveWalletName}
            disabled={walletSaving || walletName.trim().length === 0}
            className="mt-3"
          >
            {walletSaving ? "保存中…" : "保存"}
          </Button>
        </section>

        {/* 表示名編集 */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">あなたの表示名</h2>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid"
          />
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button
            fullWidth
            onClick={saveName}
            disabled={saving}
            className="mt-3"
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </section>

        {/* 記録時の表示画像（複数枚） */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            記録時の表示画像
          </h2>

          {/* オン/オフ スイッチ */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">
              記録したときに画像を表示する
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={celebEnabled}
              onClick={() => toggleCeleb(!celebEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full px-0.5 transition-colors ${
                celebEnabled ? "bg-primary-mid" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  celebEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 画像グリッド（サムネ＋個別削除） */}
          {celebImages.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {celebImages.map((img) => (
                <div key={img.id} className="relative">
                  <img
                    src={img.url}
                    alt="お祝い画像"
                    className="h-24 w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => deleteCelebImage(img.id)}
                    disabled={celebBusy}
                    aria-label="この画像を削除"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white shadow disabled:opacity-50"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 追加 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onPickImage}
            className="hidden"
          />
          <Button
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            disabled={celebBusy || !canAddImage}
            className="mt-3"
          >
            {celebBusy
              ? "処理中…"
              : canAddImage
                ? `画像を追加（${celebImages.length}/${MAX_IMAGES}）`
                : `上限（${MAX_IMAGES}枚）に達しました`}
          </Button>
          <p className="mt-2 text-xs text-slate-400">
            複数枚あると、記録のたびにランダムで表示されます。
          </p>
          {celebMessage && (
            <p className="mt-2 text-sm text-green-600">{celebMessage}</p>
          )}
          {celebError && <p className="mt-2 text-sm text-red-600">{celebError}</p>}
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
              <p className="mt-2 text-center text-xs text-primary-text">
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

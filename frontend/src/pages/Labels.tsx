import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, api } from "../api/client";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Label } from "../types";

// backend/app/schemas.py の MAX_LABELS / LABEL_NAME_MAX_CHARS とそろえる。
const MAX_LABELS = 50;
const NAME_MAX_CHARS = 20;

const INPUT_CLASS =
  "min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-primary-mid";

// サーバーと同じ正規化・同じ数え方で先に判定する（422 は汎用の文言になるため）。
function normalizeName(value: string): string {
  return value.normalize("NFKC").trim();
}

function validateName(name: string): string {
  if (!name) return "ラベル名を入力してください";
  if ([...name].length > NAME_MAX_CHARS) {
    return `ラベル名は${NAME_MAX_CHARS}文字以内で入力してください`;
  }
  return "";
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export default function Labels() {
  const navigate = useNavigate();
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(
    null
  );
  const [deleting, setDeleting] = useState<Label | null>(null);

  useEffect(() => {
    api
      .get<Label[]>("/api/labels")
      .then(setLabels)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          navigate("/setup", { replace: true });
        } else {
          setLoadError("読み込みに失敗しました");
        }
      });
  }, [navigate]);

  // 相手が先に削除していた場合は、表示だけ実態に合わせる。
  function removeGoneLabel(id: string) {
    setLabels((prev) => prev?.filter((label) => label.id !== id) ?? prev);
    setEditingId(null);
    setMessage("このラベルはすでに削除されています");
  }

  function clearNotices() {
    setMessage("");
    setError("");
    setRowError(null);
  }

  async function addLabel(e: FormEvent) {
    e.preventDefault();
    clearNotices();
    const name = normalizeName(newName);
    const invalid = validateName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const created = await api.post<Label>("/api/labels", { name });
      setLabels((prev) => (prev ? [...prev, created] : [created]));
      setNewName("");
      setMessage(`「${created.name}」を追加しました`);
    } catch (err) {
      setError(messageOf(err, "追加に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  function startEditing(label: Label) {
    clearNotices();
    setEditingId(label.id);
    setEditingName(label.name);
  }

  async function saveName(e: FormEvent, id: string) {
    e.preventDefault();
    clearNotices();
    const name = normalizeName(editingName);
    const invalid = validateName(name);
    if (invalid) {
      setRowError({ id, text: invalid });
      return;
    }
    setBusy(true);
    try {
      const updated = await api.patch<Label>(`/api/labels/${id}`, { name });
      setLabels(
        (prev) =>
          prev?.map((label) => (label.id === id ? updated : label)) ?? prev
      );
      setEditingId(null);
    } catch (err) {
      if (isGone(err)) {
        removeGoneLabel(id);
      } else {
        setRowError({ id, text: messageOf(err, "保存に失敗しました") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteLabel(id: string) {
    clearNotices();
    setBusy(true);
    try {
      await api.delete(`/api/labels/${id}`);
      setLabels((prev) => prev?.filter((label) => label.id !== id) ?? prev);
    } catch (err) {
      if (isGone(err)) {
        removeGoneLabel(id);
      } else {
        setRowError({ id, text: messageOf(err, "削除に失敗しました") });
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return <div className="p-8 text-center text-red-600">{loadError}</div>;
  }
  if (!labels) {
    return <div className="p-8 text-center text-slate-500">読み込み中…</div>;
  }

  const canAdd = labels.length < MAX_LABELS;

  return (
    <div className="min-h-screen px-4 pb-10">
      <header className="flex items-center gap-3 py-4">
        <button onClick={() => navigate("/")} className="text-slate-500">
          ← 戻る
        </button>
        <h1 className="text-lg font-bold text-slate-800">ラベル</h1>
      </header>

      <div className="space-y-5">
        {/* 追加 */}
        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">
            ラベルを追加
          </h2>
          <form onSubmit={addLabel} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={NAME_MAX_CHARS}
              placeholder="新しいラベル"
              aria-label="新しいラベル"
              className={INPUT_CLASS}
            />
            <Button
              type="submit"
              disabled={busy || !canAdd}
              className="shrink-0"
            >
              追加
            </Button>
          </form>
          <p className="mt-2 text-xs text-slate-400">
            {canAdd
              ? `${labels.length} / ${MAX_LABELS} 個。ラベルは2人で共有されます。`
              : `上限（${MAX_LABELS}個）に達しました。追加するには、使わないラベルを削除してください。`}
          </p>
          {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>

        {/* 一覧 */}
        <section className="rounded-2xl bg-white px-4 py-2 shadow">
          {labels.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              ラベルがありません。上の入力欄から追加してください。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {labels.map((label) => (
                <li key={label.id} className="py-3">
                  {editingId === label.id ? (
                    <form
                      onSubmit={(e) => saveName(e, label.id)}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={NAME_MAX_CHARS}
                        aria-label="ラベル名"
                        autoFocus
                        className={INPUT_CLASS}
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="shrink-0 p-1 text-sm font-semibold text-primary-text disabled:opacity-50"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setRowError(null);
                        }}
                        className="shrink-0 p-1 text-sm text-slate-400"
                      >
                        やめる
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-base text-slate-800">
                        {label.name}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {label.payment_count}件
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditing(label)}
                        disabled={busy}
                        className="shrink-0 p-1 text-sm font-semibold text-primary-text disabled:opacity-50"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearNotices();
                          setDeleting(label);
                        }}
                        disabled={busy}
                        className="shrink-0 p-1 text-sm font-semibold text-red-400 disabled:opacity-50"
                      >
                        削除
                      </button>
                    </div>
                  )}
                  {rowError?.id === label.id && (
                    <p className="mt-1 text-sm text-red-600">{rowError.text}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {deleting && (
        <ConfirmDialog
          message={
            deleting.payment_count > 0
              ? `「${deleting.name}」を削除しますか？${deleting.payment_count}件の記録からこのラベルが外れます。金額と精算は変わりません。`
              : `「${deleting.name}」を削除しますか？`
          }
          onConfirm={() => {
            void deleteLabel(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

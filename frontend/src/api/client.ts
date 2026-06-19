// fetch ラッパ。JWT を Authorization ヘッダに付与し、エラーは例外にする。

const TOKEN_KEY = "warikan_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// エラー応答から人間可読なメッセージを取り出す。
// FastAPI の 422(入力検証)は detail が配列([{loc,msg,...}])なので、
// そのまま文字列化すると "[object Object]" になる。配列のときは丸めた文言にする。
function errorMessage(data: unknown, status: number): string {
  const detail =
    data && typeof data === "object"
      ? (data as { detail?: unknown }).detail
      : undefined;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return "入力内容を確認してください";
  }
  return `エラーが発生しました (${status})`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data, res.status));
  }
  return data as T;
}

// multipart/form-data 送信（画像アップロード用）。
// Content-Type はブラウザに boundary 付きで自動設定させるため、ここでは付けない。
async function requestForm<T>(
  method: string,
  path: string,
  form: FormData
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { method, headers, body: form });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, errorMessage(data, res.status));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  postForm: <T>(path: string, form: FormData) =>
    requestForm<T>("POST", path, form),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

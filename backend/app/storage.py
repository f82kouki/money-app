"""お祝い画像の保存先を抽象化するモジュール。

celebration_image カラムには「画像への参照文字列」を1つだけ保存する:
  - フォールバック(ローカル/未設定) : data URL  (例 "data:image/jpeg;base64,...")
  - 本番(Supabase Storage)         : バケット内オブジェクトキー (例 "<user_id>")

呼び出し側(routers/settings.py)は保存先を意識せず、この3関数だけを使う。
SUPABASE_URL / SUPABASE_SERVICE_KEY が揃えば Storage を使い、無ければ data URL に
フォールバックする（ローカル開発・テスト用）。
"""
from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from .config import settings

logger = logging.getLogger("warikan")

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_TIMEOUT = 10.0  # 秒


def _object_path(user_id: str, image_id: str) -> str:
    # 画像ごとに 1 オブジェクト（複数枚対応）。ユーザー単位で分け、孤児削除しやすく。
    # 拡張子なし(形式が変わっても同キー上書きで孤児が出ない)。
    return f"{user_id}/{image_id}"


def _bucket_url(path: str) -> str:
    return (
        f"{settings.supabase_url}/storage/v1/object/"
        f"{settings.supabase_bucket}/{urllib.parse.quote(path)}"
    )


def _request(
    method: str,
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> bytes:
    """Supabase Storage REST を叩く薄いラッパ。失敗時は本文付きで RuntimeError。"""
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {settings.supabase_service_key}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"Supabase Storage {method} -> {e.code}: {body}") from e


def save_image(user_id: str, image_id: str, content: bytes, content_type: str) -> str:
    """画像を保存し、DBに入れる参照文字列を返す。

    image_id は celebration_images の行 ID。Storage 上で画像ごとに別オブジェクトに
    分けるために使う（ローカルの data URL では使わない）。
    """
    safe_ct = content_type if content_type in _ALLOWED_CONTENT_TYPES else "image/jpeg"
    if not settings.supabase_storage_enabled:
        encoded = base64.b64encode(content).decode("ascii")
        return f"data:{safe_ct};base64,{encoded}"
    path = _object_path(user_id, image_id)
    _request(
        "POST",
        _bucket_url(path),
        data=content,
        headers={
            "Content-Type": safe_ct,
            "x-upsert": "true",            # 既存があれば上書き
            "Cache-Control": "max-age=3600",
        },
    )
    return path


def resolve_url(ref: str | None) -> str | None:
    """表示用URLを返す。data URL ならそのまま、Storageキーなら署名URLを発行。"""
    if not ref:
        return None
    if ref.startswith("data:"):
        return ref  # 旧データ(base64)はそのまま表示
    if not settings.supabase_storage_enabled:
        return ref
    try:
        url = (
            f"{settings.supabase_url}/storage/v1/object/sign/"
            f"{settings.supabase_bucket}/{urllib.parse.quote(ref)}"
        )
        raw = _request(
            "POST",
            url,
            data=json.dumps({"expiresIn": settings.supabase_signed_url_ttl}).encode(),
            headers={"Content-Type": "application/json"},
        )
        data = json.loads(raw)
        signed = data.get("signedURL") or data.get("signedUrl")
        if not signed:
            raise RuntimeError(f"no signedURL in response: {data}")
        if signed.startswith("http"):
            return signed
        if not signed.startswith("/"):
            signed = "/" + signed
        if signed.startswith("/storage/v1"):
            return settings.supabase_url + signed
        return settings.supabase_url + "/storage/v1" + signed
    except Exception as e:  # 署名失敗で設定画面を500にしない。画像なし扱い+ログ。
        logger.warning("お祝い画像の署名URL発行に失敗: %s", e)
        return None


def delete_image(ref: str | None) -> None:
    """保存済み画像の実体を削除する(best-effort)。"""
    if not ref or ref.startswith("data:"):
        return None  # data URL は実体がDBにあるだけ。呼び出し側がカラムをNoneにする。
    if not settings.supabase_storage_enabled:
        return None
    try:
        _request("DELETE", _bucket_url(ref))
    except Exception as e:
        logger.warning("お祝い画像の削除に失敗: %s", e)
    return None

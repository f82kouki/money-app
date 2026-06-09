"""お祝い画像の保存先を抽象化するモジュール。

celebration_image カラムには「画像への参照文字列」を1つだけ保存する:
  - ローカル保存（この実装）   : data URL  (例 "data:image/jpeg;base64,...")
  - 本番(Supabase, Issue #1)  : Storage パス (例 "celebration/<user_id>.jpg")

呼び出し側（routers/settings.py）は保存先を意識せず、この3関数だけを使う。
Supabase 接続は Issue #1 で TODO(#1) の箇所を埋めるだけで差し込める。
"""
from __future__ import annotations

import base64

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def save_image(user_id: str, content: bytes, content_type: str) -> str:
    """画像を保存し、DBに入れる参照文字列を返す。

    ローカルでは data URL を作って返す（Content-Type は image/* に正規化して偽装を防ぐ）。
    """
    # TODO(#1): Supabase Storage 有効時はここで private バケットへアップロードし、
    #           "celebration/<user_id>.jpg" のような Storage パスを返す。
    safe_ct = content_type if content_type in _ALLOWED_CONTENT_TYPES else "image/jpeg"
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{safe_ct};base64,{encoded}"


def resolve_url(ref: str | None) -> str | None:
    """表示用URLを返す。data URL ならそのまま、Storage パスなら署名URLを発行。"""
    if not ref:
        return None
    if ref.startswith("data:"):
        return ref
    # TODO(#1): Storage パスのときは Supabase の期限付き署名URLを発行して返す。
    return ref


def delete_image(ref: str | None) -> None:
    """保存済み画像の実体を削除する（必要な場合）。

    ローカル(data URL)は実体がDBカラムにあるだけなので、ここでは何もしない
    （呼び出し側でカラムを None にする）。
    """
    # TODO(#1): Supabase 保存時はここで Storage オブジェクトを削除する。
    return None

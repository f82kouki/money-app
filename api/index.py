"""Vercel の Python サーバーレス関数エントリ。

backend/ を import パスに追加し、FastAPI の `app` をそのまま公開する。
Vercel の Python ランタイムは ASGI アプリ(app)を検出してそのまま動かす。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]

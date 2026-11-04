"""認証 API の IP 単位レート制限（固定窓）。

アカウント単位のロック(L1)は「1つの ID への推測」を止めるが、多数の ID をまたぐ試行や
/register での ID 存在確認は止められない。その穴を IP 単位で狭める。
サーバーレスはプロセス間でメモリを共有しないため、カウンタは DB に持つ。
"""
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .config import settings
from .db import engine, get_db
from .logging_config import logger
from .models import AuthRateLimit


def _client_ip(request: Request) -> str:
    # Vercel は X-Forwarded-For を自身の値で上書きするため、クライアントは偽装できない。
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_key(ip: str) -> str:
    """生の IP を DB に残さないよう HMAC にする。"""
    return hmac.new(
        settings.jwt_secret.encode("utf-8"), ip.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _record_hit(db: Session, key: str, now: datetime) -> int:
    """試行を1回記録し、現在の窓での累計を返す。

    読んでから書くと同時試行で更新が失われるので、UPSERT で原子的に数える。
    """
    window_floor = now - timedelta(minutes=settings.auth_rate_limit_window_minutes)
    expired = AuthRateLimit.window_start < window_floor
    insert = sqlite_insert if engine.dialect.name == "sqlite" else pg_insert
    stmt = (
        insert(AuthRateLimit)
        .values(key=key, window_start=now, hits=1)
        .on_conflict_do_update(
            index_elements=[AuthRateLimit.key],
            set_={
                "window_start": case((expired, now), else_=AuthRateLimit.window_start),
                "hits": case((expired, 1), else_=AuthRateLimit.hits + 1),
            },
        )
        .returning(AuthRateLimit.hits)
    )
    hits = db.scalar(stmt)
    if hits == 1:
        # 新しい窓の開始時に、期限切れの行を掃除する（IP 由来の値を残し続けない）。
        db.execute(delete(AuthRateLimit).where(AuthRateLimit.window_start < window_floor))
    db.commit()
    return hits


def enforce_auth_rate_limit(
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    """上限を超えた IP の認証リクエストを 429 で弾く依存関数。"""
    key = _rate_key(_client_ip(request))
    hits = _record_hit(db, key, datetime.now(timezone.utc))
    if hits > settings.auth_rate_limit_max:
        logger.warning("認証レート制限: key=%s hits=%d", key[:8], hits)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="アクセスが集中しています。しばらくしてから再度お試しください",
        )

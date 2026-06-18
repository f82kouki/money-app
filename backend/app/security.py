"""パスワードハッシュ・JWT 発行/検証・認証依存。"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=True)

# 存在しないユーザーでも bcrypt 検証を1回回して応答時間を平準化するためのダミー。
# これが無いと「ユーザー不在=即 return」で処理が速く、タイミングでメール存在を
# 推測されてしまう（L2: ユーザー列挙の緩和）。ライブラリ既定コストで生成する。
_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt()).decode("utf-8")


def hash_password(password: str) -> str:
    # bcrypt は 72 バイトまで。エンコードして安全にハッシュ。
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:72], password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def dummy_verify_password(password: str) -> None:
    """ユーザー不在時に呼び、本物の検証と同等の時間を使って列挙を防ぐ（L2）。"""
    verify_password(password, _DUMMY_HASH)


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    # ver(token_version) を埋め、ログアウトで世代を進めると既存トークンを失効できる（L3）。
    payload = {"sub": user.id, "exp": expire, "ver": user.token_version}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="認証に失敗しました",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            creds.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise invalid
    if not user_id:
        raise invalid
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise invalid
    # トークン世代の照合（L3）。ログアウトで token_version を進めると不一致になり失効。
    # 旧トークンは "ver" を持たないため欠落は 0 とみなして互換を保つ。
    if payload.get("ver", 0) != user.token_version:
        raise invalid
    return user

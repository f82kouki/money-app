"""認証ルーター: 登録 / ログイン / ログアウト / 自分情報。"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..logging_config import logger
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..security import (
    create_access_token,
    dummy_verify_password,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _as_aware(dt: datetime) -> datetime:
    """SQLite から naive で返る datetime を UTC aware に正規化して比較可能にする。"""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    exists = db.scalar(select(User).where(User.email == body.email))
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="このメールアドレスは既に登録済みです",
        )
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    # PII を残さないため、ログには email ではなく id のみ出す（L4）。
    logger.info("ユーザー登録: id=%s", user.id)
    # display_name はグループ参加時に使うので、ここでは保持しない（最初のメンバー作成時に入力）
    return TokenOut(access_token=create_access_token(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="メールアドレスまたはパスワードが違います",
    )
    locked = HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="ログイン試行が多すぎます。しばらくしてから再度お試しください",
    )

    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        # ユーザー不在でも本物と同等の時間を使い、列挙を防ぐ（L2）。
        dummy_verify_password(body.password)
        raise invalid

    now = datetime.now(timezone.utc)
    # ロック中はパスワードの正否に関わらず弾く（L1）。
    if user.locked_until is not None and _as_aware(user.locked_until) > now:
        raise locked

    if not verify_password(body.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)
            user.failed_login_attempts = 0  # ロックしたらカウンタはリセット
            db.commit()
            logger.warning("ログインロック: id=%s", user.id)
            raise locked
        db.commit()
        raise invalid

    # 成功 → 失敗カウンタ・ロックを解除
    if user.failed_login_attempts or user.locked_until is not None:
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()
    logger.info("ログイン成功: id=%s", user.id)
    return TokenOut(access_token=create_access_token(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """token_version を進めて、このユーザーの発行済みトークンを一括失効させる（L3）。"""
    user.token_version += 1
    db.commit()
    logger.info("ログアウト(トークン失効): id=%s", user.id)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user

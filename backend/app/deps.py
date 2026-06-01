"""ルーター間で共有する依存関数。"""
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import GroupMember
from .models import User
from .security import get_current_user


def get_current_membership(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupMember:
    """ログイン中ユーザーの所属メンバー行を返す。未所属なら 409。"""
    member = db.scalar(
        select(GroupMember).where(GroupMember.user_id == user.id)
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="グループに未所属です。作成または参加してください。",
        )
    return member

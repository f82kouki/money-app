"""グループ/メンバー ルーター: 作成 / 参加 / 取得 / 表示名編集。"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_membership
from ..logging_config import logger
from ..models import Group, GroupMember, User
from ..schemas import (
    GroupCreateIn,
    GroupJoinIn,
    GroupOut,
    GroupUpdateIn,
    MemberOut,
    MemberUpdateIn,
)
from ..security import get_current_user

router = APIRouter(prefix="/api", tags=["groups"])

MAX_MEMBERS = 2
# 紛らわしい文字(0/O, 1/I/L)を除いた招待コード用文字
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _new_invite_code(db: Session) -> str:
    for _ in range(10):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(6))
        if db.scalar(select(Group).where(Group.invite_code == code)) is None:
            return code
    raise HTTPException(status_code=500, detail="招待コードの生成に失敗しました")


def _serialize_group(group: Group, my_member_id: str) -> GroupOut:
    return GroupOut(
        id=group.id,
        name=group.name,
        invite_code=group.invite_code,
        members=[MemberOut.model_validate(m) for m in group.members],
        my_member_id=my_member_id,
    )


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    body: GroupCreateIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupOut:
    existing = db.scalar(select(GroupMember).where(GroupMember.user_id == user.id))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="既にグループに所属しています",
        )
    group = Group(name=body.name, invite_code=_new_invite_code(db))
    db.add(group)
    db.flush()
    member = GroupMember(
        group_id=group.id, user_id=user.id, display_name=body.display_name
    )
    db.add(member)
    db.commit()
    db.refresh(group)
    logger.info(
        "グループ作成: '%s' code=%s by %s", group.name, group.invite_code, user.email
    )
    return _serialize_group(group, member.id)


@router.post("/groups/join", response_model=GroupOut)
def join_group(
    body: GroupJoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GroupOut:
    existing = db.scalar(select(GroupMember).where(GroupMember.user_id == user.id))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="既にグループに所属しています",
        )
    group = db.scalar(
        select(Group).where(Group.invite_code == body.invite_code.upper())
    )
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="招待コードが見つかりません",
        )
    if len(group.members) >= MAX_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="このグループは既に2人います",
        )
    member = GroupMember(
        group_id=group.id, user_id=user.id, display_name=body.display_name
    )
    db.add(member)
    db.commit()
    db.refresh(group)
    logger.info("グループ参加: '%s' code=%s by %s", group.name, group.invite_code, user.email)
    return _serialize_group(group, member.id)


@router.get("/groups/me", response_model=GroupOut)
def my_group(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> GroupOut:
    group = db.get(Group, membership.group_id)
    return _serialize_group(group, membership.id)


@router.patch("/groups/me", response_model=GroupOut)
def update_my_group(
    body: GroupUpdateIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> GroupOut:
    """おさいふの名前(タイトル)を変更する。2人のどちらからでも可。"""
    group = db.get(Group, membership.group_id)
    group.name = body.name
    db.commit()
    db.refresh(group)
    logger.info("おさいふ名変更: '%s' code=%s", group.name, group.invite_code)
    return _serialize_group(group, membership.id)


@router.patch("/members/me", response_model=MemberOut)
def update_my_member(
    body: MemberUpdateIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> GroupMember:
    membership.display_name = body.display_name
    db.commit()
    db.refresh(membership)
    return membership

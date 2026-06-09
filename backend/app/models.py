"""DB モデル。クロス DB(SQLite/Postgres) で扱いやすいよう ID は文字列(uuid hex)。"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    # お祝い画像（記録時のダイアログ）。celebration_image は参照文字列:
    #   ローカル保存=data URL / 本番(Supabase, Issue #1)=Storage パス
    celebration_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    # celebration_image は最大 ~2.7MB の data URL になり得るため deferred で遅延ロードし、
    # get_current_user の毎リクエストの select(User) で読み込まれないようにする。
    # 複数ユーザーの画像を一括で読む場合は select に undefer() を明示すること。
    celebration_image: Mapped[str | None] = mapped_column(
        Text, nullable=True, deferred=True
    )

    memberships: Mapped[list["GroupMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(100))
    invite_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    members: Mapped[list["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"
    # 同じユーザーが同じグループに二重参加しないように
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    display_name: Mapped[str] = mapped_column(String(50))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    group: Mapped[Group] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    payer_member_id: Mapped[str] = mapped_column(ForeignKey("group_members.id"))
    amount: Mapped[int] = mapped_column(Integer)  # 円（整数）
    category: Mapped[str] = mapped_column(String(100), default="")
    paid_at: Mapped[date] = mapped_column(Date)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    group: Mapped[Group] = relationship(back_populates="payments")
    payer: Mapped[GroupMember] = relationship()

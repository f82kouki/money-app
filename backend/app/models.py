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
from sqlalchemy import text as sa_text
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

    # トークン世代。ログアウト時に +1 して、発行済み JWT を一括失効させる（L3）。
    # 既存トークンは "ver" を持たないため、検証側は欠落を 0 とみなし互換を保つ。
    token_version: Mapped[int] = mapped_column(
        Integer, default=0, server_default=sa_text("0"), nullable=False
    )
    # ログイン失敗回数とロック解除時刻（L1: 簡易レート制限）。成功でリセットする。
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, default=0, server_default=sa_text("0"), nullable=False
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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
    # お祝い画像（複数枚）。画像本体(data URL)は重いので relationship 側の
    # クエリで明示ロードする（User の毎リクエスト select には載らない）。
    celebration_images: Mapped[list["CelebrationImage"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="CelebrationImage.created_at.asc()",
    )


class CelebrationImage(Base):
    """記録時に表示するお祝い画像（1ユーザー複数枚）。

    image は storage.py が返す参照文字列:
      ローカル保存=data URL / 本番(Supabase)=Storage オブジェクトキー。
    """

    __tablename__ = "celebration_images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    image: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped[User] = relationship(back_populates="celebration_images")


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
    messages: Mapped[list["Message"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )
    settlements: Mapped[list["Settlement"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class GroupMember(Base):
    __tablename__ = "group_members"
    # 同じユーザーが同じグループに二重参加しないように
    __table_args__ = (UniqueConstraint("group_id", "user_id", name="uq_group_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    # このアプリは「1ユーザー=1グループ」が前提。user_id 単独に一意制約を張り、
    # 作成/参加の競合(TOCTOU)で二重所属が生じないよう DB レベルで担保する（M1）。
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), unique=True, index=True
    )
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
    # 精算の種別。"warikan"=2人で折半 / "tatekae"=相手が全額負担(立て替え/貸し)。
    # 既存データは全て折半として扱うため既定 warikan。
    split_type: Mapped[str] = mapped_column(
        String(16), default="warikan", server_default=sa_text("'warikan'")
    )
    # 精算で「締めた」支払いを指す。NULL=未精算（集計対象）。精算実行時にまとめて
    # その時点の settlement.id を入れ、以降は集計から外す（L8）。履歴としては残す。
    settlement_id: Mapped[str | None] = mapped_column(
        ForeignKey("settlements.id"), nullable=True, index=True
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    group: Mapped[Group] = relationship(back_populates="payments")
    payer: Mapped[GroupMember] = relationship()


class Settlement(Base):
    """精算（貸し借りを清算して区切る）の記録。

    実行時点の純額(amount)と向き(from→to)のスナップショット。これを作ると、
    その時点の未精算 payment 群に settlement_id が入り、集計対象から外れる（L8）。
    """

    __tablename__ = "settlements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    settled_by_member_id: Mapped[str] = mapped_column(ForeignKey("group_members.id"))
    # 渡す側 / 受け取る側のメンバーID（貸し借りなしで精算した場合は両方 None）。
    from_member_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    to_member_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    group: Mapped[Group] = relationship(back_populates="settlements")


class Message(Base):
    """グループ内のメッセージ（2人のミニチャット）。"""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    sender_member_id: Mapped[str] = mapped_column(ForeignKey("group_members.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, index=True
    )

    group: Mapped[Group] = relationship(back_populates="messages")
    sender: Mapped[GroupMember] = relationship()

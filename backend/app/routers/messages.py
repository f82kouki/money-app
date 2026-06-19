"""メッセージ ルーター: グループ内（2人）のミニチャット。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_membership
from ..logging_config import logger
from ..models import GroupMember, Message
from ..schemas import MessageIn, MessageOut

router = APIRouter(prefix="/api", tags=["messages"])

# 取得上限。2人チャットなので大きくはならないが、念のため直近 N 件に制限する。
_LIMIT = 500


@router.get("/messages", response_model=list[MessageOut])
def list_messages(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> list[Message]:
    """自グループのメッセージを古い順（画面では上から下）に返す。"""
    rows = db.scalars(
        select(Message)
        .where(Message.group_id == membership.group_id)
        .order_by(Message.created_at.desc())
        .limit(_LIMIT)
    ).all()
    return list(reversed(rows))  # 直近 N 件を古い順に並べ替えて返す


@router.post(
    "/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED
)
def create_message(
    body: MessageIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Message:
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="メッセージを入力してください")
    message = Message(
        group_id=membership.group_id,
        sender_member_id=membership.id,
        body=text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    logger.info("メッセージ送信: group=%s by=%s", membership.group_id, membership.id)
    return message

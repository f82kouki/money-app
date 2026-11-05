"""ラベル ルーター: 支払いに付ける分類ラベルの一覧 / 追加 / 名前変更 / 削除。

ラベルはグループ（2人）で共有する。精算の計算には使わない。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_membership
from ..logging_config import logger
from ..models import GroupMember, Label, payment_labels
from ..schemas import MAX_LABELS, LabelIn, LabelOut

router = APIRouter(prefix="/api", tags=["labels"])


def _duplicate_name() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT, detail="同じ名前のラベルがあります"
    )


def _get_owned_label(db: Session, group_id: str, label_id: str) -> Label:
    label = db.get(Label, label_id)
    if label is None or label.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="ラベルが見つかりません"
        )
    return label


def _payment_count(db: Session, label_id: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(payment_labels)
            .where(payment_labels.c.label_id == label_id)
        )
        or 0
    )


@router.get("/labels", response_model=list[LabelOut])
def list_labels(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> list[LabelOut]:
    rows = db.execute(
        select(Label.id, Label.name, func.count(payment_labels.c.payment_id))
        .outerjoin(payment_labels, payment_labels.c.label_id == Label.id)
        .where(Label.group_id == membership.group_id)
        .group_by(Label.id)
        .order_by(Label.sort_order, Label.created_at, Label.id)
    ).all()
    return [
        LabelOut(id=label_id, name=name, payment_count=count)
        for label_id, name, count in rows
    ]


@router.post("/labels", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
def create_label(
    body: LabelIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> LabelOut:
    group_id = membership.group_id
    count, last_order = db.execute(
        select(func.count(), func.max(Label.sort_order)).where(
            Label.group_id == group_id
        )
    ).one()
    if count >= MAX_LABELS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"ラベルは最大{MAX_LABELS}個までです",
        )
    label = Label(group_id=group_id, name=body.name, sort_order=(last_order or 0) + 1)
    db.add(label)
    try:
        db.commit()
    except IntegrityError:
        # 事前チェックでは同時の追加を防げないので、一意制約の結果を 409 にする。
        db.rollback()
        raise _duplicate_name()
    logger.info("ラベル追加: group=%s name='%s'", group_id, body.name)
    return LabelOut(id=label.id, name=label.name, payment_count=0)


@router.patch("/labels/{label_id}", response_model=LabelOut)
def update_label(
    label_id: str,
    body: LabelIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> LabelOut:
    """名前を変更する。記録は ID で参照するので、過去の表示にもそのまま反映される。"""
    label = _get_owned_label(db, membership.group_id, label_id)
    label.name = body.name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _duplicate_name()
    return LabelOut(
        id=label.id, name=label.name, payment_count=_payment_count(db, label.id)
    )


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(
    label_id: str,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> None:
    """ラベルを削除する。記録は残り、このラベルだけが外れる。"""
    label = _get_owned_label(db, membership.group_id, label_id)
    # SQLite は既定で FK を強制しないので、ON DELETE CASCADE だけに頼らず明示的に消す。
    db.execute(delete(payment_labels).where(payment_labels.c.label_id == label.id))
    db.delete(label)
    db.commit()
    logger.info("ラベル削除: id=%s group=%s", label_id, membership.group_id)

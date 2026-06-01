"""支払い ルーター: CRUD + 集計(精算)。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_membership
from ..logging_config import logger
from ..models import GroupMember, Payment
from ..schemas import (
    MemberTotal,
    PaymentIn,
    PaymentOut,
    PaymentUpdateIn,
    SummaryOut,
)

router = APIRouter(prefix="/api", tags=["payments"])


def _member_in_group(db: Session, group_id: str, member_id: str) -> GroupMember:
    member = db.get(GroupMember, member_id)
    if member is None or member.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="支払者がこのグループのメンバーではありません",
        )
    return member


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> list[Payment]:
    rows = db.scalars(
        select(Payment)
        .where(Payment.group_id == membership.group_id)
        .order_by(Payment.paid_at.desc(), Payment.created_at.desc())
    ).all()
    return list(rows)


@router.post("/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: PaymentIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Payment:
    _member_in_group(db, membership.group_id, body.payer_member_id)
    payment = Payment(
        group_id=membership.group_id,
        payer_member_id=body.payer_member_id,
        amount=body.amount,
        category=body.category,
        paid_at=body.paid_at,
        created_by=membership.user_id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    logger.info(
        "支払い追加: group=%s payer=%s amount=%d '%s'",
        membership.group_id,
        body.payer_member_id,
        body.amount,
        body.category,
    )
    return payment


def _get_owned_payment(db: Session, group_id: str, payment_id: str) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None or payment.group_id != group_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="記録が見つかりません"
        )
    return payment


@router.patch("/payments/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: str,
    body: PaymentUpdateIn,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Payment:
    payment = _get_owned_payment(db, membership.group_id, payment_id)
    if body.payer_member_id is not None:
        _member_in_group(db, membership.group_id, body.payer_member_id)
        payment.payer_member_id = body.payer_member_id
    if body.amount is not None:
        payment.amount = body.amount
    if body.category is not None:
        payment.category = body.category
    if body.paid_at is not None:
        payment.paid_at = body.paid_at
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_payment(
    payment_id: str,
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> None:
    payment = _get_owned_payment(db, membership.group_id, payment_id)
    db.delete(payment)
    db.commit()
    logger.info("支払い削除: id=%s group=%s", payment_id, membership.group_id)


@router.get("/summary", response_model=SummaryOut)
def summary(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> SummaryOut:
    members = db.scalars(
        select(GroupMember)
        .where(GroupMember.group_id == membership.group_id)
        .order_by(GroupMember.joined_at.asc())
    ).all()
    payments = db.scalars(
        select(Payment).where(Payment.group_id == membership.group_id)
    ).all()

    totals_by_member: dict[str, int] = {m.id: 0 for m in members}
    for p in payments:
        totals_by_member[p.payer_member_id] = (
            totals_by_member.get(p.payer_member_id, 0) + p.amount
        )

    totals = [
        MemberTotal(member_id=m.id, display_name=m.display_name, total=totals_by_member[m.id])
        for m in members
    ]
    grand_total = sum(t.total for t in totals)

    # 精算: 多く払った方が受け取る。差額の半分を少ない方が渡すと均等。
    difference = 0
    settlement_amount = 0
    from_member_id: str | None = None
    to_member_id: str | None = None
    message = "まだ記録がありません"

    if len(totals) == 2:
        a, b = totals[0], totals[1]
        difference = abs(a.total - b.total)
        settlement_amount = difference // 2
        if difference == 0:
            message = "ぴったり均等です 🎉" if grand_total > 0 else "まだ記録がありません"
        else:
            payer, receiver = (b, a) if a.total > b.total else (a, b)
            from_member_id, to_member_id = payer.member_id, receiver.member_id
            message = (
                f"{payer.display_name} が {receiver.display_name} に "
                f"{settlement_amount:,} 円渡せば均等です"
            )
    elif len(totals) == 1 and grand_total > 0:
        message = "相手が参加するとここに精算額が出ます"

    return SummaryOut(
        totals=totals,
        grand_total=grand_total,
        difference=difference,
        settlement_amount=settlement_amount,
        from_member_id=from_member_id,
        to_member_id=to_member_id,
        message=message,
    )

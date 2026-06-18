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
        split_type=body.split_type,
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
    if body.split_type is not None:
        payment.split_type = body.split_type
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
    # 「相手が負担すべき額」を 2倍した整数(=倍円)で積む。割り勘の 1円端数で精度が
    # 落ちないよう、合算してから最後に2で割る（全件割り勘なら従来の (差額)//2 と一致）。
    #   割り勘 : 相手は amount/2 を負う → 倍円で amount を加算
    #   立て替え: 相手は amount を全額負う → 倍円で amount*2 を加算
    credit2_by_member: dict[str, int] = {m.id: 0 for m in members}
    for p in payments:
        totals_by_member[p.payer_member_id] = (
            totals_by_member.get(p.payer_member_id, 0) + p.amount
        )
        unit2 = p.amount * 2 if p.split_type == "tatekae" else p.amount
        credit2_by_member[p.payer_member_id] = (
            credit2_by_member.get(p.payer_member_id, 0) + unit2
        )

    totals = [
        MemberTotal(member_id=m.id, display_name=m.display_name, total=totals_by_member[m.id])
        for m in members
    ]
    grand_total = sum(t.total for t in totals)

    # 精算: 各支払いの「相手が負う額」を差し引きし、純額(net)を一方が渡せば精算完了。
    difference = 0
    settlement_amount = 0
    from_member_id: str | None = None
    to_member_id: str | None = None
    message = "まだ記録がありません"

    if len(totals) == 2:
        a, b = totals[0], totals[1]
        difference = abs(a.total - b.total)
        diff2 = credit2_by_member[a.member_id] - credit2_by_member[b.member_id]
        settlement_amount = abs(diff2) // 2
        if grand_total == 0:
            message = "まだ記録がありません"
        elif settlement_amount == 0:
            message = "貸し借りなし 🎉"
        else:
            # diff2 > 0 なら a が多く負担している → a が受け取り、b が渡す。
            receiver, payer = (a, b) if diff2 > 0 else (b, a)
            from_member_id, to_member_id = payer.member_id, receiver.member_id
            message = (
                f"{payer.display_name} が {receiver.display_name} に "
                f"{settlement_amount:,} 円で精算完了です"
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

"""支払い ルーター: CRUD + 集計(精算)。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_membership
from ..logging_config import logger
from ..models import GroupMember, Payment, Settlement
from ..schemas import (
    MemberTotal,
    PaymentIn,
    PaymentOut,
    PaymentUpdateIn,
    SettlementOut,
    SummaryOut,
)

router = APIRouter(prefix="/api", tags=["payments"])


def _net_settlement(
    members: list[GroupMember], payments: list[Payment]
) -> tuple[str | None, str | None, int]:
    """2人の純精算額を計算して (from_member_id, to_member_id, amount) を返す。

    倍円(×2)で「相手が負担すべき額」を積んで最後に //2 する（端数の累積誤差を避ける）。
      割り勘 : 相手は amount/2 → 倍円で amount を加算
      立て替え: 相手は amount 全額 → 倍円で amount*2 を加算
    amount==0（貸し借りなし）や 2人未満なら (None, None, 0)。
    """
    if len(members) != 2:
        return None, None, 0
    credit2: dict[str, int] = {m.id: 0 for m in members}
    for p in payments:
        unit2 = p.amount * 2 if p.split_type == "tatekae" else p.amount
        credit2[p.payer_member_id] = credit2.get(p.payer_member_id, 0) + unit2
    a, b = members[0], members[1]
    diff2 = credit2[a.id] - credit2[b.id]
    amount = abs(diff2) // 2
    if amount == 0:
        return None, None, 0
    # diff2 > 0 なら a が多く負担 → a が受け取り、b が渡す。
    if diff2 > 0:
        return b.id, a.id, amount  # (from=渡す側, to=受け取る側)
    return a.id, b.id, amount


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
    members = list(
        db.scalars(
            select(GroupMember)
            .where(GroupMember.group_id == membership.group_id)
            .order_by(GroupMember.joined_at.asc())
        ).all()
    )
    # 未精算(settlement_id IS NULL)の支払いのみ集計する。精算で締めた分は除外し、
    # 合計・差額・精算額を「現在の貸し借り」にリセットする（L8）。履歴自体は残る。
    payments = list(
        db.scalars(
            select(Payment).where(
                Payment.group_id == membership.group_id,
                Payment.settlement_id.is_(None),
            )
        ).all()
    )

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

    # 精算: 各支払いの「相手が負う額」を差し引きし、純額(net)を一方が渡せば精算完了。
    difference = 0
    from_member_id, to_member_id, settlement_amount = _net_settlement(members, payments)
    message = "まだ記録がありません"

    if len(totals) == 2:
        difference = abs(totals[0].total - totals[1].total)
        if grand_total == 0:
            message = "まだ記録がありません"
        elif settlement_amount == 0:
            message = "貸し借りなし 🎉"
        else:
            payer = next(t for t in totals if t.member_id == from_member_id)
            receiver = next(t for t in totals if t.member_id == to_member_id)
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


@router.post(
    "/settlements", response_model=SettlementOut, status_code=status.HTTP_201_CREATED
)
def create_settlement(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> Settlement:
    """現在の貸し借りを精算済みにして区切る（L8）。2人のどちらからでも可。

    未精算の支払いを今回の settlement に紐づけ、以降の集計対象から外す。
    支払い記録(履歴)は消さない。
    """
    members = list(
        db.scalars(
            select(GroupMember)
            .where(GroupMember.group_id == membership.group_id)
            .order_by(GroupMember.joined_at.asc())
        ).all()
    )
    if len(members) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="相手が参加してから精算できます",
        )
    payments = list(
        db.scalars(
            select(Payment).where(
                Payment.group_id == membership.group_id,
                Payment.settlement_id.is_(None),
            )
        ).all()
    )
    from_id, to_id, amount = _net_settlement(members, payments)
    if amount == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="精算するものがありません",
        )
    settlement = Settlement(
        group_id=membership.group_id,
        settled_by_member_id=membership.id,
        from_member_id=from_id,
        to_member_id=to_id,
        amount=amount,
    )
    db.add(settlement)
    db.flush()  # settlement.id を採番
    # 今回対象の未精算支払いをまとめて締める。
    db.query(Payment).filter(
        Payment.group_id == membership.group_id,
        Payment.settlement_id.is_(None),
    ).update({"settlement_id": settlement.id}, synchronize_session=False)
    db.commit()
    db.refresh(settlement)
    logger.info(
        "精算実行: group=%s amount=%d from=%s to=%s",
        membership.group_id,
        amount,
        from_id,
        to_id,
    )
    return settlement


@router.get("/settlements", response_model=list[SettlementOut])
def list_settlements(
    membership: GroupMember = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> list[Settlement]:
    """精算履歴を新しい順で返す。"""
    rows = db.scalars(
        select(Settlement)
        .where(Settlement.group_id == membership.group_id)
        .order_by(Settlement.created_at.desc())
    ).all()
    return list(rows)

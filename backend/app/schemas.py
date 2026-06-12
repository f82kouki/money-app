"""Pydantic v2 の入出力スキーマ。"""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# ---- 認証 ----
# email はログイン用のID。メール形式は問わず、好きな文字列でOK。
class RegisterIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    created_at: datetime


# ---- グループ / メンバー ----
class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=50)


class GroupJoinIn(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)
    display_name: str = Field(min_length=1, max_length=50)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    display_name: str


class MemberUpdateIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)


# ---- お祝い画像（記録時のダイアログ） ----
class CelebrationOut(BaseModel):
    celebration_enabled: bool
    # 表示用URL（ローカル=data URL / 本番=署名URL）。未設定なら null。
    celebration_image_url: str | None


class CelebrationToggleIn(BaseModel):
    celebration_enabled: bool


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    invite_code: str
    members: list[MemberOut]
    # 現在ログイン中のユーザーに対応する member_id（フロントで「自分」を判定）
    my_member_id: str


# ---- 支払い ----
class PaymentIn(BaseModel):
    payer_member_id: str
    amount: int = Field(gt=0)
    category: str = Field(default="", max_length=100)
    paid_at: date


class PaymentUpdateIn(BaseModel):
    payer_member_id: str | None = None
    amount: int | None = Field(default=None, gt=0)
    category: str | None = Field(default=None, max_length=100)
    paid_at: date | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    payer_member_id: str
    amount: int
    category: str
    paid_at: date
    created_at: datetime


# ---- 集計 ----
class MemberTotal(BaseModel):
    member_id: str
    display_name: str
    total: int


class SummaryOut(BaseModel):
    totals: list[MemberTotal]
    grand_total: int
    # 差額（絶対値）
    difference: int
    # 精算: from_member が to_member に settlement_amount 渡せば均等
    settlement_amount: int
    from_member_id: str | None
    to_member_id: str | None
    message: str

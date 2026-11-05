"""Pydantic v2 の入出力スキーマ。"""
import unicodedata
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


# ---- あいことば（第2の資格情報：ユーザーID＋あいことばで再ログイン）----
def normalize_aikotoba(value: str) -> str:
    """設定時とログイン時で必ず同じ形にそろえる（全半角・濁点の合成/分解・前後空白のゆれを吸収）。"""
    return unicodedata.normalize("NFKC", value).strip()


class AikotobaLoginIn(BaseModel):
    email: str
    aikotoba: str

    @field_validator("aikotoba")
    @classmethod
    def _normalize(cls, v: str) -> str:
        return normalize_aikotoba(v)


AIKOTOBA_MIN_CHARS = 4  # 『にっこり』は4文字。2文字では総当たりの現実的な範囲に入る


class AikotobaSetIn(BaseModel):
    # 長さは正規化後の値で判定する。上限は bcrypt に合わせ 72 バイト（文字数ではない）。
    aikotoba: str

    @field_validator("aikotoba")
    @classmethod
    def _validate(cls, v: str) -> str:
        v = normalize_aikotoba(v)
        if len(v) < AIKOTOBA_MIN_CHARS:
            raise ValueError(f"あいことばは{AIKOTOBA_MIN_CHARS}文字以上にしてください")
        if len(v.encode("utf-8")) > 72:  # bcrypt の上限は文字数ではなくバイト数
            raise ValueError("あいことばが長すぎます")
        return v


class AikotobaStateOut(BaseModel):
    # 設定画面で「あいことば設定済みか」を表示するための軽量モデル。
    aikotoba_set: bool


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


class GroupUpdateIn(BaseModel):
    # おさいふの名前（タイトル）編集。
    name: str = Field(min_length=1, max_length=100)


# ---- お祝い画像（記録時のダイアログ） ----
class CelebrationImageOut(BaseModel):
    id: str
    # 表示用URL（ローカル=data URL / 本番=署名URL）。
    url: str


class CelebrationOut(BaseModel):
    celebration_enabled: bool
    # 保存済みのお祝い画像（複数枚）。記録時はこの中から1枚を表示する。
    images: list[CelebrationImageOut]


class CelebrationToggleIn(BaseModel):
    celebration_enabled: bool


class CelebrationStateOut(BaseModel):
    # トグル応答用の軽量モデル。画像URLの署名(ネットワーク往復)を伴わない（M4）。
    celebration_enabled: bool


# ---- テーマカラー ----
class ThemeIn(BaseModel):
    # None は標準の色へ戻す。値は CSS へ渡るので、形式を厳密に制限する。
    color: str | None = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


class ThemeOut(BaseModel):
    color: str | None


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    invite_code: str
    members: list[MemberOut]
    # 現在ログイン中のユーザーに対応する member_id（フロントで「自分」を判定）
    my_member_id: str


# ---- ラベル ----
# 1グループあたりのラベル数の上限と、名前の長さ。フロントにも同じ値を持たせる。
MAX_LABELS = 50
LABEL_NAME_MAX_CHARS = 20


class LabelIn(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _normalize(cls, v: str) -> str:
        # 全半角のゆれ（ｶﾌｪ と カフェ）を同じ名前として一意制約で検出する。
        v = unicodedata.normalize("NFKC", v).strip()
        if not 1 <= len(v) <= LABEL_NAME_MAX_CHARS:
            raise ValueError(f"ラベル名は1〜{LABEL_NAME_MAX_CHARS}文字にしてください")
        return v


class LabelOut(BaseModel):
    id: str
    name: str
    # このラベルが付いた記録の件数（削除の確認に使う）。
    payment_count: int


class PaymentLabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str


# ---- 支払い ----
# 精算の種別: warikan=2人で折半 / tatekae=相手が全額負担(立て替え/貸し)
SplitType = Literal["warikan", "tatekae"]

# 金額の上限（円）。割り勘用途には十分な10億。Postgres の INTEGER(最大約21.4億)に
# 収まる範囲に抑え、桁あふれによる 500 を防ぐ。フロント側にも同じ上限を持たせる。
MAX_AMOUNT = 1_000_000_000


class PaymentIn(BaseModel):
    payer_member_id: str
    amount: int = Field(gt=0, le=MAX_AMOUNT)
    category: str = Field(default="", max_length=100)
    paid_at: date
    split_type: SplitType = "warikan"
    label_ids: list[str] = Field(default_factory=list, max_length=MAX_LABELS)


class PaymentUpdateIn(BaseModel):
    payer_member_id: str | None = None
    amount: int | None = Field(default=None, gt=0, le=MAX_AMOUNT)
    category: str | None = Field(default=None, max_length=100)
    paid_at: date | None = None
    split_type: SplitType | None = None
    # None=変更なし / []=全解除
    label_ids: list[str] | None = Field(default=None, max_length=MAX_LABELS)


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    payer_member_id: str
    amount: int
    category: str
    paid_at: date
    split_type: SplitType
    # 精算済みなら紐づく settlement の ID。未精算は None（集計対象）。
    settlement_id: str | None = None
    created_at: datetime
    labels: list[PaymentLabelOut]


# ---- 精算（リセット） ----
class SettlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    # 渡す側 / 受け取る側（貸し借りなしで締めた場合は両方 None）。
    from_member_id: str | None
    to_member_id: str | None
    amount: int
    settled_by_member_id: str
    created_at: datetime


# ---- メッセージ ----
class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sender_member_id: str
    body: str
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

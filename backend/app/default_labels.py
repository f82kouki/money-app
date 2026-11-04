"""初期ラベル。新規グループと、ラベルが1件も無い既存グループに入れる。"""
from .models import Label

DEFAULT_LABEL_NAMES = (
    # 食
    "食費",
    "外食",
    "カフェ",
    # 暮らし
    "日用品",
    "家賃",
    "光熱費",
    "通信費",
    "サブスク",
    # 美容・服
    "コスメ",
    "美容",
    "ファッション",
    # 健康・移動
    "医療",
    "交通",
    # お出かけ
    "旅行",
    "デート",
    "娯楽",
    "趣味",
    # その他
    "プレゼント",
    "ペット",
    "その他",
)


def build_default_labels(group_id: str) -> list[Label]:
    return [
        Label(group_id=group_id, name=name, sort_order=order)
        for order, name in enumerate(DEFAULT_LABEL_NAMES)
    ]

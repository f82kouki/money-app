"""モデル(SQLAlchemy)定義とDB実スキーマの差分(drift)を検出する。

マイグレーション未適用で「モデルにあるが DB に無い」テーブル/カラムがあると、
get_current_user の select(User) などが 500 になる（2026-06-19 の token_version 欠落事故）。
本モジュールはその差分を能動的に可視化し、起動時ログ・/api/health・CI で使う。
"""
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from .db import Base, engine


def find_schema_drift(eng: Engine | None = None) -> dict[str, list[str]]:
    """モデル定義に対して DB に不足しているテーブル/カラムを返す。

    戻り値: {"missing_tables": [...], "missing_columns": ["users.token_version", ...]}
    どちらも空なら drift 無し。DB 接続不可などでは例外を送出する（呼び出し側で握る）。

    注意: 「DB にあるがモデルに無い」列は drift とみなさない（後方互換の余剰列は無害で、
    expand/contract の contract 前の状態でも誤検知しないようにするため）。
    """
    from . import models  # noqa: F401  Base.metadata にテーブルを登録するため

    eng = eng or engine
    insp = inspect(eng)
    existing_tables = set(insp.get_table_names())

    missing_tables: list[str] = []
    missing_columns: list[str] = []
    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            missing_tables.append(table_name)
            continue
        db_cols = {c["name"] for c in insp.get_columns(table_name)}
        for col in table.columns:
            if col.name not in db_cols:
                missing_columns.append(f"{table_name}.{col.name}")

    return {
        "missing_tables": sorted(missing_tables),
        "missing_columns": sorted(missing_columns),
    }


def has_drift(drift: dict[str, list[str]]) -> bool:
    return bool(drift["missing_tables"] or drift["missing_columns"])

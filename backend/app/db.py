"""SQLAlchemy のエンジン・セッション・Base 定義。"""
from collections.abc import Generator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

_url = settings.database_url
_connect_args: dict = {}
_engine_kwargs: dict = {"pool_pre_ping": True}

if _url.startswith("sqlite"):
    # SQLite はスレッドチェックを外す（FastAPI のスレッド対応）
    _connect_args = {"check_same_thread": False}
else:
    # サーバーレス(Vercel)では関数側でプールせず、Supabase のプーラーに任せる
    _engine_kwargs["poolclass"] = NullPool

engine = create_engine(_url, connect_args=_connect_args, **_engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_user_celebration_columns() -> None:
    """users テーブルに celebration 系カラムを冪等に追加する。

    Alembic 未導入のため create_all は既存テーブルへ新カラムを追加しない。
    既存DB（warikan.db や Supabase）を壊さずに列だけ足すための軽量マイグレーション。
    """
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return  # テーブルは create_all 側で作られる
    cols = {c["name"] for c in insp.get_columns("users")}
    # BOOLEAN のデフォルトは DB 方言で表記が異なる（Postgres は整数 0 を boolean に
    # 暗黙変換しない）。SQLite は 0、それ以外(Postgres等)は false を使う。
    # Postgres は ADD COLUMN IF NOT EXISTS をサポートするので、複数インスタンスが
    # 同時に inspect ガードを通過しても重複 ALTER でエラーにならない。SQLite は
    # IF NOT EXISTS 非対応（かつ並行書き込みも無い）ため素の ALTER を使う。
    is_sqlite = engine.dialect.name == "sqlite"
    bool_false = "0" if is_sqlite else "false"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        if "celebration_enabled" not in cols:
            conn.exec_driver_sql(
                f"ALTER TABLE users ADD COLUMN {if_not_exists}celebration_enabled "
                f"BOOLEAN NOT NULL DEFAULT {bool_false}"
            )
        if "celebration_image" not in cols:
            conn.exec_driver_sql(
                f"ALTER TABLE users ADD COLUMN {if_not_exists}celebration_image TEXT"
            )


def init_db() -> None:
    """全テーブルを作成する（make db-init から呼ぶ）。"""
    from . import models  # noqa: F401  モデル登録のため import

    Base.metadata.create_all(bind=engine)
    _ensure_user_celebration_columns()

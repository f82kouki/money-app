"""SQLAlchemy のエンジン・セッション・Base 定義。"""
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

_url = settings.database_url
_connect_args: dict = {}
_engine_kwargs: dict = {}

if _url.startswith("sqlite"):
    # SQLite はスレッドチェックを外す（FastAPI のスレッド対応）
    _connect_args = {"check_same_thread": False}
    # プールした接続が古くなる場合に備えた事前 ping（プールを使う経路のみ有効）
    _engine_kwargs["pool_pre_ping"] = True
else:
    # サーバーレス(Vercel)では関数側でプールせず、Supabase のプーラーに任せる。
    # NullPool は毎回新規接続するため、pool_pre_ping(SELECT 1) は余計な1往復に
    # なるだけ（新規接続は常に新鮮）。よってここでは付けない。
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


def _ensure_payment_columns() -> None:
    """payments テーブルに split_type 列を冪等に追加する。

    既存行は全て従来どおり「割り勘(折半)」として扱うため既定 'warikan'。
    _ensure_user_celebration_columns と同じく Alembic 無し環境の軽量マイグレーション。
    """
    insp = inspect(engine)
    if "payments" not in insp.get_table_names():
        return  # テーブルは create_all 側で作られる
    if "split_type" in {c["name"] for c in insp.get_columns("payments")}:
        return
    is_sqlite = engine.dialect.name == "sqlite"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"ALTER TABLE payments ADD COLUMN {if_not_exists}split_type "
            "VARCHAR(16) NOT NULL DEFAULT 'warikan'"
        )


def _migrate_celebration_image_to_table() -> None:
    """旧: users.celebration_image(単数) → 新: celebration_images(複数) に移行する。

    既存の1枚を celebration_images に1行として取り込む。冪等にするため、その user に
    既に行があれば何もしない。取り込んだら旧カラムを None にして二重移行を防ぐ。
    参照文字列(data URL / Storageキー)はそのまま使えるので Storage 実体の移動は不要。
    """
    from .models import CelebrationImage, User

    with SessionLocal() as db:
        rows = db.execute(
            select(User.id, User.celebration_image).where(
                User.celebration_image.isnot(None)
            )
        ).all()
        if not rows:
            return
        migrated_user_ids = set(
            db.scalars(select(CelebrationImage.user_id).distinct()).all()
        )
        changed = False
        for user_id, image in rows:
            if user_id in migrated_user_ids:
                continue
            db.add(CelebrationImage(user_id=user_id, image=image))
            db.query(User).filter(User.id == user_id).update(
                {"celebration_image": None}
            )
            changed = True
        if changed:
            db.commit()


def init_db() -> None:
    """全テーブルを作成する（make db-init から呼ぶ）。"""
    from . import models  # noqa: F401  モデル登録のため import

    Base.metadata.create_all(bind=engine)
    _ensure_user_celebration_columns()
    _ensure_payment_columns()
    _migrate_celebration_image_to_table()

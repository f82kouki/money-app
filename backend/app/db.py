"""SQLAlchemy のエンジン・セッション・Base 定義。"""
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings
from .logging_config import logger

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


def _ensure_user_auth_columns() -> None:
    """users に認証関連カラムを冪等に追加する（L1 レート制限 / L3 トークン失効）。

    token_version / failed_login_attempts は NOT NULL DEFAULT 0、locked_until は NULL 可。
    既存行は全て「失効なし・ロックなし」として扱う。
    """
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("users")}
    is_sqlite = engine.dialect.name == "sqlite"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        if "token_version" not in cols:
            conn.exec_driver_sql(
                f"ALTER TABLE users ADD COLUMN {if_not_exists}token_version "
                "INTEGER NOT NULL DEFAULT 0"
            )
        if "failed_login_attempts" not in cols:
            conn.exec_driver_sql(
                f"ALTER TABLE users ADD COLUMN {if_not_exists}failed_login_attempts "
                "INTEGER NOT NULL DEFAULT 0"
            )
        if "locked_until" not in cols:
            conn.exec_driver_sql(
                f"ALTER TABLE users ADD COLUMN {if_not_exists}locked_until "
                "TIMESTAMP WITH TIME ZONE"
                if not is_sqlite
                else "ALTER TABLE users ADD COLUMN locked_until DATETIME"
            )


def _ensure_user_aikotoba_column() -> None:
    """users に aikotoba_hash 列を冪等に追加する（C: あいことば再ログイン）。

    get_current_user の select(User) が毎リクエストで全列を読むため、本番に列が
    無いと認証API全停止（2026-06-19 の token_version 事故と同型）。NULL 可
    （未設定=あいことば無効）。_ensure_user_auth_columns と同じ軽量マイグレーション。
    """
    insp = inspect(engine)
    if "users" not in insp.get_table_names():
        return
    if "aikotoba_hash" in {c["name"] for c in insp.get_columns("users")}:
        return
    is_sqlite = engine.dialect.name == "sqlite"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"ALTER TABLE users ADD COLUMN {if_not_exists}aikotoba_hash VARCHAR(255)"
        )


def _ensure_celebration_image_group_column() -> None:
    """celebration_images に group_id 列を冪等に追加する（A: お祝い画像の2人共有）。

    画像はグループ（2人）で共有する。既存行は _backfill_celebration_image_group が
    user_id → group_members → group からバックフィルする。ON/OFF は個人設定
    (User.celebration_enabled) のままなので groups への列追加は不要。
    """
    insp = inspect(engine)
    if "celebration_images" not in insp.get_table_names():
        return
    if "group_id" in {c["name"] for c in insp.get_columns("celebration_images")}:
        return
    is_sqlite = engine.dialect.name == "sqlite"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "ALTER TABLE celebration_images ADD COLUMN "
            f"{if_not_exists}group_id VARCHAR(32)"
        )


def _ensure_payment_settlement_column() -> None:
    """payments に settlement_id 列を冪等に追加する（L8 精算リセット）。

    既存行は全て未精算(NULL)として扱う。集計は settlement_id IS NULL のみ対象。
    """
    insp = inspect(engine)
    if "payments" not in insp.get_table_names():
        return
    if "settlement_id" in {c["name"] for c in insp.get_columns("payments")}:
        return
    is_sqlite = engine.dialect.name == "sqlite"
    if_not_exists = "" if is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"ALTER TABLE payments ADD COLUMN {if_not_exists}settlement_id VARCHAR(32)"
        )


def _ensure_group_member_user_unique() -> None:
    """group_members.user_id に一意インデックスを冪等に張る（M1: 1人=1グループ）。

    既存データに重複 user_id があると作成に失敗するため、先に検出してその場合は
    作成をスキップ＋警告する（自動マージはしない。手動クリーンアップを促す）。
    SQLite/Postgres とも CREATE UNIQUE INDEX IF NOT EXISTS をサポートする。
    """
    insp = inspect(engine)
    if "group_members" not in insp.get_table_names():
        return
    with engine.begin() as conn:
        dups = conn.exec_driver_sql(
            "SELECT user_id FROM group_members GROUP BY user_id HAVING COUNT(*) > 1"
        ).fetchall()
        if dups:
            logger.warning(
                "group_members に重複 user_id があり一意制約を作成できません: %s "
                "（手動クリーンアップ後に再実行してください）",
                [d[0] for d in dups],
            )
            return
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_group_members_user "
            "ON group_members (user_id)"
        )


def _backfill_celebration_image_group() -> None:
    """既存 celebration_images.group_id を user_id 経由でバックフィルする（冪等）。

    group_id が未設定(NULL)の行だけを対象に、その画像の所有者 user_id が属する
    グループの id を入れる。所属グループが無いユーザーの画像は NULL のまま残す
    （そのユーザーがグループに入った後の再実行で埋まる）。
    """
    from .models import CelebrationImage, GroupMember

    with SessionLocal() as db:
        rows = db.execute(
            select(CelebrationImage.id, CelebrationImage.user_id).where(
                CelebrationImage.group_id.is_(None)
            )
        ).all()
        if not rows:
            return
        # user_id → group_id の対応表を一括取得（画像ごとの N+1 を避ける）。
        user_ids = {user_id for _, user_id in rows}
        members = db.execute(
            select(GroupMember.user_id, GroupMember.group_id).where(
                GroupMember.user_id.in_(user_ids)
            )
        ).all()
        group_by_user = {user_id: group_id for user_id, group_id in members}
        changed = False
        for image_id, user_id in rows:
            group_id = group_by_user.get(user_id)
            if group_id is None:
                continue
            db.query(CelebrationImage).filter(
                CelebrationImage.id == image_id
            ).update({"group_id": group_id})
            changed = True
        if changed:
            db.commit()


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
    _ensure_user_auth_columns()
    _ensure_user_aikotoba_column()
    _ensure_payment_settlement_column()
    _ensure_celebration_image_group_column()
    _ensure_group_member_user_unique()
    _migrate_celebration_image_to_table()
    # 旧単数列→表(_migrate_...)の後に、表の各行へ group_id をバックフィルする。
    _backfill_celebration_image_group()

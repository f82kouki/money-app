"""CI 用: 既存 DB を head へ上げた結果がモデルと一致するかを検査する。

新規 DB は create_all が全部作るので、_ensure_* の書き忘れや FK/index の付け忘れは
アップグレード経路でしか検出できない（.github/workflows/ci.yml の upgrade ジョブ）。
"""
from sqlalchemy import inspect, text

from app import models  # noqa: F401  Base.metadata にテーブルを登録するため
from app.db import Base, engine
from app.schema_check import find_schema_drift, has_drift


def find_constraint_drift() -> list[str]:
    """モデルが宣言した index / FK のうち、DB に無いものを返す。"""
    insp = inspect(engine)
    missing: list[str] = []
    for name, table in Base.metadata.tables.items():
        db_indexes = {i["name"] for i in insp.get_indexes(name)}
        missing += [
            f"index {index.name}"
            for index in table.indexes
            if index.name not in db_indexes
        ]
        db_fks = {
            (fk["constrained_columns"][0], fk["referred_table"])
            for fk in insp.get_foreign_keys(name)
        }
        missing += [
            f"fk {name}.{fk.parent.name} -> {fk.column.table.name}"
            for fk in table.foreign_keys
            if (fk.parent.name, fk.column.table.name) not in db_fks
        ]
    return missing


def count_unfilled_images() -> int:
    """所属グループのある所有者の画像のうち、group_id が埋まっていない行数。"""
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT count(*) FROM celebration_images ci "
                "JOIN group_members gm ON gm.user_id = ci.user_id "
                "WHERE ci.group_id IS NULL OR ci.group_id <> gm.group_id"
            )
        ).scalar_one()


def count_groups_without_labels() -> int:
    """初期ラベルが投入されていないグループの数。"""
    with engine.connect() as conn:
        return conn.execute(
            text(
                "SELECT count(*) FROM groups g "
                "WHERE NOT EXISTS (SELECT 1 FROM labels l WHERE l.group_id = g.id)"
            )
        ).scalar_one()


def main() -> None:
    drift = find_schema_drift()
    assert not has_drift(drift), f"schema drift: {drift}"
    constraints = find_constraint_drift()
    assert not constraints, f"constraint drift: {constraints}"
    unfilled = count_unfilled_images()
    assert unfilled == 0, f"backfill incomplete: {unfilled} rows"
    unlabeled = count_groups_without_labels()
    assert unlabeled == 0, f"default labels missing: {unlabeled} groups"
    print("upgrade ok: no schema/constraint drift, backfill complete")


if __name__ == "__main__":
    main()

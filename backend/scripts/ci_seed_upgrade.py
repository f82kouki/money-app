"""CI 用: base ブランチのコードで動かし、既存データ相当の行を投入する。

head のモデルではなく base のモデルを使うため、`PYTHONPATH=.` を付けて base の
backend/ を cwd にして実行する（.github/workflows/ci.yml の upgrade ジョブ）。
"""
from app.db import SessionLocal
from app.models import CelebrationImage, Group, GroupMember, User


def main() -> None:
    with SessionLocal() as db:
        users = [User(email=f"ci-{i}", password_hash="x") for i in range(3)]
        db.add_all(users)
        db.flush()
        group = Group(name="ci", invite_code="CIUPGR")
        db.add(group)
        db.flush()
        # 2人は同じグループ、3人目は未所属（バックフィル対象外のまま残る行）。
        for user in users[:2]:
            db.add(GroupMember(group_id=group.id, user_id=user.id, display_name="ci"))
        for user in users:
            db.add(CelebrationImage(user_id=user.id, image=f"{user.id}/ci"))
        db.commit()
    print("seeded")


if __name__ == "__main__":
    main()

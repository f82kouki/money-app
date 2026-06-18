"""ユーザー個人設定ルーター: 記録時のお祝い画像（複数枚アップロード/トグル）。"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import storage
from ..db import get_db
from ..models import CelebrationImage, User
from ..schemas import CelebrationImageOut, CelebrationOut, CelebrationToggleIn
from ..security import get_current_user

router = APIRouter(prefix="/api/me", tags=["settings"])

# アップロード許可（MIME ホワイトリスト）。SVG はスクリプト混入の恐れがあるため不許可。
_ALLOWED = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 2 * 1024 * 1024  # 2MB
_MAX_IMAGES = 5  # 1ユーザーあたりの保存上限


def _images_of(db: Session, user_id: str) -> list[CelebrationImage]:
    return list(
        db.scalars(
            select(CelebrationImage)
            .where(CelebrationImage.user_id == user_id)
            .order_by(CelebrationImage.created_at.asc())
        ).all()
    )


def _to_out(db: Session, user: User) -> CelebrationOut:
    images: list[CelebrationImageOut] = []
    for img in _images_of(db, user.id):
        url = storage.resolve_url(img.image)
        if url:  # 署名URL発行に失敗した画像はスキップ（設定画面を500にしない）
            images.append(CelebrationImageOut(id=img.id, url=url))
    return CelebrationOut(
        celebration_enabled=user.celebration_enabled,
        images=images,
    )


@router.get("/celebration", response_model=CelebrationOut)
def get_celebration(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    return _to_out(db, user)


@router.patch("/celebration", response_model=CelebrationOut)
def update_celebration(
    body: CelebrationToggleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    user.celebration_enabled = body.celebration_enabled
    db.commit()
    db.refresh(user)
    return _to_out(db, user)


@router.post("/celebration/image", response_model=CelebrationOut)
async def upload_celebration_image(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    if len(_images_of(db, user.id)) >= _MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"画像は最大{_MAX_IMAGES}枚までです",
        )
    # サイズ検証（+1 byte 読んで上限超過を検知）
    content = await file.read(_MAX_BYTES + 1)
    if len(content) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="画像が大きすぎます（2MBまで）",
        )
    if not content:
        raise HTTPException(status_code=400, detail="画像が空です")
    # MIME 検証（フロントは迂回可能なのでサーバー側で必ずチェック）
    if file.content_type not in _ALLOWED:
        raise HTTPException(
            status_code=400, detail="対応していない画像形式です（JPEG/PNG/WebP）"
        )

    # 先に行を作って ID を確定させ、その ID で Storage のオブジェクトキーを分ける。
    image = CelebrationImage(user_id=user.id, image="")
    db.add(image)
    db.flush()  # image.id を採番
    # 2MB POST のアップロードはネットワーク I/O。event loop を塞がないよう threadpool へ。
    image.image = await run_in_threadpool(
        storage.save_image, user.id, image.id, content, file.content_type
    )
    db.commit()
    return _to_out(db, user)


@router.delete("/celebration/image/{image_id}", response_model=CelebrationOut)
def delete_celebration_image(
    image_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    image = db.get(CelebrationImage, image_id)
    if image is None or image.user_id != user.id:
        raise HTTPException(status_code=404, detail="画像が見つかりません")
    storage.delete_image(image.image)
    db.delete(image)
    db.commit()
    return _to_out(db, user)

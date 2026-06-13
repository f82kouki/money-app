"""ユーザー個人設定ルーター: 記録時のお祝い画像（アップロード/トグル）。"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .. import storage
from ..db import get_db
from ..models import User
from ..schemas import CelebrationOut, CelebrationToggleIn
from ..security import get_current_user

router = APIRouter(prefix="/api/me", tags=["settings"])

# アップロード許可（MIME ホワイトリスト）。SVG はスクリプト混入の恐れがあるため不許可。
_ALLOWED = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 2 * 1024 * 1024  # 2MB


def _to_out(user: User) -> CelebrationOut:
    return CelebrationOut(
        celebration_enabled=user.celebration_enabled,
        celebration_image_url=storage.resolve_url(user.celebration_image),
    )


@router.get("/celebration", response_model=CelebrationOut)
def get_celebration(user: User = Depends(get_current_user)) -> CelebrationOut:
    return _to_out(user)


@router.patch("/celebration", response_model=CelebrationOut)
def update_celebration(
    body: CelebrationToggleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    user.celebration_enabled = body.celebration_enabled
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.post("/celebration/image", response_model=CelebrationOut)
async def upload_celebration_image(
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
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

    # 2MB POST のアップロードはネットワーク I/O。event loop を塞がないよう threadpool へ。
    user.celebration_image = await run_in_threadpool(
        storage.save_image, user.id, content, file.content_type
    )
    db.commit()
    db.refresh(user)
    return _to_out(user)


@router.delete("/celebration/image", response_model=CelebrationOut)
def delete_celebration_image(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CelebrationOut:
    storage.delete_image(user.celebration_image)
    user.celebration_image = None
    db.commit()
    db.refresh(user)
    return _to_out(user)

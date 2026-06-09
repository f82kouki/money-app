"""FastAPI アプリ本体。"""
import time

from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .logging_config import logger
from .routers import auth, groups, payments, settings as settings_router

app = FastAPI(title="warikan API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """全リクエストを「メソッド パス -> ステータス (処理時間)」で記録する。"""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # ルーターで捕捉されなかった例外（=想定外のバグ）はトレースバック全文を出す
        elapsed = (time.perf_counter() - start) * 1000
        logger.exception(
            "%s %s -> 500 未処理の例外 (%.1fms)",
            request.method,
            request.url.path,
            elapsed,
        )
        raise
    elapsed = (time.perf_counter() - start) * 1000
    log = logger.info if response.status_code < 400 else logger.warning
    log(
        "%s %s -> %d (%.1fms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
    return response


@app.exception_handler(StarletteHTTPException)
async def on_http_exception(request: Request, exc: StarletteHTTPException):
    """4xx/5xx の HTTPException を、原因(detail)付きで記録する。"""
    level = logger.error if exc.status_code >= 500 else logger.warning
    level(
        "%s %s -> %d: %s",
        request.method,
        request.url.path,
        exc.status_code,
        exc.detail,
    )
    return await http_exception_handler(request, exc)


@app.exception_handler(RequestValidationError)
async def on_validation_error(request: Request, exc: RequestValidationError):
    """422（入力チェック失敗）を、どの項目がダメだったかと一緒に記録する。"""
    logger.warning(
        "%s %s -> 422 入力エラー: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    return await request_validation_exception_handler(request, exc)


app.include_router(auth.router)
app.include_router(groups.router)
app.include_router(payments.router)
app.include_router(settings_router.router)


@app.on_event("startup")
async def on_startup():
    if settings.auto_create_tables:
        from .db import init_db

        init_db()
        logger.info("テーブルを自動作成しました (AUTO_CREATE_TABLES=1)")
    logger.info("warikan API 起動完了 (log_level=%s)", settings.log_level)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}

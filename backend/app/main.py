"""FastAPI アプリ本体。"""
import time

from fastapi import FastAPI, Request
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import ProgrammingError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .logging_config import logger
from .routers import (
    auth,
    groups,
    messages,
    payments,
    settings as settings_router,
)
from .schema_check import find_schema_drift, has_drift

app = FastAPI(title="warikan API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # 認証は Authorization ヘッダ(Bearer)で行い Cookie を使わないため資格情報の共有は不要。
    allow_credentials=False,
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


# Postgres の sqlstate: 42703=undefined_column / 42P01=undefined_table。
# これらは「マイグレーション未適用でモデルにある列/表が DB に無い」サイン。
_SCHEMA_DRIFT_SQLSTATES = {"42703", "42P01"}


@app.exception_handler(ProgrammingError)
async def on_db_programming_error(request: Request, exc: ProgrammingError):
    """DB の列/表欠落(drift)は 500 生スタックトレースでなく 503 で返す。

    ハンドラ未登録だと ServerErrorMiddleware が 500 を返してしまう（事故時の挙動）。
    ここで拾い、利用者には「更新中」を表す 503、運用には原因 sqlstate をログに出す。
    """
    sqlstate = getattr(getattr(exc, "orig", None), "sqlstate", None)
    if sqlstate in _SCHEMA_DRIFT_SQLSTATES:
        logger.error(
            "%s %s -> 503 スキーマdrift検知（マイグレーション未適用の疑い）: %s",
            request.method,
            request.url.path,
            exc.orig,
        )
        return JSONResponse(
            status_code=503,
            content={"detail": "サーバー更新中です。少し待ってから再度お試しください。"},
            headers={"Retry-After": "30"},
        )
    # それ以外の DB エラーは内部詳細を伏せて 500（全文はログに残す）。
    logger.exception("%s %s -> 500 DBエラー", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "内部エラーが発生しました。"})


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
app.include_router(messages.router)


@app.on_event("startup")
async def on_startup():
    if settings.auto_create_tables:
        from .db import init_db

        init_db()
        logger.info("テーブルを自動作成しました (AUTO_CREATE_TABLES=1)")
    # スキーマdrift の先回り検知（best-effort。DB 接続不可でも起動は止めない）。
    # サーバーレスでは startup が確実に走らないため、これは“従”。リクエスト時の
    # 503 ハンドラ(on_db_programming_error)が“主”の防御。
    try:
        drift = find_schema_drift()
        if has_drift(drift):
            logger.error(
                "スキーマdrift検知: 不足テーブル=%s 不足カラム=%s "
                "（マイグレーション未適用の可能性。CIのmigrateジョブ/手動適用を確認）",
                drift["missing_tables"],
                drift["missing_columns"],
            )
    except Exception:
        logger.warning("スキーマdriftチェックに失敗（DB接続不可など）", exc_info=True)
    logger.info("warikan API 起動完了 (log_level=%s)", settings.log_level)


@app.get("/api/health")
def health() -> dict:
    """死活＋スキーマ整合性。schema_ok=False は drift（要マイグレーション）。"""
    try:
        drift = find_schema_drift()
        if has_drift(drift):
            return {
                "status": "ok",
                "schema_ok": False,
                "missing": drift["missing_tables"] + drift["missing_columns"],
            }
        return {"status": "ok", "schema_ok": True}
    except Exception:
        # DB に触れない場合は判定不能。死活自体は ok を返す。
        return {"status": "ok", "schema_ok": None}

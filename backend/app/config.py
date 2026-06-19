"""アプリ設定。環境変数 (.env) から読み込む。"""
import os
from pathlib import Path

from dotenv import load_dotenv

# リポジトリルートの .env を読み込む（backend/ の1つ上）
ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def _normalize_db_url(url: str) -> str:
    """Supabase が出す postgresql:// を psycopg3 ドライバ指定に正規化する。

    Supabase のコピー文字列は `postgresql://...` のことが多いが、SQLAlchemy で
    psycopg3 を使うには `postgresql+psycopg://...` が必要。
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


class Settings:
    # 例: postgresql+psycopg://user:pass@host:5432/postgres?sslmode=require
    # ローカルでオフライン作業したい場合は sqlite:///./warikan.db でも動く
    database_url: str = _normalize_db_url(
        os.getenv("DATABASE_URL", "sqlite:///./warikan.db")
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    # ログの詳細度。DEBUG にすると全リクエストが見やすくなる。
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    # 起動時にテーブルを自動作成するか（Docker開発で便利。本番は make db-init 推奨）
    auto_create_tables: bool = os.getenv("AUTO_CREATE_TABLES", "0").lower() in (
        "1",
        "true",
        "yes",
    )
    # トークン有効期限（分）。割り勘アプリなので長めでよい。
    access_token_expire_minutes: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30))
    )
    # CORS 許可オリジン（ローカル開発の Vite）。本番は同一ドメイン /api なので不要。
    cors_origins: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5178"
    ).split(",")

    # --- ログインのレート制限（L1: DBベースの簡易ロック）---
    # 連続失敗が上限に達したら一定時間ロックする。総当たり対策。
    login_max_attempts: int = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
    login_lock_minutes: int = int(os.getenv("LOGIN_LOCK_MINUTES", "15"))

    # --- Supabase Storage（お祝い画像の本番保存先）---
    # 未設定なら storage.py が data URL(base64) にフォールバックする（ローカル開発用）。
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    supabase_bucket: str = os.getenv("SUPABASE_BUCKET", "celebration")
    # 署名URLの有効期限（秒）。開いたまま記録しても切れないよう長め(既定24h)。
    supabase_signed_url_ttl: int = int(
        os.getenv("SUPABASE_SIGNED_URL_TTL", str(60 * 60 * 24))
    )

    @property
    def supabase_storage_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_key)


settings = Settings()

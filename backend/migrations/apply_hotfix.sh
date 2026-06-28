#!/usr/bin/env bash
# ============================================================================
# 止血マイグレーション適用スクリプト（本番 Supabase）
#   2026-06-19_hotfix_schema_drift.sql の STEP1 を本番へ適用し、前後で検証する。
#
# 使い方:   bash backend/migrations/apply_hotfix.sh
# 前提:     - リポジトリルートの .env に本番 DATABASE_URL が入っていること
#           - psql が使えること（macOS: brew install libpq）
# 安全性:   ADD COLUMN IF NOT EXISTS のみ。冪等・後方互換・再実行可。
#           DDL は Session pooler(5432) に向ける（Transaction pooler 6543 を回避）。
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SQL="$HERE/2026-06-19_hotfix_schema_drift.sql"

RAW_URL="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
if [ -z "${RAW_URL}" ]; then
  echo "✗ DATABASE_URL が $ROOT/.env に見つかりません" >&2
  exit 1
fi

# psql(libpq) 用に整形: ドライバ指定を外す / 6543→5432 / sslmode を保証
URL="${RAW_URL/postgresql+psycopg:\/\//postgresql://}"
URL="${URL/:6543/:5432}"
case "$URL" in
  *sslmode=*) ;;
  *\?*)       URL="${URL}&sslmode=require" ;;
  *)          URL="${URL}?sslmode=require" ;;
esac

MASKED="$(printf '%s' "$URL" | sed -E 's#//[^:]+:[^@]+@#//<user>:<pw>@#')"
CHECK="SELECT column_name FROM information_schema.columns \
WHERE table_name='users' AND column_name IN \
('token_version','failed_login_attempts','locked_until','celebration_enabled','celebration_image') \
ORDER BY column_name;"

echo "▶ 接続先: ${MASKED}"
case "$URL" in
  *sqlite*|*localhost*|*127.0.0.1*)
    echo "✗ 本番(Supabase)を指していないようです。中止します。" >&2; exit 1 ;;
esac

echo "▶ 適用前の users 対象カラム:"
psql "$URL" -v ON_ERROR_STOP=1 -c "$CHECK"

echo "▶ STEP1 を適用します..."
psql "$URL" -v ON_ERROR_STOP=1 -f "$SQL"

echo "▶ 適用後の users 対象カラム（5件そろえばOK）:"
psql "$URL" -v ON_ERROR_STOP=1 -c "$CHECK"

echo "✅ 完了。/api/health と認証APIで 200 を確認してください。"

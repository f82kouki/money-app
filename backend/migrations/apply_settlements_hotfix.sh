#!/usr/bin/env bash
# ============================================================================
# 止血マイグレーション適用スクリプト（本番 Supabase）
#   2026-07-04_hotfix_settlements_table.sql を本番へ適用し、前後で検証する。
#   ＝ 作戦書-settlements欠落-hotfix-202607.md の Route B（手動止血）を安全に実行する。
#
# 使い方:   bash backend/migrations/apply_settlements_hotfix.sh
# 前提:     - リポジトリルートの .env に本番 DATABASE_URL が入っていること
#           - psql が使えること（macOS: brew install libpq）
# 安全性:   CREATE TABLE/INDEX IF NOT EXISTS のみ。冪等・後方互換・再実行可。
#           DDL は Session pooler(5432) に向ける（Transaction pooler 6543 を回避）。
#           接続先が本番でない（sqlite/localhost）場合は中止する。
# 注意:     本命は Route A（deploy-prod の Secret を直して Re-run）。本スクリプトは
#           それが間に合わない時の即時止血用。適用後も deploy-prod の green 化は別途必要。
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SQL="$HERE/2026-07-04_hotfix_settlements_table.sql"

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
CHECK="SELECT to_regclass('public.settlements') AS settlements;"

echo "▶ 接続先: ${MASKED}"
case "$URL" in
  *sqlite*|*localhost*|*127.0.0.1*)
    echo "✗ 本番(Supabase)を指していないようです。中止します。" >&2; exit 1 ;;
esac

echo "▶ 適用前の settlements 有無（NULL なら未作成）:"
psql "$URL" -v ON_ERROR_STOP=1 -c "$CHECK"

echo "▶ settlements テーブルを作成します..."
psql "$URL" -v ON_ERROR_STOP=1 -f "$SQL"

echo "▶ 適用後の settlements 有無（'settlements' が返ればOK）:"
psql "$URL" -v ON_ERROR_STOP=1 -c "$CHECK"

echo "✅ 完了。GET /api/health が schema_ok:true に、POST /api/settlements が 200 になるか確認してください。"

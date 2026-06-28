-- ============================================================================
-- 止血マイグレーション: 本番(Supabase Postgres)のスキーマdrift解消
--   事象: column users.token_version does not exist → 認証必須API全部が500
--   原因: models.py に追加した列が本番DBへ未適用（手動 make db-init 漏れ）
--
-- 性質: 冪等・後方互換（すべて ADD COLUMN IF NOT EXISTS）。再実行しても安全。
--       既存行は各 DEFAULT で埋まる（PG11+ は NOT NULL DEFAULT 追加もメタデータ操作）。
-- 内容: backend/app/db.py の _ensure_* 群が足すのと同じ列を、純SQLで適用する。
--
-- 実行先: Session/Direct の 5432（Transaction pooler 6543 ではない）。
--         一番安全なのは Supabase ダッシュボードの SQL Editor に貼って実行。
-- 作成日: 2026-06-19
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 0] 適用前の現状確認（読み取り専用・任意）
--   先にこれだけ実行して、どの列が欠けているかを目視確認できる。
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'users'
--  ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 1] 本体（止血）: users / payments へ不足カラムを冪等に追加
--   トランザクションで囲み、全部入るか・全部入らないかにする。
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- --- users: 認証系（L1 レート制限 / L3 トークン失効）。今回の500の直接原因 ---
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMP WITH TIME ZONE;

-- --- users: お祝い画像フラグ/旧単数カラム（過去のマイグレ漏れに備え冪等に保証）---
ALTER TABLE users ADD COLUMN IF NOT EXISTS celebration_enabled    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS celebration_image      TEXT;

-- --- payments: 精算種別 / 精算ID（同上、冪等に保証）---
ALTER TABLE payments ADD COLUMN IF NOT EXISTS split_type     VARCHAR(16) NOT NULL DEFAULT 'warikan';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS settlement_id  VARCHAR(32);

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 2] 任意: group_members.user_id への一意インデックス（M1: 1人=1グループ）
--   重複があると失敗するため、別トランザクションで・重複チェックの後に実行する。
--   STEP 1 の止血には不要なので、必要なときだけ流す。
-- ─────────────────────────────────────────────────────────────────────────
-- 2a) まず重複の有無を確認（0行なら 2b を実行してよい）:
-- SELECT user_id, COUNT(*) FROM group_members GROUP BY user_id HAVING COUNT(*) > 1;
--
-- 2b) 重複が無いことを確認できたら一意インデックスを作成（冪等）:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_group_members_user ON group_members (user_id);


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 3] 適用後の検証（読み取り専用）
--   8列すべてが返ればOK。期待: token_version / failed_login_attempts /
--   locked_until / celebration_enabled / celebration_image が users に存在。
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'users'
--    AND column_name IN ('token_version','failed_login_attempts','locked_until',
--                        'celebration_enabled','celebration_image')
--  ORDER BY column_name;
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'payments'
--    AND column_name IN ('split_type','settlement_id')
--  ORDER BY column_name;

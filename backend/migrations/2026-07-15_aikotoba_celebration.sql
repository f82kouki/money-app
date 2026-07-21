-- ============================================================================
-- 先行適用/保険マイグレーション: あいことば再ログイン(C) ＋ お祝い画像の2人共有(A)
--   追加物:
--     - users.aikotoba_hash            … あいことば(第2資格情報)の bcrypt ハッシュ
--     - celebration_images.group_id    … お祝い画像を group(2人)で共有するための束ね列
--
-- 位置づけ: 通常は main へ push すれば deploy-prod の migrate ジョブ(init_db)が
--           同じ列を冪等に適用する。本SQLはその「保険/先行適用」用。特に
--           users.aikotoba_hash は get_current_user の select(User) が毎リクエスト
--           全列を読むため、列が無い状態で新コードが動くと認証が全停止する
--           (2026-06-19 の token_version 事故と同型)。心配ならコードデプロイの前に
--           これを流して列だけ先に用意しておく(列が先にあってもコードは無害)。
--
-- 性質: 冪等・後方互換(すべて ADD COLUMN IF NOT EXISTS)。再実行しても安全。
--       backend/app/db.py の _ensure_user_aikotoba_column /
--       _ensure_celebration_image_group_column が足すのと同じ列を純SQLで再現。
--
-- 実行先: Session/Direct の 5432(Transaction pooler 6543 ではない/DDL不可)。
--         一番安全なのは Supabase ダッシュボードの SQL Editor に貼って実行。
--         スクリプトなら backend/migrations/apply_hotfix.sh と同型で流す。
-- 作成日: 2026-07-15
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 0] 適用前の現状確認(読み取り専用・任意)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'users' AND column_name = 'aikotoba_hash';
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'celebration_images' AND column_name = 'group_id';


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 1] 本体: 不足カラムを冪等に追加
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- タスクC: あいことば(認証列。drift で認証全停止を防ぐため先行適用推奨)
ALTER TABLE users ADD COLUMN IF NOT EXISTS aikotoba_hash VARCHAR(255);

-- タスクA: お祝い画像の group 化(ON/OFF は各自据え置きのため groups へは触らない)
ALTER TABLE celebration_images ADD COLUMN IF NOT EXISTS group_id VARCHAR(32);

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 2] お祝い画像 group_id のバックフィル(任意)
--   通常はコード側 _backfill_celebration_image_group()(init_db が冪等に実行)に
--   任せてよい。SQL で先に埋めたい場合のみ実行する。group_id が未設定の行を、
--   その画像の所有者 user_id が属するグループの id で埋める(冪等)。
-- ─────────────────────────────────────────────────────────────────────────
-- BEGIN;
-- UPDATE celebration_images AS ci
--    SET group_id = gm.group_id
--   FROM group_members AS gm
--  WHERE ci.group_id IS NULL
--    AND ci.user_id = gm.user_id;
-- COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 3] 適用後の検証(読み取り専用)
--   両列が返ればOK。/api/health が schema_ok:true になることも確認する。
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE (table_name = 'users' AND column_name = 'aikotoba_hash')
--     OR (table_name = 'celebration_images' AND column_name = 'group_id')
--  ORDER BY table_name, column_name;

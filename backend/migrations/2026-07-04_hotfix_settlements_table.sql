-- ============================================================================
-- 止血マイグレーション: 本番(Supabase Postgres)に settlements テーブルを作成
--   事象: relation "settlements" does not exist → POST /api/settlements が500
--   原因: Settlement モデル/エンドポイントは投入済みだが、テーブル作成(create_all)が
--         本番未適用。deploy-prod #1 の migrate ジョブ(=init_db)が失敗し流れなかった。
--
-- 性質: 冪等・後方互換（CREATE TABLE/INDEX IF NOT EXISTS）。再実行しても安全。
--       backend/app/db.py の init_db()(create_all) が作るのと同じ定義を純SQLで再現。
--       列定義は backend/app/models.py の class Settlement と一致。
--
-- 実行先: Session/Direct の 5432（Transaction pooler 6543 ではない）。
--         一番安全なのは Supabase ダッシュボードの SQL Editor に貼って実行。
--         スクリプトなら backend/migrations/apply_settlements_hotfix.sh。
-- 作成日: 2026-07-04
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 0] 適用前の現状確認（読み取り専用・任意）
--   NULL が返れば未作成（＝要適用）。'settlements' が返れば既に存在。
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT to_regclass('public.settlements');


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 1] 本体（止血）: settlements テーブルを冪等に作成
--   トランザクションで囲み、全部入るか・全部入らないかにする。
--   参照先 groups / group_members は既存。空テーブル作成なのでFK付与も安全。
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS settlements (
    id                    VARCHAR(32)               NOT NULL,
    group_id              VARCHAR(32)               NOT NULL,
    settled_by_member_id  VARCHAR(32)               NOT NULL,
    from_member_id        VARCHAR(32),
    to_member_id          VARCHAR(32),
    amount                INTEGER                   NOT NULL,
    created_at            TIMESTAMP WITH TIME ZONE  NOT NULL,
    CONSTRAINT pk_settlements PRIMARY KEY (id),
    CONSTRAINT fk_settlements_group_id
        FOREIGN KEY (group_id)             REFERENCES groups (id),
    CONSTRAINT fk_settlements_settled_by_member_id
        FOREIGN KEY (settled_by_member_id) REFERENCES group_members (id)
);

-- group_id の索引（models.py で index=True。名称は SQLAlchemy 既定に合わせる）
CREATE INDEX IF NOT EXISTS ix_settlements_group_id ON settlements (group_id);

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────
-- [STEP 2] 適用後の検証（読み取り専用）
--   'settlements' が返り、7列（id/group_id/settled_by_member_id/from_member_id/
--   to_member_id/amount/created_at）が並べばOK。
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT to_regclass('public.settlements');
--
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'settlements'
--  ORDER BY ordinal_position;


-- ─────────────────────────────────────────────────────────────────────────
-- 備考: payments.settlement_id → settlements.id の FK は付けない。
--   既存 payments テーブルには create_all も FK を後付けしないため、挙動を揃える。
--   （アプリはDBレベルFKに依存しない。settlement_id 列は 2026-06-19 に適用済み。）
-- ─────────────────────────────────────────────────────────────────────────

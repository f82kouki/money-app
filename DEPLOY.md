# warikan デプロイ & 運用ガイド

ローカル開発・Supabase（本番DB）・Vercel（本番ホスティング）の構成と手順をまとめたもの。
スキーマ変更やリリースのたびにこのファイルの該当箇所を参照する。

---

## 構成の全体像

| 環境 | アプリ | DB | 起動/デプロイ |
|---|---|---|---|
| **ローカル開発** | Docker（backend）+ ローカル Vite（frontend） | **Docker Postgres**（隔離・高速） | `make dev` |
| **本番** | Vercel（フロント静的 + `/api` Python 関数） | **Supabase Postgres**（1プロジェクト） | `main` へ push で自動デプロイ |

- DB は **dev/prod を分けず Supabase 1つ**を本番として使う。
- ローカル開発は **Docker Postgres** を使う（`make dev` は `.env` を無視し docker-compose の DB に繋ぐ）。
  → ローカルのデータは Supabase には入らない。これは仕様。
- **本番ブランチは `main`**。`develop` を `main` にマージすると本番デプロイが走る。
- デプロイは **Vercel の Git 連携で自動**。GitHub Actions は不要（CI を挟みたいときだけ別途）。

```
ローカル(make dev) ─→ Docker Postgres
develop ──(PRでマージ)──→ main ──(push検知)──→ Vercel Production ─→ Supabase
```

---

## 1. ローカル開発

```bash
make dev          # backend(Docker) + frontend(ローカル Vite) を起動
# アプリ:  http://localhost:5178
# API Doc: http://localhost:8000/docs
make down         # backend(Docker) を停止
make logs         # backend(Docker) のログ追従
```

- backend は Docker、DB は docker-compose の Postgres（`pgdata` ボリュームに永続化）。
- DBの中身を覗く: `make db-shell`（psql）/ `make db-tables`（全テーブル表示）。
- **注意**: `make backend`（venv 起動）は `.env` の `DATABASE_URL` を読む。`.env` が Supabase を指している場合、ローカルから**本番DBに直書き**するので普段は使わない。

---

## 2. Supabase（本番DB）

現プロジェクト ref: `komdwtqknvhqzzdvohyx` / リージョン: `ap-northeast-1`（東京）

### 2-1. プロジェクト作成時の設定（新規作成する場合）

| 項目 | 設定 |
|---|---|
| Project name | 任意（例 `warikan`） |
| Database password | 強いパスワードを生成し**必ず保存**（後から確認不可・リセットは可能） |
| Region | Tokyo (Northeast Asia) |
| **Enable Data API** | **オフ** ★ |
| Automatically expose new tables | オフ |
| Enable automatic RLS | オフでOK |

★ このアプリは Postgres へ直接接続するだけで Supabase の REST API(PostgREST) を使わない。`users` にパスワードハッシュを保持するため、Data API はオフにして公開経路を断つ。

### 2-2. 接続文字列（用途別に2種類）

ダッシュボード右上 **Connect**（または Settings → Database）から取得。`[PASSWORD]` を実パスワードに置換し、末尾に `?sslmode=require` を付与する。

| 用途 | 種類 | ポート | 例 |
|---|---|---|---|
| `make db-init` / ローカルからのDB操作 | **Direct connection** | `5432` | `postgresql://postgres:[PASSWORD]@db.komdwtqknvhqzzdvohyx.supabase.co:5432/postgres?sslmode=require` |
| **Vercel(本番)** | **Transaction pooler** | `6543` | `postgresql://postgres.komdwtqknvhqzzdvohyx:[PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require` |

- Direct(5432) に繋がらない環境（IPv6 のみ等）では **Session pooler(5432)** を `make db-init` に使う。
- **Vercel は必ず Transaction pooler(6543)**（サーバーレスの接続枯渇防止）。
- パスワードに記号（`@ : / ? # & %` 等）が含まれる場合は **URL エンコード**が必要（`@`→`%40` など）。

---

## 3. DBスキーマの作成・変更（Alembic 未導入）

このプロジェクトは Alembic を使わず、`init_db()`（`create_all` + 軽量な `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`）でスキーマを管理する。
`AUTO_CREATE_TABLES` は本番では使わない（サーバーレスで起動イベントが確実に走らないため）。

### 初回（テーブル一括作成）

```bash
cd backend
DATABASE_URL='postgresql://postgres:[PASSWORD]@db.komdwtqknvhqzzdvohyx.supabase.co:5432/postgres?sslmode=require' \
  .venv/bin/python -c "from app.db import init_db; init_db(); print('migrated')"
```

（`config.py` が `postgresql://`→`postgresql+psycopg://` に自動変換。`create_all` は既存テーブルに対して no-op）

### カラム追加を含むリリース ⚠️ 順序に注意

新カラムを宣言したコードを、DB にカラムが無い状態で先にデプロイすると、その機能の API が 500 になる。
**新コードを main にマージ（＝本番デプロイ）する前に**、上記コマンドを一度実行して列を追加しておく。

- 追加カラムは旧コードから参照されないので、デプロイ前に流しても稼働中の本番に影響しない。
- `init_db()` は冪等（`IF NOT EXISTS` + 列存在チェック）なので再実行・並行実行も安全。
- `models.py` でカラムを追加したら、`db.py` の `_ensure_user_celebration_columns()` 相当のように `ALTER TABLE` を足すか、新カラム用の同等関数を用意して `init_db()` から呼ぶこと。

> 例: 「記録時のお祝い画像」リリースでは `users` に `celebration_enabled` / `celebration_image` を追加。事前に上記マイグレーションを実行済み。

---

## 4. Vercel デプロイ

### 4-1. 初回セットアップ

1. https://vercel.com に GitHub でログイン
2. **Add New… → Project** → `f82kouki/money-app` を Import（GitHub App の権限付与を許可）
3. 設定:
   - **Root Directory**: `./`（デフォルト。`vercel.json` がリポジトリ root にあるため）
   - Framework Preset / Build 設定: 触らない（`vercel.json` の `builds` がビルドを定義し、ダッシュボード設定は無視される）
4. **Settings → Git → Production Branch** = `main`

### 4-2. 環境変数（Settings → Environment Variables）

単一DBなので**スコープは All（Production / Preview / Development 全部）**でOK。

| Key | 値 |
|---|---|
| `DATABASE_URL` | Supabase の **Transaction pooler(6543)** 文字列（`?sslmode=require` 付き） |
| `JWT_SECRET` | ランダムな長い文字列 |

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"   # JWT_SECRET 生成
```

- `JWT_SECRET` をデフォルト（`dev-secret-change-me`）のままにしない（トークン偽造可能になる）。
- `AUTO_CREATE_TABLES` は**設定しない**（本番は db-init 運用）。
- `CORS_ORIGINS` は**不要**（フロントと API が同一ドメイン `/api`）。

### 4-3. ブランチとデプロイの関係

| トリガー | デプロイ先 |
|---|---|
| `main` へ push | **Production**（本番URL） |
| `develop` など他ブランチへ push | **Preview**（プレビューURL `...-git-develop-xxxx.vercel.app`） |
| Pull Request | PR に Preview URL がコメント |

push のたびに**プロジェクト全体を再ビルド**（差分単位ではない／ビルドキャッシュは効く）。

---

## 5. リリースフロー（通常運用）

1. `develop` で開発・ローカル確認（`make dev`）。
2. **スキーマ変更がある場合**: 先に Supabase へマイグレーション（§3「カラム追加を含むリリース」）。
3. GitHub で **`develop` → `main` の PR を作成してマージ**。
4. Vercel が `main` への push を検知し、**自動で本番デプロイ**。
5. 本番URLで動作確認（§6）。

---

## 6. 動作確認

1. 本番URL（`https://money-app-xxxx.vercel.app` 等）を開く
2. 新規登録 → グループ作成 → 支払い記録 → 設定でお祝い画像アップロード
3. Supabase **Table Editor** で `users` / `payments` に行が入っているか確認
4. 画像アップロードが通れば `python-multipart`（本番の地雷）も解消済みの証明

---

## 7. よくあるハマりどころ

- **ローカルで登録したのに Supabase が更新されない** → 正常。`make dev` は Docker Postgres を使う。本番DB（Supabase）に入るのはデプロイ後のアプリ経由。
- **main をデプロイしたのに新機能が無い** → `develop` を `main` にマージし忘れ。main は手動マージしないと最新にならない。
- **本番で画像アップロードが 500** → ルート `requirements.txt` に `python-multipart` が無い（同期忘れ）。`backend/requirements.txt` と揃える。
- **Direct(5432) に繋がらない** → Session pooler(5432) を使う。Vercel は Transaction pooler(6543)。
- **接続文字列で認証エラー** → パスワードの記号を URL エンコードし忘れ。
- **久々のアクセスが遅い/繋がらない** → Supabase 無料枠は約1週間アクセスが無いと自動停止。ダッシュボードから再開。
- **`.env` をコミットしてしまう** → `.gitignore` 済み（`.env` 系）。秘密情報なので絶対にコミットしない。

---

## 付録: 接続先早見表

| 場面 | DB | 文字列の種類 |
|---|---|---|
| ローカル `make dev` | Docker Postgres | docker-compose が自動設定（`.env` 無視） |
| `make db-init`（本番スキーマ操作） | Supabase | Direct 5432（or Session pooler 5432） |
| Vercel 本番ランタイム | Supabase | Transaction pooler 6543 |

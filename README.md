# warikan（割り勘記録アプリ）

2人で「どちらがいくら支払ったか」をスマホからすぐ記録し、合計・差額・**精算額**を確認できる Web アプリ。

- フロント: React + TypeScript + Vite + Tailwind（スマホ縦画面優先）
- バック: FastAPI + SQLAlchemy（認証は JWT 自作）
- DB: Supabase（無料 Postgres）／ローカルは SQLite でもOK
- デプロイ: Vercel（フロント静的 + `/api` の Python 関数）

```
warikan/
├─ frontend/   React + TS（Vite）
├─ backend/    FastAPI（app/ 配下）
├─ api/        Vercel 用エントリ（backend の app を公開）
├─ Makefile    まとめて操作
└─ vercel.json デプロイ設定
```

## クイックスタート（推奨）

**バックエンドは Docker、フロントエンドはローカル**で動かす。`make dev` がまとめて起動する。

```bash
make dev
```

これで内部的に：
1. `docker compose up -d --build` … PostgreSQL + FastAPI を Docker で起動（バックグラウンド）
2. フロントの依存が無ければ `npm install` してから `npm run dev`（ローカルで Vite を起動）

- アプリ: http://localhost:5178
- API ドキュメント: http://localhost:8000/docs

**停止**: フロントは `Ctrl-C`。バックエンド(Docker)はそのまま動き続けるので、止めるときは `make down`。

`.env` は不要（DB 接続情報は docker-compose.yml が渡す）。DB は本番と同じ **PostgreSQL**、テーブルは起動時に自動作成、データはボリューム `pgdata` に永続化される。`requirements.txt` を変えたら `make restart`（backend 再ビルド）。

## Docker を使わず全部ローカルで動かす場合

```bash
make setup-backend && make setup   # venv + npm の依存をインストール
cp .env.example .env               # ローカルは SQLite 設定のままでOK
make db-init                       # DB にテーブルを作成
# 別々のターミナルで:
make backend    # FastAPI (:8000)
make frontend   # Vite (:5178)
```

### 主な make コマンド

| コマンド | 内容 |
|---|---|
| `make dev` | **backend(Docker) + frontend(ローカル) を起動** |
| `make down` | backend(Docker) を停止 |
| `make logs` | backend(Docker) のログを追従表示 |
| `make restart` | backend を再ビルドして起動し直す |
| `make up` | backend(db+api) だけ Docker で起動 |
| `make db-init` | DB にテーブル作成 |
| `make dev` | フロント＋バックを同時起動 |
| `make backend` / `make frontend` | 片方だけ起動 |
| `make lint` | フロントの型チェック |
| `make build` | フロントの本番ビルド |
| `make clean` | venv / node_modules / dist / sqlite を削除 |

## 使い方（2人で割り勘）

1. 1人目: 新規登録 → 「新しく作る」でグループ作成 → **招待コード**が表示される。
2. 2人目: 新規登録 → 「招待コードで参加」にコードを入力して参加。
3. それぞれが支払いを記録（金額・支払った人・項目・日付）。
4. トップのサマリーで各合計・差額・「◯◯が△△に □円渡せば均等」を確認。
5. 記録は編集・削除可。設定画面で表示名を変更できる。

## Supabase をDBに使う（本番に近い構成）

Supabase は初めてでも数分でセットアップできる。

1. https://supabase.com で無料プロジェクトを作成。
2. `Project Settings → Database → Connection string` を開く。
   - **ローカル開発 / `make db-init`** には **Direct connection（port 5432）** を使う。
   - **Vercel(本番)** には **Connection pooling の Transaction mode（port 6543）** を使う（サーバーレスの接続枯渇を防ぐため）。
3. コピーした `postgresql://...` を `.env` の `DATABASE_URL` に貼る（コード側で psycopg 用に自動変換される）。`?sslmode=require` を末尾に付けるのを推奨。
4. `make db-init` でテーブル作成 → `make dev` で起動。

> ⚠️ ハマりどころ
> - 無料プロジェクトは **約1週間アクセスが無いと自動停止** する。久々の初回アクセスが遅い／ダッシュボードから再開が必要なことがある。
> - サーバーレスでは本コードが自動で `NullPool`（プールしない）に切り替わる。必ず **Transaction pooler(6543)** を使うこと。

## Vercel へデプロイ

1. このリポジトリを Git にプッシュし、Vercel で Import。
2. ルートの `vercel.json` がフロント(静的)と `/api`(Python) を両方ビルドする。
3. Vercel の **Environment Variables** に設定:
   - `DATABASE_URL` = Supabase の **Transaction pooler(6543)** 接続文字列
   - `JWT_SECRET` = ランダムな長い文字列（`python -c "import secrets; print(secrets.token_hex(32))"`）
4. デプロイ後、Supabase 側で一度 `make db-init`（ローカルから Direct 接続で）を実行してテーブルを作成しておく。
5. フロントと API は同一ドメインの `/api/*` なので CORS 設定は不要。

> Vercel のモノレポ + Python 関数はバージョンによって挙動が変わることがある。うまく動かない場合は、フロントを Vercel・バックエンドを別ホスト（Render 等）に分ける構成も検討する。

### スキーマ変更（カラム追加）を含むデプロイ ⚠️

本プロジェクトは Alembic を導入していないため、既存テーブルへの**カラム追加は手動マイグレーションが必要**。`AUTO_CREATE_TABLES` は本番では使わず（サーバーレスでは起動イベントが確実に走らない）、`make db-init` 運用とする。

新カラムを宣言したコードを、DB にカラムが無い状態で**先にデプロイすると該当機能のAPIが 500 になる**ため、次の順序を守る:

1. **新コードのデプロイ前**に、本番 Supabase（**Direct 接続 / port 5432**）へ列追加マイグレーションを一度だけ実行する。`init_db()` は `create_all`（既存テーブルには no-op）＋ 軽量な `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` を行う（冪等・再実行安全）:
   ```bash
   cd warikan/backend
   DATABASE_URL='postgresql://...（Supabase Direct 5432）...' \
     .venv/bin/python -c "from app.db import init_db; init_db(); print('migrated')"
   ```
   追加カラムは現行（旧）コードからは参照されないので、デプロイ前に流しても稼働中の本番に影響しない。
2. その後、新コードを Vercel にデプロイする。

> 例: 「記録時のお祝い画像」機能のリリースでは `users` に `celebration_enabled` / `celebration_image` を追加するため、上記の事前マイグレーションが必要。

## 動作確認シナリオ

アカウントA登録 → グループ作成 → 招待コード取得 → 別ブラウザ/シークレットでアカウントB登録 → コードで参加 → 双方で支払い追加 → サマリーの合計・差額・精算額を確認 → 編集・削除 → 設定で表示名変更が反映されるか確認。

# warikan — モノレポ操作用 Makefile
# 使い方: make setup → .env を編集 → make db-init → make dev

SHELL := /bin/zsh
BACKEND := backend
FRONTEND := frontend
VENV := $(BACKEND)/.venv
# 利用可能な新しめの Python を自動検出（3.10+ 必須）
PYTHON := $(shell command -v python3.13 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3)
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

.PHONY: help dev setup setup-frontend setup-backend db-init backend frontend lint build check check-requirements clean \
	up up-d down logs build-docker restart ps db-shell db-tables

help:
	@echo "== 開発（これだけでOK）=="
	@echo "make dev         - backend(Docker) + frontend(ローカル) を起動"
	@echo "make down        - backend の Docker を停止"
	@echo "make logs        - backend(Docker) のログを追従表示"
	@echo ""
	@echo "== バックエンド Docker 個別操作 =="
	@echo "make up          - backend(db+api) を Docker で起動（フロントなし）"
	@echo "make restart     - 再ビルドして起動し直す"
	@echo ""
	@echo "== その他 =="
	@echo "make setup       - frontend(npm) の依存をインストール"
	@echo "make lint        - 型チェック（フロント）"
	@echo "make build       - frontend を本番ビルド"
	@echo "make check       - requirements同期 + 型チェック + 本番ビルド（デプロイ前）"
	@echo "make check-requirements - root/backend の requirements ドリフト検出"
	@echo "make clean       - node_modules / dist などを削除"

# ===== メイン: backend は Docker、frontend はローカル（vimmy と同じ流儀）=====
dev:
	@echo "🚀 フル開発環境を起動中..."
	@echo "バックエンドサービス起動中..."
	docker compose up -d --build
	@echo "フロントエンド開発サーバー起動中..."
	cd $(FRONTEND) && ([ -d node_modules ] || npm install) && npm run dev

# frontend の依存をインストール（backend は Docker なので venv 不要）
setup: setup-frontend

setup-frontend:
	cd $(FRONTEND) && npm install

frontend:
	cd $(FRONTEND) && npm run dev

# --- 以下は Docker を使わず backend をローカルで動かしたい場合の補助 ---
setup-backend:
	@echo "using $(PYTHON)"
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND)/requirements.txt

db-init:
	cd $(BACKEND) && .venv/bin/python -c "from app.db import init_db; init_db(); print('tables created')"

backend:
	cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000

lint:
	cd $(FRONTEND) && npm run lint

build:
	cd $(FRONTEND) && npm run build

# requirements 同期 + 型チェック + 本番ビルドが通るかをまとめて確認（デプロイ前の検証用）
check: check-requirements
	cd $(FRONTEND) && npm run lint && npm run build

# ルートと backend の requirements.txt がズレていないか確認する。
# Vercel はルートの requirements.txt を読むため、本番依存は両者で一致させる
# （uvicorn は本番Vercelでは不要なので比較から除外。コメント/空行も無視）。
check-requirements:
	@norm() { grep -vE '^[[:space:]]*#|^[[:space:]]*$$|uvicorn' "$$1" | sort; }; \
	if diff <(norm requirements.txt) <(norm $(BACKEND)/requirements.txt) >/dev/null; then \
		echo "✅ requirements.txt は同期しています"; \
	else \
		echo "❌ requirements.txt がズレています (uvicorn以外):"; \
		diff <(norm requirements.txt) <(norm $(BACKEND)/requirements.txt) || true; \
		exit 1; \
	fi

clean:
	rm -rf $(VENV) $(FRONTEND)/node_modules $(FRONTEND)/dist $(BACKEND)/warikan.db

# ===== Docker =====
up:
	docker compose up

# バックグラウンド起動したいとき: make up-d
up-d:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

# ソースの依存(requirements/package.json)を変えたら再ビルドが必要
build-docker:
	docker compose build

restart:
	docker compose up --build

# ===== DB の中身を見る =====
# psql の対話シェルに入る（\dt でテーブル一覧、\q で終了）
db-shell:
	docker compose exec db psql -U warikan -d warikan

# 全テーブルの中身をまとめて表示
db-tables:
	@for t in users groups group_members payments; do \
		echo "=========== $$t ==========="; \
		docker compose exec -T db psql -U warikan -d warikan -c "SELECT * FROM $$t;"; \
	done

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

.PHONY: help setup setup-backend setup-frontend db-init backend frontend dev lint build clean \
	up up-d down logs build-docker restart ps

help:
	@echo "== Docker（推奨）=="
	@echo "make up          - 3コンテナ(db/backend/frontend)を起動"
	@echo "make down        - コンテナを停止・削除"
	@echo "make logs        - ログを表示（追従）"
	@echo "make restart     - 再ビルドして起動し直す"
	@echo ""
	@echo "== ローカル(venv/npm 直接) =="
	@echo "make setup       - backend(venv+pip) と frontend(npm) の依存をインストール"
	@echo "make db-init     - DB にテーブルを作成"
	@echo "make dev         - backend と frontend を並列起動"
	@echo "make lint        - 型チェック（フロント）"
	@echo "make build       - frontend を本番ビルド"
	@echo "make clean       - venv / node_modules / dist を削除"

setup: setup-backend setup-frontend

setup-backend:
	@echo "using $(PYTHON)"
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r $(BACKEND)/requirements.txt

setup-frontend:
	cd $(FRONTEND) && npm install

db-init:
	cd $(BACKEND) && .venv/bin/python -c "from app.db import init_db; init_db(); print('tables created')"

backend:
	cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd $(FRONTEND) && npm run dev

# backend と frontend を同時起動（Ctrl-C で両方停止）
dev:
	@echo "backend(:8000) と frontend(:5173) を起動します。Ctrl-C で停止。"
	@trap 'kill 0' INT TERM; \
	( cd $(BACKEND) && .venv/bin/uvicorn app.main:app --reload --port 8000 ) & \
	( cd $(FRONTEND) && npm run dev ) & \
	wait

lint:
	cd $(FRONTEND) && npm run lint

build:
	cd $(FRONTEND) && npm run build

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

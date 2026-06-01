# FastAPI バックエンド用イメージ
FROM python:3.12-slim

# Python のお作法: バイトコード書き出し無効・出力をバッファしない（ログが即出る）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 依存だけ先にインストール（キャッシュを効かせる）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリ本体をコピー（開発時は compose の volume で上書きされる）
COPY . .

EXPOSE 8000

# 本番想定のデフォルト起動。開発(reload)は docker-compose 側で command を上書きする。
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

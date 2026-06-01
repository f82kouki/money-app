# Vite 開発サーバ用イメージ（ホットリロードあり）
FROM node:20-alpine

WORKDIR /app

# 依存だけ先にインストール（キャッシュを効かせる）
COPY package.json package-lock.json* ./
RUN npm install

# ソースをコピー（開発時は compose の volume で上書きされる）
COPY . .

EXPOSE 5173

# --host でコンテナ外(ブラウザ)からアクセス可能にする
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

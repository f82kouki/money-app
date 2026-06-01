import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ローカル開発では /api を FastAPI に転送して CORS を回避する。
// 転送先はデフォルト localhost:8000。Docker では BACKEND_URL=http://backend:8000 を渡す。
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5178,
    strictPort: true, // 5178 が埋まっていたら別ポートに逃げず明示エラーにする
    host: true, // Docker コンテナ外（ブラウザ）からアクセス可能にする
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api and /health to the Node/Express gateway (port 5001).
// Override with VITE_PROXY_TARGET (e.g. http://127.0.0.1:8000 to hit FastAPI directly;
// FastAPI exposes the same /api/* routes and /health).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://127.0.0.1:5001";
  const proxy = {
    "/api": { target, changeOrigin: true },
    "/health": { target, changeOrigin: true },
  };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 5173, proxy },
    build: {
      chunkSizeWarningLimit: 900,
    },
  };
});

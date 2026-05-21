import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});

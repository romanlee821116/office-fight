import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const buildTime = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    // 模型與字型檔名不帶 hash，URL 附上版本號才不會被瀏覽器快取住舊檔
    __ASSET_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  server: {
    host: true,
    port: 5173,
    // 埠被占用時直接報錯，避免悄悄跳到 5174 讓分享的網址失效
    strictPort: true,
    // dev 模式把 /api 轉給伺服端，前端才能用相對路徑查詢設定
    proxy: {
      '/api': 'http://localhost:2567',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
});

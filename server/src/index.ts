import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { OfficeRoom } from './rooms/OfficeRoom';
import { logger } from './logger';

const PORT = Number(process.env.PORT ?? 2567);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
app.disable('x-powered-by');

// 第三層防線：即使有字串漏進 HTML，也不允許執行內嵌或外部腳本
// - 'wasm-unsafe-eval'：drei/three 載入 GLB 時會初始化 Draco / meshopt 的 WebAssembly 解碼器
// - connect-src blob: data:：GLTFLoader 會把內嵌貼圖轉成 blob URL 再 fetch
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: blob: data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

/** 前端啟動時查詢是否需要進場密碼（密碼本身不外流） */
app.get('/api/config', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ requireJoinCode: (process.env.JOIN_CODE ?? '').trim().length > 0 });
});

// 提供打包後的前端（vite build → client/dist），同源不需處理 CORS
// index.html 不快取（每次改版都要拿到最新的 bundle 清單）；/assets 檔名帶 hash，可長期快取
app.use(
  express.static(clientDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.includes(`${path.sep}models${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`)) {
        // 模型 / 字型檔名不帶 hash，快取一天即可
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);
/** 讀取 index.html 並把 og:image / og:url 換成這次請求的絕對網址（預覽抓取器需要絕對路徑） */
function renderIndex(req: express.Request): string | null {
  const file = path.join(clientDist, 'index.html');
  if (!fs.existsSync(file)) return null;
  // Host 標頭由請求者控制，只接受主機名 / IP / 埠的合法字元，避免被塞進 HTML 屬性
  const rawHost = req.headers.host ?? `localhost:${PORT}`;
  const host = /^[A-Za-z0-9.\-\[\]:]{1,255}$/.test(rawHost) ? rawHost : `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https' ? 'https' : 'http';
  const origin = `${proto}://${host}`;
  return fs.readFileSync(file, 'utf8').replaceAll('__OG_IMAGE__', `${origin}/og-image.png`).replaceAll('__OG_URL__', `${origin}/`);
}

app.get(/^\/(?!matchmake|health|api\/).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const html = renderIndex(req);
  if (!html) {
    res.status(404).send('尚未建置前端，請先執行 npm run build');
    return;
  }
  res.type('html').send(html);
});

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('office', OfficeRoom);

gameServer
  .listen(PORT)
  .then(() => {
    const codeOn = (process.env.JOIN_CODE ?? '').trim().length > 0;
    logger.info(`伺服器啟動：http://localhost:${PORT}（內網請以本機 IP 連入）`);
    logger.info(codeOn ? '進場密碼：已啟用' : '進場密碼：未設定（公開部署請設定 JOIN_CODE）');
  })
  .catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`埠 ${PORT} 已被占用，可能有上一次的伺服器還在跑。請執行 npm run stop 再重新啟動，或改用 PORT=xxxx npm start`);
    } else {
      logger.error('伺服器啟動失敗', err);
    }
    process.exit(1);
  });

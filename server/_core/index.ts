import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAdminRoutes } from "../admin";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getCardById, getPhotosByCardId } from "../db";
import { sdk } from "./sdk";
import { storagePut } from "../storage";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const host = process.env.HOST || "0.0.0.0";

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Serve uploaded files
  app.use('/uploads', express.static('uploads'));

  registerOAuthRoutes(app);
  registerAdminRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // 分享页：/share/card/:id  返回带 Open Graph 标签的 HTML 预览页
  app.get("/share/card/:id", async (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    if (isNaN(cardId)) { res.status(400).send("Invalid card id"); return; }

    const card = await getCardById(cardId);
    if (!card) { res.status(404).send("Card not found"); return; }

    const cardPhotos = await getPhotosByCardId(cardId);

    // 将第一张图片的相对路径转为绝对 URL
    const baseUrl = (process.env.PUBLIC_BASE_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const firstPhotoUrl = (() => {
      const raw = cardPhotos[0]?.url ?? "";
      if (!raw) return "";
      if (/^https?:\/\//i.test(raw)) return raw;
      return `${baseUrl}${raw.startsWith("/") ? "" : "/"}${raw}`;
    })();

    const title = card.title ?? "来参与投票吧";
    const desc = `「${title}」- 快来「一选」参与这个有趣的投票！`;
    const photoCount = cardPhotos.length;
    const shareUrl = `${baseUrl}/share/card/${cardId}`;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)} - 一选</title>

  <!-- Open Graph（微信/QQ 链接预览） -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${escHtml(shareUrl)}" />
  <meta property="og:title"       content="${escHtml(title)} - 一选" />
  <meta property="og:description" content="${escHtml(desc)}" />
  ${firstPhotoUrl ? `<meta property="og:image" content="${escHtml(firstPhotoUrl)}" />` : ""}
  <meta property="og:image:width"  content="600" />
  <meta property="og:image:height" content="600" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(desc)}" />
  ${firstPhotoUrl ? `<meta name="twitter:image" content="${escHtml(firstPhotoUrl)}" />` : ""}

  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1a1a2e;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
    .card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:24px;max-width:420px;width:100%;text-align:center}
    .app-name{font-size:13px;color:rgba(255,255,255,0.45);letter-spacing:2px;margin-bottom:20px;text-transform:uppercase}
    .photos{display:grid;gap:8px;margin-bottom:20px;border-radius:12px;overflow:hidden}
    .photos.n1{grid-template-columns:1fr}
    .photos.n2{grid-template-columns:1fr 1fr}
    .photos.n3{grid-template-columns:1fr 1fr}
    .photos.n4{grid-template-columns:1fr 1fr}
    .photos img{width:100%;aspect-ratio:1;object-fit:cover}
    .title{font-size:20px;font-weight:700;margin-bottom:8px;line-height:1.4}
    .subtitle{font-size:14px;color:rgba(255,255,255,0.55);margin-bottom:24px}
    .btn{display:inline-block;background:#6366F1;color:#fff;text-decoration:none;border-radius:50px;padding:14px 36px;font-size:16px;font-weight:600}
    .btn:active{opacity:.85}
    .footer{margin-top:24px;font-size:12px;color:rgba(255,255,255,0.25)}
  </style>
</head>
<body>
  <div class="card">
    <p class="app-name">一选</p>
    ${photoCount > 0 ? `
    <div class="photos n${Math.min(photoCount, 4)}">
      ${cardPhotos.slice(0, 4).map(p => {
        const imgUrl = /^https?:\/\//i.test(p.url) ? p.url : `${baseUrl}${p.url.startsWith("/") ? "" : "/"}${p.url}`;
        return `<img src="${escHtml(imgUrl)}" alt="投票图片" loading="lazy" />`;
      }).join("\n      ")}
    </div>` : ""}
    <h1 class="title">${escHtml(title)}</h1>
    <p class="subtitle">共 ${photoCount} 张图，来参与投票吧！</p>
    <a class="btn" href="${escHtml(shareUrl)}">打开 App 参与投票</a>
  </div>
  <p class="footer">一选 · 颜值投票</p>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  // 通用图片上传接口：接收 base64，上传到 OSS，返回 URL
  app.post("/api/upload", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    } catch {
      res.status(401).json({ error: "Unauthorized" }); return;
    }

    const { base64, mimeType, directory } = req.body as { base64?: string; mimeType?: string; directory?: string };
    if (!base64 || !mimeType) {
      res.status(400).json({ error: "base64 and mimeType are required" }); return;
    }
    if (base64.length > 5_000_000) {
      res.status(413).json({ error: "Image too large" }); return;
    }

    try {
      const extension = (mimeType.split("/")[1] || "jpg").replace(/[^a-zA-Z0-9]/g, "");
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const dir = (directory ?? "comments").replace(/[^a-zA-Z0-9_-]/g, "");
      const fileKey = `${dir}/${Date.now()}-${randomSuffix}.${extension}`;
      console.log(`[upload] uploading key=${fileKey} size=${base64.length} mimeType=${mimeType}`);
      const buffer = Buffer.from(base64, "base64");
      const { url } = await storagePut(fileKey, buffer, mimeType);
      console.log(`[upload] success url=${url}`);
      res.json({ url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[upload] storagePut failed:", msg);
      res.status(500).json({ error: msg });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, host, () => {
    console.log(`[api] server listening on ${host}:${port}`);
  });
}

startServer().catch(console.error);

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Minimal dependency-free static file server for the built Storybook.
// Used to expose storybook-static/ over a plain HTTP port for remote (ngrok)
// review — no websocket, no host check, nothing for a tunnel to break.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";

const ROOT = join(process.cwd(), "storybook-static");
const PORT = Number(process.env.PORT || 6007);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    // prevent path traversal
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(ROOT, safe);

    let info;
    try {
      info = await stat(filePath);
    } catch {
      info = null;
    }
    if (info && info.isDirectory()) {
      filePath = join(filePath, "index.html");
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type, "access-control-allow-origin": "*" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`storybook-static served on http://localhost:${PORT}`);
});

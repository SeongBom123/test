// Vercel 없이 로컬에서 실행하는 개발 서버. 실행: npm run dev
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && match[2] && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const API = new Set(["config", "library", "review", "search"]);
const publicDir = join(root, "public");

const server = createServer(async (req, res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(data)); };
  const path = new URL(req.url, "http://localhost").pathname;
  const api = path.match(/^\/api\/([a-z]+)$/);
  try {
    if (api && API.has(api[1])) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      req.body = raw ? JSON.parse(raw) : undefined;
      const mod = await import(pathToFileURL(join(root, "api", `${api[1]}.js`)).href);
      return await mod.default(req, res);
    }
    const file = normalize(join(publicDir, path === "/" ? "index.html" : path));
    if (!file.startsWith(publicDir + sep) || !existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch (error) {
    console.error(error?.name);
    if (!res.headersSent) res.status(500).json({ error: "서버 오류" });
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, "127.0.0.1", () => console.log(`http://localhost:${port}`));

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./lib/paths.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".xml": "application/rss+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const port = Number(process.env.PORT ?? 4173);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (!path.extname(pathname)) pathname += ".html";

  const file = path.join(paths.public, pathname);
  if (!file.startsWith(paths.public)) {
    response.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      response.end("<p>404</p>");
      return;
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(content);
  });
});

server.listen(port, () => {
  console.log(`preview: http://127.0.0.1:${port}`);
});

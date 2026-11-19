import { createServer } from "node:http";
import { readFileSync } from "node:fs";

export function createDemoFrontend({ config }) {
  const files = { "/": ["index.html", "text/html; charset=utf-8"], "/client.js": ["client.js", "text/javascript; charset=utf-8"] };
  return createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (pathname === "/config.json") {
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(config())); return;
    }
    if (pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const file = files[pathname];
    if (!file) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": file[1] }); res.end(readFileSync(new URL(file[0], import.meta.url)));
  });
}

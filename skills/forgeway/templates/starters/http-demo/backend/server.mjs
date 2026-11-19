import { createServer } from "node:http";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function createDemoApi({ convention, databasePath, frontendOrigin, now = Date.now }) {
  const c = convention;
  if (c.auth.mode !== "token" || c.auth.routes.refresh !== null) throw new Error("HTTP demo supports Token mode without refresh only");
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version === 0) db.exec(readFileSync(new URL("001-initial.sql", import.meta.url), "utf8"));
    else if (version !== 1) throw new Error("unsupported example database version");
  } catch (error) { db.close(); throw error; }
  const sessions = new Map();
  const tokenKey = (token) => createHash("sha256").update(token).digest("hex");
  const reply = (res, status, data = {}, message = "") => {
    const r = c.response;
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ [r.code_field]: status < 400 ? r.success_code : -status, [r.message_field]: message, [r.data_field]: data }));
  };
  async function body(req) {
    if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("expected JSON body");
    let contents = "";
    for await (const chunk of req) {
      contents += chunk;
      if (Buffer.byteLength(contents) > 4096) throw new Error("body too large");
    }
    const value = JSON.parse(contents);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid JSON object");
    return value;
  }
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    if (c.request_id.response_header) res.setHeader(c.request_id.response_header, requestId);
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (origin && origin !== frontendOrigin()) { reply(res, 403, {}, "Origin not allowed"); return; }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (c.request_id.response_header) res.setHeader("Access-Control-Expose-Headers", c.request_id.response_header);
    }
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === c.auth.routes.login && req.method === "POST") {
        const input = await body(req);
        if (input.username !== "demo" || input.password !== "demo-only") { reply(res, 401, {}, "Invalid demo credentials"); return; }
        const user = db.prepare("SELECT id, enabled FROM users WHERE id = 1").get();
        if (!user?.enabled) { reply(res, 403, {}, "Account disabled"); return; }
        for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key);
        if (sessions.size >= 100) { reply(res, 429, {}, "Demo session limit"); return; }
        const token = randomBytes(32).toString("base64url");
        sessions.set(tokenKey(token), { userId: user.id, expires: now() + 300000 });
        reply(res, 200, { accessToken: token, tokenType: c.auth.token_scheme, expiresIn: 300 }); return;
      }
      const knownRoute = (req.method === "GET" && [c.auth.routes.me, "/items"].includes(url.pathname)) || (req.method === "POST" && url.pathname === c.auth.routes.logout);
      if (!knownRoute) { reply(res, 404, {}, "Not found"); return; }
      const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      const session = token ? sessions.get(tokenKey(token)) : null;
      if (!session || session.expires <= now()) { reply(res, 401, {}, "Authentication required"); return; }
      // Request-level CurrentUser is loaded from the validated server-side session.
      const currentUser = db.prepare("SELECT id, name, enabled FROM users WHERE id = ?").get(session.userId);
      if (!currentUser?.enabled) { reply(res, 403, {}, "Account disabled"); return; }
      if (url.pathname === c.auth.routes.me) { reply(res, 200, { id: currentUser.id, name: currentUser.name, roles: ["reader"] }); return; }
      if (url.pathname === c.auth.routes.logout) { sessions.delete(tokenKey(token)); reply(res, 200); return; }
      const p = c.pagination;
      const integer = (key, fallback) => {
        if (!url.searchParams.has(key)) return fallback;
        const raw = url.searchParams.get(key);
        if (!/^[1-9][0-9]*$/.test(raw)) throw new Error("invalid pagination");
        const value = Number(raw);
        if (!Number.isSafeInteger(value)) throw new Error("invalid pagination");
        return value;
      };
      const page = integer(p.page_field, 1);
      const pageSize = integer(p.page_size_field, p.default_page_size);
      if (pageSize > p.max_page_size || !Number.isSafeInteger((page - 1) * pageSize)) throw new Error("invalid pagination");
      const q = url.searchParams.get("q") ?? "";
      if (q.length > 100) throw new Error("search too long");
      const filter = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const total = db.prepare("SELECT count(*) AS total FROM items WHERE owner_id = ? AND title LIKE ? ESCAPE '\\'").get(currentUser.id, filter).total;
      const items = db.prepare("SELECT id, title FROM items WHERE owner_id = ? AND title LIKE ? ESCAPE '\\' ORDER BY id LIMIT ? OFFSET ?").all(currentUser.id, filter, pageSize, (page - 1) * pageSize);
      reply(res, 200, { [p.items_field]: items, [p.total_field]: total, [p.page_field]: page, [p.page_size_field]: pageSize });
    } catch (error) {
      reply(res, error.code?.startsWith("ERR_SQLITE") ? 500 : 400, {}, "Request failed");
    }
  });
  server.requestTimeout = 5000;
  return { server, closeDatabase: () => db.close() };
}

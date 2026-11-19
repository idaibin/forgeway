import { mkdirSync, lstatSync, realpathSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { checkWorkspace } from "./workspace.mjs";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(`http://127.0.0.1:${server.address().port}`); });
});
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
const demoFiles = ["backend/server.mjs", "backend/001-initial.sql", "frontend/server.mjs", "frontend/index.html", "frontend/client.js"];

function checkGeneratedDemo(root) {
  for (const relative of demoFiles) {
    const filename = path.join(root, "apps", relative);
    let current = root;
    for (const segment of ["apps", ...relative.split("/")]) {
      current = path.join(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error(`unsafe HTTP demo path: apps/${relative}`);
    }
    if (!lstatSync(filename).isFile() ||
        !readFileSync(filename).equals(readFileSync(new URL(`../templates/starters/http-demo/${relative}`, import.meta.url)))) {
      throw new Error(`HTTP demo file differs from the generated fixture: apps/${relative}`);
    }
  }
}

export async function startDemo(target, { now } = {}) {
  const checked = checkWorkspace(target);
  if (!checked.valid) throw new Error(`workspace check failed: ${checked.findings.map((item) => item.code).join(", ")}`);
  const root = realpathSync(target);
  const record = JSON.parse(readFileSync(path.join(root, ".forgeway/workspace.json"), "utf8"));
  if (record.starter !== "http-demo") throw new Error("explicitly generate --starter http-demo first");
  checkGeneratedDemo(root);
  const evidenceRoot = path.join(root, ".codex");
  try { mkdirSync(evidenceRoot); } catch (error) { if (error.code !== "EEXIST") throw error; }
  if (!lstatSync(evidenceRoot).isDirectory() || lstatSync(evidenceRoot).isSymbolicLink()) throw new Error("unsafe evidence directory");
  const databasePath = path.join(evidenceRoot, "http-demo.sqlite");
  try { if (!lstatSync(databasePath).isFile() || lstatSync(databasePath).isSymbolicLink()) throw new Error("unsafe demo database"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  // This opt-in example runner executes only the checked generated fixture files.
  const backend = await import(pathToFileURL(path.join(root, "apps/backend/server.mjs")));
  const frontend = await import(pathToFileURL(path.join(root, "apps/frontend/server.mjs")));
  let frontendOrigin;
  let apiOrigin;
  const convention = checked.http_convention.effective_convention;
  const api = backend.createDemoApi({ convention, databasePath, frontendOrigin: () => frontendOrigin, now });
  const web = frontend.createDemoFrontend({ config: () => ({ apiOrigin, convention }) });
  try {
    apiOrigin = await listen(api.server);
    frontendOrigin = await listen(web);
  } catch (error) { await Promise.all([close(api.server), close(web)]); api.closeDatabase(); throw error; }
  return { apiOrigin, frontendOrigin, databasePath, convention, close: async () => { await Promise.all([close(web), close(api.server)]); api.closeDatabase(); } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) { console.error("Usage: node tooling/demo-run.mjs <http-demo-workspace>"); process.exitCode = 2; }
  else {
    try {
      const demo = await startDemo(process.argv[2]);
      console.log(JSON.stringify({ frontend: demo.frontendOrigin, backend: demo.apiOrigin, example_only: true }));
      const stop = () => { void demo.close().then(() => process.exit(0)); };
      process.once("SIGINT", stop); process.once("SIGTERM", stop);
    } catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}

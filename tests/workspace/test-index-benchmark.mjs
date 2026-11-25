// Measure only the list query, on the HTTP starter's actual schema.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
try {
  db.exec(readFileSync(new URL("../../skills/forgeway/templates/starters/http-demo/backend/001-initial.sql", import.meta.url), "utf8"));
  db.exec(`WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<10000)
    INSERT INTO items SELECT 4+i, CASE WHEN i%100=0 THEN 1 ELSE 2 END, 'item' FROM seq`);
  const profiles = ["NOT INDEXED", ""].map(hint => {
    const sql = `SELECT id,title FROM items ${hint} WHERE owner_id=? AND title LIKE ? ESCAPE '\\' ORDER BY id LIMIT ? OFFSET ?`;
    const args = [1, "%", 20, 30];
    const stmt = db.prepare(sql);
    return { plan: db.prepare("EXPLAIN QUERY PLAN " + sql).all(...args), read: () => stmt.all(...args), samples: [] };
  });
  const expected = Array.from({length: 20}, (_, i) => 2804 + i*100);
  for (let i=0; i<110; i++) {
    for (const p of i%2 ? profiles : [...profiles].reverse()) {
      const start = performance.now();
      const rows = p.read();
      const elapsed = performance.now()-start;
      assert.deepEqual(rows.map(r => [r.id,r.title]), expected.map(id => [id,"item"]));
      if (i>=10) p.samples.push(elapsed);
    }
  }
  console.log(JSON.stringify(profiles.map(p => ({plan:p.plan, samples_ms:p.samples})), null, 2));
} finally {
  db.close();
}

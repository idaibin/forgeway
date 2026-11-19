export function fallbackNeeded(rule, status, text) {
  if (rule.fallback.statuses.includes(status)) return true;
  if (status < 200 || status >= 300) return false;
  let body; try { body = JSON.parse(text); } catch { return false; }
  return rule.fallback.emptyPaths.some(path => {
    let value = body;
    for (const key of path ? path.split('.') : []) {
      if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return false; } }
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
      value = value[key];
    }
    if (typeof value === 'string' && value.trim()) { try { value = JSON.parse(value); } catch { /* nonempty text */ } }
    return value === null || value === '' || Array.isArray(value) && value.length === 0 || value && typeof value === 'object' && Object.keys(value).length === 0;
  });
}
export function response(rule) {
  const r = rule.response, format = r.format || 'json';
  const bytes = format === 'base64' ? Buffer.from(r.body, 'base64') : Buffer.from(format === 'text' ? r.body : JSON.stringify(r.body));
  return { status: r.status, body: [204, 205, 304].includes(r.status) || rule.method === 'HEAD' ? Buffer.alloc(0) : bytes,
    headers: { 'Content-Type': r.contentType || (format === 'json' ? 'application/json' : format === 'text' ? 'text/plain' : 'application/octet-stream'), 'X-Tab-Mock': rule.id, 'Cache-Control': 'no-store' } };
}

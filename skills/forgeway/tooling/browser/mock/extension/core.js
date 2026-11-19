/* Shared validation and request selection; no browser side effects. */
(() => {
  'use strict';
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const keys = (v, allowed, at) => {
    assert(object(v), `${at} 必须是对象`);
    for (const k of Object.keys(v)) assert(allowed.includes(k), `${at}.${k} 为未知字段`);
  };
  const id = (v, at) => assert(typeof v === 'string' && /^[\w-]{1,80}$/.test(v), `${at} 需为1–80位字母、数字、下划线或连字符`);
  const label = (v, at) => assert(typeof v === 'string' && v.trim().length > 0 && v.length <= 160, `${at} 需为1–160位文本`);
  const origin = (v, at) => {
    let u; try { u = new URL(v); } catch { throw new Error(`${at} 不是合法 origin`); }
    assert(['http:', 'https:'].includes(u.protocol) && u.origin === v, `${at} 需为精确 http(s) origin，不含路径`);
  };
  const path = (v, at) => assert(typeof v === 'string' && v.startsWith('/') && !/[?#\\*]/.test(v) && !v.split('/').some(x => ['.', '..'].includes(x)) && new URL(v, 'https://validation.invalid').pathname === v, `${at} 需为标准绝对路径，不含通配符/query/hash`);
  const within = (p, prefix) => p === prefix || p.startsWith(prefix.endsWith('/') ? prefix : prefix + '/');
  const matchesPath = (rule, pathname) => {
    if (rule.pathMode === 'exact') return rule.path === pathname;
    if (rule.pathMode === 'prefix') return within(pathname, rule.path);
    const expected = rule.path.split('/'), actual = pathname.split('/');
    return expected.length === actual.length && expected.every((part, i) => part.startsWith(':') ? /^[A-Za-z0-9_-]+$/.test(actual[i]) : part === actual[i]);
  };
  const subset = (actual, expected) => {
    if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
    if (object(expected)) return object(actual) && Object.keys(expected).every(k => Object.hasOwn(actual, k) && subset(actual[k], expected[k]));
    return actual === expected;
  };
  const inPage = (url, environment) => {
    try { const u = new URL(url); return u.origin === environment.pageOrigin && within(u.pathname, environment.pagePathPrefix); } catch { return false; }
  };
  const protectedRequest = (url, environment) => {
    const u = new URL(url);
    return environment.apis.some(api => u.origin === api.origin && within(u.pathname, api.pathPrefix));
  };
  function validateProject(p) {
    keys(p, ['id', 'name', 'environments', 'scenarios'], 'project'); id(p.id, 'project.id'); label(p.name, 'project.name');
    assert(Array.isArray(p.environments) && p.environments.length > 0 && p.environments.length <= 30, 'environments 需有1–30项');
    assert(Array.isArray(p.scenarios) && p.scenarios.length > 0 && p.scenarios.length <= 50, 'scenarios 需有1–50项');
    const envIds = new Set();
    for (const e of p.environments) {
      keys(e, ['id', 'name', 'pageOrigin', 'pagePathPrefix', 'apis'], 'environment'); id(e.id, 'environment.id'); label(e.name, 'environment.name');
      assert(!envIds.has(e.id), '环境ID重复'); envIds.add(e.id); origin(e.pageOrigin, 'pageOrigin'); path(e.pagePathPrefix, 'pagePathPrefix');
      assert(Array.isArray(e.apis) && e.apis.length > 0 && e.apis.length <= 30, 'apis 需有1–30项');
      for (const a of e.apis) { keys(a, ['origin', 'pathPrefix'], 'api'); origin(a.origin, 'api.origin'); path(a.pathPrefix, 'api.pathPrefix'); }
    }
    const sceneIds = new Set();
    for (const s of p.scenarios) {
      keys(s, ['id', 'name', 'rules'], 'scenario'); id(s.id, 'scenario.id'); label(s.name, 'scenario.name');
      assert(!sceneIds.has(s.id), '场景ID重复'); sceneIds.add(s.id);
      assert(Array.isArray(s.rules) && s.rules.length <= 1000, 'rules 最多1000项'); const ruleIds = new Set();
      for (const r of s.rules) {
        keys(r, ['id', 'name', 'semantics', 'action', 'method', 'origin', 'path', 'pathMode', 'query', 'body', 'response', 'fallback'], 'rule');
        id(r.id, 'rule.id'); label(r.name, 'rule.name'); assert(!ruleIds.has(r.id), '规则ID重复'); ruleIds.add(r.id);
        assert(['read', 'write'].includes(r.semantics), 'semantics 需明确 read/write');
        assert(['mock', 'block', 'pass'].includes(r.action), 'action 需为 mock/block/pass');
        assert(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(r.method), 'method 必须为大写标准方法');
        origin(r.origin, 'rule.origin'); path(r.path, 'rule.path'); assert(['exact', 'prefix', 'template'].includes(r.pathMode), 'pathMode 需为 exact/prefix/template');
        if (r.pathMode === 'template') assert(r.path.split('/').some(part => part.startsWith(':')) && r.path.split('/').every(part => !part.includes(':') || /^:[A-Za-z][A-Za-z0-9_]*$/.test(part)), 'template 参数需占据完整路径段');
        assert(p.environments.some(e => e.apis.some(a => a.origin === r.origin && within(r.path, a.pathPrefix))), '规则不属于任何环境 API 范围');
        if (r.query !== undefined) {
          assert(object(r.query), 'query 需为对象');
          for (const v of Object.values(r.query)) assert(typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string')), 'query 值为字符串或字符串数组');
        }
        if (r.body !== undefined) assert(object(r.body), 'body 条件需为对象');
        if (r.fallback !== undefined) {
          keys(r.fallback, ['statuses', 'emptyPaths'], 'fallback');
          assert(r.action === 'mock' && r.semantics === 'read', 'fallback 仅允许只读 mock');
          assert(Array.isArray(r.fallback.statuses) && r.fallback.statuses.every(x => Number.isInteger(x) && x >= 200 && x <= 599), 'fallback.statuses 无效');
          assert(Array.isArray(r.fallback.emptyPaths) && r.fallback.emptyPaths.every(x => typeof x === 'string' && /^(?:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)?$/.test(x)), 'fallback.emptyPaths 无效');
          assert(r.fallback.statuses.length + r.fallback.emptyPaths.length > 0, 'fallback 缺少条件');
        }
        if (r.action === 'mock') {
          keys(r.response, ['status', 'delayMs', 'body', 'format', 'contentType'], 'response');
          assert(Number.isInteger(r.response.status) && r.response.status >= 200 && r.response.status <= 599, 'HTTP状态需为200–599整数');
          assert(Number.isInteger(r.response.delayMs) && r.response.delayMs >= 0 && r.response.delayMs <= 60000, 'delayMs 需为0–60000整数');
          assert(Object.hasOwn(r.response, 'body'), '缺少 response.body');
          assert(r.response.format === undefined || ['json','text','base64'].includes(r.response.format), 'format 需为 json/text/base64');
          assert(r.response.contentType === undefined || (typeof r.response.contentType === 'string' && r.response.contentType.length <= 200 && /^[\x20-\x7e]+$/.test(r.response.contentType)), 'contentType 需为不含换行的 MIME 文本');
          if (['text','base64'].includes(r.response.format)) assert(typeof r.response.body === 'string', '文本或base64正文需为字符串');
          if (r.response.format === 'base64') assert(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.response.body), 'base64 编码无效');
          assert(![204, 205, 304].includes(r.response.status) || r.response.body === null, '204/205/304 响应 body 必须为 null');
        } else assert(r.response === undefined, 'block/pass 不配置 response');
      }
    }
    return p;
  }
  function validateConfig(input) {
    // JSON roundtrip removes prototypes. Configuration size follows platform resources.
    const raw = JSON.stringify(input); assert(raw, '配置必须可序列化为JSON');
    const c = JSON.parse(raw); keys(c, ['schemaVersion', 'projects'], 'config');
    assert(c.schemaVersion === 1 && Array.isArray(c.projects) && c.projects.length <= 100, '需 schemaVersion=1、projects 数组（最多100项）');
    const ids = new Set(); for (const p of c.projects) { validateProject(p); assert(!ids.has(p.id), '项目ID重复'); ids.add(p.id); }
    return c;
  }
  function paramsObject(params) {
    const o = Object.create(null);
    for (const key of new Set(params.keys())) { const a = params.getAll(key); o[key] = a.length === 1 ? a[0] : a; }
    return o;
  }
  function parseBody(body) {
    if (body instanceof URLSearchParams) return paramsObject(body);
    if (typeof body !== 'string') return undefined;
    try { return JSON.parse(body); } catch { return body.includes('=') ? paramsObject(new URLSearchParams(body)) : undefined; }
  }
  function select(config, request) {
    if (!config || !inPage(request.pageURL, config.environment)) return { action: 'pass' };
    const u = new URL(request.url);
    if (!protectedRequest(u.href, config.environment)) return { action: 'pass' };
    const query = paramsObject(u.searchParams);
    const rule = config.scenario.rules.find(r => r.method === request.method && r.origin === u.origin &&
      matchesPath(r, u.pathname) &&
      (r.query === undefined || subset(query, r.query)) && (r.body === undefined || subset(request.body, r.body)));
    return rule ? { ...rule } : { id: 'unmatched', action: 'block', semantics: 'unknown' };
  }
  globalThis.TabMockCore = Object.freeze({ validateConfig, validateProject, select, parseBody, subset, inPage, within, matchesPath });
})();

/* Runs in page MAIN world before application scripts. No Chrome APIs. */
(() => {
  'use strict';
  if (globalThis.__tabMockInstalled) return;
  Object.defineProperty(globalThis, '__tabMockInstalled', { value: true });
  const core = globalThis.TabMockCore; delete globalThis.TabMockCore;
  const projectState = globalThis.TabMockProjectAdapter; delete globalThis.TabMockProjectAdapter;
  const projectStateInvalid = projectState && (projectState.version !== 1 || typeof projectState.respond !== 'function' || typeof projectState.matches !== 'function');
  const stateReply = async (reply, rule, request, snapshot, signal) => {
    if (rule.action !== 'mock' || !projectState) return reply;
    if (projectStateInvalid) throw Error('Unsupported project state adapter');
    const controller = new AbortController();
    const cancel = () => controller.abort(new DOMException('Mock state request cancelled', 'AbortError'));
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true }); pending.add(cancel);
    try { return (await projectState.respond({ rule, request, snapshot, signal: controller.signal })) ?? reply; }
    finally { signal?.removeEventListener('abort', cancel); pending.delete(cancel); }
  };
  const nativeFetch = window.fetch.bind(window); const NativeXHR = window.XMLHttpRequest;
  const pending = new Set(); let config = null; let indicatorVisible = true; let initialised = false; let release;
  const ready = new Promise(resolve => { release = resolve; });
  // A missing bridge is an error, never a fallback for held requests.
  const bootTimer = setTimeout(() => { if (!initialised) { initialised = true; release(false); } }, 5000);
  const abortError = reason => reason === undefined ? new DOMException('Mock 请求已取消', 'AbortError') : reason;
  function report(rule, method, url, outcome, start) {
    const u = new URL(url);
    window.postMessage({ source: 'tab-mock-runtime', type: 'LOG', row: { ruleId: rule.id || '', method, url: u.origin + u.pathname, outcome, elapsedMs: Math.round(performance.now() - start) } }, location.origin);
  }
  function indicator() {
    if (!document.documentElement) return;
    let el = document.getElementById('__tab_mock_indicator');
    if (!config || !core.inPage(location.href, config.environment)) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = '__tab_mock_indicator'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#f5fbf8;color:#126451;border:1px solid #cce3d9;padding:5px 10px;border-radius:999px;font:500 12px/18px system-ui;max-width:calc(100vw - 24px);box-shadow:0 2px 8px #183b2b14';
      document.documentElement.append(el);
    }
    el.textContent = 'Mock ON';
    el.title = 'Mock 已开启 · ' + config.scenario.name;
    el.setAttribute('aria-label', el.title);
    el.hidden = !indicatorVisible;
    el.style.display = indicatorVisible ? 'block' : 'none';
  }
  document.addEventListener('DOMContentLoaded', indicator, { once: true });
  window.addEventListener('pagehide', () => {
    for (const cancel of [...pending]) cancel('aborted');
    config = null; indicator();
  });
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'tab-mock-bridge') return;
    if (event.data.type === 'INDICATOR') { indicatorVisible = event.data.visible !== false; indicator(); return; }
    if (event.data.type !== 'CONFIG') return;
    indicatorVisible = event.data.indicatorVisible !== false;
    const next = event.data.config;
    if (initialised && (config?.version || null) !== (next?.version || null)) {
      for (const cancel of [...pending]) cancel(next ? 'changed' : 'disabled');
    }
    config = next; initialised = true; clearTimeout(bootTimer); release(true); indicator();
    window.postMessage({ source: 'tab-mock-runtime', type: 'APPLIED', token: event.data.token }, location.origin);
  });
  window.postMessage({ source: 'tab-mock-runtime', type: 'READY' }, location.origin);
  function fallbackNeeded(rule, status, text) {
    if (rule.fallback.statuses.includes(status)) return true;
    if (status < 200 || status >= 300) return false;
    let body; try { body = JSON.parse(text); } catch { return false; }
    return rule.fallback.emptyPaths.some(path => {
      let value = body;
      for (const key of path ? path.split('.') : []) {
        if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return false; } }
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
        value = value[key];
      }
      if (typeof value === 'string' && value.trim()) { try { value = JSON.parse(value); } catch { /* nonempty text */ } }
      return value === null || value === '' || (Array.isArray(value) ? value.length === 0 : value && typeof value === 'object' && Object.keys(value).length === 0);
    });
  }
  const responseBytes = response => response.format === 'base64' ? Uint8Array.from(atob(response.body), c => c.charCodeAt(0)) : new TextEncoder().encode(response.format === 'text' ? response.body : JSON.stringify(response.body));
  const contentType = response => response.contentType || (response.format === 'base64' ? 'application/octet-stream' : response.format === 'text' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
  const blockedResponse = { status: 403, format: 'json', body: { error: 'FORGEWAY_MOCK_BLOCKED', message: 'Request blocked by Mock policy' } };
  function hold(rule, signal, start, method, url) {
    return new Promise((resolve, reject) => {
      let timer; let settled = false;
      const end = (outcome, error) => {
        if (settled) return; settled = true; clearTimeout(timer); pending.delete(cancel); signal?.removeEventListener('abort', onAbort);
        report(rule, method, url, outcome, start); error ? reject(error) : resolve();
      };
      const cancel = outcome => end(outcome, abortError());
      const onAbort = () => end('aborted', abortError(signal.reason));
      pending.add(cancel);
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        if (rule.action === 'block') end('block');
        else end('mock');
      }, rule.response?.delayMs || 0);
    });
  }
  window.fetch = async function(input, init) {
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw abortError(signal.reason);
    const available = await new Promise((resolve, reject) => {
      const onAbort = () => reject(abortError(signal.reason));
      signal?.addEventListener('abort', onAbort, { once: true });
      ready.then(value => { signal?.removeEventListener('abort', onAbort); resolve(value); });
    });
    if (!available) throw new TypeError('Tab Mock 配置桥接不可用');
    if (signal?.aborted) throw abortError(signal.reason);
    const snapshot = config;
    if (!snapshot || !core.inPage(location.href, snapshot.environment)) return nativeFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI).href;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const start = performance.now();
    let body;
    // Only read a cloned body when a candidate explicitly needs body matching.
    if (projectState || snapshot.scenario.rules.some(r => r.body !== undefined && r.origin === new URL(url).origin && r.method === method && core.matchesPath(r, new URL(url).pathname))) {
      try { body = core.parseBody(await new Request(input, init).clone().text()); } catch { body = undefined; }
    }
    if (signal?.aborted) throw abortError(signal.reason);
    if (config?.version !== snapshot.version || !core.inPage(location.href, snapshot.environment)) throw abortError();
    const rule = core.select(snapshot, { url, method, body, pageURL: location.href });
    if (rule.action === 'pass') { if (rule.id) report(rule, method, url, 'pass', start); return nativeFetch(input, init); }
    if (rule.action === 'mock' && projectStateInvalid) throw Error('Invalid project state adapter');
    if (rule.fallback && projectState?.matches(snapshot, rule)) throw Error('Stateful rules cannot use real response fallback');
    if (rule.fallback) {
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      const cancel = () => controller.abort(); pending.add(cancel);
      try {
        const live = await nativeFetch(input, { ...init, signal: controller.signal });
        const text = await live.clone().text();
        if (config?.version !== snapshot.version || !core.inPage(location.href, snapshot.environment)) throw abortError();
        if (!fallbackNeeded(rule, live.status, text)) { report(rule, method, url, 'pass', start); return live; }
      } finally { pending.delete(cancel); signal?.removeEventListener('abort', onAbort); }
    }
    await hold(rule, signal, start, method, url);
    const reply = await stateReply(rule.action === 'block' ? blockedResponse : rule.response, rule, { url, method, body }, snapshot, signal);
    const status = reply.status;
    const response = new Response(method === 'HEAD' || [204, 205, 304].includes(status) ? null : responseBytes(reply), { status, headers: { 'Content-Type': contentType(reply), 'X-Tab-Mock': rule.id } });
    Object.defineProperty(response, 'url', { value: url }); return response;
  };
  class MockXHR extends EventTarget {
    constructor() {
      super(); this._state = 0; this._status = 0; this._text = ''; this._type = ''; this._timeout = 0; this._credentials = false;
      this._native = null; this._headers = []; this._sent = false; this._controller = null; this._generation = 0;
      this.upload = new EventTarget();
    }
    _emit(type, progress = false) {
      const event = progress ? new ProgressEvent(type, { lengthComputable: type === 'load' || type === 'progress', loaded: this._text.length, total: this._text.length }) : new Event(type);
      this.dispatchEvent(event);
      if (typeof this['on' + type] === 'function') this['on' + type].call(this, event);
    }
    _change(state) { this._state = state; this._emit('readystatechange'); }
    get readyState() { return this._native ? this._native.readyState : this._state; }
    get status() { return this._native ? this._native.status : this._status; }
    get statusText() { return this._native ? this._native.statusText : (this._realStatusText || (this._status ? ({200:'OK',204:'No Content',401:'Unauthorized',403:'Forbidden',500:'Internal Server Error'}[this._status] || '') : '')); }
    get responseURL() { return this._native ? this._native.responseURL : (this._state === 4 && this._status ? (this._realURL || this._url) : ''); }
    get responseText() { if (this.responseType && this.responseType !== 'text') throw new DOMException('responseType 不为 text', 'InvalidStateError'); return this._native ? this._native.responseText : this._text; }
    get response() {
      if (this._native) return this._native.response;
      if (this._state !== 4) return this._type === '' || this._type === 'text' ? this._text : null;
      if (!this._status) return this._type === '' || this._type === 'text' ? '' : null;
      if (this._type === 'json') { try { return JSON.parse(this._text); } catch { return null; } }
      if (this._type === 'blob') return new Blob([this._bytes || new Uint8Array()], { type: this._contentType });
      if (this._type === 'arraybuffer') return (this._bytes || new Uint8Array()).slice().buffer;
      if (this._type === 'document') return null;
      return this._text;
    }
    get responseXML() { return this._native ? this._native.responseXML : null; }
    get responseType() { return this._native ? this._native.responseType : this._type; }
    set responseType(value) { if (!['', 'text', 'json', 'blob', 'arraybuffer', 'document'].includes(value)) return; this._type = value; if (this._native) this._native.responseType = value; }
    get timeout() { return this._timeout; }
    set timeout(v) { this._timeout = Number(v) >>> 0; if (this._native) this._native.timeout = this._timeout; else this._updateTimeout?.(); }
    get withCredentials() { return this._credentials; }
    set withCredentials(v) { this._credentials = !!v; if (this._native) this._native.withCredentials = this._credentials; }
    open(method, url, async = true, user, password) {
      this.abort(); this._native = null; this._state = 0; this._status = 0; this._text = ''; this._headers = []; this._sent = false;
      this._realHeaders = null; this._realStatusText = null; this._realURL = null;
      this._method = String(method).toUpperCase(); this._url = new URL(url, document.baseURI).href; this._async = async !== false; this._user = user; this._password = password;
      // Let native validation reject invalid methods and URLs before accepting open.
      const probe = new NativeXHR(); probe.open(method, this._url, async, user, password); probe.abort(); this._change(1);
    }
    setRequestHeader(name, value) {
      if (this.readyState !== 1 || this._sent) throw new DOMException('请求状态无效', 'InvalidStateError');
      // Validate syntax without retaining auth in any log/config.
      new Headers([[name, value]]); this._headers.push([name, value]);
    }
    overrideMimeType(value) { this._mime = value; this._native?.overrideMimeType(value); }
    getAllResponseHeaders() { return this._native ? this._native.getAllResponseHeaders() : (this._state >= 2 && this._status ? this._realHeaders ?? 'content-type: ' + this._contentType + '\r\nx-tab-mock: ' + this._ruleId + '\r\n' : ''); }
    getResponseHeader(name) {
      if (this._native) return this._native.getResponseHeader(name);
      if (this._state < 2 || !this._status) return null;
      if (this._realHeaders != null) { const line = this._realHeaders.split('\r\n').find(line => line.slice(0, line.indexOf(':')).toLowerCase() === String(name).toLowerCase()); return line ? line.slice(line.indexOf(':') + 1).trim() : null; }
      return ({ 'content-type': this._contentType, 'x-tab-mock': this._ruleId })[String(name).toLowerCase()] || null;
    }
    abort() {
      if (this._native) { this._native.abort(); this._sent = false; this._generation++; return; }
      if (this._sent) { this._cancel?.('aborted'); this._controller?.abort(); }
      this._generation++;
      this._sent = false; this._state = 0; this._status = 0; this._text = '';
    }
    send(body = null) {
      if (this.readyState !== 1 || this._sent) throw new DOMException('请求状态无效', 'InvalidStateError');
      if (!this._async) {
        if (!initialised || (config && core.select(config, { url: this._url, method: this._method, pageURL: location.href, body: core.parseBody(body) }).action !== 'pass')) throw new DOMException('保护范围不支持同步 XHR', 'NotSupportedError');
        return this._pass(body);
      }
      this._sent = true; const generation = ++this._generation; const start = performance.now();
      const snapshot = config;
      let timer; let responseTimer; let probe; let ended = false; let rule = { id: '' }; const stateController = new AbortController();
      const finish = (outcome, success = false) => {
        if (ended) return; ended = true; if (!success) { probe?.abort(); stateController.abort(); } clearTimeout(timer); clearTimeout(responseTimer); pending.delete(cancel); this._cancel = null; this._updateTimeout = null; this._sent = false;
        if (!success) { this._status = 0; this._text = ''; }
        this._change(4); report(rule, this._method, this._url, outcome, start);
        if (generation !== this._generation) return;
        this._emit(success ? 'load' : (outcome === 'timeout' ? 'timeout' : ['aborted', 'changed', 'disabled'].includes(outcome) ? 'abort' : 'error'), true); this._emit('loadend', true);
      };
      const cancel = outcome => finish(outcome); this._cancel = cancel; pending.add(cancel);
      this._updateTimeout = () => { clearTimeout(timer); if (this._timeout) timer = setTimeout(() => finish('timeout'), Math.max(0, this._timeout - (performance.now() - start))); };
      this._updateTimeout();
      this._emit('loadstart', true);
      if (ended) return;
      ready.then(ok => {
        if (ended || generation !== this._generation) return;
        if (!ok) { finish('error'); return; }
        // Initial startup had no snapshot; bind after bridge readiness. Existing active changes cancel via pending.
        if (snapshot && config?.version !== snapshot.version) { finish('changed'); return; }
        rule = core.select(config, { url: this._url, method: this._method, body: core.parseBody(body), pageURL: location.href });
        if (rule.action === 'pass') {
          ended = true; clearTimeout(timer); pending.delete(cancel); this._cancel = null; this._updateTimeout = null;
          if (rule.id) report(rule, this._method, this._url, 'pass', start);
          this._pass(body); return;
        }
        if (rule.action === 'mock' && (projectStateInvalid || (rule.fallback && projectState?.matches(config, rule)))) { finish('error'); return; }
        this._ruleId = rule.id;
        // One lifecycle timer owner, independent of mutable timeout.
        const deliver = () => { responseTimer = setTimeout(async () => {
          if (ended) return;
          let reply;
          try { reply = await stateReply(rule.action === 'block' ? blockedResponse : rule.response, rule, { url: this._url, method: this._method, body: core.parseBody(body) }, config, stateController.signal); }
          catch { finish('error'); return; }
          if (ended || generation !== this._generation) return;
          this._status = reply.status; this._contentType = this._mime || contentType(reply); this._change(2);
          if (ended || generation !== this._generation) return;
          this._bytes = this._method === 'HEAD' || [204,205,304].includes(this._status) ? new Uint8Array() : responseBytes(reply);
          this._text = new TextDecoder().decode(this._bytes);
          this._change(3);
          if (ended || generation !== this._generation) return;
          this._emit('progress', true);
          if (!ended && generation === this._generation) finish(rule.action === 'block' ? 'block' : 'mock', true);
        }, rule.response?.delayMs || 0); };
        if (!rule.fallback) { deliver(); return; }
        probe = new NativeXHR();
        probe.open(this._method, this._url, true, this._user, this._password);
        probe.responseType = 'arraybuffer'; probe.withCredentials = this._credentials;
        if (this._mime) probe.overrideMimeType(this._mime);
        for (const header of this._headers) probe.setRequestHeader(...header);
        probe.addEventListener('load', () => {
          if (ended || generation !== this._generation) return;
          if (fallbackNeeded(rule, probe.status, new TextDecoder().decode(probe.response || new ArrayBuffer(0)))) { deliver(); return; }
          // Retain the actual native response and headers for non-fallback reads.
          const bytes = new Uint8Array(probe.response || new ArrayBuffer(0));
          this._status = probe.status; this._bytes = bytes; this._text = new TextDecoder().decode(bytes);
          this._contentType = probe.getResponseHeader('content-type') || '';
          this._realHeaders = probe.getAllResponseHeaders(); this._realStatusText = probe.statusText; this._realURL = probe.responseURL;
          this._change(2); if (ended) return; this._change(3); if (ended) return; this._emit('progress', true); finish('pass', true);
        });
        probe.addEventListener('error', () => finish('error'));
        probe.addEventListener('abort', () => { if (!ended) finish('aborted'); });
        probe.send(body);
      }).catch(() => finish('error'));
    }
    _pass(body) {
      const xhr = new NativeXHR(); this._native = xhr;
      for (const name of ['readystatechange', 'loadstart', 'progress', 'load', 'error', 'abort', 'timeout', 'loadend']) xhr.addEventListener(name, () => {
        if (this._async && (name === 'loadstart' || (name === 'readystatechange' && xhr.readyState === 1))) return;
        if (name === 'loadend') this._sent = false; this._emit(name, name !== 'readystatechange');
      });
      xhr.open(this._method, this._url, this._async, this._user, this._password);
      xhr.responseType = this._type; xhr.timeout = this._timeout; xhr.withCredentials = this._credentials;
      if (this._mime) xhr.overrideMimeType(this._mime);
      for (const h of this._headers) xhr.setRequestHeader(...h);
      xhr.send(body);
    }
  }
  for (const [key, value] of Object.entries({ UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4 })) { Object.defineProperty(MockXHR, key, { value }); Object.defineProperty(MockXHR.prototype, key, { value }); }
  window.XMLHttpRequest = MockXHR;
})();

/* Project-owned reducers; no endpoints, domain fields, credentials or real writes. */
(() => {
  'use strict';
  const assert = (ok, text) => { if (!ok) throw Error(text); };
  const clone = value => structuredClone(value);
  const json = value => { const text = JSON.stringify(value, (_key, item) => { assert(!['undefined','function','symbol','bigint'].includes(typeof item) && (typeof item !== 'number' || Number.isFinite(item)), 'State must contain only JSON values'); return item; }); assert(text !== undefined, 'State must be JSON'); return JSON.parse(text); };
  const name = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
  const abort = signal => { if (signal?.aborted) throw signal.reason || new DOMException('Mock state request aborted', 'AbortError'); };
  function collection(rows, idField) {
    assert(Array.isArray(rows) && typeof idField === 'string' && idField.length > 0 && !['__proto__','prototype','constructor'].includes(idField), 'Invalid state collection');
    const index = id => rows.findIndex(row => row[idField] === id);
    return Object.freeze({
      get(id) { const i = index(id); return i < 0 ? undefined : clone(rows[i]); },
      insert(row) { assert(row?.[idField] !== undefined && row[idField] !== null && index(row[idField]) < 0, 'Missing or duplicate Mock identity'); const item = json(row); rows.push(item); return clone(item); },
      patch(id, patch) { const i = index(id); assert(i >= 0, 'Mock record not found'); assert(!Object.hasOwn(patch, idField) || patch[idField] === id, 'Mock identity is immutable'); rows[i] = json({ ...rows[i], ...patch }); return clone(rows[i]); },
      remove(id) { const i = index(id); assert(i >= 0, 'Mock record not found'); return clone(rows.splice(i, 1)[0]); },
    });
  }
  function createAdapter(definition, host = globalThis) {
    const d = definition;
    assert(d?.version === 1 && name(d.projectId) && name(d.scenarioId) && name(d.namespace) && name(d.revision), 'Invalid forgeway-mock-state-adapter/1 identity');
    assert(['memory', 'browser'].includes(d.persistence), 'State persistence must be memory or browser');
    const initial = json(d.initialState);
    assert(d.handlers && typeof d.handlers === 'object' && !Array.isArray(d.handlers) && Object.keys(d.handlers).length > 0, 'State adapter requires handlers');
    const handlers = Object.fromEntries(Object.entries(d.handlers).map(([id, handler]) => {
      assert(name(id) && ['read', 'write'].includes(handler?.semantics) && typeof handler.run === 'function', 'Invalid state handler');
      return [id, { semantics: handler.semantics, run: handler.run }];
    }));
    // Freeze identity/handler bindings; the supplied project definition cannot retarget a live adapter.
    const identity = { projectId: d.projectId, scenarioId: d.scenarioId, namespace: d.namespace, revision: d.revision, persistence: d.persistence };
    const memory = new Map(); let queue = Promise.resolve(); let opened;
    const database = () => opened ||= new Promise((resolve, reject) => {
      if (!host.indexedDB) { reject(Error('Persistent Mock storage is unavailable')); return; }
      const request = host.indexedDB.open('forgeway-project-mock-state', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Persistent Mock storage is blocked'));
    });
    function reduce(previous, handler, input) {
      abort(input.signal);
      const state = json(previous);
      const result = handler.run({ state, request: clone(input.request), rule: clone(input.rule), collection });
      assert(result && typeof result.commit === 'boolean' && !result.then, 'State handler must return synchronous explicit commit');
      const response = result.response;
      assert(response && Number.isInteger(response.status) && response.status >= 200 && response.status <= 599 && response.format === 'json' && response.body !== undefined, 'State handler requires a complete JSON response');
      assert(!result.commit || (handler.semantics === 'write' && response.status < 300), 'Read or failed state response cannot commit');
      assert(![204,205,304].includes(response.status) || response.body === null, 'Body is forbidden for this response status');
      abort(input.signal);
      return { commit: result.commit, state: json(state), response: json(response) };
    }
    async function execute(key, handler, input) {
      abort(input.signal);
      if (identity.persistence === 'memory') {
        const result = reduce(memory.has(key) ? memory.get(key) : initial, handler, input);
        if (result.commit) memory.set(key, result.state);
        return result.response;
      }
      const db = await database(); abort(input.signal);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'); let result, failure;
        const onAbort = () => { try { tx.abort(); } catch { /* Commit may already have completed. */ } };
        input.signal?.addEventListener('abort', onAbort, { once: true });
        const cleanup = () => input.signal?.removeEventListener('abort', onAbort);
        tx.oncomplete = () => { cleanup(); resolve(result.response); };
        tx.onabort = tx.onerror = () => { cleanup(); reject(failure || input.signal?.reason || tx.error || Error('Mock state transaction aborted')); };
        const store = tx.objectStore('state'), read = store.get(key);
        read.onsuccess = () => {
          try {
            abort(input.signal);
            result = reduce(read.result === undefined ? initial : read.result, handler, input);
            if (result.commit) store.put(result.state, key);
          } catch (error) { failure = error; tx.abort(); }
        };
      });
    }
    return Object.freeze({
      version: 1,
      matches(snapshot, rule) { return rule.action === 'mock' && snapshot?.projectId === identity.projectId && snapshot?.scenario?.id === identity.scenarioId && Object.hasOwn(handlers, rule.id); },
      async respond(input) {
        const { snapshot, rule } = input;
        if (rule.action !== 'mock' || snapshot?.projectId !== identity.projectId || snapshot?.scenario?.id !== identity.scenarioId) return undefined;
        const handler = Object.hasOwn(handlers, rule.id) ? handlers[rule.id] : undefined; if (!handler) return undefined;
        assert(handler.semantics === rule.semantics, 'Project state rule semantics mismatch');
        assert(snapshot.environment?.pageOrigin && snapshot.environment.pagePathPrefix, 'State adapter requires an exact environment');
        const key = JSON.stringify([identity.projectId, identity.scenarioId, snapshot.environment.pageOrigin, snapshot.environment.pagePathPrefix, identity.namespace, identity.revision]);
        const work = () => execute(key, handler, input);
        const result = queue.then(work); queue = result.catch(() => {}); return result;
      },
    });
  }
  globalThis.TabMockStateful = Object.freeze({ version: 1, createAdapter, collection });
})();

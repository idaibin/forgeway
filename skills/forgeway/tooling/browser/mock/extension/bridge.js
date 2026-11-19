/* Isolated world: only Chrome -> MAIN configuration and metadata-only logs. */
(() => {
  if (globalThis.__tabMockBridge) return;
  globalThis.__tabMockBridge = true;
  const tokenId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  let indicatorVisible = true; let preferenceRevision = 0;
  let current = null; let booted = false; let revision = 0;
  const pending = new Map();
  function post(config, token = tokenId()) {
    window.postMessage({ source: 'tab-mock-bridge', type: 'CONFIG', config, token, indicatorVisible }, location.origin); return token;
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'tab-mock-runtime') return;
    if (event.data.type === 'READY' && booted) post(current);
    if (event.data.type === 'APPLIED') { const done = pending.get(event.data.token); if (done) { pending.delete(event.data.token); done({ applied: true }); } }
    if (event.data.type === 'LOG') chrome.runtime.sendMessage({ type: 'LOG', row: event.data.row }).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'NATIVE_PAGE_STATUS') { respond({ version: current?.version || null, indicator: !!document.getElementById('__tab_mock_indicator') }); return; }
    if (message.type !== 'APPLY') return;
    revision++; booted = true; current = message.config;
    const token = tokenId();
    const timer = setTimeout(() => { pending.delete(token); respond({ applied: false }); }, 1500);
    pending.set(token, value => { clearTimeout(timer); respond(value); }); post(current, token); return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.showIndicator) return;
    preferenceRevision++; indicatorVisible = changes.showIndicator.newValue !== false;
    window.postMessage({ source: 'tab-mock-bridge', type: 'INDICATOR', visible: indicatorVisible }, location.origin);
  });
  const startPreferenceRevision = preferenceRevision;
  const preferenceReady = chrome.storage.local.get('showIndicator').then(value => {
    if (preferenceRevision !== startPreferenceRevision) return;
    indicatorVisible = value.showIndicator !== false;
    window.postMessage({ source: 'tab-mock-bridge', type: 'INDICATOR', visible: indicatorVisible }, location.origin);
  });
  const startRevision = revision;
  Promise.all([chrome.runtime.sendMessage({ type: 'BOOT' }), preferenceReady]).then(([result]) => {
    if (!result.ok) throw new Error(result.error);
    if (revision !== startRevision) return;
    current = result.value; booted = true; post(current);
  }).catch(() => { /* MAIN startup gate rejects held requests. */ });
  // Extension reload/uninstall invalidates the old isolated world. Clear its MAIN
  // snapshot promptly; it cannot leave a seemingly enabled orphan interceptor.
  const pageScope = () => { const url = new URL(location.href); return url.origin + url.pathname; };
  let heartbeatURL = pageScope();
  const heartbeat = setInterval(async () => {
    const before = revision;
    try {
      const metadata = await chrome.runtime.sendMessage({ type: 'PING' });
      if (!metadata.ok) throw new Error(metadata.error);
      if (revision !== before) return;
      if (current && heartbeatURL === pageScope() && (current?.version || null) === (metadata.value?.version || null)) return;
      heartbeatURL = pageScope();
      const result = await chrome.runtime.sendMessage({ type: 'BOOT' });
      if (!result.ok) throw new Error(result.error);
      if (revision !== before) return;
      if ((current?.version || null) !== (result.value?.version || null)) { current = result.value; post(current); }
    } catch {
      clearInterval(heartbeat); current = null; booted = true; post(null);
    }
  }, 2000);
  window.addEventListener('pagehide', event => { if (!event.persisted) clearInterval(heartbeat); });
  window.addEventListener('pageshow', async event => {
    if (!event.persisted) return;
    const before = revision;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'BOOT' });
      if (!result.ok) throw new Error(result.error);
      if (revision !== before) return;
      current = result.value; post(current);
    } catch { current = null; post(null); }
  });
})();

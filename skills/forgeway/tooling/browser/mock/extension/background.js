import { startNativeControl } from './native-client.js';
import './core.js';
import { readConfig, writeConfig, addLog, readLogs, clearLogs } from './db.js';
const core = globalThis.TabMockCore;
const SESSION = 'bindings';
const AUTO = 'autoStartConfig';
const SNAPSHOTS = 'manualBindingSnapshots';
const emptyConfig = () => ({ schemaVersion: 1, projects: [] });
function validateAuto(input) {
  const config = core.validateConfig(input);
  for (const p of config.projects) {
    if (p.environments.length !== 1 || p.scenarios.length !== 1) throw new Error('自动环境必须固定一个环境和场景');
    if (p.scenarios[0].rules.some(r => r.action === 'pass' && r.semantics === 'write')) throw new Error('自动启用不能放行真实业务写请求');
    const e = p.environments[0];
    if (config.projects.some(other => other !== p && (core.inPage(e.pageOrigin + e.pagePathPrefix, other.environments[0]) || core.inPage(other.environments[0].pageOrigin + other.environments[0].pagePathPrefix, e)))) throw new Error('自动启用的页面范围不能重叠');
  }
  return config;
}
const autoConfig = async () => validateAuto((await chrome.storage.local.get(AUTO))[AUTO] || emptyConfig());
// Only seed once. A user disabling automatic activation must never be undone on restart.
let seedReady;
function ensureSeed() {
  return seedReady ||= (async () => {
    if ((await chrome.storage.local.get('autoSeeded')).autoSeeded) return;
    const seed = validateAuto(await (await fetch(chrome.runtime.getURL('autostart.json'))).json());
    if (seed.projects.length) {
      const config = await readConfig();
      await writeConfig(core.validateConfig({ schemaVersion: 1, projects: [...config.projects.filter(p => !seed.projects.some(x => x.id === p.id)), ...seed.projects] }));
      await chrome.storage.local.set({ [AUTO]: seed });
    }
    await chrome.storage.local.set({ autoSeeded: true });
  })();
}
const snapshotFor = p => ({ projectId: p.id, projectName: p.name, environment: p.environments[0], scenario: p.scenarios[0], version: crypto.randomUUID(), automatic: true });
async function removeAutomatic(projectId) {
  const all = await bindings();
  const config = await autoConfig();
  await chrome.storage.local.set({ [AUTO]: { schemaVersion: 1, projects: config.projects.filter(p => p.id !== projectId) } });
  for (const [id, cfg] of Object.entries(all)) if (cfg.automatic && cfg.projectId === projectId) await stop(id, all);
}
// Serialise mutations to prevent competing manager pages / tab events losing bindings.
let queue = Promise.resolve();
const serial = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
const bindings = async () => {
  const rows = (await chrome.storage.session.get(SESSION))[SESSION] || {};
  const automatic = await autoConfig();
  const saved = (await chrome.storage.local.get(SNAPSHOTS))[SNAPSHOTS] || {};
  for (const [id, row] of Object.entries(rows)) if (row.snapshotVersion) {
    const snapshot = saved[row.snapshotVersion];
    if (snapshot?.version === row.version && snapshot.projectId === row.projectId) rows[id] = snapshot;
    else delete rows[id];
  }
  for (const [id, row] of Object.entries(rows)) if (row.automatic && !row.scenario) {
    const project = automatic.projects.find(p => p.id === row.projectId);
    if (project) rows[id] = { ...snapshotFor(project), version: row.version };
    else delete rows[id];
  }
  return rows;
};
const setBindings = async value => {
  const snapshots = Object.fromEntries(Object.values(value).filter(row => !row.automatic).map(row => [row.version, row]));
  const previous = (await chrome.storage.local.get(SNAPSHOTS))[SNAPSHOTS] || {};
  // Write new snapshots before publishing references; retain old versions until
  // the session commit succeeds so a failed commit cannot break active tabs.
  await chrome.storage.local.set({ [SNAPSHOTS]: { ...previous, ...snapshots } });
  await chrome.storage.session.set({ [SESSION]: Object.fromEntries(Object.entries(value).map(([id, row]) => [id, row.automatic
    ? { projectId: row.projectId, version: row.version, automatic: true }
    : { projectId: row.projectId, version: row.version, snapshotVersion: row.version }])) });
  await chrome.storage.local.set({ [SNAPSHOTS]: snapshots });
};
async function deadline(operation) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('页面注入超时，已撤销启用；请待页面可用后重试')), 5000); })]); }
  finally { clearTimeout(timer); }
}
async function badge(tabId, enabled) {
  await chrome.action.setBadgeText({ tabId, text: enabled ? 'ON' : '' }).catch(() => {});
  if (enabled) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#087969' }).catch(() => {});
}
async function stop(tabId, all) {
  delete all[tabId]; await setBindings(all); await badge(Number(tabId), false);
  await chrome.tabs.sendMessage(Number(tabId), { type: 'APPLY', config: null }).catch(() => {});
}
async function register(origin) {
  if (chrome.runtime.getManifest?.().content_scripts?.some(s => s.matches.includes(origin + '/*'))) return;
  const token = [...new TextEncoder().encode(origin)].map(x => x.toString(16).padStart(2, '0')).join('');
  const mainId = 'main-' + token; const bridgeId = 'bridge-' + token;
  const current = await chrome.scripting.getRegisteredContentScripts();
  if (!current.some(s => s.id === mainId)) {
    await chrome.scripting.registerContentScripts([
      { id: mainId, matches: [origin + '/*'], js: ['stateful.js', 'core.js', 'project-adapter.js', 'runtime.js'], runAt: 'document_start', world: 'MAIN', allFrames: false, persistAcrossSessions: true },
      { id: bridgeId, matches: [origin + '/*'], js: ['bridge.js'], runAt: 'document_start', world: 'ISOLATED', allFrames: false, persistAcrossSessions: true },
    ]);
  }
}
async function arm(message, prepare = false) {
  const config = await readConfig(); const project = config.projects.find(p => p.id === message.projectId);
  const environment = project?.environments.find(e => e.id === message.environmentId);
  const scenario = project?.scenarios.find(s => s.id === message.scenarioId);
  if (!project || !environment || !scenario) throw new Error('项目、环境或场景不存在');
  const tab = await chrome.tabs.get(message.tabId);
  if (!(prepare && tab.url === 'about:blank') && !core.inPage(tab.url, environment)) throw new Error('标签页不在所选环境页面范围内');
  if (!await chrome.permissions.contains({ origins: [environment.pageOrigin + '/*'] })) throw new Error('尚未授予页面来源权限');
  await register(environment.pageOrigin);
  const snapshot = { projectId: project.id, projectName: project.name, environment, scenario, version: crypto.randomUUID() };
  const all = await bindings(); if (all[tab.id]) await stop(tab.id, all);
  all[tab.id] = snapshot; await setBindings(all);
  if (prepare) { await badge(tab.id, true); return snapshot; }
  try {
    await deadline(chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, injectImmediately: true, world: 'MAIN', files: ['stateful.js', 'core.js', 'project-adapter.js', 'runtime.js'] }));
    await deadline(chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, injectImmediately: true, world: 'ISOLATED', files: ['bridge.js'] }));
    const ack = await chrome.tabs.sendMessage(tab.id, { type: 'APPLY', config: snapshot });
    if (!ack?.applied) throw new Error('页面未确认 Mock 状态');
    const latest = await chrome.tabs.get(tab.id);
    if (!core.inPage(latest.url, environment)) throw new Error('开启期间页面已离开目标环境');
    await badge(tab.id, true); return snapshot;
  } catch (e) { await stop(tab.id, all); throw e; }
}
function trustedUI(sender) { return sender.id === chrome.runtime.id && ['manager.html', 'popup.html'].some(page => sender.url === chrome.runtime.getURL(page)); }
async function refreshProjectPages(project, tabs) {
  const keys = (await chrome.storage.local.get('projectPageCacheKeys')).projectPageCacheKeys?.[project.id] || [];
  const sessionKeys = (await chrome.storage.local.get('projectSessionCacheKeys')).projectSessionCacheKeys?.[project.id] || [];
  const paths = (await chrome.storage.local.get('projectPageCachePaths')).projectPageCachePaths?.[project.id] || {};
  const errors = [];
  for (const tab of tabs) {
    try {
      if (![keys, sessionKeys].every(list => Array.isArray(list) && list.every(k => typeof k === 'string' && k.trim()))
        || !paths || typeof paths !== 'object' || Array.isArray(paths)
        || Object.entries(paths).some(([key, entries]) => !key.trim() || !Array.isArray(entries)
          || entries.some(path => !Array.isArray(path) || !path.length || path.some(part => typeof part !== 'string' || !part || ['__proto__', 'prototype', 'constructor'].includes(part))))) throw Error('页面缓存配置无效');
      const latest = await chrome.tabs.get(tab.id);
      if (!project.environments.some(env => core.inPage(latest.url, env))) throw Error('页面已离开项目范围');
      if (keys.length || sessionKeys.length || Object.keys(paths).length) {
        const url = new URL(latest.url);
        await deadline(chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'MAIN',
          func: (cacheKeys, cachePaths, expectedPage, sessionCacheKeys) => {
            if (location.origin + location.pathname !== expectedPage) throw Error('页面已离开目标范围');
            const clear = () => {
              for (const key of cacheKeys) localStorage.removeItem(key);
              for (const key of sessionCacheKeys) sessionStorage.removeItem(key);
              for (const [key, entries] of Object.entries(cachePaths)) {
                const raw = localStorage.getItem(key);
                if (raw === null) continue;
                const value = JSON.parse(raw); let changed = false;
                for (const path of entries) {
                  let parent = value;
                  for (const part of path.slice(0, -1)) parent = parent && typeof parent === 'object' && Object.hasOwn(parent, part) ? parent[part] : null;
                  if (parent && typeof parent === 'object' && Object.hasOwn(parent, path.at(-1))) { delete parent[path.at(-1)]; changed = true; }
                }
                if (changed) localStorage.setItem(key, JSON.stringify(value));
              }
            };
            clear(); window.addEventListener('pagehide', clear, { once: true });
          }, args: [keys, paths, url.origin + url.pathname, sessionKeys] }));
      }
      const beforeReload = await chrome.tabs.get(tab.id);
      if (!project.environments.some(env => core.inPage(beforeReload.url, env))) throw Error('刷新前页面已离开项目范围');
      await chrome.tabs.reload(tab.id, { bypassCache: true });
    } catch (error) { errors.push({ tabId: tab.id, error: error.message }); }
  }
  return { errors };
}
async function handle(message, sender) {
  await ensureSeed();
  if (message?.type === 'PING') {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) throw new Error('无效页面来源');
    const rows = (await chrome.storage.session.get(SESSION))[SESSION] || {};
    return { version: rows[sender.tab.id]?.version || null };
  }
  if (message?.type === 'BOOT') {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) throw new Error('无效页面来源');
    const all = await bindings(); let cfg = all[sender.tab.id];
    if (cfg && !core.inPage(sender.url, cfg.environment)) { await stop(sender.tab.id, all); cfg = null; }
    if (!cfg) return serial(async () => {
      const latest = await bindings();
      if (latest[sender.tab.id] && core.inPage(sender.url, latest[sender.tab.id].environment)) { await badge(sender.tab.id, true); return latest[sender.tab.id]; }
      const project = (await autoConfig()).projects.find(p => core.inPage(sender.url, p.environments[0]));
      if (project && await chrome.permissions.contains({ origins: [project.environments[0].pageOrigin + '/*'] })) {
        cfg = snapshotFor(project); latest[sender.tab.id] = cfg; await setBindings(latest);
      }
      await badge(sender.tab.id, !!cfg);
      return cfg || null;
    });
    await badge(sender.tab.id, true);
    return cfg;
  }
  if (message?.type === 'LOG') {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
    const row = message.row;
    // Config may have just been disabled; accept only bounded, non-sensitive lifecycle metadata.
    if (!row || !['mock', 'block', 'pass', 'aborted', 'timeout', 'disabled', 'changed', 'error'].includes(row.outcome)) return;
    let url; try { url = new URL(row.url); } catch { return; }
    if (!['http:', 'https:'].includes(url.protocol)) return;
    // Logging needs only binding presence, not the potentially large response data.
    const cfg = ((await chrome.storage.session.get(SESSION))[SESSION] || {})[sender.tab.id];
    await addLog({ time: Date.now(), tabId: sender.tab.id, ruleId: String(row.ruleId || '').slice(0, 80), method: String(row.method || '').slice(0, 10), url: url.origin + url.pathname, outcome: row.outcome, elapsedMs: Math.min(60000, Math.max(0, Number(row.elapsedMs) || 0)), active: !!cfg }); return;
  }
  if (!trustedUI(sender)) throw new Error('仅允许扩展管理页操作');
  switch (message.type) {
    case 'GET': {
      const automatic = await autoConfig(), all = await bindings();
      const scenarioSummary = ({ id, name }) => ({ id, name });
      if (message.compact === true) {
        automatic.projects = automatic.projects.map(p => ({ ...p, scenarios: p.scenarios.map(scenarioSummary) }));
        for (const [id, row] of Object.entries(all)) all[id] = { ...row, scenario: scenarioSummary(row.scenario) };
      }
      return { automatic, config: await readConfig(), bindings: all, tabs: (await chrome.tabs.query({})).filter(t => /^https?:/.test(t.url || '')).map(t => { const u = new URL(t.url); return { id: t.id, url: u.origin + u.pathname }; }), logs: await readLogs() };
    }
    case 'SAVE': {
      const next = core.validateConfig(message.config); const all = await bindings();
      for (const [tabId, cfg] of Object.entries(all)) if (!next.projects.some(p => p.id === cfg.projectId)) await stop(tabId, all);
      await writeConfig(next);
      for (const p of (await autoConfig()).projects) if (!next.projects.some(x => x.id === p.id)) await removeAutomatic(p.id);
      return true;
    }
    case 'AUTO_ENABLE': {
      const config = await readConfig(); const p = config.projects.find(x => x.id === message.projectId);
      const environment = p?.environments.find(e => e.id === message.environmentId), scenario = p?.scenarios.find(x => x.id === message.scenarioId);
      if (!p || !environment || !scenario) throw new Error('项目、环境或场景不存在');
      if (!await chrome.permissions.contains({ origins: [environment.pageOrigin + '/*'] })) throw new Error('尚未授予页面来源权限');
      const current = await autoConfig();
      const next = validateAuto({ schemaVersion: 1, projects: [...current.projects.filter(x => x.id !== p.id), { ...p, environments: [environment], scenarios: [scenario] }] });
      await register(environment.pageOrigin);
      await removeAutomatic(p.id);
      await chrome.storage.local.set({ [AUTO]: next });
      const all = await bindings();
      for (const [id, cfg] of Object.entries(all)) if (cfg.projectId === p.id) await stop(id, all);
      return true;
    }
    case 'AUTO_DISABLE': {
      if (typeof message.projectId !== 'string' || !(await autoConfig()).projects.some(p => p.id === message.projectId)) throw new Error('未找到所选自动项目');
      await removeAutomatic(message.projectId); return true;
    }
    case 'ARM': return arm(message);
    case 'PREPARE': return arm(message, true);
    case 'RELOAD_PROJECT_PAGE': {
      const project = (await readConfig()).projects.find(p => p.id === message.projectId);
      if (!project) throw Error('项目不存在');
      return refreshProjectPages(project, [{ id: message.tabId }]);
    }
    case 'STOP_PROJECT': {
      const project = (await readConfig()).projects.find(p => p.id === message.projectId);
      if (!project) throw Error('项目不存在');
      await removeAutomatic(project.id);
      const all = await bindings();
      for (const [id, cfg] of Object.entries(all)) if (cfg.projectId === project.id) await stop(id, all);
      const tabs = (await chrome.tabs.query({})).filter(t => project.environments.some(env => core.inPage(t.url || '', env)));
      return refreshProjectPages(project, tabs);
    }
    case 'STOP': { const all = await bindings(); const cfg = all[message.tabId]; if (cfg?.automatic) await removeAutomatic(cfg.projectId); else await stop(message.tabId, all); return true; }
    case 'CLEAR_LOGS': await clearLogs(); return true;
    default: throw new Error('未知操作');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Read/log operations must not queue behind executeScript (BOOT would deadlock ARM).
  const op = ['SAVE', 'ARM', 'PREPARE', 'STOP', 'STOP_PROJECT', 'RELOAD_PROJECT_PAGE', 'AUTO_ENABLE', 'AUTO_DISABLE'].includes(message?.type) ? serial(() => handle(message, sender)) : handle(message, sender);
  op.then(value => respond({ ok: true, value })).catch(error => respond({ ok: false, error: error.message })); return true;
});
chrome.tabs.onRemoved.addListener(tabId => serial(async () => { const all = await bindings(); delete all[tabId]; await setBindings(all); }));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) serial(async () => { const all = await bindings(); if (all[tabId] && !core.inPage(change.url, all[tabId].environment)) await stop(tabId, all); });
});
const reset = () => serial(async () => { const all = await bindings(); for (const id of Object.keys(all)) await stop(id, all); });
chrome.runtime.onStartup.addListener(() => reset().then(ensureSeed));
chrome.runtime.onInstalled.addListener(() => reset().then(ensureSeed));
chrome.permissions.onRemoved.addListener(() => serial(async () => {
  await ensureSeed();
  for (const p of (await autoConfig()).projects) if (!await chrome.permissions.contains({ origins: [p.environments[0].pageOrigin + '/*'] })) await removeAutomatic(p.id);
  const all = await bindings();
  for (const [id, cfg] of Object.entries(all)) {
    if (!await chrome.permissions.contains({ origins: [cfg.environment.pageOrigin + '/*'] })) await stop(id, all);
  }
}));

// Native commands are initiated by this extension's service worker, not by page messages.
async function nativeDigest(value) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function nativePageMessage(tabId, message) {
  let timer;
  try { return await Promise.race([chrome.tabs.sendMessage(tabId, message).catch(() => null), new Promise(resolve => { timer = setTimeout(() => resolve(null), 2000); })]); }
  finally { clearTimeout(timer); }
}
async function nativeState() {
  await ensureSeed();
  const config = await readConfig(), automatic = await autoConfig(), all = await bindings();
  const projects = await Promise.all(config.projects.map(async project => ({ id: project.id, config_sha256: await nativeDigest({ schemaVersion: 1, projects: [project] }), automatic: automatic.projects.some(p => p.id === project.id) })));
  const pages = await Promise.all((await chrome.tabs.query({})).slice(0, 500).map(async tab => {
    const project = automatic.projects.find(p => core.inPage(tab.url, p.environments[0]));
    if (!project) return null;
    const observed = await nativePageMessage(tab.id, { type: 'NATIVE_PAGE_STATUS' });
    const applied = !!observed?.indicator && observed.version === all[tab.id]?.version;
    return { tabId: tab.id, projectId: project.id, applied, requiresRefresh: !applied };
  }));
  return { protocol: 'forgeway-mock-native/1', extensionId: chrome.runtime.id, version: chrome.runtime.getManifest().version, projects, pages: pages.filter(Boolean) };
}
async function nativeDispatch(command) {
  if (command.type === 'STATUS') return nativeState();
  if (command.type !== 'SYNC' || command.expiresAt <= Date.now()) throw Error('Native command rejected');
  return serial(async () => {
    if (command.expiresAt <= Date.now()) throw Error('Native command expired');
    const config = validateAuto(command.config);
    if (config.projects.length !== 1 || await nativeDigest(config) !== command.expectedHash) throw Error('Native scope/hash rejected');
    const project = config.projects[0], environment = project.environments[0];
    if (!await chrome.permissions.contains({ origins: [environment.pageOrigin + '/*'] })) throw Error('Native source permission not granted');
    const current = await readConfig();
    // Validate overlap before changing any saved state.
    const nextAuto = validateAuto({ schemaVersion: 1, projects: [...(await autoConfig()).projects.filter(p => p.id !== project.id), project] });
    const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('manager.html') };
    await handle({ type: 'SAVE', config: { schemaVersion: 1, projects: [...current.projects.filter(p => p.id !== project.id), project] } }, sender);
    await register(environment.pageOrigin);
    await chrome.storage.local.set({ [AUTO]: nextAuto });
    const all = await bindings();
    const tabs = await chrome.tabs.query({}), targets = tabs.filter(tab => core.inPage(tab.url, environment));
    for (const tab of tabs) if (all[tab.id]?.projectId === project.id && !core.inPage(tab.url, environment)) await stop(tab.id, all);
    const updates = targets.map(tab => ({ tab, config: snapshotFor(project) }));
    for (const { tab, config } of updates) all[tab.id] = config;
    await setBindings(all);
    await Promise.all(updates.map(async ({ tab, config }) => { const ack = await nativePageMessage(tab.id, { type: 'APPLY', config }); if (ack?.applied) await badge(tab.id, true); }));
    const actual = await nativeState(), saved = actual.projects.find(p => p.id === project.id);
    return { ...actual, config_sha256: saved.config_sha256, automatic: saved.automatic };
  });
}
if (chrome.runtime.getManifest?.().permissions?.includes('nativeMessaging')) {
  let nativeConnection = null;
  const retry = () => { nativeConnection = null; chrome.alarms.create('forgeway-native-reconnect', { delayInMinutes: 0.5 }); };
  const connect = async () => {
    if (nativeConnection) return;
    try {
      const response = await fetch(chrome.runtime.getURL('native.json'));
      if (!response.ok) throw Error('Native settings missing');
      const settings = await response.json();
      nativeConnection = startNativeControl({ api: chrome, settings, dispatch: nativeDispatch, onDisconnect: retry });
    } catch { retry(); }
  };
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'forgeway-native-reconnect') connect(); });
  connect();
}

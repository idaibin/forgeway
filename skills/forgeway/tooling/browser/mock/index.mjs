import { temporaryCommand } from './temporary-cli.mjs';
import { proxyCommand } from './proxy-cli.mjs';
import { nativeCommand } from './native-control.mjs';
import { randomUUID } from 'node:crypto';
import { Script } from 'node:vm';
import { fork } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpSession, delay, discoverTargets, evaluate } from '../cdp.mjs';
import { readMockConfig, selectMock, DEFAULT_RECORD_COUNT, semanticDigest, digest } from './config.mjs';
import { connectOwned, SESSION_VERSION, sessionFile } from './session.mjs';
import { applyScenario, inspectControl } from './control.mjs';
import { parseViewport } from './viewport.mjs';
const bundledExtension = fileURLToPath(new URL('./extension/', import.meta.url));
function value(flags, key, required = true) {
  const values = flags[key];
  if (values === undefined && !required) return undefined;
  if (!Array.isArray(values) || values.length !== 1) throw new Error(`--${key} requires exactly one value`);
  return values[0];
}
const writeState = (root, state) => writeFileSync(sessionFile(root), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
async function pageSession(endpoint, id, expectedURL) {
  for (let n = 0; n < 50; n++) {
    const target = (await discoverTargets(endpoint)).find(t => t.id === id);
    if (target) {
      if (expectedURL && target.url !== expectedURL) throw new Error('Owned extension manager identity mismatch');
      return CdpSession.connect(target.webSocketDebuggerUrl);
    }
    await delay(100);
  }
  throw new Error('Mock target is unavailable');
}
async function sendUI(session, message) {
  const reply = await evaluate(session, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  if (!reply?.ok) throw new Error(reply?.error || 'Mock extension did not acknowledge operation');
  return reply.value;
}
function extension(flags) {
  if (flags['state-adapter'] && (!flags.directory || !flags.config)) throw Error('--state-adapter requires config and a new extension directory');
  if (!flags.directory && !flags.config) return { schema_version: 'forgeway-browser-mock-extension/1', default_record_count: DEFAULT_RECORD_COUNT, path: bundledExtension };
  const { config, sha256 } = readMockConfig(value(flags, 'config'));
  const selected = selectMock(config, { projectId: value(flags, 'project'), environmentId: value(flags, 'environment'), scenarioId: value(flags, 'scenario'), url: value(flags, 'url') });
  if (selected.scenario.rules.some(r => r.action === 'pass' && r.semantics === 'write')) throw new Error('Automatic activation cannot permit real writes');
  const adapterFile = value(flags, 'state-adapter', false);
  const adapter = adapterFile ? readFileSync(path.resolve(adapterFile), 'utf8') : undefined;
  if (adapter !== undefined) new Script(adapter, { filename: path.basename(adapterFile) });
  const output = path.resolve(value(flags, 'directory'));
  if (existsSync(output)) throw new Error('--directory must be a new caller-owned directory');
  cpSync(bundledExtension, output, { recursive: true, errorOnExist: true, force: false });
  if (adapter !== undefined) writeFileSync(path.join(output, 'project-adapter.js'), `try {\n${adapter}\nif (!globalThis.TabMockProjectAdapter) throw Error('Project adapter did not register');\n} catch { globalThis.TabMockProjectAdapter = {version:0}; }\n`);
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  const matches = [selected.environment.pageOrigin + '/*'];
  manifest.host_permissions = matches;
  manifest.content_scripts = [
    { matches, js: ['stateful.js', 'core.js', 'project-adapter.js', 'runtime.js'], run_at: 'document_start', world: 'MAIN', all_frames: false },
    { matches, js: ['bridge.js'], run_at: 'document_start', world: 'ISOLATED', all_frames: false }
  ];
  const seed = { schemaVersion: 1, projects: [{ ...selected.project, environments: [selected.environment], scenarios: [selected.scenario] }] };
  writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(path.join(output, 'autostart.json'), JSON.stringify(seed, null, 2) + '\n', { mode: 0o600 });
  return { schema_version: 'forgeway-browser-mock-extension/1', default_record_count: DEFAULT_RECORD_COUNT, path: output, automatic: true, config_sha256: sha256, page_origin: selected.environment.pageOrigin, page_path: selected.environment.pagePathPrefix, state_adapter_sha256: adapter === undefined ? null : digest(adapter), installed: false };
}
async function open(flags) {
  const viewport = parseViewport(value(flags, 'viewport', false));
  const { config, sha256 } = readMockConfig(value(flags, 'config'));
  const selected = selectMock(config, { projectId: value(flags, 'project'), environmentId: value(flags, 'environment'), scenarioId: value(flags, 'scenario'), url: value(flags, 'url') });
  if (flags.headless !== undefined && flags.headless !== true) throw new Error('--headless does not accept a value');
  if (selected.scenario.rules.some(r=>r.action==='pass'&&r.semantics==='write')) throw new Error('Viewing sessions cannot permit real writes');
  const chrome = path.resolve(value(flags, 'chrome'));
  if (!existsSync(chrome)) throw new Error('Chrome executable was not found at --chrome');
  const requested = path.resolve(value(flags, 'session'));
  if (existsSync(requested)) throw new Error('--session must be a new task-owned directory');
  mkdirSync(requested, { mode: 0o700 });
  const root = realpathSync(requested), profile = path.join(root, 'profile'), extension = path.join(root, 'extension');
  cpSync(bundledExtension, extension, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const launchIdentity = 'session-' + randomUUID();
  manifest.version_name = launchIdentity;
  manifest.host_permissions = [selected.environment.pageOrigin + '/*'];
  writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const child = fork(fileURLToPath(new URL('./launcher.mjs', import.meta.url)), [root], { detached: true, stdio: ['ignore','ignore','ignore','ipc'], execArgv: [] });
  return new Promise((resolve,reject)=>{
    let settled = false;
    const timer = setTimeout(()=>{child.kill('SIGTERM');finish(new Error('Mock startup timed out'));},45000);
    const finish = (error,result)=>{if(settled)return;settled=true;clearTimeout(timer);child.removeAllListeners('exit');if(child.connected)child.disconnect();child.unref();error?reject(error):resolve(result);};
    child.once('error',error=>finish(error));
    child.once('exit',()=>finish(new Error('Mock browser owner exited before startup')));
    child.once('message',reply=>finish(reply.ok?null:new Error(reply.error),reply.value));
    child.send({chrome,headless:flags.headless===true,viewport,launchIdentity,config,sha256,projectId:selected.project.id,environmentId:selected.environment.id,scenarioId:selected.scenario.id,pageOrigin:selected.environment.pageOrigin,pagePath:selected.target.pathname,url:selected.target.href});
  });
}

async function resume(flags) {
  const root = value(flags, 'session');
  const { config, sha256 } = readMockConfig(value(flags, 'config'));
  const { state, browser } = await connectOwned(root);
  let manager, target;
  try {
    const selected = selectMock(config, { projectId: state.project_id, environmentId: state.environment_id, scenarioId: state.scenario_id, url: value(flags, 'url') });
    if (selected.environment.pageOrigin !== state.page_origin) throw new Error('Apply cannot expand the session page origin');
    manager = await pageSession(state.endpoint, state.manager_target_id, 'chrome-extension://' + state.extension_id + '/manager.html');
    target = await pageSession(state.endpoint, state.target_id);
    await target.send('Page.enable');
    const checks = await applyScenario({ config, selected, tabId: state.tab_id,
      send: (type, data = {}) => sendUI(manager, { type, ...data }),
      navigate: async url => {
        await target.send('Page.navigate', { url });
        for (let n = 0; n < 50; n++) {
          const destination = new URL(url);
          const predicate = url === 'about:blank' ? "location.href==='about:blank'" : "location.origin+location.pathname===" + JSON.stringify(destination.origin + destination.pathname);
          if (await evaluate(target, predicate).catch(() => false)) return;
          await delay(100);
        }
        throw new Error('Owned target did not reach requested URL');
      },
      readPage: async () => {
        for (let n = 0; n < 100; n++) {
          const page = await evaluate(target, "({url:location.origin+location.pathname,indicator:!!document.getElementById('__tab_mock_indicator')})").catch(() => null);
          if (page?.indicator) return page;
          await delay(100);
        }
        return null;
      }
    });
    state.config_sha256 = sha256; state.config_semantic_sha256 = semanticDigest(config); state.page_path = selected.target.pathname; writeState(state.session_root, state);
    return { schema_version: SESSION_VERSION, status: 'active', session: state.session_root, checks, config_sha256: sha256, browser_retained: true, foreground_requested: false, authorizes_delivery: false };
  } finally { manager?.close(); target?.close(); browser.close(); }
}
async function status(root) {
  const { state, browser } = await connectOwned(root);
  let manager, target;
  try {
    manager = await pageSession(state.endpoint, state.manager_target_id, 'chrome-extension://' + state.extension_id + '/manager.html');
    target = await pageSession(state.endpoint, state.target_id);
    const actual = await sendUI(manager, { type: 'GET' });
    const page = await evaluate(target, "({url:location.origin+location.pathname,indicator:!!document.getElementById('__tab_mock_indicator')})");
    let checks = { binding_matches: false, automatic_matches: false, page_in_scope: false, indicator_present: page.indicator };
    try {
      const selected = selectMock(actual.config, { projectId: state.project_id, environmentId: state.environment_id, scenarioId: state.scenario_id, url: state.page_origin + state.page_path });
      checks = inspectControl(actual, selected, state.tab_id, page);
    } catch { /* Actual configuration no longer has the selected scope. */ }
    checks.config_matches = state.config_semantic_sha256 ? semanticDigest(actual.config) === state.config_semantic_sha256 : null;
    const verified = Object.values(checks).every(value => value === true);
    return { schema_version: SESSION_VERSION, status: verified ? 'active' : actual.bindings[state.tab_id] ? 'stale' : 'inactive', session: state.session_root, checks, config_sha256: state.config_sha256, project_id: state.project_id, scenario_id: state.scenario_id, tabs: actual.tabs, logs: actual.logs, foreground_requested: false, authorizes_delivery: false };
  } finally { manager?.close(); target?.close(); browser.close(); }
}
export async function mockCommand(action, flags, positionals) {
  if (positionals.length !== 3) throw new Error('Use forgeway browser mock <extension|validate|open|apply|resume|status|stop|temporary>');
  if (action === 'temporary') return temporaryCommand(flags);
  if (['proxy-start','proxy-update','proxy-status','proxy-stop'].includes(action)) return proxyCommand(action, flags);
  const nativeAllowed = action === 'native-init' ? ['directory','extension-directory','extension-id'] : action === 'native-register' ? ['directory','registration-directory'] : action === 'native-sync' ? ['directory','config','project','environment','scenario','url','timeout-ms'] : action === 'native-status' ? ['directory','timeout-ms'] : null;
  if (nativeAllowed) { for (const key of Object.keys(flags)) if (![...nativeAllowed,'json','compact'].includes(key)) throw Error('Unsupported native option --'+key); return nativeCommand(action, flags); }
  const allowed = action === 'open' ? ['config','project','environment','scenario','url','chrome','session','headless','viewport','compact','json'] : ['resume', 'apply'].includes(action) ? ['session','config','url','compact','json'] : action === 'validate' ? ['config','compact','json'] : action === 'extension' ? ['state-adapter','config','project','environment','scenario','url','directory','compact','json'] : ['session','compact','json'];
  for (const key of Object.keys(flags)) if (!allowed.includes(key)) throw new Error('Unsupported Mock option --' + key);
  if (action === 'extension') return extension(flags);
  if (action === 'validate') { const { config, sha256 } = readMockConfig(value(flags,'config')); return { schema_version: 'forgeway-browser-mock-check/1', valid: true, config_sha256: sha256, projects: config.projects.length, scenarios: config.projects.reduce((n,p)=>n+p.scenarios.length,0), rules: config.projects.flatMap(p=>p.scenarios).reduce((n,s)=>n+s.rules.length,0) }; }
  if (action === 'open') return open(flags);
  if (['resume', 'apply'].includes(action)) return resume(flags);
  if (action === 'status') return status(value(flags,'session'));
  if (action === 'stop') {
    const root = value(flags,'session'), { browser, state } = await connectOwned(root);
    try { await browser.send('Browser.close'); } finally { browser.close(); }
    return { schema_version: SESSION_VERSION, status: 'closed', session: state.session_root };
  }
  throw new Error('Unknown Mock action ' + action);
}

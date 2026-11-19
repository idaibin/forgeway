import './core.js';
const core = globalThis.TabMockCore;
const $ = id => document.getElementById(id);
let state = { config: { schemaVersion: 1, projects: [] }, bindings: {}, tabs: [], logs: [] }; let projectId; let dirty = false;
const project = () => state.config.projects.find(p => p.id === projectId);
const notify = (text, error = false) => { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; };
async function send(type, data = {}) { const r = await chrome.runtime.sendMessage({ type, ...data }); if (!r?.ok) throw new Error(r?.error || '扩展后台未响应'); return r.value; }
function option(select, value, text) { const o = document.createElement('option'); o.value = value; o.textContent = text; select.append(o); }
function cell(row, value) { const c = document.createElement('td'); c.textContent = value; row.append(c); }
function chooseProject(id) {
  if (dirty && !confirm('放弃尚未保存的项目编辑？')) return;
  projectId = id; dirty = false; renderProject();
}
function renderProject() {
  const p = project(); $('projects').replaceChildren();
  for (const item of state.config.projects) { const b = document.createElement('button'); b.textContent = item.name; b.setAttribute('aria-current', item.id === projectId ? 'true' : 'false'); b.onclick = () => chooseProject(item.id); $('projects').append(b); }
  $('project-title').textContent = p?.name || '尚无项目，请导入或新建';
  $('editor').value = p ? JSON.stringify(p, null, 2) : ''; $('editor').disabled = !p;
  $('environment').replaceChildren(); $('scenario').replaceChildren();
  for (const e of p?.environments || []) option($('environment'), e.id, e.name);
  for (const s of p?.scenarios || []) option($('scenario'), s.id, s.name);
  for (const key of ['save', 'duplicate', 'delete', 'arm', 'auto-enable', 'auto-disable']) $(key).disabled = !p;
  renderRules(); renderTabs();
}
function renderRules() {
  const p = project(); const e = p?.environments.find(x => x.id === $('environment').value); const s = p?.scenarios.find(x => x.id === $('scenario').value);
  $('scope').textContent = e ? `页面：${e.pageOrigin}${e.pagePathPrefix}\n受保护 API：${e.apis.map(a => a.origin + a.pathPrefix).join('，')}` : '尚未配置环境';
  $('rules').replaceChildren();
  for (const rule of s?.rules || []) { const r = document.createElement('tr'); cell(r, `${rule.semantics} / ${rule.action}`); cell(r, `${rule.name}\n${rule.method} ${rule.origin}${rule.path}${rule.pathMode === 'prefix' ? '（路径段前缀）' : rule.pathMode === 'template' ? '（具名路径段）' : ''}`); cell(r, rule.response?.status || '—'); cell(r, rule.response ? `${rule.response.delayMs} ms` : '—'); $('rules').append(r); }
}
function renderTabs() {
  const current = $('tab').value; const env = project()?.environments.find(e => e.id === $('environment').value); $('tab').replaceChildren();
  for (const tab of state.tabs.filter(t => env && core.inPage(t.url, env))) option($('tab'), tab.id, `#${tab.id} · ${tab.url}`);
  if ([...$('tab').options].some(o => o.value === current)) $('tab').value = current;
  if (!$('tab').options.length) option($('tab'), '', '没有符合环境范围的标签页');
  $('arm').disabled = !$('tab').value; $('reload').disabled = !$('tab').value; $('stop').disabled = !state.bindings[$('tab').value];
}
function renderRuntime() {
  $('automatic').textContent = '自动启用：' + ((state.automatic?.projects || []).map(p => p.name + ' / ' + p.scenarios[0].name + ' · ' + p.environments[0].pageOrigin + p.environments[0].pagePathPrefix).join('；') || '未配置');
  $('active-count').textContent = Object.keys(state.bindings).length; $('bindings').replaceChildren();
  if (!Object.keys(state.bindings).length) $('bindings').textContent = '未启用 Mock。';
  for (const [id, cfg] of Object.entries(state.bindings)) {
    const line = document.createElement('div'); line.className = 'binding'; const text = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = `ON · #${id} · ${cfg.projectName} / ${cfg.scenario.name}`;
    const detail = document.createElement('div'); detail.className = 'hint'; detail.textContent = `${cfg.environment.name} · ${cfg.environment.pageOrigin}${cfg.environment.pagePathPrefix}`; text.append(strong, detail);
    const b = document.createElement('button'); b.textContent = '关闭'; b.onclick = action(async () => { await send('STOP', { tabId: Number(id) }); await refresh(); notify(`已关闭标签 #${id}`); }); line.append(text, b); $('bindings').append(line);
  }
  $('logs').replaceChildren();
  if (!state.logs.length) { const row = document.createElement('tr'); cell(row, '暂无日志。开启后操作目标页面，点击刷新读取。'); $('logs').append(row); }
  for (const log of state.logs) { const row = document.createElement('tr'); cell(row, `${new Date(log.time).toLocaleTimeString()} / #${log.tabId}`); cell(row, `${log.method} ${log.url}`); cell(row, log.ruleId || '—'); cell(row, log.outcome); cell(row, log.elapsedMs + ' ms'); $('logs').append(row); }
}
async function refresh({ render = false } = {}) {
  state = await send('GET', { compact: true });
  if (!state.config.projects.some(p => p.id === projectId)) { projectId = state.config.projects[0]?.id; render = true; }
  if (render) { dirty = false; renderProject(); } else renderTabs(); renderRuntime();
}
function action(fn) { return async event => { const button = event?.currentTarget; if (button) button.disabled = true; try { await fn(event); } catch (e) { notify(e.message, true); } finally { if (button) button.disabled = false; renderTabs(); } }; }
$('environment').onchange = () => { renderRules(); renderTabs(); }; $('scenario').onchange = renderRules;
$('tab').onchange = renderTabs; $('editor').oninput = () => { dirty = true; };
$('refresh').onclick = action(async () => { await refresh(); notify('已读取标签页、启用快照和日志。未保存的编辑保留。'); });
$('arm').onclick = action(async () => {
  const p = project(); const e = p.environments.find(x => x.id === $('environment').value);
  notify('正在核对来源权限…');
  // Permission request must remain in the user gesture before any asynchronous work.
  const granted = await chrome.permissions.request({ origins: [e.pageOrigin + '/*'] }); if (!granted) throw new Error('未授予来源权限，Mock 未开启');
  notify('来源权限已就绪，正在安装标签页拦截器…');
  await send('ARM', { projectId: p.id, environmentId: e.id, scenarioId: $('scenario').value, tabId: Number($('tab').value) });
  await refresh(); notify('Mock 已开启。首次启用请刷新目标页，覆盖最早的页面请求。');
});
$('auto-enable').onclick = action(async () => {
  const p = project(), e = p.environments.find(x => x.id === $('environment').value);
  if (!await chrome.permissions.request({ origins: [e.pageOrigin + '/*'] })) throw new Error('未授予来源权限');
  await send('AUTO_ENABLE', { projectId: p.id, environmentId: e.id, scenarioId: $('scenario').value });
  await refresh(); notify('已保存自动启用。刷新或重新打开范围内页面时生效，浏览器重启后仍保留。');
});
$('auto-disable').onclick = action(async () => { await send('AUTO_DISABLE', { projectId }); await refresh(); notify('已关闭此项目自动启用和关联的自动标签页。'); });
$('stop').onclick = action(async () => { await send('STOP', { tabId: Number($('tab').value) }); await refresh(); notify('已关闭。等待中的 Mock 已取消，新请求恢复页面原行为。'); });
$('reload').onclick = action(async () => { const id = Number($('tab').value); if (dirty && !confirm('当前编辑尚未保存，仍按已启用快照刷新目标页？')) return; await chrome.tabs.reload(id); notify(`已请求刷新目标页 #${id}，请观察页面状态。`); });
function warnPass(config) { return !config.projects.some(p => p.scenarios.some(s => s.rules.some(r => r.action === 'pass' && r.semantics === 'write'))) || confirm('配置包含 write + pass：命中后会真实发送业务写请求。确认保留这些明确放行规则？'); }
$('save').onclick = action(async () => {
  const p = JSON.parse($('editor').value); if (p.id !== projectId) throw new Error('编辑时不能更改项目ID，请使用复制项目');
  const next = core.validateConfig({ schemaVersion: 1, projects: state.config.projects.map(x => x.id === projectId ? p : x) }); if (!warnPass(next)) return;
  await send('SAVE', { config: next }); await refresh({ render: true }); notify('项目已保存。已启用标签使用原快照；重新开启后应用本次编辑。');
});
$('new').onclick = action(async () => {
  if (dirty && !confirm('放弃尚未保存的项目编辑并新建？')) return;
  const id = 'project-' + crypto.randomUUID(); const p = { id, name: '新项目', environments: [{ id: 'test', name: '测试环境（请修改入口）', pageOrigin: 'http://localhost', pagePathPrefix: '/', apis: [{ origin: 'http://localhost', pathPrefix: '/api/' }] }], scenarios: [{ id: 'normal', name: '默认场景', rules: [] }] };
  await send('SAVE', { config: core.validateConfig({ schemaVersion: 1, projects: [...state.config.projects, p] }) }); projectId = id; await refresh({ render: true }); notify('已新建项目。请编辑页面与 API 范围，添加规则后保存。');
});
$('duplicate').onclick = action(async () => {
  if (dirty && !confirm('使用已保存配置复制，放弃未保存编辑？')) return;
  const p = structuredClone(project()); p.id = 'project-' + crypto.randomUUID(); p.name += ' 副本';
  await send('SAVE', { config: core.validateConfig({ schemaVersion: 1, projects: [...state.config.projects, p] }) }); projectId = p.id; await refresh({ render: true }); notify('项目已复制，可修改域名后复用场景。');
});
$('delete').onclick = action(async () => { if (!confirm('删除所选项目并关闭其所有启用标签？')) return; await send('SAVE', { config: { schemaVersion: 1, projects: state.config.projects.filter(p => p.id !== projectId) } }); await refresh({ render: true }); notify('项目已删除，其启用标签已关闭。'); });
$('import').onclick = () => $('file').click();
$('file').onchange = action(async () => {
  const file = $('file').files[0]; if (!file) return;
  try {
    if (dirty && !confirm('导入后刷新项目编辑器，放弃未保存编辑？')) return;
    const input = core.validateConfig(JSON.parse(await file.text())); const duplicates = input.projects.filter(p => state.config.projects.some(x => x.id === p.id)).length;
    if (duplicates && !confirm(`导入将替换 ${duplicates} 个相同ID项目，其他项目保留。继续？`)) return;
    const next = core.validateConfig({ schemaVersion: 1, projects: [...state.config.projects.filter(p => !input.projects.some(x => x.id === p.id)), ...input.projects] }); if (!warnPass(next)) return;
    await send('SAVE', { config: next }); projectId = input.projects[0]?.id || projectId; await refresh({ render: true }); notify(`已导入 ${input.projects.length} 个项目。已启用快照需重新开启才更新。`);
  } finally { $('file').value = ''; }
});
$('export').onclick = action(async () => {
  const latest = await send('GET', { compact: true }); const blob = new Blob([JSON.stringify(latest.config, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'tab-mock-config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已导出已保存配置（不含日志与启用会话）。');
});
$('clear').onclick = action(async () => { await send('CLEAR_LOGS'); await refresh(); notify('日志已清空。'); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
refresh({ render: true }).then(() => notify('本地配置已读取。导入门户配置，或新建自己的项目。')).catch(e => notify(e.message, true));

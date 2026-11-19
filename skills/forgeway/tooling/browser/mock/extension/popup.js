import './core.js';
const core = globalThis.TabMockCore;
const list = document.getElementById('projects');
const notice = document.getElementById('notice');
const indicatorSwitch = document.getElementById('show-indicator');
let showIndicator = true;
async function loadPreference() {
  const saved = await chrome.storage.local.get('showIndicator');
  showIndicator = saved.showIndicator !== false;
  indicatorSwitch.checked = showIndicator; indicatorSwitch.disabled = false;
}
indicatorSwitch.onchange = async () => {
  indicatorSwitch.disabled = true;
  try {
    await chrome.storage.local.set({ showIndicator: indicatorSwitch.checked });
    showIndicator = indicatorSwitch.checked;
    notice.textContent = ''; notice.className = '';
  } catch (error) {
    indicatorSwitch.checked = showIndicator; notice.textContent = error.message; notice.className = 'error';
  } finally { indicatorSwitch.disabled = false; }
};
async function send(type, data = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || '扩展后台未响应');
  return response.value;
}
async function refresh() {
  const [state, tabs] = await Promise.all([send('GET', { compact: true }), chrome.tabs.query({ active: true, currentWindow: true })]);
  const tab = tabs[0];
  const binding = state.bindings[tab?.id];
  list.replaceChildren();
  for (const project of state.config.projects) {
    const active = binding?.projectId === project.id;
    const environments = project.environments.filter(env => core.inPage(tab?.url || '', env));
    const saved = state.automatic?.projects.find(item => item.id === project.id);
    const savedEnvironment = saved?.environments[0];
    const environment = environments.find(env => env.id === binding?.environment.id && active)
      || environments.find(env => env.id === savedEnvironment?.id)
      || (environments.length === 1 ? environments[0] : null);
    const scenarioId = active ? binding.scenario.id : saved?.scenarios[0]?.id;
    const scenario = project.scenarios.find(item => item.id === scenarioId)
      || (project.scenarios.length === 1 ? project.scenarios[0] : null);
    const row = document.createElement('div'); row.className = 'project';
    const text = document.createElement('div');
    const name = document.createElement('div'); name.className = 'name'; name.textContent = project.name;
    const status = document.createElement('div'); status.className = active ? 'status active' : 'status';
    status.textContent = active ? '已开启' : !environments.length ? '当前页面不适用' : !environment || !scenario ? '请先在扩展选项页完成配置' : '已关闭';
    const toggle = document.createElement('label'); toggle.className = 'toggle';
    const switchControl = document.createElement('input'); switchControl.type = 'checkbox'; switchControl.checked = active;
    switchControl.setAttribute('role', 'switch');
    switchControl.setAttribute('aria-label', `启用 ${project.name}`);
    switchControl.disabled = !active && (!environment || !scenario || !tab?.id);
    toggle.append(switchControl);
    switchControl.onchange = async () => {
      const enabled = switchControl.checked;
      if (enabled === active) return;
      switchControl.disabled = true; notice.textContent = ''; notice.className = '';
      let applied = false;
      try {
        let result;
        if (!enabled) result = await send('STOP_PROJECT', { projectId: project.id });
        else {
          if (!await chrome.permissions.request({ origins: [environment.pageOrigin + '/*'] })) throw new Error('未授予来源权限');
          await send('ARM', { projectId: project.id, environmentId: environment.id, scenarioId: scenario.id, tabId: tab.id });
        }
        applied = true;
        await refresh();
        if (enabled) result = await send('RELOAD_PROJECT_PAGE', { projectId: project.id, tabId: tab.id });
        if (result?.errors?.length) throw Error(result.errors.map(item => item.error).join('；'));
      } catch (error) {
        notice.textContent = applied ? '开关已生效，请手动刷新当前页面：' + error.message : error.message;
        notice.className = 'error'; switchControl.checked = applied ? enabled : active; switchControl.disabled = false;
      }
    };
    text.append(name, status); row.append(text, toggle); list.append(row);
  }
  notice.textContent = state.config.projects.length ? '' : '暂无项目';
}
Promise.all([refresh(), loadPreference()]).catch(error => { notice.textContent = error.message; notice.className = 'error'; });

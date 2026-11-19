/** Lifecycle orchestration for an already identity-checked, Forgeway-owned session. */
import './extension/core.js';
import { isDeepStrictEqual } from 'node:util';
const core = globalThis.TabMockCore;
export const sameValue = isDeepStrictEqual;
export function inspectControl(actual, selected, tabId, page) {
  const binding = actual.bindings[tabId];
  const automatic = actual.automatic?.projects.find(p => p.id === selected.project.id);
  const bound = !!binding && binding.projectId === selected.project.id && sameValue(binding.environment, selected.environment) && sameValue(binding.scenario, selected.scenario);
  const enabled = !!automatic && sameValue(automatic.environments, [selected.environment]) && sameValue(automatic.scenarios, [selected.scenario]);
  const scoped = !!page && core.inPage(page.url, selected.environment);
  return { binding_matches: bound, automatic_matches: enabled, page_in_scope: scoped, indicator_present: page?.indicator === true };
}
export async function applyScenario({ config, selected, tabId, send, navigate, readPage }) {
  if (selected.scenario.rules.some(r => r.action === 'pass' && r.semantics === 'write')) throw new Error('Viewing sessions cannot permit real writes');
  const before = await send('GET');
  if (!before.automatic) throw new Error('Owned extension does not support automatic activation');
  const selection = { projectId: selected.project.id, environmentId: selected.environment.id, scenarioId: selected.scenario.id };
  let activationAttempted = false;
  try {
    await navigate('about:blank');
    await send('SAVE', { config });
    activationAttempted = true;
    await send('AUTO_ENABLE', selection);
    await send('PREPARE', { ...selection, tabId });
    await navigate(selected.target.href);
    const page = await readPage();
    const actual = await send('GET');
    const checks = { ...inspectControl(actual, selected, tabId, page), config_matches: sameValue(actual.config, config) };
    if (!Object.values(checks).every(Boolean)) throw new Error('Owned Mock activation readback did not match the requested configuration');
    return checks;
  } catch (error) {
    const cleanup = [];
    if (activationAttempted) {
      try { await send('AUTO_DISABLE', { projectId: selection.projectId }); } catch { cleanup.push('automatic'); }
    }
    try { await send('STOP', { tabId }); } catch { cleanup.push('binding'); }
    throw new Error(error.message + (cleanup.length ? '; cleanup not verified: ' + cleanup.join(',') : ''));
  }
}

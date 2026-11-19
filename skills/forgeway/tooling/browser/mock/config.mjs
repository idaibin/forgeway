import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import './extension/core.js';
const core = globalThis.TabMockCore;
export const DEFAULT_RECORD_COUNT = 20;
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const semanticDigest = value => digest(JSON.stringify(canonical(value)));
export function readMockConfig(file) {
  if (!file) throw new Error('--config is required');
  const bytes = readFileSync(file);
  return { config: core.validateConfig(JSON.parse(bytes.toString('utf8'))), sha256: digest(bytes) };
}
export function selectMock(config, { projectId, environmentId, scenarioId, url }) {
  const project = config.projects.find(p => p.id === projectId);
  const environment = project?.environments.find(e => e.id === environmentId);
  const scenario = project?.scenarios.find(s => s.id === scenarioId);
  if (!project || !environment || !scenario) throw new Error('Selected project/environment/scenario is missing');
  const target = new URL(url);
  if (target.username || target.password || !core.inPage(url, environment)) throw new Error('Target URL is outside the selected environment');
  return { project, environment, scenario, target };
}

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CdpSession, endpointUrl } from '../cdp.mjs';
export const SESSION_VERSION = 'forgeway-browser-mock-session/1';
export const sessionFile = root => path.join(root, 'session.json');
export function loadSession(root) {
  const state = JSON.parse(readFileSync(sessionFile(root), 'utf8'));
  if (state.schema_version !== SESSION_VERSION || state.session_root !== realpathSync(root) || !Number.isInteger(state.launcher_pid) || !/^[a-p]{32}$/.test(state.extension_id) || !/^[a-f0-9]{64}$/.test(state.config_sha256) || typeof state.target_id !== 'string') throw new Error('Invalid Mock session identity');
  if (state.config_semantic_sha256 !== undefined && !/^[a-f0-9]{64}$/.test(state.config_semantic_sha256)) throw new Error('Invalid Mock configuration identity');
  state.endpoint = endpointUrl(state.endpoint);
  return state;
}
export async function connectOwned(root) {
  const state = loadSession(root);
  const response = await fetch(state.endpoint + '/json/version', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('Mock browser is unavailable');
  const browser = await CdpSession.connect((await response.json()).webSocketDebuggerUrl);
  try {
    const { arguments: args } = await browser.send('Browser.getBrowserCommandLine');
    if (!args.includes('--user-data-dir=' + path.join(state.session_root, 'profile')) || !args.includes('--load-extension=' + path.join(state.session_root, 'extension'))) throw new Error('Browser does not belong to this Mock session');
    return { state, browser };
  } catch (error) { browser.close(); throw error; }
}

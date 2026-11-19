import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readMockConfig, selectMock } from './config.mjs';
import { readProxyState } from './proxy-state.mjs';
import { TOKEN_HEADER } from './proxy-runtime.mjs';
const one = (flags, name) => { if (!Array.isArray(flags[name]) || flags[name].length !== 1 || !flags[name][0]) throw Error('--' + name + ' requires exactly one value'); return flags[name][0]; };
async function control(state, operation, config) {
  const r = await fetch(state.endpoint + '/__forgeway_mock/' + operation, { method: operation === 'status' ? 'GET' : 'POST', headers: { [TOKEN_HEADER]: state.token, 'Content-Type': 'application/json' }, ...(config ? { body: JSON.stringify({ config }) } : {}), redirect: 'error', signal: AbortSignal.timeout(10000) });
  const body = await r.json();
  if (!r.ok || body.instanceId !== state.instanceId) throw Error('Proxy control rejected or instance mismatch');
  return body;
}
export async function proxyCommand(action, flags) {
  const allowed = action === 'proxy-start' ? ['session','config','project','environment','scenario','url','api-origin','upstream','strip-prefix','port'] : action === 'proxy-update' ? ['session','config'] : ['session'];
  for (const key of Object.keys(flags)) if (![...allowed,'json','compact'].includes(key)) throw Error('Unsupported proxy option --' + key);
  const directory = path.resolve(one(flags, 'session'));
  if (action !== 'proxy-start') {
    const state = readProxyState(directory);
    if (state.status === 'stopped') {
      if (action === 'proxy-update') throw Error('Cannot update a stopped proxy');
      try { await control(state, 'status'); throw Error('Stopped state still has a live proxy'); } catch (error) { if (!error.cause || !['ECONNREFUSED','ECONNRESET'].includes(error.cause.code)) throw error; }
      return { status: 'stopped', instanceId: state.instanceId, listenerClosed: true };
    }
    const operation = action.slice(6);
    const reply = await control(state, operation, operation === 'update' ? readMockConfig(one(flags, 'config')).config : undefined);
    if (operation !== 'stop') return reply;
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (readProxyState(directory).status === 'stopped') {
        try { await control(state, 'status'); } catch (error) { if (error.cause && ['ECONNREFUSED','ECONNRESET'].includes(error.cause.code)) return { status: 'stopped', instanceId: state.instanceId, listenerClosed: true }; throw error; }
      }
    }
    throw Error('Proxy listener shutdown not verified');
  }
  const { config } = readMockConfig(one(flags, 'config'));
  const settings = { projectId: one(flags, 'project'), environmentId: one(flags, 'environment'), scenarioId: one(flags, 'scenario'), url: one(flags, 'url'), apiOrigin: one(flags, 'api-origin'), upstream: one(flags, 'upstream'), stripPrefix: one(flags, 'strip-prefix'), instanceId: randomUUID(), token: randomBytes(32).toString('hex'), port: flags.port ? Number(one(flags,'port')) : 0 };
  selectMock(config, settings);
  if (!Number.isInteger(settings.port) || settings.port < 0 || settings.port > 65535) throw Error('Invalid proxy port');
  if (fs.existsSync(directory)) throw Error('--session must be a new task-owned directory');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const session = fs.realpathSync(directory);
  const child = fork(fileURLToPath(new URL('./proxy-worker.mjs', import.meta.url)), [], { detached: true, stdio: ['ignore','ignore','ignore','ipc'], execArgv: [] });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (child.connected) child.disconnect(); child.unref(); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(Error('Proxy startup timed out')); }, 10000);
    child.once('error', error => finish(error)); child.once('exit', () => finish(Error('Proxy worker exited before startup')));
    child.once('message', reply => finish(reply.ok ? null : Error(reply.error), reply));
    child.send({ session, settings, config });
  });
}

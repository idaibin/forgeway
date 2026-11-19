import { startProxy } from './proxy-runtime.mjs';
import { writeProxyState, PROXY_VERSION } from './proxy-state.mjs';
let runtime, state;
process.once('message', async input => {
  try {
    runtime = await startProxy({ ...input.settings, onStopped: async () => { state.status = 'stopped'; writeProxyState(state); } }, input.config);
    state = { schema_version: PROXY_VERSION, session: input.session, endpoint: runtime.endpoint, token: input.settings.token, instanceId: input.settings.instanceId, pid: process.pid, status: 'active' };
    writeProxyState(state); process.send({ ok: true, endpoint: runtime.endpoint, ...runtime.status() });
  } catch (error) { process.send?.({ ok: false, error: error.message }); await runtime?.stop(); process.exitCode = 1; }
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await runtime?.stop(); });

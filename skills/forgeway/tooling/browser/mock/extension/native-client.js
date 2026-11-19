const PROTOCOL = 'forgeway-mock-native/1';
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
export function startNativeControl({ api, settings, dispatch, intervalMs = 500, onDisconnect = () => {} }) {
  if (!settings || settings.protocol !== PROTOCOL || !uuid(settings.channelId) || !/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(settings.host)) throw Error('Invalid native settings');
  const port = api.runtime.connectNative(settings.host);
  let ready = false, busy = false, assembly = null, closed = false;
  const timer = setInterval(() => { if (ready && !busy && !assembly) port.postMessage({ protocol: PROTOCOL, type: 'POLL' }); }, intervalMs);
  const stop = () => { if (closed) return; closed = true; clearInterval(timer); assembly = null; onDisconnect(); };
  port.onDisconnect.addListener(stop);
  port.onMessage.addListener(async frame => {
    try {
      if (frame?.protocol !== PROTOCOL) throw Error('Native protocol mismatch');
      if (frame.type === 'READY' && !ready && frame.channelId === settings.channelId) { ready = true; return; }
      if (!ready || busy || frame.type !== 'COMMAND' || !uuid(frame.id) || !Number.isInteger(frame.part) || !Number.isSafeInteger(frame.total) || frame.total < 1 || typeof frame.data !== 'string' || frame.data.length > 300000) throw Error('Invalid native command frame');
      if (!assembly) assembly = { id: frame.id, total: frame.total, parts: [], bytes: 0 };
      if (frame.id !== assembly.id || frame.total !== assembly.total || frame.part !== assembly.parts.length) throw Error('Native chunk sequence mismatch');
      const bytes = Uint8Array.from(atob(frame.data), c => c.charCodeAt(0));
      assembly.bytes += bytes.length;
      assembly.parts.push(bytes);
      if (assembly.parts.length !== assembly.total) return;
      const combined = new Uint8Array(assembly.bytes); let offset = 0;
      for (const part of assembly.parts) { combined.set(part, offset); offset += part.length; }
      const id = assembly.id; assembly = null; busy = true;
      const command = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(combined));
      if (command.protocol !== PROTOCOL || command.id !== id || !['SYNC', 'STATUS'].includes(command.type) || !Number.isSafeInteger(command.expiresAt) || command.expiresAt <= Date.now()) throw Error('Invalid or expired native command');
      let reply;
      try { reply = { ok: true, value: await dispatch(command) }; }
      catch { reply = { ok: false, error: 'Native operation rejected; inspect project configuration and granted origin permissions' }; }
      port.postMessage({ protocol: PROTOCOL, type: 'RESULT', id, ...reply }); busy = false;
    } catch { stop(); port.disconnect(); }
  });
  port.postMessage({ protocol: PROTOCOL, type: 'HELLO', channelId: settings.channelId, extensionId: api.runtime.id, version: api.runtime.getManifest().version });
  return { stop: () => { stop(); port.disconnect(); } };
}

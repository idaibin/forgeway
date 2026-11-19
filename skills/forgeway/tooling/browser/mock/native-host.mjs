import fs from 'node:fs';
import path from 'node:path';
import { endianness } from 'node:os';
import { fileURLToPath } from 'node:url';
const PROTOCOL = 'forgeway-mock-native/1';
const idPattern = /^[0-9a-f-]{36}$/;
const writeJSON = (file, value) => { const temp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file); };
export function readChannel(directory) {
  const root = fs.realpathSync(directory), stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) throw Error('Native channel must be a private real directory');
  const settings = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'));
  if (settings.schema_version !== 'forgeway-mock-native-channel/1' || settings.directory !== root || !/^[a-p]{32}$/.test(settings.extensionId) || !idPattern.test(settings.channelId)) throw Error('Invalid native channel settings');
  for (const name of ['requests', 'responses']) if (fs.lstatSync(path.join(root, name)).isSymbolicLink()) throw Error('Native channel cannot contain linked queues');
  return settings;
}
export function encodeFrame(value) {
  const bytes = Buffer.from(JSON.stringify(value)); if (bytes.length > 1024 * 1024) throw Error('Native frame too large');
  const prefix = Buffer.alloc(4); prefix[endianness() === 'LE' ? 'writeUInt32LE' : 'writeUInt32BE'](bytes.length); return Buffer.concat([prefix, bytes]);
}
export async function runHost(directory, origin, input = process.stdin, output = process.stdout) {
  const settings = readChannel(directory);
  if (origin !== `chrome-extension://${settings.extensionId}/`) throw Error('Native caller origin rejected');
  const lock = path.join(settings.directory, 'host.lock');
  const acquire = () => { const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd); };
  try { acquire(); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!fs.lstatSync(lock).isFile() || fs.lstatSync(lock).isSymbolicLink()) throw Error('Invalid native host lock');
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid native host owner');
    let alive = true; try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; else throw e; }
    if (alive) throw Error('Native channel already has a host');
    fs.unlinkSync(lock); acquire();
  }
  try {
  let buffer = Buffer.alloc(0), ready = false, inflight = null, chain = Promise.resolve();
  const send = async message => new Promise((resolve, reject) => output.write(encodeFrame({ protocol: PROTOCOL, ...message }), error => error ? reject(error) : resolve()));
  const processMessage = async message => {
    if (message?.protocol !== PROTOCOL) throw Error('Native protocol mismatch');
    if (!ready) {
      if (message.type !== 'HELLO' || message.channelId !== settings.channelId || message.extensionId !== settings.extensionId) throw Error('Native identity mismatch');
      writeJSON(path.join(settings.directory, 'connection.json'), { protocol: PROTOCOL, pid: process.pid, extensionId: settings.extensionId, channelId: settings.channelId });
      ready = true; await send({ type: 'READY', channelId: settings.channelId }); return;
    }
    if (message.type === 'RESULT') {
      if (!inflight || message.id !== inflight.id || typeof message.ok !== 'boolean' || JSON.stringify(message).length > 500000) throw Error('Unexpected native result');
      const receipt = { protocol: PROTOCOL, id: message.id, extensionId: settings.extensionId, receivedAt: Date.now(), ok: message.ok, ...(message.ok ? { value: message.value } : { error: String(message.error || 'Native operation failed').slice(0, 240) }) };
      writeJSON(path.join(settings.directory, 'responses', message.id + '.json'), receipt);
      fs.unlinkSync(inflight.file); inflight = null; return;
    }
    if (message.type !== 'POLL') throw Error('Unknown native message');
    if (inflight) return;
    const files = fs.readdirSync(path.join(settings.directory, 'requests')).filter(name => /^\d+-[0-9a-f-]{36}\.json$/.test(name)).sort();
    for (const name of files) {
      const file = path.join(settings.directory, 'requests', name), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Invalid native queue file');
      const bytes = fs.readFileSync(file), command = JSON.parse(bytes);
      if (command.protocol !== PROTOCOL || !idPattern.test(command.id) || !['SYNC', 'STATUS'].includes(command.type) || !Number.isSafeInteger(command.expiresAt) || name !== command.createdAt + '-' + command.id + '.json') throw Error('Invalid native queued command');
      if (command.expiresAt <= Date.now()) { fs.unlinkSync(file); continue; }
      inflight = { id: command.id, file };
      const size = 192 * 1024, total = Math.ceil(bytes.length / size);
      for (let part = 0; part < total; part++) await send({ type: 'COMMAND', id: command.id, part, total, data: bytes.subarray(part * size, (part + 1) * size).toString('base64') });
      break;
    }
  };
  for await (const chunk of input) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = buffer[endianness() === 'LE' ? 'readUInt32LE' : 'readUInt32BE']();
      if (!length || length > 1024 * 1024) throw Error('Native inbound frame limit');
      if (buffer.length < length + 4) break;
      const message = JSON.parse(buffer.subarray(4, length + 4).toString('utf8')); buffer = buffer.subarray(length + 4);
      chain = chain.then(() => processMessage(message)); await chain;
    }
  }
  if (buffer.length) throw Error('Truncated native frame');
  } finally { if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--directory');
  runHost(process.argv[at + 1], process.argv[at + 2]).catch(() => { process.stderr.write('Forgeway Native Messaging host rejected input or channel state\n'); process.exitCode = 1; });
}

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readChannel } from './native-host.mjs';
import { readMockConfig, selectMock, semanticDigest } from './config.mjs';
const PROTOCOL = 'forgeway-mock-native/1';
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const one = (flags, name) => { if (!Array.isArray(flags[name]) || flags[name].length !== 1) throw Error('--' + name + ' requires one value'); return flags[name][0]; };
export function initNative(flags) {
  if (process.platform === 'win32') throw Error('Native launcher installation is supported on macOS/Linux; Windows requires an executable host launcher');
  const root = path.resolve(one(flags, 'directory')), extension = fs.realpathSync(one(flags, 'extension-directory')), extensionId = one(flags, 'extension-id');
  if (!/^[a-p]{32}$/.test(extensionId)) throw Error('Invalid extension id');
  if (fs.existsSync(root)) throw Error('Native channel directory must be new');
  const bundled = fileURLToPath(new URL('./extension/', import.meta.url));
  if (extension === fs.realpathSync(bundled)) throw Error('Native setup requires a caller-owned extension copy');
  const manifestFile = path.join(extension, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestFile));
  if (manifest.manifest_version !== 3 || manifest.background?.service_worker !== 'background.js' || fs.existsSync(path.join(extension, 'native.json'))) throw Error('Expected an unpaired Forgeway extension artifact');
  for (const name of ['native-client.js', 'core.js', 'bridge.js']) if (!fs.existsSync(path.join(extension, name))) throw Error('Native-capable Forgeway artifact required');
  const channelId = randomUUID(), host = 'com.forgeway.mock';
  fs.mkdirSync(root, { mode: 0o700 });
  for (const name of ['requests', 'responses', 'NativeMessagingHosts']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
  const settings = { schema_version: 'forgeway-mock-native-channel/1', directory: fs.realpathSync(root), extensionId, channelId };
  fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify(settings), { mode: 0o600 });
  const launcher = path.join(settings.directory, 'host.sh');
  fs.writeFileSync(launcher, '#!/bin/sh\nexec ' + quote(process.execPath) + ' ' + quote(fileURLToPath(new URL('./native-host.mjs', import.meta.url))) + ' --directory ' + quote(settings.directory) + ' "$@"\n', { mode: 0o700 });
  const registration = path.join(root, 'NativeMessagingHosts', host + '.json');
  fs.writeFileSync(registration, JSON.stringify({ name: host, description: 'Forgeway project Mock native control', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2), { mode: 0o600 });
  manifest.permissions = [...new Set([...(manifest.permissions || []), 'nativeMessaging', 'alarms'])];
  fs.writeFileSync(path.join(extension, 'native.json'), JSON.stringify({ protocol: PROTOCOL, host, channelId }), { mode: 0o600 });
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { schema_version: settings.schema_version, directory: settings.directory, extension_id: extensionId, registration_manifest: registration, registered: false, browser_changed: false };
}
export function registerNative(flags) {
  const settings = readChannel(one(flags, 'directory'));
  const target = path.resolve(one(flags, 'registration-directory'));
  fs.mkdirSync(target, { mode: 0o700, recursive: true });
  if (fs.lstatSync(target).isSymbolicLink()) throw Error('Native registration directory cannot be a link');
  const name = 'com.forgeway.mock.json';
  const manifest = JSON.parse(fs.readFileSync(path.join(settings.directory, 'NativeMessagingHosts', name)));
  if (manifest.name !== 'com.forgeway.mock' || manifest.path !== path.join(settings.directory, 'host.sh') || JSON.stringify(manifest.allowed_origins) !== JSON.stringify(['chrome-extension://' + settings.extensionId + '/'])) throw Error('Native registration identity mismatch');
  const file = path.join(target, name);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  return { registered: true, registration_manifest: file, extension_id: settings.extensionId, extension_reloaded: false, browser_restarted: false };
}
export async function nativeRequest(directory, type, payload = {}, timeoutMs = 15000) {
  const settings = readChannel(directory);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw Error('Native timeout must be 100–60000 ms');
  const id = randomUUID(), createdAt = Date.now();
  const command = { protocol: PROTOCOL, id, type, createdAt, expiresAt: createdAt + timeoutMs, ...payload };
  const bytes = Buffer.from(JSON.stringify(command));
  const file = path.join(settings.directory, 'requests', createdAt + '-' + id + '.json'), temp = file + '.tmp';
  fs.writeFileSync(temp, bytes, { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file);
  const receipt = path.join(settings.directory, 'responses', id + '.json');
  while (Date.now() < command.expiresAt) {
    if (fs.existsSync(receipt)) {
      const stat = fs.lstatSync(receipt); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw Error('Invalid native receipt file');
      const reply = JSON.parse(fs.readFileSync(receipt)); fs.unlinkSync(receipt);
      if (reply.protocol !== PROTOCOL || reply.id !== id || reply.extensionId !== settings.extensionId) throw Error('Native receipt identity mismatch');
      if (!reply.ok) throw Error(reply.error || 'Native operation rejected');
      return reply.value;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  // Do not retransmit: a command may already have started. A fresh STATUS can reconcile it.
  throw Error('Native request timed out; outcome is not verified. Query native-status before retrying a mutation');
}
export async function nativeCommand(action, flags) {
  if (action === 'native-init') return initNative(flags);
  if (action === 'native-register') return registerNative(flags);
  const directory = one(flags, 'directory'), timeout = flags['timeout-ms'] ? Number(one(flags, 'timeout-ms')) : 15000;
  if (action === 'native-status') return nativeRequest(directory, 'STATUS', {}, timeout);
  const { config } = readMockConfig(one(flags, 'config'));
  const selected = selectMock(config, { projectId: one(flags, 'project'), environmentId: one(flags, 'environment'), scenarioId: one(flags, 'scenario'), url: one(flags, 'url') });
  if (selected.scenario.rules.some(r => r.semantics === 'write' && r.action === 'pass')) throw Error('Native viewing sync cannot permit real writes');
  const scoped = { schemaVersion: 1, projects: [{ ...selected.project, environments: [selected.environment], scenarios: [selected.scenario] }] };
  const expectedHash = semanticDigest(scoped);
  const reply = await nativeRequest(directory, 'SYNC', { config: scoped, expectedHash }, timeout);
  if (reply.config_sha256 !== expectedHash || reply.automatic !== true) throw Error('Native sync did not match actual extension state');
  return reply;
}

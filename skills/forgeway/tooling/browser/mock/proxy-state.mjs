import fs from 'node:fs';
import path from 'node:path';
export const PROXY_VERSION = 'forgeway-mock-proxy/1';
export function readProxyState(directory) {
  const root = path.resolve(directory), file = path.join(root, 'state.json');
  const dir = fs.lstatSync(root), info = fs.lstatSync(file);
  if (!dir.isDirectory() || dir.isSymbolicLink() || info.isSymbolicLink() || !info.isFile() || (dir.mode & 0o077) || (info.mode & 0o077)) throw Error('Proxy session must be a private directory and file');
  const state = JSON.parse(fs.readFileSync(file));
  const endpoint = new URL(state.endpoint);
  if (state.schema_version !== PROXY_VERSION || state.session !== fs.realpathSync(root) || !/^[a-f0-9]{64}$/.test(state.token) || !/^[\w-]{36}$/.test(state.instanceId) || !Number.isSafeInteger(state.pid) || state.pid < 1 || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.pathname !== '/' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['active','stopped'].includes(state.status)) throw Error('Invalid proxy session');
  return state;
}
export function writeProxyState(state) {
  const file = path.join(state.session, 'state.json'), staged = file + '.tmp-' + process.pid;
  try { fs.writeFileSync(staged, JSON.stringify(state), { mode: 0o600, flag: 'wx' }); fs.renameSync(staged, file); }
  finally { if (fs.existsSync(staged)) fs.unlinkSync(staged); }
}

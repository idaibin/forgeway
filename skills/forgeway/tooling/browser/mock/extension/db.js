const opened = new Promise((resolve, reject) => {
  const request = indexedDB.open('tab-mock', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('config');
    request.result.createObjectStore('logs', { keyPath: 'key', autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function transact(storeName, mode, work) {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode); let value;
    try { value = work(tx.objectStore(storeName)); } catch (e) { tx.abort(); reject(e); return; }
    tx.oncomplete = () => resolve(value?.result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('存储事务取消'));
  });
}
export const readConfig = async () => (await transact('config', 'readonly', s => s.get('current'))) || { schemaVersion: 1, projects: [] };
export const writeConfig = value => transact('config', 'readwrite', s => s.put(value, 'current'));
export const readLogs = async () => (await transact('logs', 'readonly', s => s.getAll())).reverse();
export const clearLogs = () => transact('logs', 'readwrite', s => s.clear());
export async function addLog(value) {
  return transact('logs', 'readwrite', store => {
    store.add(value);
    const keys = store.getAllKeys();
    keys.onsuccess = () => { for (const key of keys.result.slice(0, -200)) store.delete(key); };
  });
}

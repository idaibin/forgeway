export function parsePreview(fragment) {
  if (typeof fragment !== 'string' || fragment.length > 128000) throw Error('模拟详情数据无效');
  const value = JSON.parse(decodeURIComponent(fragment.replace(/^#/, '')));
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;
  if (!object(value) || Object.keys(value).some(k => !['title', 'source', 'body', 'fields'].includes(k))
    || !text(value.title, 200) || !text(value.source, 200) || !text(value.body, 20000)) throw Error('模拟详情数据无效');
  const fields = value.fields ?? [];
  if (!Array.isArray(fields) || fields.length > 16 || fields.some(f => !object(f)
    || Object.keys(f).some(k => !['label', 'value'].includes(k))
    || !text(f.label, 80) || !text(f.value, 2000))) throw Error('模拟详情数据无效');
  return { title: value.title, source: value.source, body: value.body, fields };
}

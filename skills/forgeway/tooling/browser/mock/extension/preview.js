import { parsePreview } from './preview-data.mjs';

function render() {
  const elements = Object.fromEntries(['title', 'source', 'fields', 'body', 'error'].map(id => [id, document.getElementById(id)]));
  elements.fields.replaceChildren();
  elements.source.textContent = ''; elements.body.textContent = ''; elements.error.hidden = true;
  try {
    const data = parsePreview(location.hash);
    document.title = data.title + ' · 模拟详情';
    elements.title.textContent = data.title;
    elements.source.textContent = data.source;
    elements.body.textContent = data.body;
    for (const field of data.fields) {
      const label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = field.label; value.textContent = field.value;
      elements.fields.append(label, value);
    }
  } catch {
    elements.title.textContent = '无法显示模拟详情';
    elements.error.textContent = '模拟详情数据无效，请检查项目夹具。';
    elements.error.hidden = false;
  }
}
addEventListener('hashchange', render);
render();

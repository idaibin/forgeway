const element = (id) => document.getElementById(id);
let token = null;
let page = 1;
let total = 0;
let query = "";
let config;
const status = (message) => { element("status").textContent = message; };

async function request(route, method = "GET", body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const result = await fetch(new URL(route, config.apiOrigin), { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: "omit" });
  const header = config.convention.request_id.response_header;
  element("request-id").textContent = header ? result.headers.get(header) ?? "浏览器无法读取" : "未采用";
  const value = await result.json();
  const r = config.convention.response;
  if (!result.ok || value[r.code_field] !== r.success_code) {
    if (result.status === 401 && token) {
      token = null; element("session").hidden = true; element("login").hidden = false;
      element("items").replaceChildren(); element("user").textContent = "";
    }
    throw new Error(value[r.message_field] || "请求失败");
  }
  return value[r.data_field];
}

async function list() {
  const p = config.convention.pagination;
  const params = new URLSearchParams({ [p.page_field]: page, [p.page_size_field]: Math.min(2, p.max_page_size), q: query });
  const data = await request(`/items?${params}`);
  total = data[p.total_field];
  element("items").replaceChildren(...data[p.items_field].map((item) => {
    const li = document.createElement("li"); li.textContent = item.title; return li;
  }));
  element("page").textContent = total ? `第 ${page} 页，共 ${total} 条` : "没有匹配记录";
  element("previous").disabled = page <= 1;
  element("next").disabled = page * Math.min(2, p.max_page_size) >= total;
}

async function perform(action) {
  const buttons = [...document.querySelectorAll("button")];
  const disabled = buttons.map((button) => button.disabled);
  buttons.forEach((button) => { button.disabled = true; });
  status("加载中");
  try { await action(); status(token ? "已登录" : "未登录"); }
  catch (error) { status(error.message); }
  finally {
    buttons.forEach((button, index) => { button.disabled = disabled[index]; });
    if (config) {
      element("previous").disabled = page <= 1;
      element("next").disabled = page * Math.min(2, config.convention.pagination.max_page_size) >= total;
    }
  }
}

element("login").addEventListener("submit", (event) => {
  event.preventDefault();
  void perform(async () => {
    const fields = new FormData(event.currentTarget);
    const auth = await request(config.convention.auth.routes.login, "POST", Object.fromEntries(fields));
    token = auth.accessToken;
    const user = await request(config.convention.auth.routes.me);
    element("user").textContent = `当前用户：${user.name}`;
    element("session").hidden = false; element("login").hidden = true;
    page = 1; await list();
  });
});
element("logout").addEventListener("click", () => void perform(async () => {
  await request(config.convention.auth.routes.logout, "POST"); token = null;
  element("session").hidden = true; element("login").hidden = false;
  element("items").replaceChildren(); element("user").textContent = "";
  element("login").elements.password.value = "";
}));
element("search").addEventListener("submit", (event) => {
  event.preventDefault(); query = new FormData(event.currentTarget).get("query"); page = 1; void perform(list);
});
element("previous").addEventListener("click", () => { page--; void perform(list); });
element("next").addEventListener("click", () => { page++; void perform(list); });

try { config = await (await fetch("/config.json")).json(); }
catch { status("无法加载示例配置"); element("login").querySelector("button").disabled = true; }

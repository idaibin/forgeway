function tokenize(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const current = source[index];
    const next = source[index + 1];
    if (current === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index < 0) break;
    } else if (current === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) break;
      index = end + 2;
    } else if (current === "'" || current === '"' || current === "`") {
      const quote = current;
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\" && index + 1 < source.length) index += 1;
        value += source[index];
        index += 1;
      }
      if (index >= source.length) break;
      if (quote !== "`") tokens.push({ kind: "string", value });
      index += 1;
    } else if (/[A-Za-z_$]/.test(current)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
      tokens.push({ kind: "identifier", value: source.slice(start, index) });
    } else {
      if ("{}[]():,.".includes(current)) tokens.push({ kind: "punctuation", value: current });
      index += 1;
    }
  }
  return tokens;
}

const closing = { "{": "}", "[": "]", "(": ")" };

function match(tokens, start) {
  const expected = closing[tokens[start]?.value];
  if (!expected) return -1;
  const stack = [expected];
  for (let index = start + 1; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (closing[value]) stack.push(closing[value]);
    else if (["}", "]", ")"].includes(value)) {
      if (stack.pop() !== value) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
}

// Reuse the existing balanced-token matcher, but inspect only direct members.
// Identifiers inside values, nested settings or call arguments are not keys.
function directItems(tokens, start) {
  const end = match(tokens, start);
  if (end < 0) return [];
  const items = [];
  for (let index = start + 1; index < end;) {
    const begin = index;
    while (index < end && tokens[index].value !== ",") {
      const nestedEnd = match(tokens, index);
      index = nestedEnd > index ? nestedEnd + 1 : index + 1;
    }
    items.push(tokens.slice(begin, index));
    index += 1;
  }
  return items;
}

function directProperty(tokens, start, name) {
  const item = directItems(tokens, start).findLast(parts =>
    ["identifier", "string"].includes(parts[0]?.kind) && parts[0].value === name &&
    (parts[1]?.value === ":" || (parts.length === 1 && parts[0].kind === "identifier")));
  return item?.[1]?.value === ":" ? item.slice(2) : item;
}

function properties(tokens, start) {
  if (tokens[start]?.value !== "{") return new Map();
  const end = match(tokens, start);
  if (end < 0) return new Map();
  const found = new Map();
  for (let index = start + 1; index < end;) {
    const key = tokens[index];
    if (!key || tokens[index + 1]?.value !== ":" || !["string", "identifier"].includes(key.kind)) {
      index += 1;
      continue;
    }
    const valueStart = index + 2;
    index = valueStart;
    while (index < end && tokens[index].value !== ",") {
      const nestedEnd = match(tokens, index);
      index = nestedEnd > index ? nestedEnd + 1 : index + 1;
    }
    found.set(key.value, tokens.slice(valueStart, index));
    index += 1;
  }
  return found;
}

function joinPath(parent, child) {
  if (child.startsWith("/")) return child;
  return `/${[parent, child].map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/")}`;
}

function importSource(tokens) {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (tokens[index].kind === "identifier" && tokens[index].value === "import" && tokens[index + 1].value === "(" && tokens[index + 2].kind === "string") return tokens[index + 2].value;
  }
  return null;
}

export function extractVueRouterRoutes(contents, { onUnresolved = () => {} } = {}) {
  const tokens = tokenize(contents);
  let hasVueBinding = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "identifier" || token.value !== "import" || tokens[index + 1]?.value !== "{") continue;
    const end = match(tokens, index + 1);
    if (end < 0 || tokens[end + 1]?.value !== "from" ||
        tokens[end + 2]?.kind !== "string" || tokens[end + 2].value !== "vue-router") continue;
    let start = index + 2;
    for (let cursor = start; cursor <= end; cursor += 1) {
      if (cursor !== end && tokens[cursor].value !== ",") continue;
      const specifier = tokens.slice(start, cursor);
      if (specifier[0]?.kind === "identifier" && specifier[0].value === "createRouter") {
        if (specifier.length === 1) hasVueBinding = true;
        else if (specifier.length === 3 && specifier[1].value === "as" && specifier[2].kind === "identifier") {
          // Do not follow aliases without a scope-aware parser. Nor may their
          // imported spelling certify an unrelated local createRouter function.
          onUnresolved({ binding: specifier[2].value,
            reason: "aliased createRouter syntax is not followed by this bounded extractor" });
        }
      }
      start = cursor + 1;
    }
  }
  if (!hasVueBinding) return [];
  // Diagnostics follow the actual direct setting independently of the legacy
  // literal walker. A nested method must neither trigger nor mask a warning.
  const diagnoseArray = (array) => {
    const items = directItems(array, 0);
    if (items.some(item => item.length >= 3 && item.slice(0, 3).every(token => token.kind === "punctuation" && token.value === "."))) {
      onUnresolved({ binding: "route-array", reason: "spread elements inside route arrays are not expanded by this bounded extractor" });
    }
    for (const item of items) {
      if (item[0]?.kind !== "punctuation" || item[0].value !== "{" || match(item, 0) !== item.length - 1) continue;
      const children = directProperty(item, 0, "children");
      if (children?.[0]?.kind === "punctuation" && children[0].value === "[" && match(children, 0) === children.length - 1) diagnoseArray(children);
    }
  };
  const routes = [];
  const visitArray = (start, parentPath = "", parentKey = null, keyPrefix = "") => {
    if (tokens[start]?.value !== "[") return;
    const end = match(tokens, start);
    if (end < 0) return;
    let ordinal = 0;
    for (let index = start + 1; index < end;) {
      if (tokens[index].value !== "{") { index += 1; continue; }
      const objectEnd = match(tokens, index);
      if (objectEnd < 0 || objectEnd > end) return;
      const fields = properties(tokens, index);
      const pathValue = fields.get("path");
      const key = keyPrefix ? `${keyPrefix}.${ordinal}` : String(ordinal);
      if (pathValue?.length === 1 && pathValue[0].kind === "string") {
        const routePath = joinPath(parentPath, pathValue[0].value);
        routes.push({ key, path: routePath, parent_key: parentKey, component_source: importSource(fields.get("component") ?? []) });
        const children = fields.get("children");
        if (children?.[0]?.value === "[") {
          const childTokens = children;
          const childEnd = match(childTokens, 0);
          if (childEnd === childTokens.length - 1) {
            const offset = tokens.indexOf(children[0], index);
            if (offset >= 0) visitArray(offset, routePath, key, key);
          }
        }
      }
      ordinal += 1;
      index = objectEnd + 1;
    }
  };
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (tokens[index].kind !== "identifier" || tokens[index].value !== "createRouter" || tokens[index + 1].value !== "(" || tokens[index + 2].value !== "{") continue;
    const directRoutes = directProperty(tokens, index + 2, "routes");
    if (directRoutes?.[0]?.kind === "punctuation" && directRoutes[0].value === "[" && match(directRoutes, 0) === directRoutes.length - 1) {
      diagnoseArray(directRoutes);
    } else if (directRoutes?.length === 1 && directRoutes[0].kind === "identifier" && !["null", "true", "false"].includes(directRoutes[0].value)) {
      onUnresolved({ binding: directRoutes[0].value, reason: "top-level routes reference or shorthand is not followed by this bounded extractor" });
    }
    const settings = properties(tokens, index + 2);
    const routeTokens = settings.get("routes");
    if (routeTokens?.[0]?.value !== "[") continue;
    const offset = tokens.indexOf(routeTokens[0], index + 2);
    if (offset >= 0) visitArray(offset);
  }
  return routes;
}

import { createHash } from "node:crypto";
import path from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalRepositoryLocator(remote, fallbackName = "repository") {
  const value = String(remote ?? "").trim();
  if (!value) return `local:${path.resolve(String(fallbackName || "repository"))}`;
  const scp = value.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
  if (scp && !value.includes("://")) {
    return `${scp[1].toLowerCase()}/${scp[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "")}`;
  }
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    return `${parsed.hostname.toLowerCase()}/${pathname}`;
  } catch {
    return value.replace(/\.git$/i, "").replace(/\/+$/g, "");
  }
}

export function repositoryIdentity({ supplied, remote, root } = {}) {
  if (supplied) return supplied;
  const locator = canonicalRepositoryLocator(remote, path.resolve(root ?? "."));
  return `repo:${sha256(locator).slice(0, 24)}`;
}

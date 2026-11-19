import { constants, openSync, closeSync, readSync, fstatSync, lstatSync, existsSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sha256, assert } from "./utils.mjs";

const MAX_BYTES = 64 * 1024 * 1024;
const sameIdentity = (left, right) => ["dev", "ino", "size", "mtimeNs", "ctimeNs"].every(key => left[key] === right[key]);
// Called only after an explicit copySnapshot choice. Never open caller paths in
// SQLite. Pin a nonblocking/no-follow descriptor, then verify two stable reads.
export function captureReadSnapshot(filename) {
  assert(typeof filename === "string" && filename !== ":memory:" && !filename.startsWith("file:"), "snapshot requires an explicit file", "DELIVERY_READ_ONLY_INPUT");
  assert(Number.isInteger(constants.O_NOFOLLOW) && Number.isInteger(constants.O_NONBLOCK), "safe snapshot capture is unavailable on this platform", "DELIVERY_READ_ONLY_PLATFORM_UNSUPPORTED");
  const selected = path.resolve(filename);
  const before = lstatSync(selected, { bigint: true });
  assert(before.isFile(), "snapshot input must be a regular non-symlink file", "DELIVERY_READ_ONLY_INPUT");
  const descriptor = openSync(selected, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let owned;
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    assert(opened.isFile() && sameIdentity(before, opened), "snapshot source identity changed", "DELIVERY_READ_ONLY_DRIFT");
    assert(opened.size >= 100n && opened.size <= BigInt(MAX_BYTES), "snapshot byte limit or invalid SQLite file", "DELIVERY_READ_ONLY_INPUT");
    const read = () => {
      const bytes = Buffer.alloc(Number(opened.size) + 1); let length = 0;
      while (length < bytes.length) {
        const count = readSync(descriptor, bytes, length, bytes.length - length, length);
        if (!count) break;
        length += count;
      }
      assert(length === Number(opened.size), "snapshot size changed", "DELIVERY_READ_ONLY_DRIFT");
      return bytes.subarray(0, length);
    };
    const first = read();
    assert(first.subarray(0, 16).equals(Buffer.from("SQLite format 3\0")), "snapshot requires SQLite format", "DELIVERY_READ_ONLY_INPUT");
    const noJournal = () => first[18] === 1 && first[19] === 1 && !["-wal", "-shm", "-journal"].some(suffix => existsSync(selected + suffix));
    assert(noJournal(), "WAL/journal requires a completed host snapshot", "DELIVERY_READ_ONLY_SNAPSHOT_REQUIRED");
    const digest = sha256(first);
    assert(sha256(read()) === digest && sameIdentity(opened, fstatSync(descriptor, { bigint: true })) && sameIdentity(opened, lstatSync(selected, { bigint: true })) && noJournal(), "snapshot source changed during capture", "DELIVERY_READ_ONLY_DRIFT");
    owned = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forgeway-read-snapshot-")));
    const target = path.join(owned, "graph.sqlite");
    writeFileSync(target, first, { flag: "wx", mode: 0o600 });
    return Object.freeze({ filename: target, source_sha256: digest, close: () => rmSync(owned, { recursive: true, force: true }) });
  } catch (cause) { if (owned) rmSync(owned, { recursive: true, force: true }); throw cause; }
  finally { closeSync(descriptor); }
}

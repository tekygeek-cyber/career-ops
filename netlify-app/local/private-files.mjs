import { constants } from "node:fs";
import {
  open,
  mkdir,
  lstat,
  rename,
  unlink,
  readFile,
  chmod,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
// Fail closed on Windows: POSIX mode bits do not enforce Windows ACLs.
export function requirePrivatePlatform() {
  if (process.platform === "win32")
    throw new Error(
      "Run in WSL on a Linux filesystem. Native Windows key storage is not implemented.",
    );
}
export async function privateDir(dir) {
  requirePrivatePlatform();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const s = await lstat(dir);
  if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== process.getuid())
    throw new Error("Unsafe local data directory.");
  await chmod(dir, 0o700);
}
export async function safeRead(file) {
  try {
    const f = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await f.stat();
      if (
        !s.isFile() ||
        s.nlink !== 1 ||
        s.uid !== process.getuid() ||
        s.mode & 0o077
      )
        throw new Error("Local file must be owner-only (chmod 600).");
      return await f.readFile("utf8");
    } finally {
      await f.close();
    }
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export async function privateWrite(file, text) {
  await privateDir(dirname(file));
  try {
    const s = await lstat(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.nlink !== 1 ||
      s.uid !== process.getuid()
    )
      throw new Error("Unsafe local file.");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const temp = join(dirname(file), `.write-${randomUUID()}`);
  const f = await open(
    temp,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await f.writeFile(text);
    await f.sync();
  } finally {
    await f.close();
  }
  try {
    await rename(temp, file);
  } finally {
    await unlink(temp).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export async function readEnv(root) {
  return parse((await safeRead(join(root, ".env"))) || "");
}
function quoteEnv(v) {
  const q = ["'", '"', "`"].find((q) => !v.includes(q));
  if (!q) throw new Error("Unsupported quoting in environment value.");
  return q + v + q;
}
export async function editEnv(root, updates) {
  await privateDir(root);
  const lock = join(root, ".env.lock");
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error("Another key update is in progress.");
    throw e;
  }
  try {
    const values = await readEnv(root);
    for (const [name, value] of Object.entries(updates)) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(name))
        throw new Error("Invalid environment name.");
      if (value === null) delete values[name];
      else {
        if (typeof value !== "string" || /[\r\n\0]/.test(value))
          throw new Error("Invalid environment value.");
        values[name] = value;
      }
    }
    await privateWrite(
      join(root, ".env"),
      Object.entries(values)
        .map(([k, v]) => `${k}=${quoteEnv(v)}`)
        .join("\n") + "\n",
    );
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
export async function readJSON(file, fallback) {
  const raw = await safeRead(file);
  if (raw === null) return fallback;
  return JSON.parse(raw);
}
export const writeJSON = (file, data) =>
  privateWrite(file, JSON.stringify(data, null, 2) + "\n");
export async function expireMail(root, now = Date.now()) {
  const file = join(root, "mail.json");
  const saved = await readJSON(file, null);
  if (saved && (!Number.isFinite(saved.expires) || saved.expires <= now)) {
    await unlink(file);
    return [];
  }
  return saved?.messages || [];
}

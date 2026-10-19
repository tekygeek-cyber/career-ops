import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile);
export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const pin = JSON.parse(
  await readFile(join(appRoot, "career-ops.lock.json"), "utf8"),
);
export const runtime =
  process.env.NODE_ENV === "test" && process.env.CAREER_WORKSPACE_TEST_RUNTIME
    ? resolve(process.env.CAREER_WORKSPACE_TEST_RUNTIME)
    : join(appRoot, ".local-runtime");
export const codeRoot = join(runtime, "career-ops");
export const dataRoot = join(runtime, "data");
export async function verifyPin(root = codeRoot) {
  const options = { cwd: root, timeout: 10000, maxBuffer: 2e6 };
  try {
    const head = (
      await exec("git", ["rev-parse", "HEAD"], options)
    ).stdout.trim();
    const version = (await readFile(join(root, "VERSION"), "utf8"))
      .trim()
      .split(/\s+/)[0];
    const dirty = (
      await exec(
        "git",
        ["status", "--porcelain", "--untracked-files=no"],
        options,
      )
    ).stdout.trim();
    if (head !== pin.commit || version !== pin.version || dirty)
      throw new Error();
  } catch {
    throw new Error(
      "Career Ops version mismatch or modified checkout. Reinstall the pinned runtime.",
    );
  }
  return pin;
}

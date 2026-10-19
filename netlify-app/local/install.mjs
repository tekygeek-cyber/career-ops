import { execFileSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  appRoot,
  runtime,
  codeRoot,
  dataRoot,
  pin,
  verifyPin,
} from "./pin.mjs";
import { privateDir } from "./private-files.mjs";
await privateDir(runtime);
await privateDir(dataRoot);
// Never update an existing checkout implicitly or install latest by a moving tag.
if (!existsSync(join(codeRoot, ".git"))) {
  execFileSync("git", ["init", codeRoot], { stdio: "inherit" });
  execFileSync("git", ["remote", "add", "origin", pin.repository], {
    cwd: codeRoot,
  });
  execFileSync("git", ["fetch", "--depth", "1", "origin", pin.commit], {
    cwd: codeRoot,
    stdio: "inherit",
  });
  execFileSync("git", ["checkout", "--detach", "FETCH_HEAD"], {
    cwd: codeRoot,
    stdio: "inherit",
  });
}
await verifyPin();
// The adapter uses only engine dependencies from this app's committed npm lock.
// Upstream ships no npm lock; do not install its entire unpinned dependency tree.
if (!existsSync(join(codeRoot, "node_modules")))
  symlinkSync(
    join(appRoot, "node_modules"),
    join(codeRoot, "node_modules"),
    "dir",
  );
console.log(
  `Pinned Career Ops ${pin.version} at ${pin.commit}. No plugins enabled and no secrets created.`,
);

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dump } from "js-yaml";
import { providers, provider, validateModel, validateKey } from "./catalog.mjs";
import { codeRoot, dataRoot, appRoot, verifyPin, pin } from "./pin.mjs";
import {
  privateDir,
  privateWrite,
  readJSON,
  writeJSON,
  readEnv,
  editEnv,
  expireMail,
} from "./private-files.mjs";
const settingsFile = join(dataRoot, "settings.json");
const defaults = {
  provider: "openai",
  model: providers[0].model,
  enabled: false,
  mailEnabled: false,
};
export async function settings() {
  const s = await readJSON(settingsFile, defaults);
  provider(s.provider);
  validateModel(s.model);
  return s;
}
export async function publicConfig() {
  const s = await settings(),
    env = await readEnv(dataRoot);
  return {
    local: true,
    pin,
    oauthReady: false,
    canSend: false,
    aiReady:
      s.enabled &&
      (provider(s.provider).local || !!env[provider(s.provider).env]),
    selection: s,
    providers: providers.map(({ id, name, model, local, env: envName }) => ({
      id,
      name,
      model,
      local,
      configured: local || !!env[envName],
    })),
    mailConfigured: !!env.WORKSPACE_GMAIL_REFRESH_TOKEN,
    missing: [],
  };
}
export async function configure({ id, model, key, enabled, clear = false }) {
  const p = provider(id);
  validateModel(model);
  if (enabled !== true && enabled !== false)
    throw new Error("Choose whether to enable this plugin.");
  await verifyPin();
  if (key !== undefined) {
    if (p.local) throw new Error("This local provider does not use a key.");
    validateKey(key);
    await editEnv(dataRoot, { [p.env]: key });
  }
  if (clear) await editEnv(dataRoot, { [p.env]: null });
  const env = await readEnv(dataRoot);
  if (enabled && !clear && !p.local && !env[p.env])
    throw new Error("Missing local key.");
  const s = {
    ...(await settings()),
    provider: id,
    model,
    enabled: enabled && !clear,
  };
  await installPlugins(s);
  await writeJSON(settingsFile, s);
  return publicConfig();
}
export async function configureMail({ enabled, consent, clear = false }) {
  if (enabled && consent !== true)
    throw new Error("Explicit email consent required.");
  await verifyPin();
  if (clear)
    await editEnv(dataRoot, {
      WORKSPACE_GMAIL_CLIENT_ID: null,
      WORKSPACE_GMAIL_CLIENT_SECRET: null,
      WORKSPACE_GMAIL_REFRESH_TOKEN: null,
    });
  const s = { ...(await settings()), mailEnabled: enabled === true && !clear };
  if (!s.mailEnabled)
    await writeJSON(join(dataRoot, "mail.json"), { expires: 0, messages: [] });
  await installPlugins(s);
  await writeJSON(settingsFile, s);
  return publicConfig();
}
export async function installPlugins(s) {
  await verifyPin();
  const template = await readFile(
    join(appRoot, "local/plugin-template.mjs"),
    "utf8",
  );
  const cfg = { plugins: {} };
  const enabled = [
    ...(s.enabled ? [provider(s.provider)] : []),
    ...(s.mailEnabled ? [{ pluginId: "workspace-mail", mail: true }] : []),
  ];
  const { hashPluginTree, readLock, writeLockEntry, consentSurface } =
    await import(pathToFileURL(join(codeRoot, "plugins/_lock.mjs")));
  for (const p of enabled) {
    const dir = join(codeRoot, "plugins.local", p.pluginId);
    await privateDir(dir);
    const manifest = {
      id: p.pluginId,
      version: "1.0.0",
      apiVersion: 1,
      description: p.mail
        ? "Read label-scoped Gmail metadata on explicit request"
        : "Explicit CV drafting through the local workspace",
      hooks: ["notify"],
      humanInTheLoop: true,
      requiredEnv: p.mail
        ? [
            "WORKSPACE_GMAIL_CLIENT_ID",
            "WORKSPACE_GMAIL_CLIENT_SECRET",
            "WORKSPACE_GMAIL_REFRESH_TOKEN",
          ]
        : p.local
          ? []
          : [p.env],
      allowedHosts: p.mail
        ? ["oauth2.googleapis.com", "gmail.googleapis.com"]
        : [new URL(p.base).hostname],
      allowsLocalhost: !!p.local,
    };
    // Existing plugin mutations are not silently overwritten or re-trusted.
    const lock = readLock(codeRoot).plugins[p.pluginId];
    if (lock) {
      const current = hashPluginTree(dir);
      if (current.integrity !== lock.integrity)
        throw new Error(
          "Plugin integrity mismatch. Review the local plugin files before reinstalling.",
        );
      const expectedManifest = JSON.stringify(manifest, null, 2) + "\n";
      if (
        (await readFile(join(dir, "index.mjs"), "utf8")) !== template ||
        (await readFile(join(dir, "manifest.json"), "utf8")) !==
          expectedManifest
      )
        throw new Error(
          "Adapter changed. Explicitly reinstall and review its capabilities.",
        );
    } else {
      await privateWrite(join(dir, "index.mjs"), template);
      await writeJSON(join(dir, "manifest.json"), manifest);
      const tree = hashPluginTree(dir);
      writeLockEntry(codeRoot, p.pluginId, {
        version: "1.0.0",
        source: "local",
        integrity: tree.integrity,
        files: tree.files,
        consent: consentSurface(manifest),
      });
    }
    cfg.plugins[p.pluginId] = {
      enabled: true,
      ...(p.mail ? {} : { provider: p }),
    };
  }
  await privateWrite(join(dataRoot, "config/plugins.yml"), dump(cfg));
}
export async function invoke(pluginId, payload) {
  await verifyPin();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(appRoot, "local/worker.mjs")], {
      cwd: dataRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...(process.env.NODE_ENV === "test"
          ? {
              NODE_ENV: "test",
              CAREER_WORKSPACE_TEST_RUNTIME:
                process.env.CAREER_WORKSPACE_TEST_RUNTIME,
            }
          : {}),
      },
      stdio: ["pipe", "pipe", "ignore"],
      shell: false,
    });
    let output = "",
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Local plugin timed out. No automatic retry was made."));
    }, 45000);
    child.stdout.on("data", (b) => {
      output += b;
      if (Buffer.byteLength(output) > 2e6) {
        child.kill("SIGKILL");
        finish(new Error("Provider response too large."));
      }
    });
    child.on("error", () =>
      finish(new Error("Could not start the local plugin.")),
    );
    child.stdin.on("error", () => {});
    child.on("close", () => {
      try {
        const r = JSON.parse(output);
        if (!r.ok) throw new Error(r.error);
        finish(null, r.result);
      } catch (e) {
        finish(
          new Error(
            e.message && e.message.length < 160 && !e.message.includes("JSON")
              ? e.message
              : "Local plugin returned an invalid response.",
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify({ pluginId, payload }));
  });
}
export async function runAI(payload) {
  const s = await settings(),
    p = provider(s.provider);
  if (!s.enabled || (!p.local && !(await readEnv(dataRoot))[p.env]))
    throw new Error("Plugin disabled or local key missing.");
  await installPlugins(s);
  return invoke(p.pluginId, { ...payload, model: s.model });
}
export async function collectMail(consent) {
  const s = await settings();
  if (!s.mailEnabled || consent !== true)
    throw new Error("Enable email and consent before checking messages.");
  await expireMail(dataRoot);
  await installPlugins(s);
  const result = await invoke("workspace-mail", {
    operation: "mail",
    consent: true,
  });
  await writeJSON(join(dataRoot, "mail.json"), {
    expires: Date.now() + 86400000,
    messages: result.messages,
  });
  return result;
}

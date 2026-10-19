// Explicit opt-in integration suite; never touches the user's normal runtime.
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  symlink,
  readFile,
  writeFile,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
const scratch = await mkdtemp(join(tmpdir(), "career-engine-"));
process.env.NODE_ENV = "test";
process.env.CAREER_WORKSPACE_TEST_RUNTIME = scratch;
const { appRoot, codeRoot, dataRoot, verifyPin, pin } = await import(
  "../local/pin.mjs"
);
const { configure, publicConfig, runAI, configureMail } = await import(
  "../local/bridge.mjs"
);
const { readEnv } = await import("../local/private-files.mjs");
try {
  execFileSync("git", [
    "clone",
    "--no-hardlinks",
    "--quiet",
    join(appRoot, ".local-runtime/career-ops"),
    codeRoot,
  ]);
  await symlink(join(appRoot, "node_modules"), join(codeRoot, "node_modules"));
  await test("pinned checkout matches exact upstream version including VERSION comment", async () => {
    assert.equal((await verifyPin()).commit, pin.commit);
  });
  await test("missing key cannot enable; stored key reuses; clearing removes from .env and disables", async () => {
    await assert.rejects(
      configure({ id: "openai", model: "gpt-4.1-mini", enabled: true }),
      /Missing local key/,
    );
    const key = "test-only-not-a-real-credential";
    let cfg = await configure({
      id: "openai",
      model: "gpt-4.1-mini",
      key,
      enabled: true,
    });
    assert.equal(cfg.aiReady, true);
    assert.ok(!JSON.stringify(cfg).includes(key));
    const yml = await readFile(join(dataRoot, "config/plugins.yml"), "utf8");
    assert.ok(!yml.includes(key));
    cfg = await configure({
      id: "openai",
      model: "gpt-4.1-mini",
      enabled: true,
    });
    assert.equal(cfg.aiReady, true);
    cfg = await configure({
      id: "openai",
      model: "gpt-4.1-mini",
      enabled: false,
      clear: true,
    });
    assert.equal(cfg.aiReady, false);
    assert.equal((await readEnv(dataRoot)).WORKSPACE_OPENAI_API_KEY, undefined);
    await assert.rejects(runAI({ operation: "validate" }), /missing/);
  });
  await test("real upstream engine runs only consented local plugin and returns CV draft", async () => {
    let requests = 0;
    const server = createServer(async (req, res) => {
      requests++;
      assert.equal(req.url, "/v1/chat/completions");
      assert.equal(req.headers.authorization, undefined);
      let body = "";
      for await (const chunk of req) body += chunk;
      assert.equal(JSON.parse(body).model, "test-model");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cv: "Test candidate. Verified experience only. ".repeat(3),
                  summary: "Local fixture only",
                  gaps: [],
                }),
              },
            },
          ],
        }),
      );
    });
    await new Promise((ok, fail) => {
      server.once("error", fail);
      server.listen(11434, "127.0.0.1", ok);
    });
    try {
      await configure({ id: "ollama", model: "test-model", enabled: true });
      const out = await runAI({
        operation: "tailor",
        consent: true,
        cv: "Test candidate",
        jd: "Fixture job",
      });
      assert.match(out.cv, /Test candidate/);
      assert.equal(requests, 1);
      await configure({ id: "ollama", model: "test-model", enabled: false });
      await assert.rejects(
        runAI({ operation: "tailor", consent: true }),
        /disabled/,
      );
      assert.equal(requests, 1);
    } finally {
      await new Promise((ok) => server.close(ok));
    }
  });
  await test("plugin mutation is blocked before execution", async () => {
    await configure({ id: "ollama", model: "test-model", enabled: true });
    await writeFile(
      join(codeRoot, "plugins.local/workspace-ai-ollama/index.mjs"),
      "malicious mutation",
    );
    await assert.rejects(
      configure({ id: "ollama", model: "test-model", enabled: true }),
      /integrity mismatch/,
    );
    await configure({ id: "ollama", model: "test-model", enabled: false });
  });
  await test("email needs consent and clearing removes credentials/cache", async () => {
    await assert.rejects(configureMail({ enabled: true }), /consent/);
    const cfg = await configureMail({ enabled: false, clear: true });
    assert.equal(cfg.selection.mailEnabled, false);
    assert.equal((await stat(join(dataRoot, "mail.json"))).mode & 0o777, 0o600);
  });
  await test("local HTTP requires one-time launch, cookie plus separate capability, and same-origin writes", async () => {
    const { start } = await import("../local/server.mjs");
    let launchURL;
    const log = console.log;
    console.log = (text) => {
      launchURL = text.match(/http:\/\/\S+/)?.[0];
    };
    let server;
    try {
      server = await start(4319);
    } finally {
      console.log = log;
    }
    const origin = "http://127.0.0.1:4319";
    try {
      assert.equal((await fetch(origin + "/api/config")).status, 403);
      const launch = await fetch(launchURL, { redirect: "manual" });
      assert.equal(launch.status, 303);
      const cookie = launch.headers.get("set-cookie").split(";")[0];
      const capability = launch.headers.get("location").split("#unlock=")[1];
      assert.ok(capability && !cookie.includes(capability));
      assert.equal(
        (await fetch(launchURL, { redirect: "manual" })).status,
        403,
      );
      const headers = { Cookie: cookie, "X-Local-Token": capability };
      const html = await (
        await fetch(origin + "/", { headers: { Cookie: cookie } })
      ).text();
      assert.ok(!html.includes(capability));
      assert.equal(
        (await fetch(origin + "/api/config", { headers: { Cookie: cookie } }))
          .status,
        403,
      );
      assert.equal(
        (await (await fetch(origin + "/api/config", { headers })).json()).local,
        true,
      );
      const bad = await fetch(origin + "/api/providers", {
        method: "POST",
        headers: {
          ...headers,
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(bad.status, 403);
      const malformed = await fetch(origin + "/api/tailor", {
        method: "POST",
        headers: {
          ...headers,
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cv: "candidate", jd: "job", consent: false }),
      });
      assert.equal(malformed.status, 400);
    } finally {
      server.closeAllConnections();
      await new Promise((ok) => server.close(ok));
    }
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}

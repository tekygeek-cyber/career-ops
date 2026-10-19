import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  stat,
  writeFile,
  symlink,
  chmod,
  readFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  editEnv,
  readEnv,
  privateWrite,
  safeRead,
  writeJSON,
  expireMail,
} from "../local/private-files.mjs";
import {
  provider,
  providers,
  validateKey,
  validateModel,
} from "../local/catalog.mjs";
import { authorize } from "../local/server.mjs";
import { verifyPin } from "../local/pin.mjs";
import plugin from "../local/plugin-template.mjs";
import { boundedFetch } from "../local/transport.mjs";
const temp = (fn) => async () => {
  const root = await mkdtemp(join(tmpdir(), "career-security-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
test("missing/invalid keys are rejected without writing", () => {
  for (const k of [
    undefined,
    "",
    "short",
    "a".repeat(4097),
    "valid-but-has whitespace",
  ])
    assert.throws(() => validateKey(k));
  assert.equal(
    validateKey("test-only-not-a-real-key"),
    "test-only-not-a-real-key",
  );
  assert.throws(() => provider("unknown"));
  assert.throws(() => validateModel("../secrets"));
  assert.equal(providers.filter((p) => p.kind === "openai").length, 11);
});
test(
  "local .env reuses stored key, updates and clears without touching other providers",
  temp(async (root) => {
    await editEnv(root, {
      WORKSPACE_OPENAI_API_KEY: "test-only-not-a-real-key",
      WORKSPACE_GROQ_API_KEY: "test-only-another-key",
    });
    assert.equal((await stat(join(root, ".env"))).mode & 0o777, 0o600);
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal(
      (await readEnv(root)).WORKSPACE_OPENAI_API_KEY,
      "test-only-not-a-real-key",
    );
    await editEnv(root, {
      WORKSPACE_OPENAI_API_KEY: "test-only-replacement-key",
    });
    await editEnv(root, { WORKSPACE_OPENAI_API_KEY: null });
    const saved = await readEnv(root);
    assert.equal(saved.WORKSPACE_OPENAI_API_KEY, undefined);
    assert.equal(saved.WORKSPACE_GROQ_API_KEY, "test-only-another-key");
  }),
);
test(
  ".env quoting preserves opaque tokens and refuses newline injection",
  temp(async (root) => {
    const token = 'test"quote#dollar$\\backslash';
    await editEnv(root, { WORKSPACE_TEST_KEY: token });
    assert.equal((await readEnv(root)).WORKSPACE_TEST_KEY, token);
    await assert.rejects(editEnv(root, { WORKSPACE_TEST_KEY: "abc\nEVIL=1" }));
    assert.equal((await readEnv(root)).EVIL, undefined);
  }),
);
test(
  "symlink and broadly readable secret files fail closed",
  temp(async (root) => {
    const target = join(root, "outside");
    await writeFile(target, "private", { mode: 0o600 });
    await symlink(target, join(root, ".env"));
    await assert.rejects(readEnv(root));
    await assert.rejects(privateWrite(join(root, ".env"), "overwrite"));
    assert.equal(await readFile(target, "utf8"), "private");
    await rm(join(root, ".env"));
    await writeFile(join(root, ".env"), "A=x", { mode: 0o644 });
    await assert.rejects(readEnv(root));
  }),
);
test("local API rejects DNS rebinding, cross-origin requests, missing capability and form posts", () => {
  const origin = "http://127.0.0.1:4318",
    token = "a".repeat(64),
    valid = {
      method: "POST",
      headers: {
        cookie: "career_local=" + token,
        host: "127.0.0.1:4318",
        origin,
        "x-local-token": token,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
    };
  assert.doesNotThrow(() => authorize(valid, origin, token));
  for (const change of [
    { cookie: "" },
    { host: "evil.example:4318" },
    { origin: "https://hosted.example.netlify.app" },
    { "x-local-token": undefined },
    { "content-type": "application/x-www-form-urlencoded" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.throws(() =>
      authorize(
        { ...valid, headers: { ...valid.headers, ...change } },
        origin,
        token,
      ),
    );
});
test(
  "version mismatch fails before plugin execution",
  temp(async (root) => {
    await assert.rejects(verifyPin(root), /version mismatch/);
  }),
);
test("provider auth failure and rate limit never return provider text or key", async () => {
  for (const [status, message] of [
    [401, "Credential rejected."],
    [429, "Provider rate limit reached. Wait before retrying."],
  ]) {
    const ctx = {
      settings: { provider: provider("openai") },
      env: { WORKSPACE_OPENAI_API_KEY: "test-only-secret" },
      fetch: async () => {
        throw Object.assign(new Error("echo-test-only-secret + personal CV"), {
          status,
        });
      },
    };
    await assert.rejects(
      plugin.notify({ operation: "validate" }, ctx),
      (e) => e.message === message,
    );
  }
});
test("each protocol places credentials in headers and parses its native response", async () => {
  for (const id of ["openai", "anthropic", "gemini"]) {
    const p = provider(id);
    let seen;
    const draft = {
      cv: "Verified candidate CV text ".repeat(5),
      summary: "Draft",
      gaps: [],
    };
    const ctx = {
      settings: { provider: p },
      env: { [p.env]: "test-only-secret" },
      fetch: async (url, options) => {
        seen = { url, options };
        return Response.json(
          id === "anthropic"
            ? { content: [{ type: "text", text: JSON.stringify(draft) }] }
            : id === "gemini"
              ? {
                  candidates: [
                    { content: { parts: [{ text: JSON.stringify(draft) }] } },
                  ],
                }
              : { choices: [{ message: { content: JSON.stringify(draft) } }] },
        );
      },
    };
    const out = await plugin.notify(
      {
        operation: "tailor",
        consent: true,
        cv: "Source only",
        jd: "JD data",
        model: p.model,
      },
      ctx,
    );
    assert.equal(out.cv, draft.cv);
    assert.ok(!seen.url.includes("test-only-secret"));
    assert.ok(!seen.options.body.includes("test-only-secret"));
    assert.equal(
      Object.values(seen.options.headers).includes("test-only-secret") ||
        Object.values(seen.options.headers).includes("Bearer test-only-secret"),
      true,
    );
  }
});
test("generation requires consent and valid document output", async () => {
  const ctx = {
    settings: { provider: provider("ollama") },
    env: {},
    fetch: async () =>
      Response.json({ choices: [{ message: { content: "not JSON" } }] }),
  };
  await assert.rejects(plugin.notify({ operation: "tailor" }, ctx), /consent/);
  await assert.rejects(
    plugin.notify({ operation: "tailor", consent: true, model: "test" }, ctx),
    /invalid CV JSON/,
  );
});
test("email reads one exact label, caps 20, excludes stale records and whitelists headers", async () => {
  let reads = 0;
  const urls = [];
  const ctx = {
    settings: {},
    env: {
      WORKSPACE_GMAIL_CLIENT_ID: "test",
      WORKSPACE_GMAIL_CLIENT_SECRET: "test",
      WORKSPACE_GMAIL_REFRESH_TOKEN: "test",
    },
    fetch: async (url) => {
      urls.push(url);
      if (url.endsWith("/token"))
        return Response.json({
          access_token: "test-only-access",
          scope: "https://www.googleapis.com/auth/gmail.metadata",
        });
      if (url.endsWith("/labels"))
        return Response.json({
          labels: [
            { id: "Label_1", name: "CareerOps" },
            { id: "INBOX", name: "INBOX" },
          ],
        });
      if (url.includes("maxResults"))
        return Response.json({
          messages: Array.from({ length: 30 }, (_, i) => ({ id: "m" + i })),
          nextPageToken: "never-follow",
        });
      reads++;
      return Response.json({
        internalDate: String(
          reads === 1 ? Date.now() - 8 * 86400000 : Date.now(),
        ),
        snippet: "MUST NOT RETAIN",
        payload: {
          body: { data: "MUST NOT RETAIN" },
          headers: [
            { name: "From", value: "sender@example.com" },
            { name: "Subject", value: "Role" },
            { name: "Date", value: "today" },
          ],
        },
      });
    },
  };
  await assert.rejects(plugin.notify({ operation: "mail" }, ctx), /consent/);
  const out = await plugin.notify({ operation: "mail", consent: true }, ctx);
  assert.equal(reads, 20);
  assert.equal(out.messages.length, 19);
  assert.ok(urls.some((u) => u.includes("labelIds=Label_1")));
  assert.ok(
    urls.every(
      (u) =>
        !u.includes("format=full") &&
        !u.includes("q=") &&
        !u.includes("pageToken"),
    ),
  );
  assert.ok(!JSON.stringify(out).includes("MUST NOT RETAIN"));
  assert.deepEqual(Object.keys(out.messages[0]).sort(), [
    "date",
    "from",
    "id",
    "subject",
  ]);
});
test(
  "email cache expires and is owner-only",
  temp(async (root) => {
    const file = join(root, "mail.json");
    await writeJSON(file, { expires: 200, messages: [{ subject: "private" }] });
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await expireMail(root, 100)).length, 1);
    assert.deepEqual(await expireMail(root, 201), []);
    assert.equal(await safeRead(file), null);
  }),
);
test("transport rejects redirects and caps success/error response bodies", async () => {
  let options;
  const fetch = boundedFetch(async (url, opts) => {
    options = opts;
    return new Response("x".repeat(2e6 + 1), { status: 401 });
  });
  await assert.rejects((await fetch("https://example.com")).text(), /limit/);
  assert.equal(options.redirect, "error");
  assert.ok(options.signal instanceof AbortSignal);
});

test("email rejects broad or unverified OAuth scopes before message reads", async () => {
  for (const scope of [
    undefined,
    "https://www.googleapis.com/auth/gmail.readonly",
  ]) {
    let calls = 0;
    const ctx = {
      settings: {},
      env: {},
      fetch: async () => {
        calls++;
        return Response.json({ access_token: "test", scope });
      },
    };
    await assert.rejects(
      plugin.notify({ operation: "mail", consent: true }, ctx),
      /metadata-only/,
    );
    assert.equal(calls, 1);
  }
});

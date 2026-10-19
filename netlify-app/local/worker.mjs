// One fresh process per operation: no stale dotenv cache after key clearing.
import { pathToFileURL } from "node:url";
import { boundedFetch } from "./transport.mjs";
globalThis.fetch = boundedFetch();
import { codeRoot, dataRoot, verifyPin } from "./pin.mjs";
console.log = console.warn = console.error = () => {};
let input = "";
for await (const c of process.stdin) {
  input += c;
  if (input.length > 250000) process.exit(1);
}
try {
  await verifyPin();
  const { pluginId, payload } = JSON.parse(input);
  const { runHook } = await import(
    pathToFileURL(codeRoot + "/plugins/_engine.mjs")
  );
  const rows = await runHook("notify", payload, {
    root: codeRoot,
    dataRoot,
    pluginId,
    timeoutMs: 35000,
  });
  const row = rows.find((x) => x.id === pluginId);
  if (!row?.ok)
    throw new Error(row?.error || "Plugin disabled or local key missing.");
  const secrets = Object.entries(process.env)
    .filter(([k, v]) => k.startsWith("WORKSPACE_") && v && v.length >= 8)
    .map(([, v]) => v);
  const redact = (v) =>
    typeof v === "string"
      ? secrets.reduce((s, key) => s.replaceAll(key, "[redacted]"), v)
      : Array.isArray(v)
        ? v.map(redact)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [k, redact(x)]),
            )
          : v;
  process.stdout.write(
    JSON.stringify({ ok: true, result: redact(row.result) }),
  );
} catch (e) {
  const allowed = [
    "Credential rejected.",
    "Provider rate limit reached. Wait before retrying.",
    "Provider request failed.",
    "Provider connection failed or timed out.",
    "Provider returned invalid CV JSON.",
    "Missing local key.",
    "Gmail metadata-only scope required.",
    "Plugin disabled or local key missing.",
  ];
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: allowed.includes(e.message)
        ? e.message
        : "Local integration failed. Check the pin, plugin consent and local credentials.",
    }),
  );
  process.exitCode = 1;
}

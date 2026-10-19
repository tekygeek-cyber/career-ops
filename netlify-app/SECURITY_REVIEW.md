# Career Ops integration security review — 2026-10-19

## Scope, assumptions and decisions made before implementation

The placeholders in the request refer to the existing `netlify-app` companion
in `tekygeek-cyber/career-ops`, using Node 22.13+, browser JavaScript and Netlify.
The new local-first/privacy requirements take precedence over its earlier hosted
AI/Gmail design. Existing browser data and historical server records must not be
automatically deleted. No real CV, API credential, mailbox or email recipient
was used to test this change. No email was sent.

Supported secret storage is POSIX permissions on Linux/macOS, or WSL on its Linux
filesystem. Native Windows ACLs and OS keychain integration are not implemented;
Windows secret operations fail closed. The threat model trusts the OS account,
reviewed plugin source, browser and installed Node/git. Malware with that user's
permissions, malicious extensions and compromised providers are outside the
protection. A one-time launch capability prevents unauthenticated local HTTP
clients from using configured credentials merely by visiting the port.

## Exact upstream pin and actual interfaces

| Item | Verified value |
| --- | --- |
| Repository | `career-ops-hq/career-ops` |
| Main commit fetched | `0b35a138fffa5335340070c2d13e0c8d1b804a2b` |
| Commit timestamp | 2026-10-19 16:18:46 UTC |
| VERSION | `1.37.0 # x-release-please-version` |
| Latest release tag observed | `career-ops-v1.37.0`, published 2026-10-16 |
| Release target reported by GitHub | `373aba45c4c46f7fea933ecfa36a98d848812378` |
| Fork baseline audited | `0552c763d25ba1aa2bfcd3366c2590a75ba36043` |
| Adapter interface | `plugins/_engine.mjs`: `runHook('notify', payload, {root,dataRoot,pluginId,timeoutMs})`; manifest apiVersion 1 |

The pin is the latest **main commit fetched at review time**, rather than the
older release target. These are different values despite sharing VERSION 1.37.0.
The fork's entire root tree is not silently replaced/merged with upstream;
`career-ops.lock.json` controls an isolated ignored checkout used by this adapter.
Upgrade by reviewing a new upstream SHA/interface, updating that lock, rerunning
the tests and installing a fresh code checkout. Preserve the separate data root;
never delete it as an upgrade shortcut. Runtime startup and each invocation check
HEAD, VERSION (ignoring its release-tool comment), and tracked-file cleanliness.

Audited primary source files at that SHA: `docs/PLUGINS.md`, `plugins/README.md`,
`plugins/_engine.mjs`, `_lock.mjs`, `_net.mjs`, `plugins/gmail/`,
`openai-tailor.mjs`, `openai-eval.mjs`, `web/src/components/config-form.tsx`,
`web/src/lib/clis.ts`, `.gitignore`, `LEGAL_DISCLAIMER.md` and the data contract.

Two assumptions in the request were inaccurate for this exact checkout:

- The React web configuration lists four API-provider choices and its key panel
  is disabled/unwired. The working UI uses installed CLI runtimes. This adapter's
  eleven OpenAI-compatible choices plus Anthropic/Gemini are its own catalog,
  not a claim that upstream ships eleven wired key choices.
- The `provider` plugin hook means a **job source**, not an AI model provider.
  The adapter therefore uses the existing general-purpose **notify hook** for
  explicit AI and email operations. It does not invent a stable upstream LLM
  provider API or bypass its opt-in engine. This is an independent adapter,
  not upstream's evaluation/tailoring/fact-check pipeline.

## Findings, remediation and residual risks

| Severity | Finding at baseline | Implemented response / remaining limit |
| --- | --- | --- |
| High | Hosted AI/Gmail/Blobs processing contradicted requested local execution | Hosted AI, sign-in, collection, sends and writes removed/410. Separate same-origin loopback runtime. Historical blobs retained for migration, not claimed erased. |
| High | Existing companion did not invoke current Career Ops | Exact isolated source pin; engine opt-in/requiredEnv/allowedHosts/integrity gates; real engine fixture test. No canonical tracker integration claimed. |
| High | Browser key storage would expose keys to XSS/extensions and origin storage | No browser persistence, no key-return API. Local transient password input → loopback → 0600 .env; worker only reads declared secrets. Plaintext disk and browser-memory exposure remain. |
| Medium | Legacy Gmail asked for send + full read-only scopes and retained refresh tokens centrally | New local metadata-only token required, explicit enable/check, exact label, 20 headers maximum, seven-day filter. No new sending or full-body reads. Legacy grant revocation remains an owner action. |
| Medium | Historical cloud records had no automatic deletion/retention policy | No new cloud writes. Existing authenticated export/logout preserved; recovery/deletion steps in README. No silent destructive purge. |
| Medium | Upstream guarded fetch can include provider body text in errors and follows redirects; header timeout does not bound response body | Adapter suppresses engine logging; maps status to fixed errors; wraps transport before ctx.fetch with redirects rejected, 30s total fetch/body deadline and 2MB stream limit. Parent worker killed at 45s. |
| Medium | Localhost alone grants other local programs access | One-time launch URL establishes per-boot HttpOnly SameSite cookie; all API reads/writes also require a separate port-isolated capability header, exact Host, same Origin on writes, JSON and fetch-site checks. No CORS. |
| Medium | Browser profile/CV/draft storage is unencrypted and indefinite | Explicit copy/export disclosure and erase control. Browser origin, OS account and disk encryption are boundaries; backups are PII. |
| Low | Dependency/API drift and arbitrary base URLs could change capabilities | Committed npm lock for adapter dependencies; fixed provider endpoints, model identifier validation, no arbitrary URL/command/port supplied by UI. |

No hardcoded production API keys were found in the audited app source. Existing
Netlify variables are server-side, not browser keys; new hosted handlers no
longer consume AI/OAuth credentials. This review is not a full historical git
secret scan, a guarantee against malicious providers, or a legal certification.
Do not paste production keys into issues, commits, screenshots or test fixtures.

## Request/authentication trace after the change

1. Run `npm run local:install`. Git fetches exactly the recorded SHA and detaches
   HEAD. No moving branch/tag is followed at runtime. No plugin is enabled by
   installation. The adapter's lockfile supplies the two engine dependencies;
   upstream's full unpinned npm graph is not installed.
2. `npm run local` serves built files only on `127.0.0.1:4318`. A random one-time
   launch URL is printed intentionally to the user's terminal, never containing
   an API key. Opening it establishes a session cookie and redirects. Restart
   invalidates all prior cookies/capabilities. Never share/tunnel that URL.
3. The one-time launch redirects with a separate fragment capability, immediately
   removed from history and kept in this origin’s sessionStorage for reloads.
   It is a local session token, never a provider key. HTML embeds no capability.
   JS sends `X-Local-Token` to same-origin
   `/api/*`; the HttpOnly cookie is also required. Origin/Host/JSON/fetch-site
   checks reject cross-origin writes, forms, hosted-to-local bridges and DNS
   rebinding hostnames. CSP disallows external scripts, frames and connections.
4. Selection uses a closed provider ID/model; key entry is a masked password
   input with autocomplete disabled. Input format is checked before storage.
   Atomic .env replacement uses a 0600 temporary file, 0700 directories and an
   exclusive edit lock. Symlink/hardlink/foreign-owned files fail closed.
   Settings return presence booleans only. The input is cleared after submission
   and modal close. Clear removes that environment name and disables AI;
   another provider's key is preserved.
5. Saving explicitly enables one `workspace-ai-<id>` plugin. Non-secret YAML
   contains only flags and the fixed provider description. The plugin manifests
   declare one host (or fixed loopback) and that provider's `WORKSPACE_*_API_KEY`.
   Prefixed names are intentional: core-owned OPENAI_API_KEY etc. are reserved
   by the upstream manifest validator. No key lives in plugins.yml.
6. Credential checking is explicit and sends no CV/JD. OpenRouter uses `/key`
   rather than its public model catalog; other providers use a model listing.
   A successful listing is a connection check, not proof of model access,
   spending permission or future validity. Format-only saving is labelled as
   such. 401/403 and 429 are sanitized; no vendor body/credential is echoed.
7. Generation requires a second explicit confirmation. Only the chosen master
   CV and job description are sent, without email messages or the API key in
   the prompt. The local worker calls **upstream runHook**, not the old Netlify
   Chat Completions route. OpenAI-compatible providers use Bearer headers;
   Anthropic uses `x-api-key` + `anthropic-version` and native messages; Gemini
   uses `x-goog-api-key` in headers and native generateContent (never URL keys).
   Ollama and LM Studio are fixed keyless loopback endpoints. Model IDs are
   editable examples, not guaranteed currently available models.
8. Requests are serialized. AI checks/generations share a one-minute local
   throttle; email checks have their own minute gate. There are no paid-call
   automatic retries. Remote limits/quota errors fail safely. A provider's
   Retry-After is not automatically scheduled or retried. The transport aborts
   at 30s, hook wait at 35s, parent kills at 45s, response cap 2MB, input cap
   250KB. Invalid provider JSON/CVs are rejected. Numeric claims are flagged;
   AI output remains untrusted, escaped text requiring human review.
9. Keys are supplied via the worker's local dotenv loading, never argv. Workers
   receive a minimal process environment, suppress stdout/stderr engine logs and
   redact declared WORKSPACE secrets from returned strings. There are no request,
   prompt, key or message logs. Child processes are fresh for each operation so
   clearing/updating a key cannot reuse an old dotenv cache. Plain ESM plugins
   are trusted code, **not a sandbox**; hashes provide tamper evidence, not
   protection from an attacker who can rewrite both code and locks.

## Email collection and data map

| Data | Purpose / transmission | Storage / retention / controls |
| --- | --- | --- |
| Optional profile email, CV, applications, drafts | User-authored workspace and exported CV; selected CV/JD sent only on generation consent | This browser's IndexedDB, unencrypted, until erase/browser cleanup; exports contain PII. No new hosted sync. |
| AI key | Authenticate selected provider over TLS; local models need none | Ignored local .env, 0600; update/clear controls, issuer revocation separate. No database/localStorage/IndexedDB secret storage. |
| Gmail OAuth client + refresh token | Local refresh against Google, metadata-scope check | Local .env only; local clear removes credentials/cache; Google revocation is separate. Access token exists in worker memory only. |
| Gmail ID, From, Subject, Date | User-approved header review from exact CareerOps label, seven days, first 20 max | Local 0600 mail.json, 24h expiry, no pagination; removed on startup/access/periodic minute cleanup while running. Old bytes remain until next start if stopped. UI results are transient and cleared on navigation/new check. |
| Legacy Netlify workspace/tokens/send receipts | Existing deployment migration only | Existing encrypted Blobs, not deleted automatically; export/revoke/admin deletion required. No newly created records from disabled routes. |
| Operational host/provider traffic | Git/npm install, chosen remote inference or Google API calls | Their independent operational policies apply. No app analytics, telemetry, marketing signup, tracking pixels or central collection service added. |

The Gmail metadata scope is still account-wide; label/date/field restrictions
are enforced by this adapter. Refresh responses without an affirmative exclusive
metadata scope are rejected. Headers contain PII and confidential subjects, even
without bodies. Message markup is escaped; messages do not become AI prompts,
trigger applications or change canonical tracker records. Deleting local cache
is not secure disk wiping and does not remove Google messages or backups.
The UI collects no newsletter/marketing email and requires no Google sign-in.
This remains consistent with upstream's no-central-collection design **for new
local operations**. Remote inference is a deliberate exception chosen by the
user; upstream's disclaimer cannot make a remote provider local or remove its
retention obligations. No new app telemetry is introduced.

## Verification and open limits

`npm run check`, `npm test`, `npm run build`, `npm run local:install`,
`npm run test:integration` and `npm audit --omit=dev` are the reproducible checks.
Unit/security fixtures cover missing/invalid keys, reuse/update/clear, file modes,
symlink refusal, malformed model, sanitized auth/rate errors, all three protocol
formats, consent, response bounds, version mismatch, exact-label metadata
minimization, scope refusal and retention. The integration suite uses the actual
pinned upstream engine, disposable git/data roots and a fake local model. It
also checks plugin tampering and absence of keys from public configuration/YAML.
Result: 24 unit/security tests and 6 real-engine/HTTP integration tests passed;
syntax checks and production build passed, and the production dependency audit
reported zero known vulnerabilities at review time.
No real-key provider, Google grant or production mailbox was exercised; no claim
of end-to-end Gmail OAuth operation or successful paid model generation is made.

Open product/operational choices:

- Native Windows ACLs or OS keychain support needs a separate implementation.
- A full local OAuth authorization-code/PKCE onboarding flow and local reviewed
  send workflow remain to be built; this change supports metadata only with
  manually supplied owner credentials. The earlier click-send feature is now
  disabled to honor the new local-first boundary.
- The notify adapter API is pinned to apiVersion 1; future upstream changes must
  be reviewed and tested. It is not a stable upstream LLM-provider extension API.
- Canonical Markdown tracker/CV integration should call upstream's core write
  paths if added. This companion intentionally keeps its separate browser store
  and does not pretend to implement upstream's A–H evaluation/ATS fact checking.
- Decide whether any historical Netlify data/grants exist and should be recovered
  or deleted before removing old hosting secrets. The source audit alone cannot
  certify absence of historical records or logs.

Primary external references checked: upstream source at the exact commit above;
[Google Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[OpenRouter current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key),
[Together chat endpoint](https://docs.together.ai/reference/chat-completions),
[Anthropic model API](https://platform.claude.com/docs/en/api/models/list) and
[Gemini model API](https://ai.google.dev/api/models).

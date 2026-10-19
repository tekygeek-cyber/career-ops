# Career Ops private workspace

An independent browser companion in `tekygeek-cyber/career-ops`. This adapter uses
Node 22.13+, plain browser JavaScript, esbuild, IndexedDB and the pinned upstream
plugin engine. It does not run the complete Career Ops A–H pipeline or write
`data/applications.md`. Application stages and CV versions in this companion
remain separate from the canonical Markdown tracker.

## Run locally

Use macOS/Linux or WSL with the checkout on its Linux filesystem. Native Windows
ACL/keychain support is not implemented and secret operations fail closed there.

```bash
git clone https://github.com/tekygeek-cyber/career-ops.git
cd career-ops/netlify-app
npm ci --ignore-scripts
npm run local:install
npm run local
```

Open the **one-time launch link** printed in the terminal on this computer. It
establishes a per-boot HttpOnly SameSite cookie; do not share the link. This link
contains a random local authorization capability, never your provider key.
The separate local API session capability is stored in port-isolated sessionStorage;
it is never a provider key. Cookies alone cannot authorize API access, including
if another localhost port receives a loopback cookie. Restart the runtime to
invalidate both and issue a new link. The service
binds only `127.0.0.1:4318`. Do not expose it through tunnels, reverse proxies or
LAN interfaces. Use a private OS account and disk encryption.

`local:install` fetches exactly the SHA in `career-ops.lock.json`, checks out a
detached HEAD, and verifies HEAD, VERSION and tracked-file cleanliness. Upstream
ships no npm lockfile at this commit. The adapter uses only the plugin engine,
with `dotenv` and `js-yaml` supplied by **this application's committed npm lock**
through an ignored node_modules link; it does not install the entire upstream
CLI dependency graph. No upstream files, user CVs or trackers are overwritten.

In Settings choose a provider and model, enter a missing key in the password
prompt and explicitly enable that plugin. Leave the key blank to reuse an
existing key. Validate credential contacts the provider's model listing without
a CV; model availability and quota are checked during generation. Clear removes
the selected key and disables AI. Local Ollama/LM Studio choices need an already
running local service and downloaded model, with the model name you enter.

All generated CVs remain drafts requiring human review. Numeric claim checking
is only a limited warning, not factual certification. PDF export transliterates
Latin accents and omits non-Latin characters; review every exported document.

## Local secrets and email

Runtime data is under `netlify-app/.local-runtime/`, ignored by git:

- `data/.env`: API keys and optional Gmail OAuth credentials, mode **0600**.
- `data/config/plugins.yml`: activation and fixed, non-secret provider settings.
- `data/settings.json`: provider/model selection and opt-in flags, no keys.
- `data/mail.json`: at most 20 email headers, mode 0600, expires after 24 hours.
- `career-ops/plugins.local/` and `plugins.lock`: reviewed adapter code and hashes.

Directories are owner-only (0700). `.env` is plaintext protected by file
permissions, **not encrypted or an OS keychain**. Keys necessarily exist briefly
in the password input, local HTTP request and provider authentication header;
none are saved in browser storage or returned in configuration responses.
Browser/OS compromise is outside this protection. Clearing a key does not revoke
it at its issuer or erase disk snapshots, memory copies or backups.

Email is disabled by default. Create a label named `CareerOps` in Gmail and add
only messages you want included. In your own Google OAuth project obtain a
refresh token with **only** `https://www.googleapis.com/auth/gmail.metadata`.
The refreshed response must affirm that scope alone, otherwise reads fail
closed. Existing send/readonly tokens are intentionally rejected. Add these
values to `data/.env` with a local editor; do not paste them into Netlify:

```dotenv
WORKSPACE_GMAIL_CLIENT_ID='your-own-client-id'
WORKSPACE_GMAIL_CLIENT_SECRET='your-own-client-secret'
WORKSPACE_GMAIL_REFRESH_TOKEN='your-own-refresh-token'
```

Then run `chmod 600 .local-runtime/data/.env`, enable email in Settings, and
approve each manual check. Reads are limited to one exact label, at most 20
messages, then filtered locally to seven days. Only ID/From/Subject/Date are
retained. The metadata scope is account-wide at Google; the label restriction is
application enforcement, not an OAuth restriction. No bodies, attachments,
snippets, mailbox pagination or background polling are used. Header cache expiry
runs on startup/access and every minute while the runtime runs; when stopped,
expired bytes remain on disk until next startup. Clear controls remove cache or
local credentials; revoke the grant separately in Google to invalidate it.
OAuth credential acquisition UI and local email sending are **not implemented**.
Application drafts can be copied to your own mail client for manual sending.

## Hosted Netlify mode

Keep production and previews private. Netlify serves the browser workspace;
AI calls, Google sign-in, email collection/sending and cloud writes now return
410. It has no local key input and does not contact localhost. IndexedDB data
stays within this browser origin unless you export or explicitly share it.
Profile email is optional and used only in your own CV/draft workspace.

Any older encrypted Netlify Blob records are **not automatically deleted**.
Authenticated legacy `/api/workspace` reads and `/api/logout` remain for migration
and revocation; keep the original SESSION_SECRET to decrypt old records. Before
removing that secret, an owner with an unexpired legacy session can read/export
`/api/workspace` in the same browser. If its session expired, inspect/export the
Blobs using owner-admin tooling and the original encryption secret; new hosted
sign-in is disabled. Delete old sessions, workspaces, limit and send receipts in
the Netlify owner console after migration if desired. Disabling routes is not
proof that historical cloud data has been erased. Do not rotate/delete the
SESSION_SECRET before recovering any needed data.

Use Export here and Import in the local workspace to migrate browser CVs and
applications. Backups contain PII and email drafts, but never local keys or the
new local email-header cache. Erase this browser workspace clears this origin's
profile, CVs, applications and drafts; keys, other origins and historical server
records have separate controls. No application telemetry is introduced. Hosting
and selected providers can retain operational logs under their own policies.

## Verify

```bash
npm run check
npm test
npm run build
npm run local:install
npm run test:integration
npm audit --omit=dev
```

The integration suite uses a disposable checkout and fake loopback model, never
real keys or mailboxes. Port 11434 must be free for its local-model fixture.
Read [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) for evidence, findings, request
traces, remaining risks and the exact upstream pin.

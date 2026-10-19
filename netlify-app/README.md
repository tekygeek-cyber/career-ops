# Career Ops Workspace for Netlify

A calm, responsive web companion developed inside Pranesh's Career Ops fork.
Original Career Ops is MIT-licensed by Santiago Fernández de Valderrama.
Retain the root LICENSE and upstream attribution when deploying.

## What works

- Upload text-based PDF, DOCX, TXT or Markdown job descriptions and master CVs.
  Extract text in the browser and review it before saving. Scanned PDFs need OCR.
- Save opportunities, search/filter the pipeline, edit application stages,
  record notes, and set a follow-up date.
- Keep immutable CV versions. AI drafts need review; edits create another version.
- Download ATS-readable text PDFs. The built-in PDF font transliterates accents
  and omits non-Latin characters; review exports before sharing.
- Offline/local IndexedDB workspace with JSON import/export; private encrypted
  Netlify Blobs storage after owner-only Google authentication. ETag conditional
  writes prevent silent overwrite across devices. A cloud/local conflict is
  resolved explicitly by the owner, with a backup option.
- Server-side OpenAI tailoring, grounded in the uploaded master CV. Numeric
  differences are flagged, not certified as factual. The owner reviews all claims.
- Review recipient, message, and reviewed PDF before clicking Send in the app.
  Gmail success is recorded as Applied. Idempotency receipts prevent repeated
  delivery for the same send key; ambiguous outcomes are blocked from retry.
- Gmail reply checks on tracked threads every 60 seconds while Conversations is
  visible. An inbound reply advances Applied to Responded only; interviews and
  offers require manual interpretation. No open/read tracking, delivery guarantee,
  background polling, webhook service or full-mailbox import is claimed.

## Important architecture boundary

Upstream https://github.com/career-ops-hq/career-ops is a local CLI workflow, not
an HTTP API. Netlify cannot start a persistent CLI or Go dashboard as a static
website. This directory adds an independent serverless web adapter inside the
fork. It does **not** execute the full upstream A–H evaluation pipeline, job
liveness checks, browser agent, updater, LaTeX pipeline or local file tracker.
The existing CLI and user data are untouched. This web workspace has its own
private store and export format, not the canonical CLI applications.md. Its AI
adapter follows upstream's evidence-first/review-first principles; it is not the
upstream fact-check engine. Local master-CV copies remain labelled untailored.

## Deploy this branch on Netlify

1. Import **your fork**, `tekygeek-cyber/career-ops`, not the upstream repository
   (you need write access to deploy your web adapter). Select branch
   `feature/netlify-career-workspace`. Netlify should read root `netlify.toml`:
   base `netlify-app`, publish `dist`, functions `netlify/functions`, command
   `npm run check && npm test && npm run build`. Root CLI dependencies are not
   installed by this build. Use Node 22.
2. If the existing careeropscenter site is linked elsewhere, change its connected
   repository/branch to the fork and this branch, preserving its chosen domain.
   This code has not changed the existing production site by itself.
3. Add the environment variables in `.env.example` in Netlify's server-side
   environment settings. Set `APP_URL` to the exact HTTPS production origin
   without a path. `ALLOWED_EMAIL` is the single authorised owner account.
   Generate `SESSION_SECRET` with `openssl rand -base64 48`; do not expose it in
   a public build variable or browser bundle. Rotating it invalidates sessions
   AND prevents decryption of existing data, so keep a secure backup.
4. In your own Google Cloud project enable **Gmail API**, configure OAuth consent
   (External, Testing for a private personal app), and add the owner as a test
   user. Create an OAuth Web Application client with authorised redirect URI
   `https://<your-production-domain>/auth/callback`. Set the returned client ID
   and client secret in Netlify. Gmail scopes are `gmail.send` and
   `gmail.readonly`, plus `openid email`. Restricted Gmail scopes can require
   Google verification for wider distribution. Test-mode refresh tokens can
   expire; reconnect when needed. No Google project or consent configuration
   is provisioned by this repository.
5. Add your own `OPENAI_API_KEY` and `OPENAI_MODEL` for a model that supports
   Chat Completions JSON object mode. Generation uses your provider account
   and may incur provider charges. No key means the UI reports setup required.
6. Redeploy, open Settings, connect the authorised Google account, and choose
   whether to keep an existing browser or cloud copy. Check a non-sensitive
   test CV, then send a single test email to yourself and reply to it.
   Verify receipt, attachment and thread detection before applying to employers.

### Access and privacy

The static app shell is publicly accessible; private API data requires an
owner-only server session. Never publish CVs, jobs, generated documents, tokens
or profile details in Git. Local data remains on the shared browser after
Disconnect; use a private device/browser profile. OAuth refresh/access tokens
and cloud workspaces are AES-256-GCM encrypted using SESSION_SECRET. Sessions
expire after seven days. Disconnect revokes the current Google token on a
best-effort basis and removes the current server session; it does not erase
workspace data or other browser sessions. You can also revoke access from
Google Account permissions. Netlify's own build/admin access is a separate
security boundary.

Blobs are namespaced by Netlify CONTEXT so preview data stays separate from
production. OAuth callback is fixed to APP_URL, so test OAuth on production,
not an untrusted deploy-preview URL. Use separate credentials and site for
staging. Do not add other editors to a site containing production secrets
unless you trust them with the private workspace.

### Upstream maintenance

Keep the web app on its feature branch. Updates to upstream are reviewed merges,
not an unattended overwrite of the fork or user data. Run `git fetch upstream`
and inspect upstream changes before merging. Netlify deploys commits pushed
to its selected branch; it does not automatically mirror upstream for you.

## Local checks

```
cd netlify-app
npm ci
npm run check
npm test
npm run build
```

Run Netlify Dev with the configured server environment for complete OAuth/API
integration testing. Pure static hosting supports local intake, profile,
tracking, copies of the master CV, PDF downloads and backup import/export.
Never use production credentials in an untrusted preview.

## Verification status

Syntax checks, ten security/data tests and the bundled production build were
run during implementation. Live OAuth, Blobs, AI and Gmail sends require the
owner's deployment configuration and were not run with real credentials.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { appRoot, dataRoot, runtime, verifyPin } from "./pin.mjs";
import { privateDir, writeJSON, expireMail } from "./private-files.mjs";
import {
  publicConfig,
  configure,
  configureMail,
  runAI,
  collectMail,
} from "./bridge.mjs";
import { numericWarnings } from "../netlify/lib/security.mjs";
function authenticated(req, capability) {
  return (req.headers.cookie || "")
    .split(";")
    .some((c) => c.trim() === "career_local=" + capability);
}
export function authorize(
  req,
  origin,
  capability,
  cookieCapability = capability,
) {
  if (!authenticated(req, cookieCapability))
    throw new Error("Open the one-time local launch link first.");
  if (req.headers.host !== new URL(origin).host)
    throw new Error("Invalid local Host.");
  if (req.headers.origin && req.headers.origin !== origin)
    throw new Error("Cross-origin access denied.");
  if (["cross-site", "same-site"].includes(req.headers["sec-fetch-site"]))
    throw new Error("Cross-site access denied.");
  const token = req.headers["x-local-token"];
  if (
    typeof token !== "string" ||
    token.length !== capability.length ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(capability))
  )
    throw new Error("Open the local workspace to authorize this request.");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    (req.headers.origin !== origin ||
      !req.headers["content-type"]?.startsWith("application/json"))
  )
    throw new Error("A same-origin JSON request is required.");
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 250000) throw new Error("Request too large.");
  }
  return JSON.parse(raw);
}
export async function start(port = 4318) {
  await verifyPin();
  await privateDir(runtime);
  await privateDir(dataRoot);
  await expireMail(dataRoot);
  const origin = `http://127.0.0.1:${port}`,
    capability = randomBytes(32).toString("hex"),
    cookieCapability = randomBytes(32).toString("hex");
  let launch = randomBytes(32).toString("hex");
  const launchURL = origin + "/launch/" + launch;
  let active = false,
    lastAI = 0,
    lastMail = 0;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
    );
    const json = (x, status = 200) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(x));
    };
    try {
      if (req.headers.host !== new URL(origin).host)
        return json({ error: "Invalid local Host." }, 403);
      const path = new URL(req.url, origin).pathname;
      if (path === "/launch/" + launch && launch && req.method === "GET") {
        launch = null;
        res.writeHead(303, {
          "Set-Cookie": `career_local=${cookieCapability}; HttpOnly; SameSite=Strict; Path=/`,
          Location: "/#unlock=" + capability,
        });
        return res.end();
      }
      if (!authenticated(req, cookieCapability)) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "text/plain");
        return res.end(
          "Open the one-time launch link printed by npm run local.",
        );
      }
      if (!path.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(req.method))
          return json({ error: "Method not allowed." }, 405);
        const allowed = {
          "/": "index.html",
          "/index.html": "index.html",
          "/app.js": "app.js",
          "/style.css": "style.css",
          "/favicon.svg": "favicon.svg",
          "/pdf.worker.min.mjs": "pdf.worker.min.mjs",
        };
        const file = allowed[path];
        if (!file) return json({ error: "Not found." }, 404);
        let bytes = await readFile(join(appRoot, "dist", file));
        res.setHeader(
          "Content-Type",
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".css")
              ? "text/css"
              : file.endsWith(".svg")
                ? "image/svg+xml"
                : "text/javascript",
        );
        return res.end(req.method === "HEAD" ? undefined : bytes);
      }
      try {
        authorize(req, origin, capability, cookieCapability);
      } catch (e) {
        return json({ error: e.message }, 403);
      }
      const action = path.slice(5),
        methods = {
          config: "GET",
          session: "GET",
          providers: "POST",
          validate: "POST",
          tailor: "POST",
          mail: "POST",
          "mail-config": "POST",
          "mail-clear": "POST",
        };
      if (!methods[action]) return json({ error: "Not found." }, 404);
      if (req.method !== methods[action])
        return json({ error: "Method not allowed." }, 405);
      if (action === "config") return json(await publicConfig());
      if (action === "session") return json({ user: null });
      if (active)
        return json({ error: "A local operation is already running." }, 429);
      active = true;
      try {
        const b = await body(req);
        if (action === "providers") return json(await configure(b));
        if (action === "mail-config") return json(await configureMail(b));
        if (action === "mail-clear") {
          await writeJSON(join(dataRoot, "mail.json"), {
            expires: 0,
            messages: [],
          });
          return json({ ok: true });
        }
        if (action === "validate") {
          if (Date.now() - lastAI < 60000)
            return json(
              { error: "Wait one minute before another provider request." },
              429,
            );
          lastAI = Date.now();
          return json(await runAI({ operation: "validate" }));
        }
        if (action === "tailor") {
          if (
            b.consent !== true ||
            typeof b.cv !== "string" ||
            b.cv.length < 40 ||
            b.cv.length > 100000 ||
            typeof b.jd !== "string" ||
            b.jd.length < 80 ||
            b.jd.length > 60000
          )
            throw new Error(
              "A CV, full job description and explicit consent are required.",
            );
          if (Date.now() - lastAI < 60000)
            return json(
              { error: "Wait one minute before another provider request." },
              429,
            );
          lastAI = Date.now();
          const out = await runAI({
            operation: "tailor",
            consent: true,
            cv: b.cv,
            jd: b.jd,
          });
          out.analysis.numericWarnings = numericWarnings(b.cv, out.cv);
          return json(out);
        }
        if (action === "mail") {
          if (Date.now() - lastMail < 60000)
            return json(
              { error: "Wait one minute before checking email again." },
              429,
            );
          lastMail = Date.now();
          return json(await collectMail(b.consent));
        }
      } finally {
        active = false;
      }
    } catch (e) {
      const safe = [
        "Gmail metadata-only scope required.",
        "Invalid model identifier.",
        "Missing local key.",
        "Explicit email consent required.",
        "Plugin disabled or local key missing.",
        "Enable email and consent before checking messages.",
        "Credential rejected.",
        "Provider rate limit reached. Wait before retrying.",
        "Provider connection failed or timed out.",
        "Provider request failed.",
        "Provider returned invalid CV JSON.",
        "A CV, full job description and explicit consent are required.",
      ];
      json(
        {
          error:
            safe.includes(e.message) || e.message.startsWith("Enter a key of")
              ? e.message
              : "Local request failed. Check private file permissions, pinned version and plugin consent.",
        },
        400,
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 30;
  const ttl = setInterval(() => expireMail(dataRoot).catch(() => {}), 60000);
  ttl.unref();
  server.on("close", () => clearInterval(ttl));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(`Open this one-time link on this computer: ${launchURL}`);
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await start();

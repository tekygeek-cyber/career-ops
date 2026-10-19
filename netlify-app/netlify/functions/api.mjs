import { json, sameOrigin, unseal, digest, cookie } from "../lib/security.mjs";
import {
  session,
  requireSession,
  store,
  configured,
  fail,
} from "../lib/runtime.mjs";
// Hosted storage is read-only for owners migrating an older deployment.
// No AI calls, OAuth starts, email collection, sends or workspace writes.
export default async function handler(req) {
  try {
    const path = new URL(req.url).pathname.split("/").at(-1),
      method = req.method;
    const allowed = {
      config: ["GET"],
      session: ["GET"],
      workspace: ["GET", "PUT"],
      tailor: ["POST"],
      send: ["POST"],
      replies: ["POST"],
      logout: ["POST"],
    };
    if (!allowed[path]) return json({ error: "Not found" }, 404);
    if (!allowed[path].includes(method))
      return json({ error: "Method not allowed" }, 405);
    if (path === "config") return json(configured());
    if (path === "session") return json({ user: null });
    if (method !== "GET") sameOrigin(req);
    if (!(path === "workspace" && method === "GET") && path !== "logout")
      return json(
        {
          error:
            "Hosted integrations are disabled. Run the local workspace for AI keys and email.",
        },
        410,
      );
    const s = await requireSession(req),
      storage = store();
    if (path === "workspace") {
      const stored = await storage.getWithMetadata(
        "workspaces/" + digest(s.sub),
      );
      const data = stored ? unseal(stored.data) : null;
      if (stored && !data)
        return json(
          {
            error:
              "Restore the original SESSION_SECRET to decrypt the legacy workspace.",
          },
          409,
        );
      return json({ data, etag: stored?.etag || null });
    }
    if (path === "logout") {
      try {
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: s.refreshToken || s.accessToken }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
      await storage.delete(s.key);
      return json({ ok: true }, 200, {
        "Set-Cookie": cookie("__Host-career_session", "", 0),
      });
    }
  } catch (err) {
    return fail(err);
  }
}

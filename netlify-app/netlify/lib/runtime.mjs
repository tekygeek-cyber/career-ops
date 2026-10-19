import { getStore } from "@netlify/blobs";
import {
  cookies,
  digest,
  unseal,
  seal,
  json,
  siteOrigin,
} from "./security.mjs";
export const store = () =>
  getStore({
    name: `career-workspace-${process.env.CONTEXT || "production"}`,
    consistency: "strong",
  });
export async function session(req) {
  const token = cookies(req)["__Host-career_session"];
  if (!token) return null;
  const key = "sessions/" + digest(token),
    raw = await store().get(key);
  const s = raw && unseal(raw);
  if (
    !s ||
    s.expires < Date.now() ||
    s.email.toLowerCase() !== process.env.ALLOWED_EMAIL?.toLowerCase()
  )
    return null;
  return { ...s, key };
}
export async function requireSession(req) {
  const s = await session(req);
  if (!s)
    throw Object.assign(
      new Error("Connect your authorised Google account first."),
      { status: 401 },
    );
  return s;
}
export function fail(err) {
  return json(
    {
      error: err.status
        ? err.message
        : "The service could not complete this request. Check server configuration and try again.",
    },
    err.status || 500,
  );
}
// Hosted deployments deliberately expose no AI, OAuth or collection capability.
export function configured() {
  return {
    local: false,
    browserOnly: true,
    oauthReady: false,
    aiReady: false,
    canSend: false,
    missing: [],
  };
}

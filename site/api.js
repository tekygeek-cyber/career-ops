/* Minimal fetch wrapper for the /api/* Netlify Function */

const BASE = "/api";

let lastErrorShown = 0;

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0, null);
  }
  if (res.status === 204) return null;
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const message = payload?.error || `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, payload);
  }
  return payload;
}

export const API = {
  listApplications: () => api("/applications"),
  getApplication: (id) => api(`/applications/${id}`),
  createApplication: (body) => api("/applications", { method: "POST", body }),
  updateApplication: (id, body) => api(`/applications/${id}`, { method: "PATCH", body }),
  deleteApplication: (id) => api(`/applications/${id}`, { method: "DELETE" }),
  listFollowups: () => api("/followups"),
  createFollowup: (body) => api("/followups", { method: "POST", body }),
  updateFollowup: (id, body) => api(`/followups/${id}`, { method: "PATCH", body }),
  deleteFollowup: (id) => api(`/followups/${id}`, { method: "DELETE" }),
};
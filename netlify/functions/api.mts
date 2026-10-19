import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { applications, followUps } from "../../db/schema.js";
import { eq, asc, desc, and } from "drizzle-orm";

const STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

type App = typeof applications.$inferSelect;

const sanitize = (v, fallback) => {
  if (typeof v !== "string") return fallback;
  return v.trim();
};

const normaliseStatus = (s) => {
  if (typeof s !== "string") return null;
  const clean = s.trim();
  return STATUSES.find((x) => x.toLowerCase() === clean.toLowerCase()) || null;
};

const normaliseDate = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  return v.trim();
};

const normaliseScore = (v) => {
  if (typeof v !== "string" || !v.trim()) return "";
  const s = v.trim().replace(/\/5$/, "");
  const n = parseFloat(s);
  if (Number.isNaN(n) || n < 0 || n > 5) return "";
  return n.toFixed(1) + "/5";
};

function validate(body) {
  if (!body || typeof body !== "object") return "Send a JSON object.";
  if (!body.company || !sanitize(body.company))
    return "Company is required.";
  if (!body.role || !sanitize(body.role)) return "Role is required.";
  if (body.status !== undefined && !normaliseStatus(body.status))
    return `Status must be one of: ${STATUSES.join(", ")}.`;
  return null;
}

function appFields(body) {
  const out = {
    company: sanitize(body.company, ""),
    role: sanitize(body.role, ""),
    location: sanitize(body.location, ""),
    source: sanitize(body.source, ""),
    nextAction: sanitize(body.nextAction, ""),
    notes: sanitize(body.notes, ""),
    status: normaliseStatus(body.status) || "Evaluated",
    score: normaliseScore(body.score),
    url: sanitize(body.url, ""),
    pdf: sanitize(body.pdf, ""),
    report: sanitize(body.report, ""),
    appliedAt: normaliseDate(body.appliedAt),
    followUpAt: normaliseDate(body.followUpAt),
  };
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function listApplications(url) {
  const rows = await db.select().from(applications).orderBy(desc(applications.updatedAt));
  return json(rows);
}

async function getApplication(id) {
  const [row] = await db.select().from(applications).where(eq(applications.id, id));
  if (!row) return json({ error: "Application not found." }, 404);
  const followups = await db
    .select()
    .from(followUps)
    .where(eq(followUps.applicationId, id))
    .orderBy(asc(followUps.dueAt));
  return json({ ...row, followups });
}

async function createApplication(body) {
  const err = validate(body);
  if (err) return json({ error: err }, 400);
  const [row] = await db.insert(applications).values(appFields(body)).returning();
  return json(row, 201);
}

async function updateApplication(id, body) {
  const [existing] = await db.select().from(applications).where(eq(applications.id, id));
  if (!existing) return json({ error: "Application not found." }, 404);
  const err = validate({ ...existing, ...body });
  if (err) return json({ error: err }, 400);
  const next = appFields({ ...existing, ...body });
  const [row] = await db
    .update(applications)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning();
  return json(row);
}

async function deleteApplication(id) {
  const [existing] = await db.select().from(applications).where(eq(applications.id, id));
  if (!existing) return json({ error: "Application not found." }, 404);
  await db.delete(applications).where(eq(applications.id, id));
  return new Response(null, { status: 204 });
}

async function listFollowUps(url) {
  const done = url.searchParams.get("done");
  const whereClause = done === "true" ? eq(followUps.done, true) : done === "false" ? eq(followUps.done, false) : undefined;
  const q = db.select().from(followUps).orderBy(asc(followUps.dueAt));
  const rows = whereClause ? await db.select().from(followUps).where(whereClause).orderBy(asc(followUps.dueAt)) : await q;
  return json(rows);
}

async function createFollowUp(body) {
  if (!body || !normaliseDate(body.dueAt))
    return json({ error: "dueAt must be a valid date (YYYY-MM-DD)." }, 400);
  const appId = Number(body.applicationId);
  if (body.applicationId) {
    if (!Number.isInteger(appId))
      return json({ error: "applicationId must be a number." }, 400);
    const [app] = await db.select().from(applications).where(eq(applications.id, appId));
    if (!app) return json({ error: "Application not found." }, 404);
  }
  const [row] = await db
    .insert(followUps)
    .values({
      applicationId: body.applicationId ? appId : null,
      dueAt: normaliseDate(body.dueAt),
      channel: sanitize(body.channel, "email") || "email",
      note: sanitize(body.note, ""),
    })
    .returning();
  return json(row, 201);
}

async function updateFollowUp(id, body) {
  const [existing] = await db.select().from(followUps).where(eq(followUps.id, id));
  if (!existing) return json({ error: "Follow-up not found." }, 404);
  const patch = {};
  if (body.done !== undefined) patch.done = Boolean(body.done);
  if (body.note !== undefined) patch.note = sanitize(body.note, "");
  if (body.dueAt !== undefined) {
    const d = normaliseDate(body.dueAt);
    if (!d) return json({ error: "dueAt must be a valid date (YYYY-MM-DD)." }, 400);
    patch.dueAt = d;
  }
  const [row] = await db.update(followUps).set(patch).where(eq(followUps.id, id)).returning();
  return json(row);
}

async function deleteFollowUp(id) {
  const [existing] = await db.select().from(followUps).where(eq(followUps.id, id));
  if (!existing) return json({ error: "Follow-up not found." }, 404);
  await db.delete(followUps).where(eq(followUps.id, id));
  return new Response(null, { status: 204 });
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  // Works both when hit directly at /api/* (function route) and via the
  // netlify.toml rewrite to /.netlify/functions/api/* (redirect fallback).
  const rest = /\/api\/(.*)$/.exec(url.pathname)?.[1] || "";
  const parts = rest.split("/").filter(Boolean);
  const [resource, id, sub] = parts;

  try {
    if (resource === "applications") {
      if (req.method === "GET" && !id) return await listApplications(new URL(req.url));
      if (req.method === "POST" && !id)
        return await createApplication(await req.json());
      if (id && !Number.isInteger(Number(id)))
        return json({ error: "Invalid id." }, 400);
      if (req.method === "GET" && id && sub !== "followups")
        return await getApplication(Number(id));
      if (req.method === "PATCH" && id) return await updateApplication(Number(id), await req.json());
      if (req.method === "DELETE" && id) return await deleteApplication(Number(id));
    }

    if (resource === "followups" || (resource === "applications" && id && sub === "followups")) {
      const appId = resource === "applications" ? Number(id) : null;
      if (req.method === "GET" && !id) return await listFollowUps(new URL(req.url));
      if (req.method === "POST" && appId)
        return await createFollowUp({ ...(await req.json()), applicationId: appId });
      if (req.method === "POST" && !id) return await createFollowUp(await req.json());
      if (req.method === "PATCH" && id) return await updateFollowUp(Number(id), await req.json());
      if (req.method === "DELETE" && id) return await deleteFollowUp(Number(id));
    }

    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "Unexpected server error." }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
};
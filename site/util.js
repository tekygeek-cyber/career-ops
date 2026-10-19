export function escapeHTML(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function daysBetween(a, b) {
  const d1 = new Date(`${a}T00:00:00`);
  const d2 = new Date(`${b}T00:00:00`);
  return Math.round((d2 - d1) / 86400000);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* Follow-up cadence — mirrors followup-cadence.mjs */
export const CADENCE = {
  Applied: { first: 7, subsequent: 7, maxFollowups: 2 },
  Responded: { first: 1, subsequent: 3 },
  Interview: { thankyou: 1 },
};

export function suggestFollowUp(app, existingCount = 0) {
  if (!app.appliedAt) return null;
  const c = CADENCE[app.status];
  if (!c) return null;
  if (existingCount >= (c.maxFollowups ?? Infinity)) return null;
  const base = c.subsequent ? Math.max(c.first ?? 0, c.subsequent) : c.thankyou ?? c.first;
  return addDaysISO(app.appliedAt, base);
}

/* el helper: h("div.card", { onclick }, child, child) */
export function h(selector, attrs = {}, ...children) {
  const [tag, ...classes] = selector.split(".");
  const el = document.createElement(tag || "div");
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function relativeDays(iso) {
  const n = daysBetween(iso, todayISO());
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} days`;
}
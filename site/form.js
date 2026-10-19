/* Shared form engine — declarative fields, validation, error surfacing */
import { h, escapeHTML } from "./util.js";
import { STATUSES } from "./status.js";

export const APP_FIELDS = [
  { name: "company", label: "Company", type: "text", required: true, placeholder: "e.g. Siemens AG", half: true },
  { name: "role", label: "Role", type: "text", required: true, placeholder: "e.g. Materials Compliance Specialist", half: true },
  { name: "status", label: "Status", type: "status-select", half: true, hint: "canonical states from templates/states.yml" },
  { name: "score", label: "Score", type: "score", half: true, hint: "optional · 0.0–5.0" },
  { name: "location", label: "Location", type: "text", half: true, placeholder: "e.g. Regensburg, Germany" },
  { name: "source", label: "Source", type: "text", half: true, placeholder: "e.g. Greenhouse, LinkedIn, portal scan" },
  { name: "appliedAt", label: "Application date", type: "date", half: true },
  { name: "followUpAt", label: "Follow-up date", type: "date", half: true },
  { name: "nextAction", label: "Next action", type: "text", placeholder: "e.g. Follow up with recruiter", half: true },
  { name: "url", label: "Job URL", type: "url", half: true, placeholder: "https://…" },
  { name: "pdf", label: "CV PDF", type: "text", half: true, hint: "reference or link to the tailored PDF" },
  { name: "report", label: "Evaluation report", type: "text", half: true, hint: "e.g. reports/003-stoneridge-…md" },
  { name: "notes", label: "Notes", type: "textarea", span: true },
];

function scoreValue(v) {
  return (v || "").replace("/5", "");
}

function fieldInput(f, value) {
  const common = {
    id: `f_${f.name}`,
    name: f.name,
    "aria-labelledby": `l_${f.name}`,
  };
  if (f.type === "textarea") return h("textarea", { ...common, rows: 3 }, value || "");
  if (f.type === "status-select")
    return h(
      "select",
      common,
      ...["", ...STATUSES].map((s) =>
        h("option", { value: s, selected: value === s ? "" : null }, s || "— none —")
      )
    );
  if (f.type === "score")
    return h("input", { ...common, type: "text", inputmode: "decimal", placeholder: "e.g. 3.8/5", value: scoreValue(value) });
  return h("input", { ...common, type: f.type, value: value || "", placeholder: f.placeholder || "" });
}

export function buildForm(fields, initial) {
  const form = h("form", { id: "app-form", novalidate: "", "data-form-kind": fields === APP_FIELDS ? "application" : "generic" });
  for (const f of fields) {
    const wrapClass = f.half ? ".field.half-wrap" : ".field.full-wrap";
    const wrap = h("div" + wrapClass, { style: f.half ? "" : "" });
    const labelEl = h(
      "label",
      { for: `f_${f.name}`, id: `l_${f.name}` },
      f.label + (f.required ? " " : ""),
      f.required ? h("span", { style: "color:var(--danger)", "aria-hidden": "true" }, "*") : null,
      f.hint ? h("span.hint", {}, ` · ${f.hint}`) : null
    );
    const input = fieldInput(f, initial[f.name]);
    wrap.append(labelEl, input);
    form.append(wrap);
  }
  // group halves into rows for layout
  form.querySelectorAll(".half-wrap").forEach((el) => {
    const gridWrap = h("div.form-row");
    el.parentNode.insertBefore(gridWrap, el);
    gridWrap.append(el);
    const next = gridWrap.nextSibling;
    if (next && next.classList?.contains("half-wrap")) {
      gridWrap.append(next);
    }
  });
  // full-span fields should not squeeze beside halves: move trailing fields out of 2-col grids
  return form;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readForm(form, fields) {
  const values = {};
  const errors = {};
  for (const f of fields) {
    const el = form.querySelector(`[name="${f.name}"]`);
    if (!el) continue;
    const raw = String(el.value ?? "").trim();
    switch (f.type) {
      case "text":
      case "textarea": {
        if (f.required && !raw) errors[f.name] = `${f.label} is required.`;
        else values[f.name] = raw;
        break;
      }
      case "date": {
        if (raw && !DATE_RE.test(raw)) errors[f.name] = "Use the date picker (YYYY-MM-DD).";
        else values[f.name] = raw || null;
        break;
      }
      case "status-select":
        values[f.name] = raw || "";
        break;
      case "score": {
        if (!raw) { values[f.name] = ""; break; }
        const n = parseFloat(raw);
        if (Number.isNaN(n) || n < 0 || n > 5)
          errors[f.name] = "Score must be a number from 0.0 to 5.0.";
        else values[f.name] = `${n.toFixed(1)}/5`;
        break;
      }
      case "url": {
        if (!raw) { values[f.name] = ""; break; }
        const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
          const u = new URL(candidate);
          if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
          values[f.name] = u.href;
        } catch {
          errors[f.name] = "Enter a valid URL.";
        }
        break;
      }
      default:
        values[f.name] = raw;
    }
  }
  return { values, errors };
}

export function fieldLabel(f) {
  return `${escapeHTML(f.label)}${f.required ? " *" : ""}`;
}
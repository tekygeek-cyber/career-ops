/* Applications view + shared form/detail modals */
import { API } from "../api.js";
import { STATUSES, STATUS_META, ACTIVE_STATUSES, statusBadge } from "../status.js";
import { escapeHTML, fmtDate, h, todayISO, relativeDays, suggestFollowUp, CADENCE } from "../util.js";
import { toast, confirmDialog, openModal, closeModal, emptyState, errorBanner } from "../ui.js";
import { setPageHead, refreshNavCounts, navigate, state } from "../app.js";
import { buildForm, readForm, APP_FIELDS } from "../form.js";

let lastData = null;

export async function renderApplications(view) {
  setPageHead(
    "Applications",
    "Everything you've evaluated or applied to. Click a row for details, actions and follow-ups.",
    `<button class="btn" id="add-app-btn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Track application
    </button>`
  );
  view.innerHTML = `<div class="skeleton-row" style="width:60%"></div><div class="card"><div class="card-body">${'<div class="skeleton skeleton-row"></div>'.repeat(6)}</div></div>`;

  try {
    lastData = await API.listApplications();
  } catch (err) {
    view.innerHTML = "";
    view.append(errorBanner(err.message, () => renderApplications(view)));
    return;
  }

  document.getElementById("add-app-btn")?.addEventListener("click", () => openApplicationForm());
  paintApplications(view);
}

function paintApplications(view) {
  const apps = lastData || [];
  refreshNavCounts({ applications: apps.length });

const container = h("div");
  const chips = h("div.chip-row", { role: "group", "aria-label": "Filter by status" });
  const counts = { all: apps.length };
  for (const s of STATUSES) counts[s] = apps.filter((a) => a.status === s).length;
  for (const key of ["all", ...STATUSES]) {
    if (key !== "all" && counts[key] === 0) continue;
    const label = key === "all" ? "All" : key;
    chips.append(
      h(
        "button.chip" + (state.statusFilter === key ? ".active" : ""),
        {
          "aria-pressed": String(state.statusFilter === key),
          onclick: () => {
            state.statusFilter = key;
            paintApplications(view);
          },
          html: `${escapeHTML(label)}<span class="chip-n">${counts[key]}</span>`,
        }
      )
    );
  }

  const search = h("input", {
    type: "search",
    placeholder: "Search company, role, notes…",
    value: state.search,
    "aria-label": "Search applications",
    oninput: (e) => {
      state.search = e.target.value;
      paintTableOnly(view);
    },
  });

  const sortSel = h(
    "select",
    {
      "aria-label": "Sort applications",
      onchange: (e) => {
        state.sort = e.target.value;
        paintTableOnly(view);
      },
    },
    ...[
      ["updated_desc", "Recently updated"],
      ["applied_desc", "Application date (newest)"],
      ["company", "Company A–Z"],
      ["score_desc", "Score (high → low)"],
      ["status", "Status"],
    ].map(([v, l]) => h("option", { value: v, selected: state.sort === v ? "" : null }, l))
  );

  const searchBox = h("div.search-box", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' });
  searchBox.append(search);

  container.append(h("div.toolbar", {}, searchBox, sortSel), chips);

  const tableCard = h("div.card");
  container.append(tableCard);
  view.replaceChildren(container);

  paintTable(tableCard, apps);
}

function filteredSorted() {
  let apps = lastData || [];
  if (state.statusFilter !== "all") apps = apps.filter((a) => a.status === state.statusFilter);
  const q = state.search.trim().toLowerCase();
  if (q) {
    apps = apps.filter((a) =>
      [a.company, a.role, a.notes, a.location, a.source].some((f) => (f || "").toLowerCase().includes(q))
    );
  }
  const sorters = {
    updated_desc: (a, b) => cmp(b.updatedAt, a.updatedAt),
    applied_desc: (a, b) => cmp(b.appliedAt, a.appliedAt) || cmp(b.updatedAt, a.updatedAt),
    company: (a, b) => a.company.localeCompare(b.company) || cmp(b.updatedAt, a.updatedAt),
    score_desc: (a, b) => num(b.score) - num(a.score) || cmp(b.updatedAt, a.updatedAt),
    status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.company.localeCompare(b.company),
  };
  return [...apps].sort(sorters[state.sort] || sorters.updated_desc);

  function cmp(x, y) {
    return String(x || "").localeCompare(String(y || ""));
  }
  function num(s) {
    const n = parseFloat((s || "").replace("/5", ""));
    return Number.isNaN(n) ? -1 : n;
  }
}

function paintTableOnly(view) {
  const card = view.querySelector(".card");
  if (card) paintTable(card, lastData || []);
}

function paintTable(card, apps) {
  const rows = filteredSorted();
  card.replaceChildren(
    rows.length === 0 && (lastData || []).length === 0
      ? h("div.card-body", {}, h("div", {
          html: emptyState({
            title: "No applications tracked yet",
            message:
              "Add your first application manually, or load realistic sample data from Settings to see the workspace in action.",
            actionHTML:
              '<button class="btn" data-empty-add>Track application</button> <a class="btn btn-secondary" href="/settings" data-nav-go>Load sample data</a>',
          }),
        }))
      : rows.length === 0
        ? h("div.card-body", {}, h("div", {
            html: emptyState({
              icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
              title: "No match for this filter",
              message: "Try a different search term or clear the status filter.",
              actionHTML: '<button class="btn btn-secondary" data-empty-clear>Clear filters</button>',
            }),
          }))
        : h("div.table-wrap", {}, buildTable(rows))
  );

  card.querySelector("[data-empty-add]")?.addEventListener("click", () => openApplicationForm());
  card.querySelector("[data-nav-go]")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/settings");
  });
  card.querySelector("[data-empty-clear]")?.addEventListener("click", () => {
    state.statusFilter = "all";
    state.search = "";
    paintApplications(document.getElementById("view"));
  });

  function buildTable(rows) {
    const table = h(
      "table.data",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          ["Company & role", "Status", "Score", "Applied", "Follow-up", "Next action"].map((t) => h("th", {}, t))
        )
      )
    );
    const tbody = h("tbody");
    for (const a of rows) {
      const tr = h(
        "tr.row-link",
        {
          tabindex: "0",
          role: "button",
          "aria-label": `Open ${a.company} — ${a.role}`,
          onclick: () => openApplicationDetail(a.id),
          onkeydown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openApplicationDetail(a.id);
            }
          },
        },
        tdCo(a),
        h("td", { "data-label": "Status", html: statusBadge(a.status) }),
        h("td", { "data-label": "Score" }, scoreChip(a.score)),
        h("td", { "data-label": "Applied" }, fmtDate(a.appliedAt)),
        h("td", { "data-label": "Follow-up" }, a.followUpAt ? followCell(a.followUpAt) : h("span.cell-dim", {}, "—")),
        h("td", { "data-label": "Next action" }, a.nextAction ? escapeHTML(a.nextAction) : h("span.cell-dim", {}, "—"))
      );
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  function tdCo(a) {
    return h(
      "td",
      { "data-label": "Company & role" },
      h("div.cell-primary", {}, a.company),
      h("div.cell-sub", {}, a.role)
    );
  }
}

export function scoreChip(score) {
  if (!score) return h("span.cell-dim", {}, "—");
  const n = parseFloat(score);
  const cls = n >= 4 ? "strong" : n <= 2.5 ? "weak" : "";
  return h("span.score-chip" + (cls ? "." + cls : ""), {}, score);
}

function followCell(iso) {
  const rel = relativeDays(iso);
  const overdue = rel.includes("overdue");
  const ok = rel === "today";
  return h(
    "span",
    { style: "display:inline-flex;gap:7px;align-items:center" },
    h("span.dot" + (overdue ? ".late" : ok ? ".soon" : ".ok"), { "aria-hidden": "true" }),
    h("span", {}, fmtDate(iso)),
    h("span.cell-dim", {}, overdue ? rel : "")
  );
}

/* ── Form ──────────────────────────────────────────────── */

export function openApplicationForm(existing, onSaved) {
  const isEdit = Boolean(existing);
  const form = buildForm(APP_FIELDS, existing || {});

  const foot = [
    h("button.btn.btn-secondary", { type: "button", onclick: () => { closeModal(); } }, "Cancel"),
    h("button.btn", { type: "submit", form: "app-form" }, isEdit ? "Save changes" : "Track application"),
  ];

  const { close } = openModal({
    title: isEdit ? `Edit — ${existing.company}` : "Track application",
    body: wrapForm(form),
    footer: foot,
    wide: true,
  });

  function wrapForm(f) {
    const wrapper = h("div");
    wrapper.append(f);
    return wrapper;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { values, errors } = readForm(form, APP_FIELDS);
    const alertEl = form.querySelector(".form-alert");
    if (Object.keys(errors).length) {
      showAlert(form, "Please fix the highlighted fields before saving.");
      markErrors(form, errors);
      return;
    }
    foot[1].disabled = true;
    foot[1].textContent = "Saving…";
    try {
      if (isEdit) {
        await API.updateApplication(existing.id, values);
      } else {
        await API.createApplication(values);
      }
      close();
      toast(isEdit ? "Application updated." : "Application tracked.");
      onSaved?.();
    } catch (err) {
      // Preserve user input: modal stays open, values untouched in DOM.
      foot[1].disabled = false;
      foot[1].textContent = isEdit ? "Save changes" : "Track application";
      showAlert(form, err.message || "Could not save. Please try again.");
    }
  });
}

function showAlert(form, message) {
  let alertEl = form.querySelector(".form-alert");
  if (!alertEl) {
    alertEl = h("div.form-alert", { role: "alert" });
    form.prepend(alertEl);
  }
  alertEl.textContent = message;
}

function markErrors(form, errors) {
  for (const [name, msg] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) continue;
    input.setAttribute("aria-invalid", "true");
    const wrap = input.closest(".field");
    let msgEl = wrap.querySelector(".field-error");
    if (!msgEl) {
      msgEl = h("div.field-error");
      wrap.append(msgEl);
    }
    msgEl.textContent = msg;
    input.addEventListener("input", () => {
      input.removeAttribute("aria-invalid");
      msgEl.textContent = "";
    }, { once: true });
  }
}

/* ── Detail ────────────────────────────────────────────── */

export async function openApplicationDetail(id) {
  let app;
  try {
    app = await API.getApplication(id);
  } catch (err) {
    toast(err.message, "error");
    return;
  }

  const body = h("div");
  body.append(detailSummary(app), detailFollowups(app));
  openModal({
    title: `${app.company} — ${app.role}`,
    body,
    footer: [
      h("button.btn.btn-secondary", {
        onclick: () => {
          closeModal();
          openApplicationForm(app, () => openApplicationDetail(app.id));
        },
      }, "Edit"),
      h("button.btn.btn-danger", {
        onclick: async () => {
          const ok = await confirmDialog(
            `Delete the application for ${app.company} (${app.role})? Its follow-ups will be removed too. This can't be undone.`,
            { title: "Delete application", confirmLabel: "Delete", danger: true }
          );
          if (!ok) return;
          try {
            await API.deleteApplication(app.id);
            closeModal();
            toast("Application deleted.");
            const v = document.getElementById("view");
            if (location.pathname.startsWith("/applications")) {
              lastData = (lastData || []).filter((a) => a.id !== app.id);
              paintApplications(v);
            } else {
              navigate("/", true);
            }
          } catch (err) {
            toast(err.message, "error");
          }
        },
      }, "Delete"),
      h("span.spacer"),
      h("button.btn.btn-secondary", { onclick: () => closeModal() }, "Close"),
    ],
    wide: true,
  });
}

function detailSummary(app) {
  const rows = [];
  const kv = (dt, dd) => rows.push(h("dt", {}, dt), dd);
  kv("Status", h("div", { html: statusBadge(app.status) }));
  if (app.score) kv("Score", scoreChip(app.score));
  if (app.location) kv("Location", app.location);
  if (app.source) kv("Source", app.source);
  kv("Applied", app.appliedAt ? fmtDate(app.appliedAt) : "—");
  if (app.url) kv("Job URL", h("a", { href: app.url, target: "_blank", rel: "noopener noreferrer" }, app.url));
  if (app.pdf) kv("PDF", app.pdf);
  if (app.report) kv("Report", escapeHTML(app.report));
  if (app.nextAction) kv("Next action", app.nextAction);

  const suggested = suggestFollowUp(app, (app.followups || []).length);
  const grid = h(
    "div.drawer-grid",
    {},
    h("div", {}, h("p.section-title", {}, "Details"), h("dl.kv", {}, rows)),
    h(
      "div",
      {},
      h("p.section-title", {}, "Cadence check"),
      cadenceBlock(app, suggested),
      app.notes ? h("div", { style: "margin-top:14px" }, h("p.section-title", {}, "Notes"), h("p.notes-block", {}, app.notes)) : null
    )
  );
  return grid;
}

function cadenceBlock(app, suggested) {
  const meta = CADENCE[app.status];
  if (!app.appliedAt) {
    return h("p.muted", {}, "No application date yet — cadence tracking starts once applied.");
  }
  if (!meta) {
    return h("p.muted", {}, `No follow-up cadence applies to “${app.status}”.`);
  }
  if (suggested) {
    return h(
      "div",
      {},
      h("p.muted", {}, `Cadence for ${app.status}: follow up ${meta.subsequent ?? meta.thankyou} day(s) after last contact.`),
      h("p", { style: "font-size:13.5px;margin:4px 0 0" }, "Suggested next follow-up: ", h("strong", {}, fmtDate(suggested)), " ", h("span.cell-dim", {}, `(${relativeDays(suggested)})`)),
      h("button.btn.btn-sm.btn-secondary.mt", {
        style: "margin-top:8px",
        onclick: (e) => {
          API.createFollowup({ applicationId: app.id, dueAt: suggested, note: "Cadence suggestion" })
            .then(() => { toast("Follow-up added."); openApplicationDetail(app.id); })
            .catch((err) => toast(err.message, "error"));
        },
      }, "Add follow-up on this date")
    );
  }
  return h("p.muted", {}, "Cadence follow-ups are complete for this status.");
}

function detailFollowups(app) {
  const wrap = h("div", { class: "mt" });
  wrap.append(h("p.section-title", {}, "Follow-ups"));
  if (!(app.followups || []).length) {
    wrap.append(h("p.muted", {}, "No follow-ups logged for this application yet."));
    return wrap;
  }
  const list = h("div");
  for (const f of app.followups) {
    const item = h(
      "div.follow-item",
      {},
      h("div.fi-main", {},
        h("div", {}, fmtDate(f.dueAt), " ", h("span.cell-dim", {}, `· ${f.channel || "email"}`), f.done ? " " + statusBadgeDone() : ""),
        f.note ? h("div.fi-sub", {}, f.note) : null
      ),
      h("button.check-btn" + (f.done ? ".done" : ""), {
        "aria-label": f.done ? `Mark follow-up ${fmtDate(f.dueAt)} as pending` : `Mark follow-up ${fmtDate(f.dueAt)} as done`,
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
        onclick: async () => {
          try {
            await API.updateFollowup(f.id, { done: !f.done });
            openApplicationDetail(app.id);
          } catch (err) {
            toast(err.message, "error");
          }
        },
      }),
      h("button.icon-btn", {
        "aria-label": "Delete follow-up",
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
        onclick: async () => {
          const ok = await confirmDialog("Delete this follow-up?", { title: "Delete follow-up", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          try {
            await API.deleteFollowup(f.id);
            openApplicationDetail(app.id);
          } catch (err) {
            toast(err.message, "error");
          }
        },
      })
    );
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function statusBadgeDone() {
  return '<span class="badge badge-offer">Done</span>';
}
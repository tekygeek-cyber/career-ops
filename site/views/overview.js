/* Overview view — the dashboard */
import { API } from "../api.js";
import { STATUSES, STATUS_META, statusBadge } from "../status.js";
import { escapeHTML, fmtDate, h, todayISO, relativeDays } from "../util.js";
import { emptyState, errorBanner, skeletonOverview, toast } from "../ui.js";
import { setPageHead, refreshNavCounts } from "../app.js";
import { openApplicationForm, openApplicationDetail, scoreChip } from "./applications.js";

export async function renderOverview(view) {
  setPageHead(
    "Overview",
    "Your job-search position at a glance — what's active, what needs attention, and what changed recently.",
    `<button class="btn" id="ov-add">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      Track application
    </button>`
  );
  view.innerHTML = skeletonOverview();

  document.getElementById("ov-add")?.addEventListener("click", () =>
    openApplicationForm(null, () => renderOverview(view))
  );

  let apps, follows;
  try {
    [apps, follows] = await Promise.all([API.listApplications(), API.listFollowups()]);
  } catch (err) {
    view.innerHTML = "";
    view.append(errorBanner(err.message, () => renderOverview(view)));
    return;
  }

  refreshNavCounts({ applications: apps.length, followups: follows.filter((f) => !f.done).length });

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = apps.filter((a) => a.status === s).length;
  const active = apps.filter((a) => ["Applied", "Responded", "Interview"].includes(a.status));
  const openFollows = follows.filter((f) => !f.done);
  const due = openFollows.filter((f) => f.dueAt <= todayISO());
  const soon = openFollows.filter((f) => f.dueAt > todayISO()).sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  if (apps.length === 0 && follows.length === 0) {
    view.innerHTML = "";
    view.append(
      h(
        "div.card",
        {},
        h(
          "div.card-body",
          {},
          h("div", {
            html: emptyState({
              icon: '<path d="M4 17l5-9 4 6 3-4 4 7"/><path d="M4 21h16"/>',
              title: "Your pipeline is empty — that's an easy fix",
              message:
                "Career Ops tracks every role you evaluate and apply to, with follow-up cadences so nothing slips. Track your first application, or load realistic sample data from Settings to explore first.",
              actionHTML:
                '<button class="btn" data-empty-add>Track application</button><a class="btn btn-secondary" href="/settings" style="margin-left:8px">Load sample data</a>',
            }),
          })
        )
      )
    );
    view.querySelector("[data-empty-add]").addEventListener("click", () =>
      openApplicationForm(null, () => renderOverview(view))
    );
    view.querySelector("a[href='/settings']").addEventListener("click", (e) => {
      e.preventDefault();
      import("../app.js").then(({ navigate }) => navigate("/settings"));
    });
    return;
  }

  const wrap = h("div");

  wrap.append(
    statGrid(apps.length, active.length, byStatus.Offer, due.length),
    h(
      "div.grid-2",
      {},
      pipelineCard(byStatus),
      followCard(due, soon, apps),
    ),
    recentCard(apps)
  );

  view.replaceChildren(wrap);
}

function statGrid(total, activeN, offers, dueN) {
  const stats = [
    {
      label: "Tracked applications",
      value: total,
      meta: "all time",
      icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    },
    {
      label: "Active pipeline",
      value: activeN,
      meta: "applied · responded · interview",
      icon: '<path d="M4 17l5-9 4 6 3-4 4 7"/>',
    },
    {
      label: "Offers",
      value: offers,
      meta: "status = Offer",
      icon: '<path d="M20 13V7H4v6"/><path d="M4 13h16v6H4z"/>',
    },
    {
      label: "Follow-ups due",
      value: dueN,
      meta: "open or overdue",
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    },
  ];
  const grid = h("div.stat-grid");
  for (const s of stats) {
    grid.append(
      h(
        "div.stat-card",
        {},
        h("div.stat-label", {
          html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>`,
        }, s.label),
        h("div.stat-value", {}, String(s.value)),
        h("div.stat-meta", {}, s.meta)
      )
    );
  }
  return grid;
}

function pipelineCard(byStatus) {
  const max = Math.max(1, ...Object.values(byStatus));
  const card = h(
    "div.card",
    {},
    h(
      "div.card-head",
      {},
      h("h2", {}, "Pipeline by status"),
      h("span.card-hint", {}, "canonical states · templates/states.yml")
    )
  );
  const body = h("div.card-body");
  for (const s of STATUSES) {
    const n = byStatus[s];
    const fillCls =
      s === "Offer" ? "good" : s === "Rejected" ? "bad" : s === "Interview" ? "warn" : s === "Applied" ? "" : "dim";
    const row = h(
      "div.bar-row",
      {},
      h("span.bar-label", {}, s),
      h("div.bar-track", {}, n ? h("div.bar-fill." + fillCls, { style: `width:${(n / max) * 100}%` }) : null),
      h("span.bar-count", {}, String(n))
    );
    row.title = STATUS_META[s].desc;
    body.append(row);
  }
  card.append(body);
  return card;
}

function followCard(due, soon, apps) {
  const card = h(
    "div.card",
    {},
    h(
      "div.card-head",
      {},
      h("h2", {}, "Follow-ups next"),
      h(
        "a.text-link",
        { href: "/followups", style: "font-size:12.5px" },
        "View all"
      )
    )
  );
  const body = h("div.card-body");
  const items = [...due, ...soon].slice(0, 5);
  if (!items.length) {
    body.append(
      h("p.muted", { style: "margin:0" }, "Nothing scheduled. Follow-ups you add to applications appear here, ordered by due date.")
    );
  } else {
    const appById = new Map(apps.map((a) => [a.id, a]));
    for (const f of items) {
      const app = appById.get(f.applicationId);
      const overdue = f.dueAt < todayISO();
      const item = h(
        "div.follow-item",
        {},
        h("button.check-btn", {
          "aria-label": `Mark follow-up on ${fmtDate(f.dueAt)} as done`,
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
          onclick: async () => {
            try {
              await API.updateFollowup(f.id, { done: true });
              toast("Follow-up completed.");
              renderOverview(document.getElementById("view"));
            } catch (err) {
              toast(err.message, "error");
            }
          },
        }),
        h(
          "div.fi-main",
          {},
          h("div", {}, app ? h("a", { href: "/applications", onclick: (e) => { e.preventDefault(); import("../app.js").then(({ navigate }) => navigate("/applications")); } }, escapeHTML(app.company)) : h("span", {}, "Unlinked")),
          h("div.fi-sub", {}, `${fmtDate(f.dueAt)} · ${relativeDays(f.dueAt)}${f.note ? " · " + escapeHTML(f.note) : ""}`)
        )
      );
      body.append(item);
    }
  }
  card.append(body);
  return card;
}

function recentCard(apps) {
  const card = h(
    "div.card",
    {},
    h("div.card-head", {}, h("h2", {}, "Recently updated applications"), h("a.text-link", { href: "/applications", style: "font-size:12.5px" }, "View all"))
  );
  const recent = [...apps].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).slice(0, 6);
  if (!recent.length) return card;
  const rows = h("div.table-wrap");
  const table = h("table.data", {}, h("thead", {}, h("tr", {}, ["Company & role", "Status", "Score", "Updated"].map((t) => h("th", {}, t)))));
  const tbody = h("tbody");
  for (const a of recent) {
    tbody.append(
      h(
        "tr.row-link",
        {
          tabindex: "0",
          role: "button",
          "aria-label": `Open ${a.company}`,
          onclick: () => openApplicationDetail(a.id),
          onkeydown: (e) => {
            if (e.key === "Enter") openApplicationDetail(a.id);
          },
        },
        h("td", { "data-label": "Company & role" }, h("div.cell-primary", {}, a.company), h("div.cell-sub", {}, a.role)),
        h("td", { "data-label": "Status", html: statusBadge(a.status) }),
        h("td", { "data-label": "Score" }, scoreChip(a.score)),
        h("td", { "data-label": "Updated" }, new Date(a.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))
      )
    );
  }
  table.append(tbody);
  rows.append(table);
  card.append(rows);
  return card;
}
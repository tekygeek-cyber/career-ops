/* Follow-ups view */
import { API } from "../api.js";
import { escapeHTML, fmtDate, h, todayISO, relativeDays } from "../util.js";
import { toast, confirmDialog, emptyState, errorBanner, openModal } from "../ui.js";
import { setPageHead, refreshNavCounts } from "../app.js";
import { openApplicationDetail } from "./applications.js";

export async function renderFollowups(view) {
  setPageHead(
    "Follow-ups",
    "Scheduled touches on active applications. The detail view suggests dates based on the cadence rules from followup-cadence.mjs.",
    `<button class="btn" id="fu-add">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      New follow-up
    </button>`
  );
  view.innerHTML = '<div class="card"><div class="card-body">' + '<div class="skeleton skeleton-row"></div>'.repeat(5) + "</div></div>";

  let apps, follows;
  try {
    [apps, follows] = await Promise.all([API.listApplications(), API.listFollowups()]);
  } catch (err) {
    view.innerHTML = "";
    view.append(errorBanner(err.message, () => renderFollowups(view)));
    return;
  }

  document.getElementById("fu-add")?.addEventListener("click", () => openFollowupForm(apps, () => renderFollowups(view)));
  refreshNavCounts({ applications: apps.length, followups: follows.filter((f) => !f.done).length });

  const appById = new Map(apps.map((a) => [a.id, a]));
  const open = follows.filter((f) => !f.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = follows.filter((f) => f.done).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const overdue = open.filter((f) => f.dueAt < todayISO());
  const dueToday = open.filter((f) => f.dueAt === todayISO());
  const upcoming = open.filter((f) => f.dueAt > todayISO());
  const unlinked = follows.filter((f) => f.applicationId && !appById.has(f.applicationId));

  const wrap = h("div");
  const groups =
    overdue.length || dueToday.length || upcoming.length || done.length
      ? [
          ["Overdue", overdue, "late"],
          ["Due today", dueToday, "soon"],
          ["Upcoming", upcoming, "ok"],
          ["Completed", done, "done"],
        ]
      : [];

  if (follows.length === 0) {
    wrap.append(
      h(
        "div.card",
        {},
        h(
          "div.card-body",
          {},
          h("div", {
            html: emptyState({
              icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
              title: "No follow-ups yet",
              message:
                "Follow-ups keep your pipeline moving — recruiters expect a nudge about a week after you apply. Create one manually, or open an application and use the cadence suggestion.",
              actionHTML: '<button class="btn" data-empty-fu>New follow-up</button>',
            }),
          })
        )
      )
    );
    wrap.querySelector("[data-empty-fu]").addEventListener("click", () => openFollowupForm(apps, () => renderFollowups(view)));
  } else {
    for (const [title, items, tone] of groups) {
      if (!items.length) continue;
      wrap.append(
        h(
          "div.card.mb",
          {},
          h("div.card-head", {}, h("h2", {}, title), h("span.card-hint", {}, `${items.length}`)),
          h("div.card-body", {}, followList(items, appById, tone, unlinked))
        )
      );
    }
    if (unlinked.length) {
      wrap.append(h("p.muted", {}, `${unlinked.length} follow-up(s) reference an application that no longer exists and are hidden from the lists above.`));
    }
  }

  view.replaceChildren(wrap);
}

function followList(items, appById, tone) {
  const list = h("div");
  for (const f of items) {
    const app = appById.get(f.applicationId);
    list.append(
      h(
        "div.follow-item",
        {},
        h("button.check-btn" + (f.done ? ".done" : ""), {
          "aria-label": f.done ? `Mark follow-up ${fmtDate(f.dueAt)} as pending` : `Mark follow-up ${fmtDate(f.dueAt)} as done`,
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
          onclick: async () => {
            try {
              await API.updateFollowup(f.id, { done: !f.done });
              toast(f.done ? "Follow-up reopened." : "Follow-up completed.");
              renderFollowups(document.getElementById("view"));
            } catch (err) {
              toast(err.message, "error");
            }
          },
        }),
        h(
          "div.fi-main",
          {},
          h(
            "div",
            {},
            app
              ? h(
                  "a.text-link",
                  {
                    href: "/applications",
                    onclick: (e) => {
                      e.preventDefault();
                      openApplicationDetail(app.id);
                    },
                  },
                  `${app.company} — ${app.role}`
                )
              : h("span", {}, "Unlinked application")
          ),
          h("div.fi-sub", {}, `${fmtDate(f.dueAt)} · ${f.done ? "completed" : relativeDays(f.dueAt)} · ${escapeHTML(f.channel || "email")}${f.note ? " · " + escapeHTML(f.note) : ""}`)
        ),
        h("button.icon-btn", {
          "aria-label": "Delete follow-up",
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
          onclick: async () => {
            const ok = await confirmDialog("Delete this follow-up?", { title: "Delete follow-up", confirmLabel: "Delete", danger: true });
            if (!ok) return;
            try {
              await API.deleteFollowup(f.id);
              renderFollowups(document.getElementById("view"));
            } catch (err) {
              toast(err.message, "error");
            }
          },
        })
      )
    );
  }
  return list;
}

function openFollowupForm(apps, onSaved) {
  const linkable = apps.filter((a) => ["Applied", "Responded", "Interview"].includes(a.status));
  const form = h("form", { novalidate: "" });

  const appSelect = h(
    "select",
    { name: "applicationId", id: "fu_app", required: "" },
    h("option", { value: "" }, "— none (general follow-up) —"),
    ...linkable.map((a) => h("option", { value: a.id }, `${a.company} — ${a.role}`))
  );
  const quickDate = h("input", { type: "date", name: "dueAt", value: todayISO() });
  const channel = h("select", { name: "channel" }, ...["email", "call", "LinkedIn", "other"].map((c) => h("option", { value: c }, c)));
  const note = h("textarea", { name: "note", rows: 2, placeholder: "Optional context — who you contacted, what you asked…" });

  form.append(
    fieldWrap("Linked application", appSelect, "Link to an application so the follow-up shows its context."),
    fieldWrap("Due date", quickDate, ""),
    fieldWrap("Channel", channel, ""),
    fieldWrap("Note", note, "")
  );

  const foot = [
    h("button.btn.btn-secondary", { type: "button" }, "Cancel"),
    h("button.btn", { type: "submit" }, "Add follow-up"),
  ];

  const m = openModal({ title: "New follow-up", body: form, footer: foot });
  foot[0].addEventListener("click", m.close);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dueAt = quickDate.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) {
      toast("Pick a valid due date.", "error");
      return;
    }
    const payload = {
      dueAt,
      channel: channel.value,
      note: note.value.trim(),
      applicationId: appSelect.value ? Number(appSelect.value) : null,
    };
    foot[1].disabled = true;
    try {
      await API.createFollowup(payload);
      m.close();
      toast("Follow-up added.");
      onSaved?.();
    } catch (err) {
      foot[1].disabled = false;
      toast(err.message, "error");
    }
  });
}

function fieldWrap(label, input, hint) {
  const id = input.name;
  const wrap = h("div.field");
  const lab = h("label", { for: id }, label);
  if (hint) lab.append(h("span.hint", {}, ` · ${hint}`));
  wrap.append(lab, input);
  return wrap;
}
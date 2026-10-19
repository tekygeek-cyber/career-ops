/* Settings view — data management + status glossary.
   Portals/keywords scanning lives in the CLI (scan.mjs + portals.yml);
   nothing here invents scanner controls that don't exist server-side. */
import { API } from "../api.js";
import { STATUSES, STATUS_META } from "../status.js";
import { h } from "../util.js";
import { toast, confirmDialog } from "../ui.js";
import { setPageHead } from "../app.js";

const SAMPLE = [
  {
    company: "Nordwind Automotive",
    role: "Materials Compliance Specialist",
    status: "Applied",
    score: "4.1/5",
    location: "Hamburg, Germany",
    source: "Greenhouse",
    appliedAt: iso(-9),
    followUpAt: iso(2),
    nextAction: "Wait for schoolter response, then nudge recruiter",
    url: "https://example.com/careers/nordwind-4102",
    notes: "Sample data — delete any time. REACH/RoHS match is strong; IMDS experience highlighted in cover letter.",
  },
  {
    company: "Helios Battery Systems",
    role: "Product Compliance Engineer",
    status: "Responded",
    score: "3.6/5",
    location: "Munich, Germany (Hybrid)",
    source: "LinkedIn",
    appliedAt: iso(14),
    followUpAt: iso(-2),
    nextAction: "Reply to HR scheduling call",
    url: "https://example.com/jobs/helios-88",
    notes: "Sample data — delete any time. Recruiter replied 4 days after application; phone screen scheduled.",
  },
  {
    company: "Baltic Polymers",
    role: "Regulatory Affairs Coordinator",
    status: "Evaluated",
    score: "2.8/5",
    location: "Gdańsk, Poland",
    source: "Portal scan",
    nextAction: "Decide whether to apply — chemical registration focus",
    notes: "Sample data — delete any time. Evaluated but not applied: role leans toward REACH dossiers rather than IMDS.",
  },
  {
    company: "Meridian Aerospace",
    role: "IMDS Engineer",
    status: "Interview",
    score: "4.6/5",
    location: "Toulouse, France",
    source: "Careers page",
    appliedAt: iso(21),
    followUpAt: iso(-1),
    nextAction: "Prepare technical panel answers",
    url: "https://example.com/jobs/meridian-imds",
    notes: "Sample data — delete any time. Tech screen done; panel interview next Tuesday.",
  },
  {
    company: "Vantage Rail Systems",
    role: "Substance Compliance Analyst",
    status: "Rejected",
    score: "3.2/5",
    location: "Birmingham, UK",
    source: "Lever",
    appliedAt: iso(30),
    notes: "Sample data — delete any time. Auto-rejection after 2 weeks; no feedback requested yet.",
  },
  {
    company: "Lakeside Consulting",
    role: "ESG Compliance Analyst",
    status: "SKIP",
    score: "2.0/5",
    location: "Amsterdam, Netherlands",
    source: "Referral",
    nextAction: "None — keep on monitor list",
    notes: "Sample data — delete any time. Consultancy reselling, not a direct employer.",
  },
];

const SAMPLE_FOLLOWUPS = [
  { company: "Nordwind Automotive", dueAt: iso(2), channel: "email", note: "Recruiter nudge (cadence: 7 days)" },
  { company: "Meridian Aerospace", dueAt: iso(-1), channel: "call", note: "Panel scheduling call" },
];

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function renderSettings(view) {
  setPageHead(
    "Settings",
    "Workspace data lives in your site's Netlify Database — created, updated and deleted from this interface.",
    ""
  );
  view.replaceChildren(settingsBody());
}

function settingsBody() {
  const wrap = h("div");

  wrap.append(dataCard(), glossaryCard(), aboutCard());
  return wrap;
}

function dataCard() {
  const card = h(
    "div.card.mb",
    {},
    h("div.card-head", {}, h("h2", {}, "Data"), h("span.card-hint", {}, "clearly-labelled demo/sample operations"))
  );
  const body = h("div.card-body");

  body.append(
    h("p", {
      style: "font-size:13.5px;color:var(--slate-700);margin:0 0 10px;max-width:70ch",
    }, "The workspace starts empty — nothing is invented for you. The sample data below is ", h("em", {}, "clearly labelled"), " realistic placeholder content you can delete at any time from the Applications view. It is never presented as real pipeline information.")
  );

  const row = h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:14px" });

  row.append(
    h(
      "button.btn.btn-secondary",
      {
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const existing = new Set((await API.listApplications()).map((a) => `${a.company}::${a.role}`));
            let added = 0;
            for (const s of SAMPLE) {
              if (existing.has(`${s.company}::${s.role}`)) continue;
              await API.createApplication(s);
              added++;
            }
            const apps = await API.listApplications();
            const byCo = new Map(apps.map((a) => [a.company, a.id]));
            for (const f of SAMPLE_FOLLOWUPS) {
              const appId = byCo.get(f.company);
              if (!appId) continue;
              await API.createFollowup({ applicationId: appId, dueAt: f.dueAt, channel: f.channel, note: f.note });
            }
            toast(added ? `Sample data loaded (${added} applications).` : "Sample applications already present — added follow-ups only.");
          } catch (err) {
            toast(err.message, "error");
          } finally {
            btn.disabled = false;
          }
        },
      },
      "Load sample data"
    ),
    h(
      "button.btn.btn-secondary",
      {
        onclick: async () => {
          const ok = await confirmDialog(
            "Delete ALL applications and follow-ups in this workspace? This is destructive and cannot be undone.",
            { title: "Clear workspace", confirmLabel: "Delete everything", danger: true }
          );
          if (!ok) return;
          try {
            const [apps, fus] = await Promise.all([API.listApplications(), API.listFollowups()]);
            for (const f of fus) await API.deleteFollowup(f.id);
            for (const a of apps) await API.deleteApplication(a.id);
            toast("Workspace cleared.");
          } catch (err) {
            toast(err.message, "error");
          }
        },
      },
      "Clear workspace"
    )
  );

  body.append(row);

  card.append(body);
  return card;
}

function glossaryCard() {
  const card = h(
    "div.card.mb",
    {},
    h("div.card-head", {}, h("h2", {}, "Status glossary"), h("span.card-hint", {}, "mirrors templates/states.yml — single source of truth"))
  );
  const table = h("table.data", {}, h("thead", {}, h("tr", {}, ["Status", "Meaning", "Follow-up cadence"].map((t) => h("th", {}, t)))));
  const tbody = h("tbody");
  const cadence = {
    Applied: "7 days after applying, then weekly (max 2)",
    Responded: "1 day after reply, then every 3 days",
    Interview: "Thank-you within 1 day",
  };
  for (const s of STATUSES) {
    tbody.append(
      h(
        "tr",
        {},
        h("td", { "data-label": "Status", html: `<span class="badge ${STATUS_META[s].cls}">${s}</span>` }),
        h("td", { "data-label": "Meaning" }, STATUS_META[s].desc),
        h("td", { "data-label": "Cadence" }, cadence[s] ? h("span", {}, cadence[s]) : h("span.cell-dim", {}, "—"))
      )
    );
  }
  table.append(tbody);
  card.append(h("div.table-wrap", {}, table));
  return card;
}

function aboutCard() {
  const card = h("div.card", {}, h("div.card-head", {}, h("h2", {}, "About this workspace")));
  const body = h("div.card-body");
  body.append(
    h("dl.kv", { style: "grid-template-columns:170px 1fr" },
      h("dt", {}, "Frontend"), h("dd", {}, "Static SPA (no build step) served from /site"),
      h("dt", {}, "Backend"), h("dd", {}, "Netlify Function at /api/* backed by Netlify Database (Postgres + Drizzle ORM)"),
      h("dt", {}, "Status model"), h("dd", {}, "templates/states.yml — the same canonical statuses the pipeline scripts read and write"),
      h("dt", {}, "Cadence rules"), h("dd", {}, "Mirrored from followup-cadence.mjs (applied: 7 days ×2, responded: 1 day / 3 days, interview: 1-day thank-you)"),
      h("dt", {}, "Out of scope"), h("dd", {}, "CV generation, portal scanning and offer evaluation remain CLI-driven (generate-pdf.mjs, scan.mjs); this workspace tracks the resulting pipeline")
    )
  );
  card.append(body);
  return card;
}
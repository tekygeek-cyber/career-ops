/* Canonical statuses — mirrors templates/states.yml */
import { escapeHTML } from "./util.js";

export const STATUSES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Interview",
  "Offer",
  "Rejected",
  "Discarded",
  "SKIP",
];

export const STATUS_META = {
  Evaluated: { cls: "badge-evaluated", desc: "Evaluated with report, pending decision" },
  Applied: { cls: "badge-applied", desc: "Application submitted" },
  Responded: { cls: "badge-responded", desc: "Company has responded (not yet interview)" },
  Interview: { cls: "badge-interview", desc: "Active interview process" },
  Offer: { cls: "badge-offer", desc: "Offer received" },
  Rejected: { cls: "badge-rejected", desc: "Rejected by company" },
  Discarded: { cls: "badge-discarded", desc: "Discarded by candidate or offer closed" },
  SKIP: { cls: "badge-skip", desc: "Doesn't fit, don't apply" },
};

export const ACTIVE_STATUSES = ["Applied", "Responded", "Interview"];

export function statusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.Evaluated;
  return `<span class="badge ${meta.cls}">${escapeHTML(status)}</span>`;
}
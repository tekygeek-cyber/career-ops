/* UI primitives — toasts, modals, confirm dialogs */
import { escapeHTML, h } from "./util.js";

export function toast(message, kind = "info") {
  const root = document.getElementById("toast-root");
  const icon =
    kind === "error"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 7 10 17l-5-5"/></svg>';
  const el = h(
    "div.toast" + (kind === "error" ? ".error" : ""),
    { role: "status", html: `${icon}<div>${escapeHTML(message)}</div>` }
  );
  root.append(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, kind === "error" ? 6000 : 3600);
}

let openEscapeHandler = null;

export function closeModal() {
  const root = document.getElementById("modal-root");
  root.innerHTML = "";
  document.body.style.overflow = "";
  if (openEscapeHandler) {
    document.removeEventListener("keydown", openEscapeHandler);
    openEscapeHandler = null;
  }
}

/* openModal({ title, body: HTMLElement, footer: HTMLElement[] , wide }) */
export function openModal({ title, body, footer = [], wide = false, onClose }) {
  closeModal();
  const root = document.getElementById("modal-root");
  const backdrop = h("div.modal-backdrop", {
    role: "presentation",
    onclick: (e) => {
      if (e.target === backdrop) { closeModal(); onClose?.(); }
    },
  });
  const modalEl = h(
    "div.modal" + (wide ? ".wide" : ""),
    { role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div.modal-head", {}, h("h2", {}, title),
      h("button.icon-btn", {
        "aria-label": "Close dialog",
        onclick: () => { closeModal(); onClose?.(); },
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
      })
    ),
    h("div.modal-body", {}, body),
    footer.length ? h("div.modal-foot", {}, footer) : null
  );
  backdrop.append(modalEl);
  root.append(backdrop);
  document.body.style.overflow = "hidden";

  openEscapeHandler = (e) => {
    if (e.key === "Escape") { closeModal(); onClose?.(); }
  };
  document.addEventListener("keydown", openEscapeHandler);

  // focus first focusable
  const first = modalEl.querySelector("input, select, textarea, button:not(.icon-btn)");
  (first || modalEl.querySelector("button"))?.focus();

  return { close: () => { closeModal(); onClose?.(); }, element: modalEl };
}

/* confirmDialog(message, { title, confirmLabel, danger }) → Promise<boolean> */
export function confirmDialog(message, { title = "Are you sure?", confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const foot = [
      h("button.btn.btn-secondary", { onclick: () => { closeModal(); resolve(false); } }, "Cancel"),
      h(
        "button.btn" + (danger ? ".btn-danger" : ""),
        {
          onclick: () => { closeModal(); resolve(true); },
        },
        confirmLabel
      ),
    ];
    const { element } = openModal({
      title,
      body: h("p", { style: "margin:0;font-size:14px;color:var(--slate-700);line-height:1.6" }, message),
      footer: foot,
    });
    // focus confirm button
    setTimeout(() => foot[1].focus(), 0);
    void element;
  });
}

export function emptyState({ icon = '<rect x="3" y="4" width="18" height="16" rx="2"/>', title, message, actionHTML = "" }) {
  return `
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
      ${actionHTML}
    </div>`;
}

export function errorBanner(message, onRetry) {
  const el = h("div.error-banner", {
    role: "alert",
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/></svg>',
  });
  el.append(h("span", {}, message));
  if (onRetry) el.append(h("button.btn.btn-sm.btn-secondary", { onclick: onRetry }, "Retry"));
  return el;
}

export function skeletonOverview() {
  return `
    <div class="stat-grid">
      ${'<div class="skeleton skeleton-card"></div>'.repeat(4)}
    </div>
    <div class="card mb"><div class="card-body">
      ${'<div class="skeleton skeleton-row"></div>'.repeat(5)}
    </div></div>`;
}
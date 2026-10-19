/* Career Ops — SPA (no build step) */
import { api, API } from "./api.js";
import { h, escapeHTML, fmtDate, todayISO } from "./util.js";
import { toast, confirmDialog, openModal, closeModal } from "./ui.js";
import { STATUS_META, STATUSES, statusBadge } from "./status.js";
import { renderOverview } from "./views/overview.js";
import { renderApplications } from "./views/applications.js";
import { renderFollowups } from "./views/followups.js";
import { renderSettings } from "./views/settings.js";

const routes = {
  "/": renderOverview,
  "/applications": renderApplications,
  "/followups": renderFollowups,
  "/settings": renderSettings,
};

const navIcons = {
  "/": '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/>',
  "/applications": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  "/followups": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  "/settings": '<circle cx="12" cy="12" r="3.2"/><path d="M4 12H2m20 0h-2M12 4V2m0 20v-2m5.7-9.3 1.4-1.4M4.9 19.1l1.4-1.4m11.4 1.4-1.4-1.4M4.9 4.9l1.4 1.4"/>',
};

const state = {
  statusFilter: "all",
  search: "",
  sort: "updated_desc",
};

let navCountCache = { applications: 0, followups: 0 };

function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <button class="visually-hidden" data-skip-link>跳到主内容</button>
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l5-9 4 6 3-4 4 7"/><path d="M4 21h16"/></svg>
        </div>
        <div>
          <div class="brand-name">Career Ops</div>
          <div class="brand-sub">Job search command center</div>
        </div>
      </div>
      <nav class="nav-group" aria-label="Sections">
        <div class="nav-label">Workspace</div>
        <a class="nav-link" href="/" data-nav="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${navIcons["/"]}</svg>Overview</a>
        <a class="nav-link" href="/applications" data-nav="/applications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${navIcons["/applications"]}</svg>Applications<span class="nav-count" data-count="applications"></span></a>
        <a class="nav-link" href="/followups" data-nav="/followups"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${navIcons["/followups"]}</svg>Follow-ups<span class="nav-count" data-count="followups"></span></a>
        <div class="nav-label" style="margin-top:14px">Configure</div>
        <a class="nav-link" href="/settings" data-nav="/settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${navIcons["/settings"]}</svg>Settings</a>
      </nav>
      <div class="sidebar-foot">
        <strong>career-ops</strong> · local workspace<br />
        Data stored in Netlify DB.
      </div>
    </aside>
    <div class="main" id="main">
      <div class="mobile-topbar">
        <button class="menu-btn" id="menu-btn" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
        <div class="brand-name">Career Ops</div>
      </div>
      <main id="view" tabindex="-1"></main>
    </div>`;
  // Wire nav
  app.querySelectorAll("[data-nav]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.getAttribute("href"));
      closeSidebar();
    });
  });
  // Mobile menu
  const menuBtn = app.querySelector("#menu-btn");
  const sidebar = app.querySelector("#sidebar");
  menuBtn.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      const backdrop = document.createElement("button");
      backdrop.className = "nav-backdrop";
      backdrop.setAttribute("aria-label", "Close navigation");
      backdrop.addEventListener("click", closeSidebar);
      document.body.appendChild(backdrop);
    } else {
      removeBackdrop();
    }
  });
  // Skip link
  const skip = app.querySelector("[data-skip-link]");
  skip.textContent = "Skip to main content";
  skip.className = "visually-hidden skip-visible-on-focus";
  skip.addEventListener("click", () => {
    document.getElementById("view").setAttribute("tabindex", "-1");
    document.getElementById("view").focus();
  });
}

function removeBackdrop() {
  document.querySelectorAll(".nav-backdrop").forEach((b) => b.remove());
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const menuBtn = document.getElementById("menu-btn");
  if (sidebar && menuBtn) {
    sidebar.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  removeBackdrop();
}

function setActiveNav(path) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const isActive = a.dataset.nav === path || (path !== "/" && a.dataset.nav !== "/" && path.startsWith(a.dataset.nav));
    a.classList.toggle("active", isActive);
  });
}

export function navigate(path, replace = false) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  route();
}

export function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const page = routes[path] || routes[path + "/"];
  setActiveNav(path);
  const view = document.getElementById("view");
  if (!page) {
    view.innerHTML = `
      <div class="card" style="margin-top:26px">
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.5 2.5 0 1 1 3.4 2.3c-.7.3-.9.8-.9 1.6"/><circle cx="12" cy="16.6" r="0.3" fill="currentColor"/></svg>
          <h3>Page not found</h3>
          <p>The page <code>${escapeHTML(path)}</code> doesn't exist in this workspace.</p>
          <button class="btn btn-secondary" data-home>Back to Overview</button>
        </div>
      </div>`;
    view.querySelector("[data-home]").addEventListener("click", () => navigate("/", true));
    return;
  }
  page(view);
  closeSidebar();
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

export function refreshNavCounts(counts) {
  if (counts) navCountCache = { ...navCountCache, ...counts };
  const app = document.querySelector('[data-count="applications"]');
  const fu = document.querySelector('[data-count="followups"]');
  if (app) app.textContent = navCountCache.applications || "";
  if (fu) fu.textContent = navCountCache.followups || "";
}

export function setPageHead(title, desc, actionsHTML = "") {
  const existing = document.querySelector(".page-head");
  if (existing) existing.remove();
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = `
    <div>
      <h1>${title}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ""}
    </div>
    ${actionsHTML ? `<div class="page-actions">${actionsHTML}</div>` : ""}`;
  const main = document.getElementById("main");
  main.insertBefore(head, main.querySelector("#view"));
}

export { state, routes };

// Boot
renderShell();
window.addEventListener("popstate", route);
window.addEventListener("routechange", route);
route();

// Global helpers for inline handlers
window.CO = { navigate };

/* util import re-export used by views */
export { h, escapeHTML, fmtDate, api, STATUS_META, STATUSES, statusBadge, toast, confirmDialog, openModal, closeModal };
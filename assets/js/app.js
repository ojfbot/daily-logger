// src/frontend/data.ts
var BASE = document.querySelector('meta[name="baseurl"]')?.content ?? "/daily-logger";
var cache = {};
async function fetchJSON(path) {
  if (cache[path]) return cache[path];
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const data = await res.json();
  cache[path] = data;
  return data;
}
async function getEntries() {
  return fetchJSON("/api/entries.json");
}
async function getTags() {
  return fetchJSON("/api/tags.json");
}
async function getRepos() {
  return fetchJSON("/api/repos.json");
}

// src/frontend/theme.ts
var STORAGE_KEY = "daily-logger-theme";
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  }
  const btn = document.querySelector(".theme-toggle");
  if (btn) {
    updateLabel(btn);
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const isDark = current === "dark" || !current && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(STORAGE_KEY, next);
      updateLabel(btn);
    });
  }
}
function updateLabel(btn) {
  const current = document.documentElement.getAttribute("data-theme");
  const isDark = current === "dark" || !current && window.matchMedia("(prefers-color-scheme: dark)").matches;
  btn.textContent = isDark ? "LIGHT" : "DARK";
}

// src/frontend/filter.ts
var activeFilters = /* @__PURE__ */ new Map();
var onFilterChange = null;
function initFilters(callback) {
  onFilterChange = callback;
  loadFromHash();
  window.addEventListener("hashchange", () => {
    loadFromHash();
    onFilterChange?.();
  });
}
function loadFromHash() {
  activeFilters = /* @__PURE__ */ new Map();
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  for (const part of hash.split("&")) {
    const [key, value] = part.split("=");
    if (key && value) {
      if (!activeFilters.has(key)) activeFilters.set(key, /* @__PURE__ */ new Set());
      for (const v of value.split(",")) {
        activeFilters.get(key).add(decodeURIComponent(v));
      }
    }
  }
}
function saveToHash() {
  const parts = [];
  for (const [type, names] of activeFilters) {
    if (names.size > 0) {
      parts.push(`${type}=${[...names].map(encodeURIComponent).join(",")}`);
    }
  }
  const newHash = parts.join("&");
  if (newHash) {
    history.replaceState(null, "", `#${newHash}`);
  } else {
    history.replaceState(null, "", window.location.pathname);
  }
}
function toggleFilter(type, name) {
  if (!activeFilters.has(type)) activeFilters.set(type, /* @__PURE__ */ new Set());
  const set = activeFilters.get(type);
  if (set.has(name)) {
    set.delete(name);
    if (set.size === 0) activeFilters.delete(type);
  } else {
    set.add(name);
  }
  saveToHash();
  onFilterChange?.();
}
function clearFilters() {
  activeFilters = /* @__PURE__ */ new Map();
  saveToHash();
  onFilterChange?.();
}
function isFilterActive(type, name) {
  return activeFilters.get(type)?.has(name) ?? false;
}
function hasActiveFilters() {
  return activeFilters.size > 0;
}
function matchesFilters(entry) {
  if (activeFilters.size === 0) return true;
  for (const [filterType, filterNames] of activeFilters) {
    const entryTagNames = entry.tags.filter((t) => t.type === filterType).map((t) => t.name);
    const candidates = filterType === "repo" ? [...entryTagNames, ...entry.reposActive ?? []] : entryTagNames;
    const hasMatch = [...filterNames].some((name) => candidates.includes(name));
    if (!hasMatch) return false;
  }
  return true;
}
function getActiveFilters() {
  return activeFilters;
}

// src/frontend/search.ts
var BASE2 = document.querySelector('meta[name="baseurl"]')?.content ?? "/daily-logger";
var entries = [];
var overlay = null;
var input = null;
var resultsList = null;
function initSearch(entriesData) {
  entries = entriesData;
  overlay = document.querySelector(".search-overlay");
  input = document.querySelector(".search-input");
  resultsList = document.querySelector(".search-results");
  if (!overlay || !input || !resultsList) return;
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      openSearch();
    }
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      closeSearch();
    }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSearch();
  });
  input.addEventListener("input", () => {
    renderResults(input.value.trim().toLowerCase());
  });
}
function openSearch() {
  overlay.classList.add("open");
  input.value = "";
  input.focus();
  renderResults("");
}
function closeSearch() {
  overlay.classList.remove("open");
}
function renderResults(query) {
  resultsList.innerHTML = "";
  if (!query) {
    for (const entry of entries.slice(0, 5)) {
      resultsList.appendChild(makeResult(entry));
    }
    return;
  }
  const matches = entries.filter((e) => {
    const haystack = [
      e.title,
      e.summary,
      ...e.tags.map((t) => t.name),
      ...(e.decisions ?? []).map((d) => d.title)
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  if (matches.length === 0) {
    resultsList.innerHTML = '<div class="search-result" style="color:var(--text-secondary)">No results</div>';
    return;
  }
  for (const entry of matches.slice(0, 10)) {
    resultsList.appendChild(makeResult(entry));
  }
}
function makeResult(entry) {
  const div = document.createElement("div");
  div.className = "search-result";
  div.innerHTML = `<div class="search-result-date">${entry.date}</div><div>${entry.title}</div>`;
  div.addEventListener("click", () => {
    window.location.href = `${BASE2}/articles/${entry.date}/`;
    closeSearch();
  });
  return div;
}

// src/frontend/render.ts
var BASE3 = document.querySelector('meta[name="baseurl"]')?.content ?? "/daily-logger";
function renderMetrics(container, entries2) {
  const totalEntries = entries2.length;
  const allRepos = new Set(entries2.flatMap((e) => e.reposActive ?? []));
  const allActions = entries2.reduce((sum, e) => sum + (e.actions?.length ?? 0), 0);
  let streak = 0;
  if (entries2.length > 0) {
    const sorted = [...entries2].sort((a, b) => b.date.localeCompare(a.date));
    let checkDate = /* @__PURE__ */ new Date(sorted[0].date + "T12:00:00Z");
    for (const entry of sorted) {
      const entryDate = /* @__PURE__ */ new Date(entry.date + "T12:00:00Z");
      const diff = Math.round((checkDate.getTime() - entryDate.getTime()) / (1e3 * 60 * 60 * 24));
      if (diff <= 1) {
        streak++;
        checkDate = entryDate;
      } else {
        break;
      }
    }
  }
  container.innerHTML = `
    <div class="metric-cell"><div class="metric-value">${totalEntries}</div><div class="metric-label">ENTRIES</div></div>
    <div class="metric-cell"><div class="metric-value">${allRepos.size}</div><div class="metric-label">ACTIVE REPOS</div></div>
    <div class="metric-cell"><div class="metric-value">${allActions}</div><div class="metric-label">ACTIONS</div></div>
    <div class="metric-cell"><div class="metric-value">${streak}</div><div class="metric-label">DAY STREAK</div></div>
  `;
}
function renderFilterBar(container, tags, options) {
  const { toggleFilter: toggleFilter2, clearFilters: clearFilters2, hasActiveFilters: hasActiveFilters2, getActiveFilters: getActiveFilters2, filteredCount, totalCount } = options;
  container.innerHTML = "";
  const isFiltering = hasActiveFilters2();
  if (isFiltering) {
    const banner = document.createElement("div");
    banner.className = "filter-active-banner";
    const activeFilters2 = getActiveFilters2();
    const chips = [];
    for (const [type, names] of activeFilters2) {
      for (const name of names) {
        chips.push(`<span class="filter-active-chip" data-type="${type}" data-name="${name}">${name} <span class="filter-chip-x">&times;</span></span>`);
      }
    }
    banner.innerHTML = `
      <span class="filter-active-label">SHOWING ${filteredCount} OF ${totalCount}</span>
      <span class="filter-active-chips">${chips.join("")}</span>
      <span class="filter-clear">CLEAR ALL</span>
    `;
    banner.querySelectorAll(".filter-active-chip").forEach((chip) => {
      const el = chip;
      el.addEventListener("click", () => toggleFilter2(el.dataset.type, el.dataset.name));
    });
    banner.querySelector(".filter-clear").addEventListener("click", clearFilters2);
    container.appendChild(banner);
    return;
  }
  const label = document.createElement("span");
  label.className = "filter-label";
  label.textContent = "FILTER";
  container.appendChild(label);
  const topTags = tags.slice(0, 12);
  for (const tag of topTags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.dataset.type = tag.type;
    chip.textContent = tag.name;
    chip.addEventListener("click", () => toggleFilter2(tag.type, tag.name));
    container.appendChild(chip);
  }
}
function renderEntryList(container, entries2) {
  container.innerHTML = "";
  if (entries2.length === 0) {
    container.innerHTML = '<div class="empty-state">No entries match these filters. <a class="filter-clear-link">Clear filters</a></div>';
    return;
  }
  for (const entry of entries2) {
    const card = document.createElement("div");
    card.className = "entry-card";
    const tagsHTML = entry.tags.map((t) => `<span class="tag" data-type="${t.type}">${t.name}</span>`).join("");
    const reposCount = entry.reposActive?.length ?? 0;
    const commitStr = entry.commitCount > 0 ? `${entry.commitCount} commits` : "rest day";
    card.innerHTML = `
      <a href="${BASE3}/articles/${entry.date}/">
        <div class="entry-date">${entry.date}</div>
        <div class="entry-title">${entry.title}</div>
        <div class="entry-summary">${entry.summary}</div>
        <div class="entry-meta">
          <div class="entry-tags">${tagsHTML}</div>
          <span class="entry-stat">${reposCount} repos</span>
          <span class="entry-stat">${commitStr}</span>
        </div>
      </a>
    `;
    container.appendChild(card);
  }
}
function renderSidebar(container, options) {
  const { repos, tags, toggleFilter: toggleFilter2, isFilterActive: isFilterActive2 } = options;
  container.innerHTML = "";
  function addSection(heading, items, type) {
    const section = document.createElement("div");
    section.className = "sidebar-section";
    section.innerHTML = `<div class="sidebar-heading">${heading}</div>`;
    for (const { name, count } of items) {
      const active = isFilterActive2(type, name);
      const item = document.createElement("div");
      item.className = "sidebar-item" + (active ? " active" : "");
      item.innerHTML = `<span>${name}</span><span class="sidebar-count">${count}</span>`;
      item.addEventListener("click", () => toggleFilter2(type, name));
      section.appendChild(item);
    }
    container.appendChild(section);
  }
  addSection("REPOS", repos.slice(0, 10).map((r) => ({ name: r.name, count: r.articleCount })), "repo");
  const archTags = tags.filter((t) => t.type === "arch").slice(0, 8);
  if (archTags.length > 0) addSection("ARCHITECTURE", archTags, "arch");
  const phaseTags = tags.filter((t) => t.type === "phase").slice(0, 6);
  if (phaseTags.length > 0) addSection("PHASES", phaseTags, "phase");
}

// src/frontend/app.ts
async function initIndex() {
  const metricsEl = document.querySelector(".metrics-bar");
  const filterEl = document.querySelector(".filter-bar");
  const listEl = document.querySelector(".entry-list");
  const sidebarEl = document.querySelector(".sidebar");
  if (!listEl) return;
  const [entries2, tags, repos] = await Promise.all([
    getEntries(),
    getTags(),
    getRepos()
  ]);
  function renderAll() {
    const filtered = entries2.filter(matchesFilters);
    if (metricsEl) renderMetrics(metricsEl, entries2);
    if (filterEl) renderFilterBar(filterEl, tags, { toggleFilter, isFilterActive, clearFilters, hasActiveFilters, getActiveFilters, filteredCount: filtered.length, totalCount: entries2.length });
    renderEntryList(listEl, filtered);
    if (sidebarEl) renderSidebar(sidebarEl, { repos, tags, toggleFilter, isFilterActive });
    const clearLink = listEl.querySelector(".filter-clear-link");
    if (clearLink) clearLink.addEventListener("click", clearFilters);
  }
  initFilters(renderAll);
  initSearch(entries2);
  renderAll();
}
async function initArticleDetail() {
  const relatedEl = document.querySelector(".related-articles");
  if (!relatedEl) return;
  const entries2 = await getEntries();
  const currentDate = relatedEl.dataset.date;
  const current = entries2.find((e) => e.date === currentDate);
  if (!current) return;
  const currentTagNames = new Set(current.tags.map((t) => t.name));
  const related = entries2.filter((e) => e.date !== currentDate).map((e) => {
    const overlap = e.tags.filter((t) => currentTagNames.has(t.name)).length;
    return { ...e, overlap };
  }).filter((e) => e.overlap >= 2).sort((a, b) => b.overlap - a.overlap).slice(0, 5);
  if (related.length === 0) {
    relatedEl.style.display = "none";
    return;
  }
  const BASE4 = document.querySelector('meta[name="baseurl"]')?.content ?? "/daily-logger";
  relatedEl.innerHTML = `
    <div class="related-heading">RELATED ARTICLES</div>
    ${related.map((e) => `
      <div class="related-item">
        <a href="${BASE4}/articles/${e.date}/">${e.date} \u2014 ${e.title}</a>
        <span class="entry-stat">${e.overlap} shared tags</span>
      </div>
    `).join("")}
  `;
}
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initIndex();
  initArticleDetail();
});

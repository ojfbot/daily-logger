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
var metricPopoverEl = null;
var metricPopoverTimer = null;
function getMetricPopover() {
  if (!metricPopoverEl) {
    metricPopoverEl = document.createElement("div");
    metricPopoverEl.className = "metric-popover";
    document.body.appendChild(metricPopoverEl);
  }
  return metricPopoverEl;
}
function showMetricPopover(cell, html) {
  if (metricPopoverTimer) clearTimeout(metricPopoverTimer);
  metricPopoverTimer = setTimeout(() => {
    const pop = getMetricPopover();
    pop.innerHTML = html;
    pop.classList.add("visible");
    const rect = cell.getBoundingClientRect();
    const popWidth = pop.offsetWidth;
    let left = rect.left + rect.width / 2 - popWidth / 2;
    if (left < 8) left = 8;
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - 8 - popWidth;
    pop.style.left = `${left}px`;
    pop.style.top = `${rect.bottom + 6}px`;
  }, 200);
}
function hideMetricPopover() {
  if (metricPopoverTimer) {
    clearTimeout(metricPopoverTimer);
    metricPopoverTimer = null;
  }
  metricPopoverEl?.classList.remove("visible");
}
function popRow(label, value) {
  return `<div class="metric-popover-row"><span class="mp-label">${label}</span><span class="mp-value">${value}</span></div>`;
}
function buildEntriesPopover(entries2) {
  const sorted = [...entries2].sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.filter((e) => {
    const d = /* @__PURE__ */ new Date(e.date + "T12:00:00Z");
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1e3;
  }).length;
  const types = {};
  for (const e of entries2) {
    const t = e.activityType || "build";
    types[t] = (types[t] ?? 0) + 1;
  }
  const typeStr = Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(", ");
  const latest = sorted[0];
  const latestLine = latest ? `<div class="metric-popover-latest">Latest: "${latest.title}" (${latest.date})</div>` : "";
  return `<div class="metric-popover-title">Entries</div>` + popRow("Last 7 days", last7) + popRow("Activity types", typeStr) + latestLine;
}
function buildReposPopover(repos) {
  const top5 = repos.slice(0, 5);
  const rows = top5.map((r) => popRow(r.name, `${r.articleCount} articles, ${r.totalCommits} commits`)).join("");
  return `<div class="metric-popover-title">Top repos by coverage</div>` + rows;
}
function buildActionsPopover(entries2) {
  const allActions = entries2.flatMap((e) => e.actions ?? []);
  const open = allActions.filter((a) => a.status === "open");
  const cmdCounts = {};
  for (const a of open) {
    cmdCounts[a.command] = (cmdCounts[a.command] ?? 0) + 1;
  }
  const cmdStr = Object.entries(cmdCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cmd, n]) => `${cmd}: ${n}`).join(", ");
  const oldest = open.sort((a, b) => a.sourceDate.localeCompare(b.sourceDate))[0];
  const oldestLine = oldest ? `<div class="metric-popover-latest">Oldest: "${oldest.description.slice(0, 60)}..." (${oldest.sourceDate})</div>` : "";
  return `<div class="metric-popover-title">Action items</div>` + popRow("Open", open.length) + popRow("Closed", allActions.length - open.length) + (cmdStr ? popRow("By type", cmdStr) : "") + oldestLine;
}
function buildCommitsPopover(entries2, repos) {
  const totalCommits = entries2.reduce((sum, e) => sum + (e.commitCount ?? 0), 0);
  const avg = entries2.length > 0 ? Math.round(totalCommits / entries2.length) : 0;
  const sorted = [...entries2].sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.filter((e) => Date.now() - (/* @__PURE__ */ new Date(e.date + "T12:00:00Z")).getTime() < 7 * 24 * 60 * 60 * 1e3).reduce((sum, e) => sum + (e.commitCount ?? 0), 0);
  const topRepo = repos[0];
  const topLine = topRepo ? popRow("Top repo", `${topRepo.name} (${topRepo.totalCommits})`) : "";
  return `<div class="metric-popover-title">Commit volume</div>` + popRow("Average", `${avg} / day`) + popRow("This week", last7) + topLine;
}
function renderMetrics(container, entries2, repos) {
  const totalEntries = entries2.length;
  const allRepos = new Set(entries2.flatMap((e) => e.reposActive ?? []));
  const allActions = entries2.reduce((sum, e) => sum + (e.actions?.length ?? 0), 0);
  const totalCommits = entries2.reduce((sum, e) => sum + (e.commitCount ?? 0), 0);
  container.innerHTML = `
    <div class="metric-cell" data-metric="entries"><div class="metric-value">${totalEntries}</div><div class="metric-label">ENTRIES</div></div>
    <div class="metric-cell" data-metric="repos"><div class="metric-value">${allRepos.size}</div><div class="metric-label">ACTIVE REPOS</div></div>
    <div class="metric-cell" data-metric="actions"><div class="metric-value">${allActions}</div><div class="metric-label">ACTIONS</div></div>
    <div class="metric-cell" data-metric="commits"><div class="metric-value">${totalCommits.toLocaleString()}</div><div class="metric-label">TOTAL COMMITS</div></div>
  `;
  const popovers = {
    entries: buildEntriesPopover(entries2),
    repos: buildReposPopover(repos),
    actions: buildActionsPopover(entries2),
    commits: buildCommitsPopover(entries2, repos)
  };
  container.querySelectorAll(".metric-cell").forEach((cell) => {
    const el = cell;
    const key = el.dataset.metric;
    if (!key || !popovers[key]) return;
    el.addEventListener("mouseenter", () => showMetricPopover(el, popovers[key]));
    el.addEventListener("mouseleave", hideMetricPopover);
  });
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

// src/frontend/popover.ts
var ORG = "ojfbot";
var COMMIT_RE = /^[a-f0-9]{7,40}$/;
var CACHE_KEY = "dl-commit-cache";
var SHOW_DELAY = 200;
var commitCache = /* @__PURE__ */ new Map();
function loadCommitCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const entries2 = JSON.parse(raw);
    for (const [key, data] of Object.entries(entries2)) {
      commitCache.set(key, { status: "ok", data });
    }
  } catch {
  }
}
function saveCommitCache() {
  try {
    const obj = {};
    for (const [key, entry] of commitCache) {
      if (entry.status === "ok") obj[key] = entry.data;
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
  }
}
async function fetchCommitData(repo, hash) {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/commits/${hash}`);
  if (res.status === 404) throw new Error("Commit not found on GitHub");
  if (res.status === 403) throw new Error("Rate limited \u2014 try again later");
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  const fullMessage = json.commit?.message ?? "";
  const firstLine = fullMessage.split("\n")[0];
  const prMatch = firstLine.match(/\(#(\d+)\)/);
  let pr = void 0;
  if (prMatch) {
    pr = { number: parseInt(prMatch[1], 10), title: "" };
  }
  return {
    sha: json.sha ?? hash,
    message: firstLine,
    author: json.commit?.author?.name ?? "",
    date: json.commit?.author?.date ?? "",
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/commit/${hash}`,
    repo,
    pr
  };
}
var prCache = /* @__PURE__ */ new Map();
var PR_LINK_RE = /^https:\/\/github\.com\/ojfbot\/([^/]+)\/(pull|issues)\/(\d+)\/?$/;
async function fetchPRData(repo, number) {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/pulls/${number}`);
  if (res.status === 404) {
    const issueRes = await fetch(`https://api.github.com/repos/${ORG}/${repo}/issues/${number}`);
    if (issueRes.status === 404) throw new Error("Private repo \u2014 preview unavailable");
    if (issueRes.status === 403) throw new Error("Rate limited \u2014 try again later");
    if (!issueRes.ok) throw new Error("Private repo \u2014 preview unavailable");
    const issue = await issueRes.json();
    return {
      number,
      title: issue.title ?? "",
      state: issue.state ?? "unknown",
      merged: false,
      author: issue.user?.login ?? "",
      date: issue.created_at ?? "",
      url: issue.html_url ?? `https://github.com/${ORG}/${repo}/issues/${number}`,
      repo,
      additions: 0,
      deletions: 0,
      labels: (issue.labels ?? []).map((l) => l.name)
    };
  }
  if (res.status === 403) throw new Error("Rate limited \u2014 try again later");
  if (!res.ok) throw new Error("Private repo \u2014 preview unavailable");
  const json = await res.json();
  return {
    number,
    title: json.title ?? "",
    state: json.merged ? "merged" : json.state ?? "unknown",
    merged: json.merged ?? false,
    author: json.user?.login ?? "",
    date: json.created_at ?? "",
    url: json.html_url ?? `https://github.com/${ORG}/${repo}/pull/${number}`,
    repo,
    additions: json.additions ?? 0,
    deletions: json.deletions ?? 0,
    labels: (json.labels ?? []).map((l) => l.name)
  };
}
function resolveRef(ref) {
  const base = `https://github.com/${ORG}`;
  switch (ref.type) {
    case "commit": {
      const url = ref.url ?? (ref.repo ? `${base}/${ref.repo}/commit/${ref.text}` : null);
      return { ref, url, label: ref.text.slice(0, 7), detail: ref.repo ?? "unknown repo" };
    }
    case "component":
      return {
        ref,
        url: ref.url ?? (ref.repo && ref.path ? `${base}/${ref.repo}/blob/main/${ref.path}` : null),
        label: ref.text,
        detail: ref.path ? `${ref.repo ?? ""}/${ref.path}` : ref.repo ?? "component"
      };
    case "file":
      return {
        ref,
        url: ref.url ?? (ref.repo && ref.path ? `${base}/${ref.repo}/blob/main/${ref.path}` : null),
        label: ref.text,
        detail: ref.repo ?? "file"
      };
    case "package": {
      let pkgUrl = ref.url ?? null;
      if (!pkgUrl) {
        const ojfMatch = ref.text.match(/^@ojfbot\/(.+)$/);
        if (ojfMatch) {
          pkgUrl = `${base}/${ojfMatch[1]}`;
        } else if (ref.repo) {
          pkgUrl = `${base}/${ref.repo}`;
        } else if (ref.text.startsWith("@")) {
          pkgUrl = `https://www.npmjs.com/package/${ref.text}`;
        }
      }
      return { ref, url: pkgUrl, label: ref.text, detail: ref.repo ? `${ref.repo} package` : "package" };
    }
    case "command": {
      let cmdUrl = ref.url ?? null;
      if (!cmdUrl && ref.text === "/adr") cmdUrl = `${base}/core/tree/main/decisions/adr`;
      return { ref, url: cmdUrl, label: ref.text, detail: "CLI command" };
    }
    case "config":
      return { ref, url: null, label: ref.text, detail: ref.repo ? `config in ${ref.repo}` : "config key" };
    case "env":
      return { ref, url: null, label: ref.text, detail: "environment variable" };
    case "endpoint":
      return { ref, url: null, label: ref.text, detail: ref.repo ? `${ref.repo} API` : "HTTP endpoint" };
    case "directory":
      return {
        ref,
        url: ref.url ?? (ref.repo ? `${base}/${ref.repo}/tree/main/${ref.path ?? ref.text}` : null),
        label: ref.text,
        detail: ref.repo ?? "directory"
      };
  }
}
var TYPE_LABELS = {
  commit: "COMMIT",
  component: "COMPONENT",
  file: "FILE",
  package: "PACKAGE",
  command: "COMMAND",
  config: "CONFIG",
  env: "ENV VAR",
  endpoint: "ENDPOINT",
  directory: "DIRECTORY"
};
function classifyByRegex(text) {
  if (COMMIT_RE.test(text)) return "commit";
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(text)) return "endpoint";
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(text)) return "env";
  if (/^@[\w-]+\/[\w.-]+$/.test(text)) return "package";
  if (/^\/[\w-]+/.test(text) && !text.includes(".")) return "command";
  if (/\/$/.test(text)) return "directory";
  if (/\.\w{1,10}$/.test(text) || text.includes("/") && !text.startsWith("/")) return "file";
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]*)+$/.test(text)) return "component";
  if (/^[a-z][\w]*-[\w-]+$/.test(text)) return "package";
  if (/^[a-z][a-zA-Z0-9]+$/.test(text) && /[A-Z]/.test(text)) return "config";
  return "config";
}
function findCodeElements(articleContent, refsIndex, reposActive) {
  const results = [];
  const codes = articleContent.querySelectorAll("code");
  for (const code of codes) {
    if (code.closest("pre")) continue;
    const text = code.textContent?.trim() ?? "";
    if (text.length < 2) continue;
    let ref = refsIndex.get(text);
    if (!ref) {
      const type = classifyByRegex(text);
      const repo = findRepoForElement(code, articleContent, reposActive);
      ref = { text, type, repo: repo ?? void 0 };
    }
    results.push({ element: code, ref });
  }
  return results;
}
function findRepoForElement(el, boundary, reposActive) {
  const h3 = findNearestH3(el, boundary);
  if (h3) {
    const repo = extractRepoFromH3(h3);
    if (repo && reposActive.includes(repo)) return repo;
  }
  return reposActive.length === 1 ? reposActive[0] : null;
}
function findNearestH3(el, boundary) {
  let node = el;
  while (node && node !== boundary) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === "H3") return sibling;
      if (sibling.tagName === "H2") return null;
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}
function extractRepoFromH3(h3) {
  const text = h3.textContent ?? "";
  const dashIndex = text.indexOf(" \u2014 ");
  const candidate = dashIndex !== -1 ? text.slice(0, dashIndex).trim() : text.trim();
  if (candidate.includes(":")) return null;
  return candidate.replace(/\s*\(.*\)$/, "").trim();
}
var popoverEl = null;
function getPopover() {
  if (popoverEl) return popoverEl;
  popoverEl = document.createElement("div");
  popoverEl.className = "commit-popover";
  popoverEl.setAttribute("role", "tooltip");
  popoverEl.innerHTML = `
    <div class="commit-popover-type"></div>
    <div class="commit-popover-sha"></div>
    <div class="commit-popover-message"></div>
    <div class="commit-popover-pr"></div>
    <div class="commit-popover-meta"></div>
  `;
  document.body.appendChild(popoverEl);
  return popoverEl;
}
function showPopoverForRef(anchor, resolved) {
  const pop = getPopover();
  const typeEl = pop.querySelector(".commit-popover-type");
  const sha = pop.querySelector(".commit-popover-sha");
  const msg = pop.querySelector(".commit-popover-message");
  const pr = pop.querySelector(".commit-popover-pr");
  const meta = pop.querySelector(".commit-popover-meta");
  typeEl.textContent = TYPE_LABELS[resolved.ref.type];
  typeEl.className = `commit-popover-type ref-type-${resolved.ref.type}`;
  sha.textContent = resolved.label;
  msg.textContent = "";
  msg.className = "commit-popover-message";
  pr.textContent = "";
  meta.textContent = resolved.detail;
  pop.dataset.url = resolved.url ?? "";
  positionPopover(pop, anchor);
  pop.classList.add("visible");
}
function showPopoverForCommit(anchor, content, ref) {
  const pop = getPopover();
  const typeEl = pop.querySelector(".commit-popover-type");
  const sha = pop.querySelector(".commit-popover-sha");
  const msg = pop.querySelector(".commit-popover-message");
  const pr = pop.querySelector(".commit-popover-pr");
  const meta = pop.querySelector(".commit-popover-meta");
  typeEl.textContent = "COMMIT";
  typeEl.className = "commit-popover-type ref-type-commit";
  if (content.status === "loading") {
    sha.textContent = ref.text;
    msg.textContent = "Loading...";
    msg.className = "commit-popover-message commit-popover-loading";
    pr.textContent = "";
    meta.textContent = ref.repo ?? "";
    pop.dataset.url = "";
  } else if (content.status === "error") {
    sha.textContent = ref.text;
    msg.textContent = content.message;
    msg.className = "commit-popover-message commit-popover-error";
    pr.textContent = "";
    meta.textContent = ref.repo ?? "";
    pop.dataset.url = "";
  } else {
    const d = content.data;
    sha.textContent = d.sha.slice(0, 7);
    msg.textContent = d.message;
    msg.className = "commit-popover-message";
    if (d.pr) {
      pr.textContent = `#${d.pr.number}${d.pr.title ? ` \u2014 ${d.pr.title}` : ""}`;
    } else {
      pr.textContent = "";
    }
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
    meta.textContent = `${ORG}/${d.repo}${dateStr ? ` \xB7 ${dateStr}` : ""}`;
    pop.dataset.url = d.url;
  }
  positionPopover(pop, anchor);
  pop.classList.add("visible");
}
function showPopoverForPR(anchor, content, repo, number) {
  const pop = getPopover();
  const typeEl = pop.querySelector(".commit-popover-type");
  const sha = pop.querySelector(".commit-popover-sha");
  const msg = pop.querySelector(".commit-popover-message");
  const pr = pop.querySelector(".commit-popover-pr");
  const meta = pop.querySelector(".commit-popover-meta");
  typeEl.textContent = "PULL REQUEST";
  typeEl.className = "commit-popover-type ref-type-pr";
  if (content.status === "loading") {
    sha.textContent = `#${number}`;
    msg.textContent = "Loading...";
    msg.className = "commit-popover-message commit-popover-loading";
    pr.textContent = "";
    meta.textContent = `${ORG}/${repo}`;
    pop.dataset.url = "";
  } else if (content.status === "error") {
    sha.textContent = `#${number}`;
    msg.textContent = content.message;
    msg.className = "commit-popover-message commit-popover-error";
    pr.textContent = "";
    meta.textContent = `${ORG}/${repo}`;
    pop.dataset.url = "";
  } else {
    const d = content.data;
    sha.textContent = `#${d.number}`;
    msg.textContent = d.title;
    msg.className = "commit-popover-message";
    const stateBadge = d.merged ? "merged" : d.state;
    const diffStr = d.additions || d.deletions ? ` \xB7 +${d.additions} \u2212${d.deletions}` : "";
    pr.textContent = `${stateBadge}${diffStr}`;
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
    meta.textContent = `${ORG}/${d.repo}${dateStr ? ` \xB7 ${dateStr}` : ""}${d.author ? ` \xB7 ${d.author}` : ""}`;
    pop.dataset.url = d.url;
  }
  positionPopover(pop, anchor);
  pop.classList.add("visible");
}
function hidePopover() {
  popoverEl?.classList.remove("visible");
}
function positionPopover(pop, anchor) {
  const rect = anchor.getBoundingClientRect();
  const gap = 8;
  pop.style.left = "-9999px";
  pop.style.top = "-9999px";
  pop.classList.add("visible");
  const popRect = pop.getBoundingClientRect();
  pop.classList.remove("visible");
  let top = rect.top - popRect.height - gap;
  if (top < 12) {
    top = rect.bottom + gap;
  }
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - popRect.width - 12));
  pop.style.top = `${top}px`;
  pop.style.left = `${left}px`;
}
var showTimer = null;
var activeAnchor = null;
function attachHoverListeners(element, ref) {
  element.addEventListener("mouseenter", () => {
    if (ref.type === "commit" && ref.repo) {
      handleCommitHover(element, ref);
    } else {
      showTimer = setTimeout(() => {
        activeAnchor = element;
        showPopoverForRef(element, resolveRef(ref));
      }, SHOW_DELAY);
    }
  });
  element.addEventListener("mouseleave", () => {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    activeAnchor = null;
    hidePopover();
  });
  element.addEventListener("click", (e) => {
    const resolved = resolveRef(ref);
    if (resolved.url) {
      e.preventDefault();
      window.open(resolved.url, "_blank", "noopener");
    } else if (activeAnchor === element) {
      activeAnchor = null;
      hidePopover();
    } else {
      e.preventDefault();
      element.dispatchEvent(new MouseEvent("mouseenter"));
    }
  });
}
function attachPRHoverListeners(element, repo, prNumber) {
  element.addEventListener("mouseenter", () => {
    const cacheKey = `pr:${repo}/${prNumber}`;
    const cached = prCache.get(cacheKey);
    if (cached?.status === "ok") {
      activeAnchor = element;
      showPopoverForPR(element, cached, repo, prNumber);
      return;
    }
    showTimer = setTimeout(() => {
      activeAnchor = element;
      if (!prCache.has(cacheKey)) {
        prCache.set(cacheKey, { status: "loading" });
        showPopoverForPR(element, { status: "loading" }, repo, prNumber);
        fetchPRData(repo, prNumber).then((data) => {
          prCache.set(cacheKey, { status: "ok", data });
          if (activeAnchor === element) showPopoverForPR(element, prCache.get(cacheKey), repo, prNumber);
        }).catch((err) => {
          const msg = err instanceof Error ? err.message : "Private repo \u2014 preview unavailable";
          prCache.set(cacheKey, { status: "error", message: msg });
          if (activeAnchor === element) showPopoverForPR(element, prCache.get(cacheKey), repo, prNumber);
        });
      } else {
        showPopoverForPR(element, prCache.get(cacheKey), repo, prNumber);
      }
    }, SHOW_DELAY);
  });
  element.addEventListener("mouseleave", () => {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    activeAnchor = null;
    hidePopover();
  });
}
function handleCommitHover(element, ref) {
  const repo = ref.repo;
  const hash = ref.text;
  const cacheKey = `${repo}/${hash}`;
  const cached = commitCache.get(cacheKey);
  if (cached?.status === "ok") {
    activeAnchor = element;
    showPopoverForCommit(element, cached, ref);
    return;
  }
  showTimer = setTimeout(() => {
    activeAnchor = element;
    if (!commitCache.has(cacheKey)) {
      commitCache.set(cacheKey, { status: "loading" });
      showPopoverForCommit(element, { status: "loading" }, ref);
      fetchCommitData(repo, hash).then((data) => {
        commitCache.set(cacheKey, { status: "ok", data });
        saveCommitCache();
        if (activeAnchor === element) showPopoverForCommit(element, commitCache.get(cacheKey), ref);
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load commit";
        commitCache.set(cacheKey, { status: "error", message: msg });
        if (activeAnchor === element) showPopoverForCommit(element, commitCache.get(cacheKey), ref);
      });
    } else {
      showPopoverForCommit(element, commitCache.get(cacheKey), ref);
    }
  }, SHOW_DELAY);
}
function extractDateFromURL() {
  const match = window.location.pathname.match(/\/articles\/([\d-]+)/);
  return match?.[1] ?? null;
}
async function initCommitPopovers() {
  const articleContent = document.querySelector(".article-content");
  if (!articleContent) return;
  loadCommitCache();
  const date = document.querySelector(".related-articles")?.dataset.date ?? extractDateFromURL();
  let reposActive = [];
  let codeReferences = [];
  if (date) {
    const entries2 = await getEntries();
    const entry = entries2.find((e) => e.date === date);
    reposActive = entry?.reposActive ?? [];
    codeReferences = entry?.codeReferences ?? [];
  }
  const refsIndex = /* @__PURE__ */ new Map();
  for (const ref of codeReferences) {
    refsIndex.set(ref.text, ref);
  }
  const codeRefElements = findCodeElements(articleContent, refsIndex, reposActive);
  for (const { element, ref } of codeRefElements) {
    element.classList.add("code-ref");
    element.classList.add(`ref-type-${ref.type}`);
    element.dataset.refType = ref.type;
    if (ref.repo) element.dataset.repo = ref.repo;
    if (ref.type === "commit") element.classList.add("commit-hash");
    attachHoverListeners(element, ref);
  }
  const prLinks = articleContent.querySelectorAll('a[href*="github.com/ojfbot"]');
  for (const link of prLinks) {
    const href = link.href;
    const match = href.match(PR_LINK_RE);
    if (!match) continue;
    const repo = match[1];
    const prNumber = parseInt(match[3], 10);
    const el = link;
    el.classList.add("code-ref", "ref-type-pr");
    attachPRHoverListeners(el, repo, prNumber);
  }
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
    if (metricsEl) renderMetrics(metricsEl, entries2, repos);
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
  initCommitPopovers();
});

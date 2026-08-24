// Cockpit Triage Dashboard - app.js
// Logica client-side: GitHub Device Flow + fallback PAT, fetch issues, rendering, bottoni approva/rifiuta.
//
// Autenticazione:
// - Preferita: GitHub Device Flow (codice di 8 caratteri + 2FA)
// - Fallback: Personal Access Token (incolla manualmente)
//
// Self-contained, no build, no server-side code (eccetto il Cloudflare Worker
// che fa lo scambio device_code -> access_token).
//
// Limiti GitHub API: 5000 req/h autenticato, 60 req/h anonimo.

import {
  extractAnalysis,
  extractBlocked,
  getTriageState,
  typeOf,
  kanbanColumn,
  selectPendingFeedback,
  hasResolvedComment,
  extractReleaseVersions,
  countByState,
  selectResumableIssues,
  buildResumeComment,
  computeResumeLabelSwap,
  approveRejectButtonsState,
  buildNewProjectCommand,
  buildProjectPath,
  emptyAssetMessage,
  normalizeConfig,
  renderDocsPanel,
} from "./lib.js";

// === State ===
let state = {
  config: null,
  token: null,
  user: null,
  issues: [],
  rateLimit: { remaining: null, reset: null },
  filters: { state: "", labels: "", search: "", triageState: "" },
};

// Contenuto PRD + nome file dell'ultimo comando generato (T3.7), usato dal
// bottone "Scarica PRD". Vive fuori da `state` perché non tocca la logica issue.
let newProjectPrd = null;

// === Utilities ===

function $(sel) {
  return document.querySelector(sel);
}
function $$(sel) {
  return document.querySelectorAll(sel);
}

function showView(viewId) {
  $("#home-view").classList.toggle("hidden", viewId !== "home");
  $("#login-view").classList.toggle("hidden", viewId !== "login");
  $("#pat-view").classList.toggle("hidden", viewId !== "pat");
  $("#dashboard-view").classList.toggle("hidden", viewId !== "dashboard");
  $("#manifest-view").classList.toggle("hidden", viewId !== "manifest");
  $("#docs-view").classList.toggle("hidden", viewId !== "docs");
}

function showToast(message, kind = "") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "toast " + kind;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError(el) {
  el.classList.add("hidden");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "ora";
  if (diff < 3600) return Math.floor(diff / 60) + "m fa";
  if (diff < 86400) return Math.floor(diff / 3600) + "h fa";
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + "g fa";
  return d.toISOString().slice(0, 10);
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function markdownToHtml(md) {
  if (!md) return "";
  let html = escapeHtml(md);
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (m, lang, code) =>
      `<pre><code class="lang-${escapeHtml(lang)}">${code}</code></pre>`
  );
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`
  );
  html = html.replace(/\n/g, "<br>");
  return html;
}

// === Config ===

// Carica config.json (repo/apiBase/storageKey). Deve girare PRIMA di ogni
// logica che tocca token/issue, così che `state.config` sia già pronto.
// F11: con un `projectName` carica `projects/<name>/config.json` (architettura A);
// senza, il legacy `config.json` single-project (retrocompat).
async function loadConfig(projectName) {
  const url = buildProjectPath(projectName, "config.json");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Impossibile caricare ${url} (HTTP ${res.status})`);
  }
  return res.json();
}

// === Home multi-progetto (F11) ===

// Progetto corrente dall'hash `#project=<name>`, oppure null (home).
function currentProjectFromHash() {
  const m = location.hash.match(/^#project=(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function loadProjectsIndex() {
  const res = await fetch("projects.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Impossibile caricare projects.json (HTTP ${res.status})`);
  }
  return res.json();
}

function renderHome(index) {
  const list = $("#project-list");
  list.innerHTML = "";
  const items = (index && index.projects) || [];
  const managedLabel = { managed: "gestito", shadow: "shadow", observed: "osservato" };
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "📭 Nessun progetto scoperto in baseDirectory.";
    list.appendChild(p);
    return;
  }
  for (const proj of items) {
    const a = document.createElement("a");
    a.className = "project-row";
    a.href = `#project=${encodeURIComponent(proj.name)}`;
    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = proj.name;
    const meta = document.createElement("span");
    meta.className = "project-meta";
    meta.textContent = `${proj.repo || "—"} · ${managedLabel[proj.managed] || "osservato"}`;
    a.append(name, meta);
    list.appendChild(a);
  }
}

// === Token storage ===

function saveToken(token) {
  localStorage.setItem(state.config.storageKey, token);
  state.token = token;
}

function loadToken() {
  return localStorage.getItem(state.config.storageKey);
}

function clearToken() {
  localStorage.removeItem(state.config.storageKey);
  state.token = null;
  state.user = null;
}

// === GitHub API ===

async function gh(path, options = {}) {
  if (!state.token) throw new Error("Non autenticato");
  const url = path.startsWith("http") ? path : `${state.config.apiBase}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const remaining = res.headers.get("X-RateLimit-Remaining");
  const reset = res.headers.get("X-RateLimit-Reset");
  if (remaining !== null) state.rateLimit.remaining = parseInt(remaining, 10);
  if (reset !== null) state.rateLimit.reset = parseInt(reset, 10);

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

async function fetchUser() {
  return gh("/user");
}

// Paginazione completa del listino issue.
//
// L'endpoint /issues restituisce issue E pull request mescolati, ordinati per
// `created` desc. Con `per_page=100` e una sola richiesta si ottengono solo i
// 100 elementi più recenti: in questo repo la maggioranza sono PR, quindi le
// issue chiuse "vere" conteggiate erano ~16 invece di 200+ (issue #515).
//
// Scarichiamo quindi tutte le pagine disponibili per ogni stato. Il limite
// MAX_PAGES è una rete di sicurezza contro loop infiniti / abuso di rate limit:
// 10 pagine * 100 = 1000 elementi per stato, ampiamente sopra il totale attuale.
// Le PR vengono scartate qui; il counter `closed` riflette così tutte le issue
// chiuse reali.
const MAX_ISSUES_PAGES = 10;

async function fetchIssues({ signal } = {}) {
  const all = [];
  for (const s of ["open", "closed"]) {
    for (let page = 1; page <= MAX_ISSUES_PAGES; page++) {
      const issues = await gh(
        `/repos/${state.config.repo}/issues?state=${s}&per_page=100&page=${page}&sort=created&direction=desc`,
        { signal }
      );
      for (const i of issues) {
        if (i.pull_request) continue;
        all.push(i);
      }
      // Pagina non piena => ultima pagina per questo stato.
      if (!Array.isArray(issues) || issues.length < 100) break;
    }
  }
  all.sort((a, b) => b.number - a.number);
  return all;
}

async function postComment(issueNumber, body) {
  return gh(`/repos/${state.config.repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function addLabel(issueNumber, label) {
  return gh(`/repos/${state.config.repo}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [label] }),
  });
}

// (#502) Rimuove una singola label da una issue. Specchio di addLabel.
// GitHub risponde 200 OK con l'elenco delle label rimanenti (body JSON),
// quindi gh() può fare res.json() senza crashare.
async function removeLabel(issueNumber, label) {
  return gh(`/repos/${state.config.repo}/issues/${issueNumber}/labels/${label}`, {
    method: "DELETE",
  });
}

async function fetchComments(issueNumber, { signal } = {}) {
  // Filtra solo i commenti "normali" (no review comments, no events).
  // Ritorna array di {id, user, body, created_at}.
  try {
    return await gh(
      `/repos/${state.config.repo}/issues/${issueNumber}/comments?per_page=100`,
      { signal }
    );
  } catch (err) {
    // Se l'API fallisce (es. rate limit) o viene abortito, ritorna array
    // vuoto: la dashboard mostra la issue senza il blocco "Analisi AI"
    // invece di crashare. Un AbortError è silenzioso (è atteso durante un
    // refresh rapido / cambio filtro).
    if (err.name === "AbortError") return [];
    console.warn(`Commenti per #${issueNumber} non disponibili:`, err.message);
    return [];
  }
}

// === Device Flow (via Worker proxy) ===

async function startDeviceFlow() {
  // Usa il Worker come proxy unico: il browser parla SOLO con oauthWorkerUrl
  // (da config). Il Worker chiama GitHub con il client_secret (mai esposto al browser).
  const res = await fetch(state.config.auth.oauthWorkerUrl + "/device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return data;
}

async function pollForToken(deviceCode, interval, expiresAt) {
  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval * 1000));

    let res;
    try {
      res = await fetch(state.config.auth.oauthWorkerUrl + "/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (err) {
      // Errore di rete, riprova al prossimo intervallo
      continue;
    }

    if (!res.ok) {
      // Worker 5xx: riprova
      continue;
    }

    const data = await res.json();

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === "authorization_pending") {
      continue;
    }
    if (data.error === "slow_down") {
      interval += 5;
      continue;
    }
    if (
      data.error === "expired_token" ||
      data.error === "access_denied" ||
      data.error === "unsupported_grant_type"
    ) {
      throw new Error(data.error_description || data.error);
    }
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
  }

  throw new Error("Codice scaduto. Riprova.");
}

// === UI ===

function renderUserInfo() {
  const info = $("#user-info");
  if (state.user) {
    $("#user-avatar").src = state.user.avatar_url;
    $("#user-name").textContent = state.user.login;
    info.classList.remove("hidden");
  } else {
    info.classList.add("hidden");
  }
}

function renderFilters() {
  const labels = new Set();
  for (const i of state.issues) {
    for (const l of i.labels) labels.add(l.name);
  }
  const sel = $("#filter-labels");
  const current = sel.value;
  sel.innerHTML =
    '<option value="">Tutte le label</option>' +
    [...labels]
      .sort()
      .map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`)
      .join("");
  if (current) sel.value = current;
}

function applyFilters(issues) {
  const L = state.config.labels;
  return issues.filter((i) => {
    // State filter supports both real GitHub states ("open", "closed")
    // and virtual states driven by labels (in esecuzione / rilasciate).
    if (state.filters.state) {
      const labels = (i.labels || []).map((l) => l.name);
      if (state.filters.state === L.in_progress) {
        if (!labels.includes(L.in_progress)) return false;
      } else if (state.filters.state === L.released) {
        // "Rilasciate" = closed AND (label released OR commento di release note)
        if (i.state !== "closed") return false;
        if (!labels.includes(L.released) && !hasResolvedComment(i, state.config))
          return false;
      } else {
        if (i.state !== state.filters.state) return false;
      }
    }
    if (state.filters.labels) {
      const has = i.labels.some((l) => l.name === state.filters.labels);
      if (!has) return false;
    }
    if (state.filters.triageState) {
      const ts = getTriageState(i, state.config);
      if (ts !== state.filters.triageState) return false;
    }
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase().trim();
      if (q) {
        const haystack = [
          String(i.number),
          i.title || "",
          i.body || "",
          (i.labels || []).map((l) => l.name).join(" "),
          (i.user && i.user.login) || "",
          (i.__analysis && i.__analysis.body) || "",
          (i.__blocked && i.__blocked.body) || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
    }
    return true;
  });
}

// Allinea i valori delle option del dropdown #filter-status alle label
// configurate. In index.html le option "in_progress"/"released" hanno valori
// cablati solo come placeholder: qui li sostituiamo con i valori reali di
// state.config.labels, così un progetto che personalizza `labels.in_progress`/
// `labels.released` (es. "doing") non rompe i filtri "In esecuzione"/"Rilasciate".
function applyConfigToFilters() {
  const sel = $("#filter-status");
  if (!sel) return;
  for (const opt of sel.querySelectorAll("option")) {
    if (opt.value === "in_progress") {
      opt.value = state.config.labels.in_progress;
    } else if (opt.value === "released") {
      opt.value = state.config.labels.released;
    }
  }
}

function updateStateFilterLabels() {
  const sel = $("#filter-status");
  if (!sel) return;
  const counts = countByState(state.issues || [], state.config);
  const opts = sel.querySelectorAll("option");
  const map = {
    "": counts.open + counts.closed,
    open: counts.open,
    closed: counts.closed - counts.released,
  };
  map[state.config.labels.in_progress] = counts.in_progress;
  map[state.config.labels.released] = counts.released;
  for (const opt of opts) {
    const baseText = opt.textContent.replace(/\s*\(\d+\)\s*$/, "");
    const c = map[opt.value];
    opt.textContent = c !== undefined ? `${baseText} (${c})` : baseText;
  }
}

function renderPendingFeedback(issues) {
  const section = $("#pending-feedback");
  const list = $("#pending-list");
  if (!section || !list) return;
  list.innerHTML = "";

  const pending = selectPendingFeedback(issues, state.config);

  if (pending.length === 0) {
    section.classList.add("hidden");
    return;
  }

  // Sort by reference timestamp (most recent first). Per le issue col
  // blocked-marker uso il timestamp del commento; per le needs_feedback
  // senza marker faccio fallback su updated_at/created_at della issue.
  pending.sort(function (a, b) {
    const ta =
      (a.__blocked && a.__blocked.timestamp) || a.updated_at || a.created_at;
    const tb =
      (b.__blocked && b.__blocked.timestamp) || b.updated_at || b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  for (const i of pending) {
    const refTimestamp =
      (i.__blocked && i.__blocked.timestamp) || i.updated_at || i.created_at;
    const ageMs = Date.now() - new Date(refTimestamp).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    const ageHours = Math.floor(ageMs / 3_600_000);
    const ageText =
      ageDays >= 1
        ? ageDays + "g fa"
        : ageHours >= 1
          ? ageHours + "h fa"
          : "ora";

    const item = document.createElement("div");
    item.className = "pending-item";
    const info = document.createElement("div");
    info.className = "pending-item-info";
    const num = document.createElement("span");
    num.className = "pending-item-num";
    num.textContent = "#" + i.number;
    const link = document.createElement("a");
    link.className = "pending-item-title";
    link.href = i.html_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = i.title;
    info.appendChild(num);
    info.appendChild(link);
    const age = document.createElement("span");
    age.className = "pending-item-age";
    if (i.__blocked) {
      // Ramo originale: issue in_progress con commento blocked-marker.
      age.textContent = "⏸️ " + ageText;
    } else {
      // needs_feedback senza blocked-marker: testo generico.
      age.textContent = "🙋 In attesa di feedback umano · " + ageText;
    }
    item.appendChild(info);
    item.appendChild(age);
    list.appendChild(item);
  }

  section.classList.remove("hidden");
}

// PARITÀ FEATURE (avviso): renderIssues (lista) e renderBoard (board kanban)
// sono DUE render path paralleli per le stesse issue. Qualsiasi azione sulle
// card (bottoni, badge, analisi, ecc.) deve essere aggiunta in ENTRAMBE le
// funzioni, altrimenti su desktop (>=900px) la lista è display:none e l'azione
// sparisce. Già successo due volte (CSS clipping PR #190, bottoni PR #200):
// verificare sempre entrambe quando si toccano le azioni sulle card.
function renderIssues() {
  const filtered = applyFilters(state.issues);
  const list = $("#issues-list");
  const empty = $("#empty-state");
  list.innerHTML = "";
  if (filtered.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    const tpl = $("#issue-card-template");
    for (const i of filtered) {
      const node = tpl.content.cloneNode(true);
      node.querySelector(".num").textContent = i.number;
      node.querySelector(".issue-title").textContent = i.title;
      const stateEl = node.querySelector(".issue-state");
      stateEl.textContent = i.state;
      stateEl.classList.add(i.state);
      const labelsEl = node.querySelector(".issue-labels");
      for (const l of i.labels) {
        const span = document.createElement("span");
        span.className =
          "issue-label " + l.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        span.textContent = l.name;
        labelsEl.appendChild(span);
      }
      node.querySelector(".issue-author").textContent =
        "👤 " + (i.user?.login || "unknown");
      node.querySelector(".issue-date").textContent =
        "📅 " + formatDate(i.created_at);

      // Blocco "Analisi AI" se la issue ha il commento di triage v1
      const analysis = i.__analysis;
      const analysisEl = node.querySelector(".issue-analysis");
      if (analysis) {
        analysisEl.classList.remove("hidden");
        const badgesEl = analysisEl.querySelector(".analysis-badges");
        const fields = [
          ["type", analysis.type],
          ["severity", analysis.severity],
          ["priority", analysis.priority],
          ["area", analysis.area],
        ];
        for (const [k, v] of fields) {
          if (!v) continue;
          const cls = "analysis-badge " + k + "-" + String(v).toLowerCase();
          const span = document.createElement("span");
          span.className = cls;
          span.textContent = `${k}: ${v}`;
          badgesEl.appendChild(span);
        }
        const cb = analysisEl.querySelector(".analysis-cost-benefit");
        const cbBits = [];
        if (analysis.effort) cbBits.push(`Sforzo: ${analysis.effort}`);
        if (analysis.benefit) cbBits.push(`Beneficio: ${analysis.benefit}`);
        if (analysis.pareto !== null && analysis.pareto !== undefined)
          cbBits.push(`Pareto: ${analysis.pareto}/100`);
        if (analysis.autoConfirm)
          cbBits.push(`Auto-confirm: ${analysis.autoConfirm}`);
        if (cbBits.length) cb.textContent = "📊 " + cbBits.join(" · ");

        const diagEl = analysisEl.querySelector(".analysis-diagnosis");
        if (analysis.diagnosis) {
          diagEl.innerHTML =
            "<b>Diagnosi:</b> " + markdownToHtml(analysis.diagnosis);
        }
        const filesEl = analysisEl.querySelector(".analysis-files");
        if (analysis.files && analysis.files.length) {
          filesEl.innerHTML =
            "📁 <b>File:</b> " +
            analysis.files
              .map((f) => `<code>${escapeHtml(f)}</code>`)
              .join(", ");
        }
        const ratEl = analysisEl.querySelector(".analysis-rationale");
        if (analysis.rationale) {
          ratEl.innerHTML =
            "<b>Razionale:</b> " + markdownToHtml(analysis.rationale);
        }
        const tsEl = analysisEl.querySelector(".analysis-timestamp");
        if (analysis.generatedAt) {
          tsEl.textContent =
            "🕒 Analisi del " + formatDate(analysis.generatedAt);
        }
      }

      const bodyEl = node.querySelector(".issue-body");
      if (i.body) {
        bodyEl.innerHTML = markdownToHtml(i.body);
      } else {
        bodyEl.textContent = "(nessuna descrizione)";
        bodyEl.style.color = "var(--muted)";
      }
      // Badge "📦 Inclusa nelle release v..." (#526): mostrato SOLO per
      // issue chiuse con almeno una versione estratta dai commenti
      // "Risolto in v...". Issue aperte o senza release note => nessun badge.
      const releasesEl = node.querySelector(".issue-releases");
      if (releasesEl && i.state === "closed") {
        const versions = extractReleaseVersions(i.__comments || [], state.config);
        if (versions.length > 0) {
          const links = versions
            .map((v) => {
              const tag = v.replace(/^v/, "");
              const safeV = escapeHtml(v);
              const safeTag = escapeHtml(tag);
              return `<a href="https://github.com/${state.config.repo}/releases/tag/${safeTag}" target="_blank" rel="noopener">${safeV}</a>`;
            })
            .join(", ");
          const label =
            versions.length === 1
              ? "📦 Inclusa nella release"
              : "📦 Inclusa nelle release";
          releasesEl.innerHTML = `${label} ${links}`;
          releasesEl.classList.remove("hidden");
        }
      }
      const openBtn = node.querySelector(".btn-open");
      openBtn.href = i.html_url;
      const approveBtn = node.querySelector(".btn-approve");
      const rejectBtn = node.querySelector(".btn-reject");
      const commentBtn = node.querySelector(".btn-comment");
      const reopenBtn = node.querySelector(".btn-reopen");
      const feedback = node.querySelector(".issue-feedback");
      // (#525) Determina classi CSS dei bottoni approva/rifiuta in base allo
      // stato della issue (aperta, chiusa+rejected, chiusa+altro).
      // Mantieni la classe base "btn" + eventuale colore (btn-success/btn-danger)
      // aggiungendo solo il suffisso di stato (btn-approve/btn-inactive/btn-rejected).
      const btnState = approveRejectButtonsState(i, state.config);
      approveBtn.classList.remove(
        "btn-approve",
        "btn-inactive",
        "btn-rejected"
      );
      rejectBtn.classList.remove("btn-reject", "btn-inactive", "btn-rejected");
      approveBtn.classList.add(btnState.approveClass);
      rejectBtn.classList.add(btnState.rejectClass);
      approveBtn.addEventListener("click", () =>
        handleApprove(i.number, feedback, approveBtn, rejectBtn)
      );
      rejectBtn.addEventListener("click", () =>
        handleReject(i.number, feedback, approveBtn, rejectBtn)
      );
      reopenBtn.addEventListener("click", () =>
        handleReopen(i.number, feedback, reopenBtn)
      );

      // If the issue has NOT been analysed yet (no triage:v1 comment),
      // hide the Approve/Reject buttons.
      // - Open issues: offer "Force triage" button + "In attesa di analisi"
      // - Closed issues: just show "Chiusa (senza analisi)" — sono pre-triage
      if (!i.__analysis) {
        approveBtn.style.display = "none";
        rejectBtn.style.display = "none";
        const actionsEl = node.querySelector(".issue-actions");
        if (actionsEl) {
          if (i.state === "closed") {
            const note = document.createElement("span");
            note.className = "issue-awaiting-triage";
            note.textContent = "📦 Chiusa (senza analisi)";
            note.title =
              "Issue chiusa prima dell'introduzione del triage automatico.";
            actionsEl.appendChild(note);
          } else {
            const triageBtn = document.createElement("button");
            triageBtn.className = "btn btn-warning btn-force-triage";
            triageBtn.textContent = "⚡ Triage ora";
            triageBtn.title =
              "Forza l'analisi AI di questa issue. Verrà marcata con 'triage' e processata al prossimo run.";
            triageBtn.addEventListener("click", () =>
              handleForceTriage(i.number, feedback, triageBtn)
            );
            actionsEl.appendChild(triageBtn);

            const note = document.createElement("span");
            note.className = "issue-awaiting-triage";
            note.textContent = "⏳ In attesa di analisi AI";
            note.title =
              "Issue non ancora analizzata dal triage. Clicca 'Triage ora' per forzare l'analisi al prossimo run.";
            actionsEl.appendChild(note);
          }
        }
      }
      commentBtn.addEventListener("click", () => {
        const text = window.prompt(
          `Commento per #${i.number} (verrà postato come tu):`
        );
        if (text) handleCustomComment(i.number, text, feedback);
      });
      // Se la issue ha già uno stato di decisione (approved/rejected/etc.),
      // mostra lo stato invece dei pulsanti approva/rifiuta.
      const labels = (i.labels || []).map((l) => l.name);
      const L = state.config.labels;
      const decidedLabels = [
        L.approved,
        L.rejected,
        L.duplicated,
        L.invalid,
        L.delayed,
      ];
      const decidedLabel = labels.find((l) => decidedLabels.includes(l));
      if (decidedLabel) {
        approveBtn.style.display = "none";
        rejectBtn.style.display = "none";
        const stateLabels = {};
        stateLabels[L.approved] = { text: "✅ Approvata", cls: "state-approved" };
        stateLabels[L.rejected] = { text: "❌ Rifiutata", cls: "state-rejected" };
        stateLabels[L.duplicated] = { text: "📋 Duplicata", cls: "state-rejected" };
        stateLabels[L.invalid] = { text: "🚫 Non valida", cls: "state-rejected" };
        stateLabels[L.delayed] = { text: "⏰ Rimandata", cls: "state-delayed" };
        const sl = stateLabels[decidedLabel] || { text: decidedLabel, cls: "" };
        const stateBadge = document.createElement("span");
        stateBadge.className = "issue-state-badge " + sl.cls;
        stateBadge.textContent = sl.text;
        const actionsEl = node.querySelector(".issue-actions");
        if (actionsEl) actionsEl.appendChild(stateBadge);
      }
      if (i.state === "closed") {
        approveBtn.disabled = true;
        rejectBtn.disabled = true;
        commentBtn.disabled = true;
        approveBtn.title = "Issue chiusa";
        rejectBtn.title = "Issue chiusa";
        // Show Reopen button only for closed issues
        reopenBtn.classList.remove("hidden");
      }
      list.appendChild(node);
    }
  }
  const rl = $("#rate-remaining");
  if (state.rateLimit.remaining !== null) {
    rl.textContent = `API rate limit: ${state.rateLimit.remaining} rimaste`;
  }
  $("#last-update").textContent =
    `Ultimo aggiornamento: ${new Date().toLocaleTimeString()}`;
}

// === Board Kanban (#619) ===
// Renderizza le issue filtrate in 4 colonne (Triage / Bug / Richieste+Idee /
// Chiarimenti). Visibile solo su desktop (CSS media query); su mobile resta
// la lista singola #issues-list.

// Costruisce il blocco "Analisi AI" per una card della board Kanban (#619).
// Riutilizza le stesse classi CSS del blocco analisi della lista singola
// (.analysis-badge, .analysis-diagnosis, …), così lo stile resta coerente.
function buildBoardAnalysis(analysis) {
  if (!analysis) return null;

  const wrap = document.createElement("div");
  wrap.className = "board-card-analysis";

  const badges = document.createElement("div");
  badges.className = "analysis-badges";
  const fields = [
    ["type", analysis.type],
    ["severity", analysis.severity],
    ["priority", analysis.priority],
    ["area", analysis.area],
  ];
  for (const [k, v] of fields) {
    if (!v) continue;
    const cls = "analysis-badge " + k + "-" + String(v).toLowerCase();
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = `${k}: ${v}`;
    badges.appendChild(span);
  }
  wrap.appendChild(badges);

  const cbBits = [];
  if (analysis.effort) cbBits.push(`Sforzo: ${analysis.effort}`);
  if (analysis.benefit) cbBits.push(`Beneficio: ${analysis.benefit}`);
  if (analysis.pareto !== null && analysis.pareto !== undefined)
    cbBits.push(`Pareto: ${analysis.pareto}/100`);
  if (analysis.autoConfirm)
    cbBits.push(`Auto-confirm: ${analysis.autoConfirm}`);
  if (cbBits.length) {
    const cb = document.createElement("div");
    cb.className = "analysis-cost-benefit";
    cb.textContent = "📊 " + cbBits.join(" · ");
    wrap.appendChild(cb);
  }

  if (analysis.diagnosis) {
    const d = document.createElement("div");
    d.className = "analysis-diagnosis";
    d.innerHTML = "<b>Diagnosi:</b> " + markdownToHtml(analysis.diagnosis);
    wrap.appendChild(d);
  }
  if (analysis.files && analysis.files.length) {
    const f = document.createElement("div");
    f.className = "analysis-files";
    f.innerHTML =
      "📁 <b>File:</b> " +
      analysis.files.map((x) => `<code>${escapeHtml(x)}</code>`).join(", ");
    wrap.appendChild(f);
  }
  if (analysis.rationale) {
    const r = document.createElement("div");
    r.className = "analysis-rationale";
    r.innerHTML = "<b>Razionale:</b> " + markdownToHtml(analysis.rationale);
    wrap.appendChild(r);
  }
  if (analysis.generatedAt) {
    const ts = document.createElement("div");
    ts.className = "analysis-timestamp";
    ts.textContent = "🕒 Analisi del " + formatDate(analysis.generatedAt);
    wrap.appendChild(ts);
  }

  return wrap;
}

// Vedi avviso PARITÀ FEATURE sopra renderIssues: questa funzione deve restare
// in parità di feature con la lista per le azioni sulle card (bottoni, badge).
function renderBoard() {
  const board = $("#board");
  if (!board) return;

  const filtered = applyFilters(state.issues);
  const columns = [[], [], [], []];
  for (const i of filtered) {
    const col = kanbanColumn(i, state.config);
    // -1 = issue senza colonna (es. chiusa senza tipo, #641): fuori board.
    if (col < 0) continue;
    columns[col].push(i);
  }

  for (let c = 0; c < 4; c++) {
    const colEl = board.querySelector(`.board-column[data-col="${c}"]`);
    if (!colEl) continue;
    const body = colEl.querySelector(".board-column-body");
    // Contatore issue nell'intestazione: se lo span .board-count manca
    // (es. index.html cached di una versione precedente alla #624), lo
    // creiamo al volo invece di skippare silenziosamente — senza questo
    // fallback un mismatch di cache browser nascondeva i numeri.
    let countEl = colEl.querySelector(".board-count");
    if (!countEl) {
      const header = colEl.querySelector(".board-column-header");
      if (!header) continue;
      countEl = document.createElement("span");
      countEl.className = "board-count";
      header.appendChild(countEl);
    }
    countEl.textContent = String(columns[c].length);
    countEl.title =
      columns[c].length === 1
        ? "1 issue in questa colonna"
        : `${columns[c].length} issue in questa colonna`;
    body.innerHTML = "";

    for (const i of columns[c]) {
      const card = document.createElement("div");
      card.className = "board-card";

      const num = document.createElement("span");
      num.className = "board-card-num";
      num.textContent = "#" + i.number;

      const title = document.createElement("a");
      title.className = "board-card-title";
      title.href = i.html_url;
      title.target = "_blank";
      title.rel = "noopener";
      title.textContent = i.title;

      const labels = document.createElement("div");
      labels.className = "board-card-labels";
      const names = (i.labels || []).map((l) =>
        typeof l === "string" ? l : l && l.name
      );
      const prio = names.find((l) => state.config.priorities.includes(l));
      const bits = [];
      const t = typeOf(i, state.config);
      if (t) bits.push(t);
      if (prio) bits.push(prio);
      if (i.state === "closed") bits.push("chiusa");
      labels.textContent = bits.join(" · ");

      card.appendChild(num);
      card.appendChild(title);
      card.appendChild(labels);

      // Analisi AI completa sulla card (#dashboard-board-analysis): la card
      // non è più "anonima" — mostra tipo/severità/priorità/area, sforzo e
      // beneficio, diagnosi, file e razionale del triage a colpo d'occhio.
      const analysis = buildBoardAnalysis(i.__analysis);
      if (analysis) card.appendChild(analysis);

      // Bottoni d'azione (parità feature con la lista, vedi renderIssues):
      // il board deve offrire le stesse azioni della lista, altrimenti su
      // desktop (>=900px, dove la lista è display:none) l'utente non ha modo
      // di agire sulle issue. Riusa gli stessi handler della lista.
      const actions = document.createElement("div");
      actions.className = "board-card-actions";
      const feedback = document.createElement("div");
      feedback.className = "issue-feedback hidden";

      // Link "Apri su GitHub" (sempre utile, compatto).
      const openLink = document.createElement("a");
      openLink.className = "btn btn-ghost btn-open";
      openLink.href = i.html_url;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.textContent = "Apri";
      actions.appendChild(openLink);

      if (!i.__analysis) {
        if (i.state === "closed") {
          const note = document.createElement("span");
          note.className = "issue-awaiting-triage";
          note.textContent = "📦 Chiusa (senza analisi)";
          actions.appendChild(note);
        } else {
          const triageBtn = document.createElement("button");
          triageBtn.className = "btn btn-warning btn-force-triage";
          triageBtn.textContent = "⚡ Triage ora";
          triageBtn.addEventListener("click", () =>
            handleForceTriage(i.number, feedback, triageBtn)
          );
          actions.appendChild(triageBtn);
        }
      } else {
        // Parità con renderIssues: se l'issue ha già una label di decisione
        // (approved/rejected/duplicated/invalid/delayed), mostriamo il badge
        // di stato invece dei bottoni Approva/Rifiuta — evita di ri-postare
        // /approve o /reject su una issue già decisa (non idempotente).
        const L = state.config.labels;
        const decidedLabels = [
          L.approved,
          L.rejected,
          L.duplicated,
          L.invalid,
          L.delayed,
        ];
        const decidedLabel = names.find((l) => decidedLabels.includes(l));

        if (decidedLabel) {
          const stateLabels = {};
          stateLabels[L.approved] = { text: "✅ Approvata", cls: "state-approved" };
          stateLabels[L.rejected] = { text: "❌ Rifiutata", cls: "state-rejected" };
          stateLabels[L.duplicated] = { text: "📋 Duplicata", cls: "state-rejected" };
          stateLabels[L.invalid] = { text: "🚫 Non valida", cls: "state-rejected" };
          stateLabels[L.delayed] = { text: "⏰ Rimandata", cls: "state-delayed" };
          const sl = stateLabels[decidedLabel] || { text: decidedLabel, cls: "" };
          const stateBadge = document.createElement("span");
          stateBadge.className = "issue-state-badge " + sl.cls;
          stateBadge.textContent = sl.text;
          actions.appendChild(stateBadge);
        } else {
          const btnState = approveRejectButtonsState(i, state.config);
          const approveBtn = document.createElement("button");
          approveBtn.className = "btn btn-success btn-approve " + btnState.approveClass;
          approveBtn.textContent = "✓ Approva";
          const rejectBtn = document.createElement("button");
          rejectBtn.className = "btn btn-danger btn-reject " + btnState.rejectClass;
          rejectBtn.textContent = "✗ Rifiuta";
          if (i.state === "closed") {
            // Parità con renderIssues: issue chiusa → bottoni disabilitati
            // (il riaprire passa solo dal bottone Riapri qui sotto).
            approveBtn.disabled = true;
            rejectBtn.disabled = true;
            approveBtn.title = "Issue chiusa";
            rejectBtn.title = "Issue chiusa";
          }
          approveBtn.addEventListener("click", () =>
            handleApprove(i.number, feedback, approveBtn, rejectBtn)
          );
          rejectBtn.addEventListener("click", () =>
            handleReject(i.number, feedback, approveBtn, rejectBtn)
          );
          actions.appendChild(approveBtn);
          actions.appendChild(rejectBtn);
        }
      }

      if (i.state === "closed") {
        const reopenBtn = document.createElement("button");
        reopenBtn.className = "btn btn-warning btn-reopen";
        reopenBtn.textContent = "🔄 Riapri";
        reopenBtn.addEventListener("click", () =>
          handleReopen(i.number, feedback, reopenBtn)
        );
        actions.appendChild(reopenBtn);
      }

      card.appendChild(actions);
      card.appendChild(feedback);

      body.appendChild(card);
    }
  }
}

async function handleApprove(num, feedbackEl, approveBtn, rejectBtn) {
  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  feedbackEl.className = "issue-feedback";
  feedbackEl.classList.remove("hidden");
  feedbackEl.textContent = `⏳ Aggiungo label ${state.config.labels.approved}...`;
  try {
    // Aggiunge direttamente la label di approvazione su GitHub. Questo rende
    // la decisione visibile immediatamente: la issue verrà filtrata
    // dallo stato "analyzed" e apparirà in quello approvato. Postiamo anche
    // un commento /approve come audit/history.
    await addLabel(num, state.config.labels.approved);
    await postComment(num, "/approve");
    // Nascondi subito i pulsanti e mostra il badge di stato
    approveBtn.style.display = "none";
    rejectBtn.style.display = "none";
    const actionsEl = approveBtn.closest(".issue-actions, .board-card-actions");
    if (actionsEl && !actionsEl.querySelector(".issue-state-badge")) {
      const badge = document.createElement("span");
      badge.className = "issue-state-badge state-approved";
      badge.textContent = "✅ Approvata";
      actionsEl.appendChild(badge);
    }
    feedbackEl.classList.add("success");
    feedbackEl.textContent =
      `✅ Approvata. La label \`${state.config.labels.approved}\` è stata aggiunta, la issue è pronta per l'implementazione.`;
  } catch (err) {
    feedbackEl.classList.add("error");
    feedbackEl.textContent = "❌ Errore: " + err.message;
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

async function handleReject(num, feedbackEl, approveBtn, rejectBtn) {
  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  feedbackEl.className = "issue-feedback";
  feedbackEl.classList.remove("hidden");
  feedbackEl.textContent = `⏳ Aggiungo label ${state.config.labels.rejected}...`;
  try {
    // Aggiunge direttamente la label di rifiuto su GitHub. La issue verrà
    // filtrata come "excluded" nella dashboard. Commento /reject per audit.
    await addLabel(num, state.config.labels.rejected);
    await postComment(num, "/reject");
    // Nascondi subito i pulsanti
    approveBtn.style.display = "none";
    rejectBtn.style.display = "none";
    const actionsEl2 = approveBtn.closest(".issue-actions, .board-card-actions");
    if (actionsEl2 && !actionsEl2.querySelector(".issue-state-badge")) {
      const badge = document.createElement("span");
      badge.className = "issue-state-badge state-rejected";
      badge.textContent = "❌ Rifiutata";
      actionsEl2.appendChild(badge);
    }
    feedbackEl.classList.add("success");
    feedbackEl.textContent =
      `✅ Rifiutata. La label \`${state.config.labels.rejected}\` è stata aggiunta, la issue è esclusa.`;
  } catch (err) {
    feedbackEl.classList.add("error");
    feedbackEl.textContent = "❌ Errore: " + err.message;
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

async function handleCustomComment(num, text, feedbackEl) {
  feedbackEl.className = "issue-feedback";
  feedbackEl.classList.remove("hidden");
  feedbackEl.textContent = "⏳ Invio commento...";
  try {
    await postComment(num, text);
    feedbackEl.classList.add("success");
    feedbackEl.textContent = "✅ Commento inviato.";
  } catch (err) {
    feedbackEl.classList.add("error");
    feedbackEl.textContent = "❌ Errore: " + err.message;
  }
}

async function handleForceTriage(num, feedbackEl, triageBtn) {
  triageBtn.disabled = true;
  feedbackEl.className = "issue-feedback";
  feedbackEl.classList.remove("hidden");
  feedbackEl.textContent = "⏳ Forzo triage su #" + num + "...";
  try {
    // Remove approved if present, add triage
    await gh("/repos/" + state.config.repo + "/issues/" + num + "/labels", {
      method: "POST",
      body: JSON.stringify([state.config.labels.triage]),
    });
    // PATCH to remove approved
    const labels = await gh("/repos/" + state.config.repo + "/issues/" + num, {
      headers: { Accept: "application/vnd.github+json" },
    });
    const currentLabels = (labels.labels || []).map((l) => l.name);
    const toRemove = currentLabels.filter(
      (l) => l === state.config.labels.approved
    );
    if (toRemove.length) {
      for (const l of toRemove) {
        await gh(
          "/repos/" + state.config.repo + "/issues/" + num + "/labels/" + l,
          {
            method: "DELETE",
          }
        );
      }
    }
    feedbackEl.classList.add("success");
    feedbackEl.textContent =
      "✅ #" +
      num +
      " marcata con `" +
      state.config.labels.triage +
      "`. Verrà analizzata al prossimo run.";
  } catch (err) {
    feedbackEl.classList.add("error");
    feedbackEl.textContent = "❌ Errore: " + err.message;
  } finally {
    triageBtn.disabled = false;
  }
}

async function handleReopen(num, feedbackEl, reopenBtn) {
  const reason = window.prompt(
    `Motivo riapertura #${num} (verrà postato come commento + riapertura):`
  );
  if (!reason) return;
  reopenBtn.disabled = true;
  feedbackEl.className = "issue-feedback";
  feedbackEl.classList.remove("hidden");
  feedbackEl.textContent = "⏳ Riapro issue...";
  try {
    await postComment(num, `🔄 **Riapertura**: ${reason}`);
    // Reopen via the GitHub REST API (gh() throws on error, returns JSON on success)
    await gh("/repos/" + state.config.repo + "/issues/" + num, {
      method: "PATCH",
      body: JSON.stringify({ state: "open", state_reason: "reopened" }),
    });
    feedbackEl.classList.add("success");
    feedbackEl.textContent =
      "✅ Issue riaperta. Torna allo stato 'Aperte' dopo il refresh.";
  } catch (err) {
    feedbackEl.classList.add("error");
    feedbackEl.textContent = "❌ Errore: " + err.message;
  } finally {
    reopenBtn.disabled = false;
  }
}

// === #502 — Submit & Resume dialog ===

// Costruisce la mappa { issueNumber: comments[] } a partire dalle issue
// caricate (ogni issue ha già __comments popolato in loadIssues).
function buildCommentsByIssue(issues) {
  const map = {};
  for (const i of issues || []) {
    if (i && i.number)
      map[i.number] = Array.isArray(i.__comments) ? i.__comments : [];
  }
  return map;
}

// Apre il dialog modale "Resume" con l'elenco delle issue bloccate.
// Se non ce ne sono, mostra un toast e non apre nulla.
function openResumeDialog() {
  const dialog = $("#resume-dialog");
  const list = $("#resume-issues-list");
  const response = $("#resume-response");
  if (!dialog || !list) return;

  const commentsByIssue = buildCommentsByIssue(state.issues);
  const resumable = selectResumableIssues(state.issues, commentsByIssue, state.config);

  if (resumable.length === 0) {
    showToast("Nessuna issue bloccata da riprendere", "");
    return;
  }

  list.innerHTML = "";
  resumable.forEach((issue, idx) => {
    const li = document.createElement("li");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "resume-issue";
    radio.value = String(issue.number);
    radio.id = "resume-issue-" + issue.number;
    if (idx === 0) radio.checked = true;

    const label = document.createElement("label");
    label.htmlFor = radio.id;
    const labels = (issue.labels || []).map((l) =>
      typeof l === "string" ? l : l.name
    );
    const reason = labels.includes(state.config.labels.awaiting_human_response)
      ? state.config.labels.awaiting_human_response
      : state.config.labels.in_progress + " · bloccata";
    label.innerHTML =
      `<strong>#${issue.number}</strong> · ` +
      `${escapeHtml(issue.title || "")} ` +
      `<em>(${escapeHtml(reason)})</em>`;

    li.appendChild(radio);
    li.appendChild(label);
    list.appendChild(li);
  });

  if (response) response.value = "";
  dialog.showModal();
}

// Handler di submit del form Resume: posta il commento /resume + label swap.
async function handleResumeSubmit(form) {
  // Le radio stanno in #resume-issues-list (fuori dal <form>), quindi la
  // query va fatta sul documento/list, non su `form` (bug #626: il dialog
  // non si chiudeva perché selected era sempre null).
  const selected = $("#resume-issues-list input[name='resume-issue']:checked");
  const response = $("#resume-response");
  const sendBtn = $("#resume-send-btn");
  if (!selected) {
    showToast("Seleziona un'issue da riprendere", "error");
    return;
  }
  const issueNumber = parseInt(selected.value, 10);
  const responseText = response ? response.value : "";
  try {
    const comment = buildResumeComment(responseText);
    const issue = (state.issues || []).find((i) => i.number === issueNumber);
    const swap = computeResumeLabelSwap((issue && issue.labels) || [], state.config);
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = "⏳ Invio...";
    }
    // 1) Posta il commento /resume (la triage lo interpreterà al prossimo run).
    await postComment(issueNumber, comment);
    // 2) Aggiungi le label (human_responded + eventualmente in_progress)
    //    in un'unica chiamata: l'endpoint accetta un array di nomi.
    if (swap.add.length) {
      await gh(`/repos/${state.config.repo}/issues/${issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: swap.add }),
      });
    }
    // 3) Rimuovi le label obsolete (awaiting_human_response).
    for (const label of swap.remove) {
      await removeLabel(issueNumber, label);
    }
    $("#resume-dialog").close();
    showToast(`✅ Resume inviato per #${issueNumber}`, "success");
    // Ricarica per riflettere il nuovo stato delle label.
    await loadIssues();
  } catch (err) {
    showToast("❌ Errore resume: " + err.message, "error");
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "▶️ Invia resume";
    }
  }
}

// === T3.7 — Branding, Manifest & Piano, Nuovo progetto da PRD ===

// Branding config-driven: imposta <title> e il testo dell'h1 dal
// config.title (nessun testo brand cablato in index.html).
function applyBranding(config) {
  const title = config && config.title ? config.title : "";
  if (!title) return;
  document.title = title;
  const h1 = $("#app-title");
  if (h1) h1.textContent = "📋 " + title;
}

// Fetch di un file read-only del cockpit con cache no-store. Ritorna null su
// 404 / errore di rete / qualunque risposta non-ok: la UI mostra "non
// disponibile" senza sollevare eccezioni.
async function fetchReadonlyFile(name) {
  try {
    const res = await fetch(name, { cache: "no-store" });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

// Vista "Manifest & Piano" (sola lettura): renderizza manifest.json (JSON
// pretty-printed) e plan.md come testo. Se mancanti → "non disponibile".
async function renderManifestPlan() {
  const manifestEl = $("#manifest-content");
  const planEl = $("#plan-content");
  // F11 architettura A: manifest.json/plan.md vivono sotto projects/<name>/
  // per ogni progetto. Sulla home (no progetto selezionato) la sezione
  // mostra "non disponibile" con grazia (entrambi i fetch tornano null).
  const project = currentProjectFromHash();
  const [manifestText, planText] = await Promise.all([
    fetchReadonlyFile(buildProjectPath(project, "manifest.json")),
    fetchReadonlyFile(buildProjectPath(project, "plan.md")),
  ]);

  if (manifestEl) {
    if (manifestText == null) {
      manifestEl.textContent = "";
    } else {
      try {
        manifestEl.textContent = JSON.stringify(
          JSON.parse(manifestText),
          null,
          2
        );
      } catch {
        manifestEl.textContent = manifestText;
      }
    }
  }
  if (planEl) {
    if (planText == null) {
      // File assente (es. dossier/plan.md non creato) o fetch fallito:
      // mostra un messaggio esplicito invece di un <pre> vuoto (il
      // placeholder CSS `:empty::before` non si applica perché <pre> non
      // è considerato vuoto dal browser — contiene un newline iniziale).
      planEl.textContent = emptyAssetMessage("Piano (plan.md)");
    } else {
      planEl.textContent = planText;
    }
  }
}

// Pannello "Docs" (ADR-0011 U3-coda, sola lettura): consuma docs-status.json
// (emesso da `sf docs status`), non ricalcola il drift — il motore è la CLI.
async function renderDocsPanelView() {
  const el = $("#docs-content");
  if (!el) return;
  const text = await fetchReadonlyFile("docs-status.json");
  let status = null;
  if (text != null) {
    try {
      status = JSON.parse(text);
    } catch {
      status = null;
    }
  }
  el.innerHTML = renderDocsPanel(status, Date.now());
}

// === F12-min (3a) — Impostazioni pubblicazione (Pages) ===

// Repo/path/branch sorgente del config del cockpit (dove vive `cockpit/config.json`).
// Derivati da `state.config.pages.source*`: se assenti, il campo non è editabile
// (non sappiamo dove committare).
function publishSource() {
  const pages = (state.config && state.config.pages) || {};
  return {
    repo: pages.sourceRepo || "",
    path: pages.sourcePath || "",
    branch: pages.sourceBranch || "",
  };
}

// Verifica i permessi del token loggato sul repo sorgente: `permissions.push`
// === true significa che il PAT può committare (Contents write). Ritorna un
// booleano; su errore ritorna false (read-only, mai eccezione verso l'utente).
async function canWriteToRepo(repo) {
  try {
    const r = await gh(`/repos/${repo}`);
    const p = r.permissions || {};
    return p.push === true || p.admin === true;
  } catch {
    return false;
  }
}

// Base64 UTF-8 (il config.json può contenere caratteri non-ASCII).
function b64EncodeUtf8(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

function b64DecodeUtf8(b64) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0))
  );
}

// Apre il dialog: carica i valori correnti, verifica i permessi di scrittura e
// abilita/disabilita i campi di conseguenza.
// === F12-min (3b) — Messaggi guida Pages/token (verifica-e-segnala) ===

// Verifica-e-segnala (mai abilitazione automatica): controlla sul repo target
// (1) se GitHub Pages è abilitata e (2) se il token loggato raggiunge il repo.
// Per ogni caso mancante mostra un messaggio guidato con i passi da fare a mano.
// Non scrive nulla: solo chiamate GET.
async function checkPublishGuides(publishRepo) {
  const guide = $("#settings-guide");
  const pagesEl = $("#settings-guide-pages");
  const tokenEl = $("#settings-guide-token");
  if (!guide) return;

  pagesEl.classList.add("hidden");
  tokenEl.classList.add("hidden");
  pagesEl.textContent = "";
  tokenEl.textContent = "";

  if (!publishRepo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(publishRepo)) {
    guide.classList.add("hidden");
    return;
  }
  guide.classList.remove("hidden");

  // Caso 1 — Pages abilitata sul target? GET /repos/{repo}/pages → 404 = no.
  try {
    await gh(`/repos/${publishRepo}/pages`);
  } catch (err) {
    if (/404|Not Found/i.test(err.message)) {
      pagesEl.classList.remove("hidden");
      pagesEl.innerHTML =
        "⚠️ <strong>Pages non abilitata</strong> su <code>" +
        escapeHtml(publishRepo) +
        "</code>.<br>Abilitala a mano: <strong>repo target → Settings → Pages → " +
        "source: branch/cartella</strong> (poi il workflow la pubblicherà).";
    }
  }

  // Caso 2 — Il token con cui sei autenticato sul cockpit raggiunge il repo?
  // GET /repos/{repo} → 404 = no. NOTA: NON verifica PAGES_DEPLOY_TOKEN (il
  // secret usato dal workflow di pubblicazione, non ispezionabile da JS
  // client-side): quello va controllato separatamente su Settings → Secrets.
  try {
    await gh(`/repos/${publishRepo}`);
  } catch (err) {
    if (/404|Not Found/i.test(err.message)) {
      tokenEl.classList.remove("hidden");
      tokenEl.innerHTML =
        "⚠️ <strong>Il token con cui hai effettuato l'accesso al cockpit non ha " +
        "accesso</strong> a <code>" +
        escapeHtml(publishRepo) +
        "</code>.<br>Fine-grained PAT non estendibile via API: " +
        "<strong>Settings → Developer settings → Fine-grained tokens → " +
        "modifica il token → aggiungi il repository</strong>.<br><em>Nota: questo " +
        "NON verifica <code>PAGES_DEPLOY_TOKEN</code>, il secret usato dal " +
        "workflow di pubblicazione — quello va controllato separatamente su " +
        "Settings → Secrets.</em>";
    }
  }

  // Se entrambi i check sono passati (nessun messaggio visibile), nascondi il
  // contenitore per non mostrare un box vuoto.
  if (
    pagesEl.classList.contains("hidden") &&
    tokenEl.classList.contains("hidden")
  ) {
    guide.classList.add("hidden");
  }
}

// Apre il dialog: carica i valori correnti, verifica i permessi di scrittura e
// abilita/disabilita i campi di conseguenza.
async function openSettingsDialog() {
  const dlg = $("#settings-dialog");
  if (!dlg) return;
  const src = publishSource();
  const pages = (state.config && state.config.pages) || {};

  $("#settings-error").classList.add("hidden");
  $("#settings-readonly").classList.add("hidden");
  $("#settings-source-repo").textContent = src.repo || "—";
  $("#settings-source-path").textContent = src.path || "—";
  $("#settings-publish-repo").value = pages.publishRepo || "";
  $("#settings-publish-branch").value = pages.publishBranch || "main";

  const editable = src.repo && src.path && (await canWriteToRepo(src.repo));
  $("#settings-publish-repo").disabled = !editable;
  $("#settings-publish-branch").disabled = !editable;
  $("#settings-save-btn").disabled = !editable;
  if (!editable) $("#settings-readonly").classList.remove("hidden");

  // 3b — verifica-e-segnala sul valore corrente (Pages abilitata + token).
  await checkPublishGuides(pages.publishRepo || "");

  dlg.showModal();
}

// Committa l'aggiornamento di `pages.publishRepo`/`publishBranch` sul file
// sorgente via GitHub Contents API (GET sha → modifica JSON → PUT). Nessuna
// scrittura sulle impostazioni del repo, solo sul config versionato.
async function handleSettingsSubmit(form) {
  const errEl = $("#settings-error");
  hideError(errEl);

  const src = publishSource();
  if (!src.repo || !src.path) {
    showError(errEl, "Sorgente del config non configurata (manca pages.sourceRepo/sourcePath).");
    return;
  }

  const publishRepo = $("#settings-publish-repo").value.trim();
  const publishBranch = $("#settings-publish-branch").value.trim();
  if (!publishRepo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(publishRepo)) {
    showError(errEl, "Repo di pubblicazione non valido (atteso owner/nome).");
    return;
  }
  if (!publishBranch) {
    showError(errEl, "Branch di pubblicazione obbligatorio.");
    return;
  }

  const saveBtn = $("#settings-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "⏳ Salvo...";
  try {
    // 1) Leggi il file corrente (sha + content base64).
    const file = await gh(
      `/repos/${src.repo}/contents/${src.path}?ref=${encodeURIComponent(src.branch)}`
    );
    if (typeof file.sha !== "string" || typeof file.content !== "string") {
      throw new Error("Risposta inattesa dalla Contents API (manca sha/content).");
    }

    // 2) Modifica il JSON: aggiorna solo `pages.publishRepo`/`publishBranch`.
    const parsed = JSON.parse(b64DecodeUtf8(file.content));
    parsed.pages = parsed.pages || {};
    parsed.pages.publishRepo = publishRepo;
    parsed.pages.publishBranch = publishBranch;

    // 3) PUT: stessa sha, stesso branch, nuovo content.
    await gh(`/repos/${src.repo}/contents/${src.path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: "chore(cockpit): aggiorna pages.publishRepo via cockpit",
        content: b64EncodeUtf8(JSON.stringify(parsed, null, 2) + "\n"),
        sha: file.sha,
        branch: src.branch,
      }),
    });

    $("#settings-dialog").close();
    showToast("✅ Impostazioni pubblicazione salvate", "success");
    // 3b — dopo il salvataggio, verifica il nuovo target e segnala eventuali
    // passi manuali (Pages non abilitata / token senza accesso).
    await checkPublishGuides(publishRepo);
    // Se la verifica ha trovato qualcosa da segnalare, riapri il dialog per
    // mostrare la guida (il form resta aperto con i nuovi valori).
    const guideEl = $("#settings-guide");
    if (guideEl && !guideEl.classList.contains("hidden")) {
      $("#settings-dialog").showModal();
    }
  } catch (err) {
    showError(errEl, "Errore salvataggio: " + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salva";
  }
}

function openNewProjectDialog() {
  const dlg = $("#new-project-dialog");
  if (!dlg) return;
  $("#new-project-error").classList.add("hidden");
  $("#new-project-result").classList.add("hidden");
  $("#new-project-name").value = "";
  $("#new-project-prd").value = "";
  $("#new-project-file").value = "";
  dlg.showModal();
}

// Genera il comando `sf new` dal nome progetto + PRD (incollato o caricato).
// Nessuna esecuzione: solo comando copiabile + download del PRD normalizzato
// come `<nome>.md`. Nome vuoto → errore inline (nessuna eccezione).
function handleNewProjectSubmit() {
  const nameInput = $("#new-project-name");
  const prdInput = $("#new-project-prd");
  const fileInput = $("#new-project-file");
  const errEl = $("#new-project-error");
  const name = (nameInput && nameInput.value ? nameInput.value : "").trim();

  if (!name) {
    showError(errEl, "Il nome del progetto è obbligatorio.");
    return;
  }
  hideError(errEl);

  const prdFileName = name + ".md";

  const renderResult = (content) => {
    newProjectPrd = { content: content || "", fileName: prdFileName };
    $("#new-project-command").textContent = buildNewProjectCommand(
      name,
      prdFileName
    );
    $("#new-project-result").classList.remove("hidden");
  };

  const file = fileInput && fileInput.files && fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => renderResult(String(reader.result || ""));
    reader.onerror = () =>
      showError(errEl, "Errore nella lettura del file PRD.");
    reader.readAsText(file);
    return;
  }

  renderResult(prdInput ? prdInput.value : "");
}

async function copyNewProjectCommand() {
  const cmd = $("#new-project-command").textContent;
  try {
    await navigator.clipboard.writeText(cmd);
    showToast("Comando copiato negli appunti", "success");
  } catch (err) {
    showToast("Impossibile copiare: " + err.message, "error");
  }
}

function downloadNewProjectPrd() {
  const prd = newProjectPrd;
  if (!prd) return;
  const blob = new Blob([prd.content || ""], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = prd.fileName || "prd.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// === Main flow ===

async function loginWithToken(token) {
  saveToken(token);
  try {
    state.user = await fetchUser();
    renderUserInfo();
    showView("dashboard");
    showToast("Connesso come @" + state.user.login, "success");
    await loadIssues();
  } catch (err) {
    clearToken();
    const errEl = $("#pat-error");
    showError(errEl, "Login fallito: " + err.message);
  }
}

// (#516) Protezione contro race condition + spinner permanente.
// Quando un nuovo loadIssues() parte mentre uno è ancora in corso, il
// precedente viene abortito. Un timeout globale di 60s sul Promise.all
// evita che lo spinner resti visibile per sempre se GitHub non risponde.
let currentLoadController = null;

const DASHBOARD_LOAD_TIMEOUT_MS = 60_000;

async function loadIssues() {
  const loading = $("#loading");
  const list = $("#issues-list");

  // Annulla eventuali caricamenti pendenti (race con refresh / cambio filtro).
  if (currentLoadController) {
    currentLoadController.abort();
  }
  const controller = new AbortController();
  currentLoadController = controller;

  loading.classList.remove("hidden");
  list.innerHTML = "";
  try {
    state.issues = await fetchIssues({ signal: controller.signal });
    if (controller.signal.aborted) return;

    // Per ogni issue aperta, scarica i commenti per estrarre l'analisi AI.
    // Le issue chiuse raramente hanno un commento di triage recente, ma
    // per coerenza le carichiamo comunque (rate limit: 1 chiamata/issue).
    // Limita a 50 issue per non sforare il rate limit (5000/h).
    const limited = state.issues.slice(0, 50);

    // Timeout globale sul Promise.all per evitare spinner permanente se
    // GitHub rate-limita o è lento. Il timeout rigetta prima del completamento.
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        controller.abort();
        reject(
          new Error(
            `Dashboard load timeout (${DASHBOARD_LOAD_TIMEOUT_MS / 1000}s)`
          )
        );
      }, DASHBOARD_LOAD_TIMEOUT_MS);
    });

    await Promise.race([
      Promise.all(
        limited.map(async (issue) => {
          if (controller.signal.aborted) return;
          const comments = await fetchComments(issue.number, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          issue.__comments = comments;
          issue.__analysis = extractAnalysis(comments, state.config);
          issue.__blocked = extractBlocked(comments, state.config);
        })
      ),
      timeoutPromise,
    ]);

    if (controller.signal.aborted) return;

    renderFilters();
    updateStateFilterLabels();
    renderPendingFeedback(state.issues);
    renderIssues();
    renderBoard();
  } catch (err) {
    if (err.name === "AbortError") {
      // Abort esplicito da un nuovo loadIssues() — silenzioso.
      console.warn("Dashboard load aborted (nuovo caricamento in corso)");
      return;
    }
    if (controller.signal.aborted) {
      console.warn("Dashboard load aborted (nuovo caricamento in corso)");
      return;
    }
    showToast("Errore caricamento issue: " + err.message, "error");
  } finally {
    // Solo se siamo ancora il caricamento "corrente": un nuovo load che
    // è partito nel frattempo non deve chiudere il proprio spinner qui.
    if (currentLoadController === controller) {
      currentLoadController = null;
      loading.classList.add("hidden");
    }
  }
}

async function startDeviceFlowLogin() {
  const errEl = $("#login-error");
  hideError(errEl);
  $("#login-btn").disabled = true;
  $("#use-pat-btn").disabled = true;
  $("#device-loading").classList.remove("hidden");

  try {
    const { device_code, user_code, verification_uri, interval, expires_in } =
      await startDeviceFlow();

    // Mostra il codice
    $("#device-code-display").classList.remove("hidden");
    $("#device-code").textContent = user_code;
    $("#device-link").href = verification_uri;
    $("#device-loading").classList.add("hidden");

    const expiresAt = Date.now() + expires_in * 1000;
    const token = await pollForToken(device_code, interval, expiresAt);

    // Successo
    $("#device-code-display").classList.add("hidden");
    await loginWithToken(token);
  } catch (err) {
    $("#device-loading").classList.add("hidden");
    $("#device-code-display").classList.add("hidden");
    showError(errEl, err.message);
  } finally {
    $("#login-btn").disabled = false;
    $("#use-pat-btn").disabled = false;
  }
}

// === Event listeners ===

document.addEventListener("DOMContentLoaded", async () => {
  // === F11 — routing: home multi-progetto vs progetto singolo ===
  const project = currentProjectFromHash();
  if (!project) {
    // Nessun `#project=<name>` → home con l'elenco dei progetti scoperti.
    try {
      const index = await loadProjectsIndex();
      renderHome(index);
      showView("home");
      $("#home-new-project-btn").addEventListener("click", openNewProjectDialog);
    } catch (err) {
      showError($("#home-error"), "Errore caricamento indice progetti: " + err.message);
    }
    // Navigazione: cliccando un progetto l'hash cambia → reload con il nuovo
    // progetto attivo (stato pulito, nessuna sovrapposizione di listener).
    window.addEventListener("hashchange", () => location.reload());
    return;
  }

  // === Config (T3.2) ===
  // Carica e valida config.json PRIMA di ogni logica che tocca token/issue:
  // loadToken()/clearToken()/saveToken() usano state.config.storageKey, e
  // gh()/fetchIssues() usano state.config.repo/apiBase. Se la config manca o
  // non è valida, ci fermiamo qui senza alcun fetch issue.
  try {
    const result = normalizeConfig(await loadConfig(project));
    if (!result.ok) {
      showError(
        $("#login-error"),
        "Configurazione non valida: " + result.errors.join("; ")
      );
      return;
    }
    state.config = result.config;
    applyBranding(state.config);
    applyConfigToFilters();
  } catch (err) {
    showError(
      $("#login-error"),
      "Errore caricamento configurazione: " + err.message
    );
    return;
  }

  $("#login-btn").addEventListener("click", startDeviceFlowLogin);
  $("#use-pat-btn").addEventListener("click", () => showView("pat"));
  $("#pat-back-btn").addEventListener("click", () => showView("login"));

  $("#pat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pat = $("#pat-input").value.trim();
    if (!pat) return;
    hideError($("#pat-error"));
    loginWithToken(pat);
  });

  $("#pat-paste-btn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      $("#pat-input").value = text.trim();
    } catch (err) {
      showError(
        $("#pat-error"),
        "Impossibile leggere dagli appunti: " + err.message
      );
    }
  });

  $("#logout-btn").addEventListener("click", () => {
    clearToken();
    renderUserInfo();
    showView("login");
    $("#device-code-display").classList.add("hidden");
  });

  // Ogni filtro deve aggiornare SIA la lista singola (#issues-list, mobile)
  // SIA la board Kanban (#board, desktop). Senza renderBoard() le colonne
  // Kanban restano frozen al primo load e mostrano issue che il filtro ha
  // appena escluso (es. "Aperte" mostra chiuse, "Stato triage = approved"
  // mostra bug in needs_feedback, ecc.).
  $("#filter-status").addEventListener("change", (e) => {
    state.filters.state = e.target.value;
    renderIssues();
    renderBoard();
  });
  $("#filter-labels").addEventListener("change", (e) => {
    state.filters.labels = e.target.value;
    renderIssues();
    renderBoard();
  });
  $("#filter-state").addEventListener("change", (e) => {
    state.filters.triageState = e.target.value;
    renderIssues();
    renderBoard();
  });
  let searchTimer = null;
  $("#filter-search").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.search = e.target.value;
      renderIssues();
      renderBoard();
    }, 200);
  });

  $("#refresh-btn").addEventListener("click", () => loadIssues());

  // === #502 — Submit & Resume dialog ===
  $("#resume-btn").addEventListener("click", openResumeDialog);
  $("#resume-cancel-btn").addEventListener("click", () => {
    const d = $("#resume-dialog");
    if (d && d.open) d.close();
  });
  $("#resume-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleResumeSubmit(e.target);
  });

  // === T3.7 — Nuovo progetto da PRD + Manifest & Piano ===
  $("#new-project-btn").addEventListener("click", openNewProjectDialog);
  $("#new-project-cancel-btn").addEventListener("click", () => {
    const d = $("#new-project-dialog");
    if (d && d.open) d.close();
  });
  $("#new-project-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleNewProjectSubmit();
  });
  $("#new-project-copy-btn").addEventListener("click", copyNewProjectCommand);
  $("#new-project-download-btn").addEventListener(
    "click",
    downloadNewProjectPrd
  );
  $("#manifest-btn").addEventListener("click", () => {
    showView("manifest");
    renderManifestPlan();
  });
  $("#manifest-back-btn").addEventListener("click", () => showView("dashboard"));
  $("#docs-btn").addEventListener("click", () => {
    showView("docs");
    renderDocsPanelView();
  });
  $("#docs-back-btn").addEventListener("click", () => showView("dashboard"));

  // === F12-min (3a) — Impostazioni pubblicazione ===
  $("#settings-btn").addEventListener("click", openSettingsDialog);
  $("#settings-cancel-btn").addEventListener("click", () => {
    const d = $("#settings-dialog");
    if (d && d.open) d.close();
  });
  $("#settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleSettingsSubmit(e.target);
  });

  // Auto-login se token in localStorage
  const saved = loadToken();
  if (saved) {
    loginWithToken(saved);
  } else {
    showView("login");
  }
});

// Cockpit Triage Dashboard - lib.js
// Logica pura (triage/board/resume) estratta da app.js (T3.1) e parametrizzata
// via `config` (T3.3): label/priorità/tipi/marker/release-pattern non sono più
// cablati qui, arrivano tutti dal config normalizzato da `normalizeConfig`.
//
// ES module: importato da app.js (browser, <script type="module">) e dai
// test node:test via `await import()`. Nessuna dipendenza dal DOM né dallo
// stato globale del modulo: solo funzioni pure testabili in isolamento.

// Escape dei caratteri speciali regex per usare in sicurezza un valore di
// config (es. marker, releaseNotePattern) dentro `new RegExp`.
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Config schema (T3.2 + T3.3): identità app-level (repo/apiBase/storageKey) e
// vocabolario domain (labels/priorities/types/typeAliases/markers/releaseNotePattern).
// Normalizza e valida la config grezza letta da config.json. Pura, senza
// eccezioni: restituisce sempre { ok, config } o { ok, errors }.
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const DEFAULT_API_BASE = "https://api.github.com";
const DEFAULT_STORAGE_KEY = "cockpit:pat";
const DEFAULT_RELEASE_NOTE_PATTERN = "Risolto in v";

export function normalizeConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["config non valida: atteso un oggetto"] };
  }

  const errors = [];

  // repo: obbligatorio, stringa non vuota in formato owner/name.
  let repo = raw.repo;
  if (typeof repo !== "string" || repo.trim() === "") {
    errors.push("repo: campo obbligatorio mancante o vuoto");
  } else if (!REPO_PATTERN.test(repo)) {
    errors.push("repo: formato non valido (atteso owner/name)");
  }

  // apiBase: opzionale, default "https://api.github.com".
  let apiBase = raw.apiBase;
  if (apiBase === undefined || apiBase === null || apiBase === "") {
    apiBase = DEFAULT_API_BASE;
  } else if (typeof apiBase !== "string") {
    errors.push("apiBase: deve essere una stringa");
  }

  // storageKey: opzionale, default "cockpit:pat".
  let storageKey = raw.storageKey;
  if (storageKey === undefined || storageKey === null || storageKey === "") {
    storageKey = DEFAULT_STORAGE_KEY;
  } else if (typeof storageKey !== "string") {
    errors.push("storageKey: deve essere una stringa");
  }

  // title: opzionale (T3.7), stringa non vuota; default = nome repo (parte
  // dopo "/"). Il branding dell'app è config-driven, mai cablato nell'HTML/JS.
  let title = raw.title;
  if (title === undefined || title === null || title === "") {
    title =
      typeof repo === "string"
        ? repo.includes("/")
          ? repo.slice(repo.indexOf("/") + 1)
          : repo
        : "";
  } else if (typeof title !== "string" || title.trim() === "") {
    errors.push("title: deve essere una stringa non vuota");
  }

  // auth: obbligatorio (T3.4). Il Device Flow richiede githubAppClientId e
  // oauthWorkerUrl come stringhe non vuote; senza di essi l'app non può
  // autenticarsi. githubAppClientId è di fatto usato solo dal Worker (che
  // tiene client_id+secret), ma va comunque dichiarato per documentazione e
  // completezza della config.
  let auth = raw.auth;
  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
    errors.push("auth: campo obbligatorio mancante o non oggetto");
  } else {
    if (
      typeof auth.githubAppClientId !== "string" ||
      auth.githubAppClientId.trim() === ""
    ) {
      errors.push("auth.githubAppClientId: deve essere una stringa non vuota");
    }
    if (
      typeof auth.oauthWorkerUrl !== "string" ||
      auth.oauthWorkerUrl.trim() === ""
    ) {
      errors.push("auth.oauthWorkerUrl: deve essere una stringa non vuota");
    }
  }

  // labels: obbligatorio, oggetto i cui valori sono stringhe non vuote.
  let labels = raw.labels;
  if (typeof labels !== "object" || labels === null || Array.isArray(labels)) {
    errors.push("labels: campo obbligatorio mancante o non oggetto");
  } else {
    for (const [key, value] of Object.entries(labels)) {
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`labels.${key}: deve essere una stringa non vuota`);
      }
    }
  }

  // priorities: obbligatorio, array di stringhe non vuote.
  let priorities = raw.priorities;
  if (!Array.isArray(priorities)) {
    errors.push("priorities: campo obbligatorio mancante o non array");
  } else {
    priorities.forEach((p, idx) => {
      if (typeof p !== "string" || p.trim() === "") {
        errors.push(`priorities[${idx}]: deve essere una stringa non vuota`);
      }
    });
  }

  // types: obbligatorio, array di stringhe non vuote.
  let types = raw.types;
  if (!Array.isArray(types)) {
    errors.push("types: campo obbligatorio mancante o non array");
  } else {
    types.forEach((t, idx) => {
      if (typeof t !== "string" || t.trim() === "") {
        errors.push(`types[${idx}]: deve essere una stringa non vuota`);
      }
    });
  }

  // typeAliases: opzionale, oggetto string→string, default {}.
  let typeAliases = raw.typeAliases;
  if (typeAliases === undefined || typeAliases === null) {
    typeAliases = {};
  } else if (typeof typeAliases !== "object" || Array.isArray(typeAliases)) {
    errors.push("typeAliases: deve essere un oggetto");
  } else {
    for (const [key, value] of Object.entries(typeAliases)) {
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`typeAliases.${key}: deve essere una stringa non vuota`);
      }
    }
  }

  // boardTypes: opzionale, array di tipi con colonna board, default
  // ["bug", "idea", "richiesta"] (ordine = precedenza storica bug > idea >
  // richiesta). "audit" non è un board type, quindi resta fuori board.
  let boardTypes = raw.boardTypes;
  if (boardTypes === undefined || boardTypes === null) {
    boardTypes = ["bug", "idea", "richiesta"];
  } else if (!Array.isArray(boardTypes)) {
    errors.push("boardTypes: deve essere un array");
  } else {
    boardTypes.forEach((t, idx) => {
      if (typeof t !== "string" || t.trim() === "") {
        errors.push(`boardTypes[${idx}]: deve essere una stringa non vuota`);
      }
    });
  }

  // markers: opzionale, oggetto con triage/blocked stringhe non vuote.
  // Nessun default cablato qui: i valori vivono solo in config.json.
  let markers = raw.markers;
  if (markers === undefined || markers === null) {
    markers = undefined;
  } else if (typeof markers !== "object" || Array.isArray(markers)) {
    errors.push("markers: deve essere un oggetto");
  } else {
    if (typeof markers.triage !== "string" || markers.triage.trim() === "") {
      errors.push("markers.triage: deve essere una stringa non vuota");
    }
    if (typeof markers.blocked !== "string" || markers.blocked.trim() === "") {
      errors.push("markers.blocked: deve essere una stringa non vuota");
    }
    // markers.blockedLegacy: opzionale, array di sub-stringhe letterali non
    // vuote usate da selectResumableIssues per riconoscere commenti "blocked"
    // storici (nessun metacharattere regex: equivalgono a `.includes`).
    let blockedLegacy = markers.blockedLegacy;
    if (blockedLegacy === undefined || blockedLegacy === null) {
      blockedLegacy = [];
    } else if (!Array.isArray(blockedLegacy)) {
      errors.push("markers.blockedLegacy: deve essere un array");
    } else {
      blockedLegacy.forEach((p, idx) => {
        if (typeof p !== "string" || p.trim() === "") {
          errors.push(
            `markers.blockedLegacy[${idx}]: deve essere una stringa non vuota`
          );
        }
      });
    }
    markers = { ...markers, blockedLegacy };
  }

  // releaseNotePattern: opzionale, stringa non vuota, default "Risolto in v".
  let releaseNotePattern = raw.releaseNotePattern;
  if (
    releaseNotePattern === undefined ||
    releaseNotePattern === null ||
    releaseNotePattern === ""
  ) {
    releaseNotePattern = DEFAULT_RELEASE_NOTE_PATTERN;
  } else if (typeof releaseNotePattern !== "string") {
    errors.push("releaseNotePattern: deve essere una stringa");
  }

  // pages: opzionale (F13/F12-min). Contiene la config di pubblicazione GitHub
  // Pages (`publishRepo`/`publishBranch`) e, per il campo impostazioni del
  // cockpit (3a), dove vive la sorgente del config stesso (`sourceRepo`/
  // `sourcePath`/`sourceBranch`) per poterla aggiornare via API col PAT loggato.
  // Default `{}` quando assente. Valori vuoti/assenti → conservati così come sono
  // (la UI decide se il campo è editabile o read-only).
  let pages = raw.pages;
  if (pages === undefined || pages === null) {
    pages = {};
  } else if (typeof pages !== "object" || Array.isArray(pages)) {
    errors.push("pages: deve essere un oggetto");
  } else {
    pages = { ...pages };
    for (const key of [
      "publishRepo",
      "publishBranch",
      "sourceRepo",
      "sourcePath",
      "sourceBranch",
    ]) {
      const v = pages[key];
      if (v !== undefined && v !== null && v !== "" && typeof v !== "string") {
        errors.push(`pages.${key}: deve essere una stringa`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      repo,
      title,
      apiBase,
      storageKey,
      auth,
      labels,
      priorities,
      types,
      boardTypes,
      typeAliases,
      markers,
      releaseNotePattern,
      pages,
    },
  };
}

export function extractAnalysis(comments, config) {
  if (!Array.isArray(comments)) return null;
  const marker = (config.markers || {}).triage;
  if (!marker) return null;
  const triage = comments.find((c) =>
    (c.body || "").trim().startsWith(marker)
  );
  if (!triage) return null;

  const body = triage.body || "";
  // Strip marker
  const stripped = body.replace(new RegExp("^" + escapeRegExp(marker) + "\\s*"), "");

  // Estrai campi `- **Key**: value`
  function getField(name) {
    const re = new RegExp(`-\\s*\\*\\*${name}\\*\\*:\\s*(.+)`, "i");
    const m = stripped.match(re);
    return m ? m[1].trim() : null;
  }

  // Estrai sezione `### Nome` (fino al prossimo `###`, `---`, o fine testo)
  function getSection(name) {
    const re = new RegExp(
      `###\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n###|\\n---|\\n*$)`,
      "i"
    );
    const m = stripped.match(re);
    return m ? m[1].trim() : null;
  }

  const filesRaw = getSection("File coinvolti") || "";
  const files = filesRaw
    .split("\n")
    .map((l) => l.replace(/^-\s+/, "").replace(/`/g, "").trim())
    .filter((l) => l && !l.startsWith("###"));

  return {
    type: getField("Tipo") || null,
    severity: getField("Severity") || null,
    priority: getField("Priority") || null,
    area: getField("Area") || null,
    effort: getField("Effort") || null,
    benefit: getField("Benefit") || null,
    pareto: getField("Pareto") ? parseInt(getField("Pareto"), 10) : null,
    autoConfirm: getField("Auto-confirm") || null,
    releaseEstimate: getField("Stima rilascio") || null,
    outcome: getField("Esito") || null,
    diagnosis: getSection("Diagnosi"),
    rationale: getSection("Razionale costi/benefici"),
    files,
    generatedAt: triage.created_at,
  };
}

export function extractBlocked(comments, config) {
  if (!Array.isArray(comments)) return null;
  const marker = (config.markers || {}).blocked;
  if (!marker) return null;
  // Find the most recent blocked-marker comment
  const blocked = comments
    .filter((c) => (c.body || "").startsWith(marker))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (blocked.length === 0) return null;
  const c = blocked[0];
  return {
    timestamp: c.created_at,
    author: c.user ? c.user.login : null,
    body: c.body,
    url: c.html_url,
  };
}

export function getTriageState(issue, config) {
  const labels = (issue.labels || []).map((l) => l.name);
  const L = config.labels;
  if (labels.includes(L.triage)) return "triage";
  if (labels.includes(L.rejected) || labels.includes(L.duplicated))
    return "excluded";
  if (labels.includes(L.delayed)) return "delayed";
  // needs_feedback ha priorità su approved/analyzed: una issue che aspetta
  // intervento umano è "in attesa di feedback" a prescindere dalle altre label.
  if (labels.includes(L.needs_feedback)) return "needs_feedback";
  if (labels.includes(L.approved)) return "approved";
  if (
    config.priorities.some((p) => labels.includes(p)) ||
    labels.some((l) => config.types.includes(l))
  ) {
    // Ha priority/type ma non approved: è stata analizzata
    return "analyzed";
  }
  if (issue.state === "closed" && labels.includes(L.fixed)) return "fixed";
  return null; // nessuno stato noto
}

export function typeOf(issue, config) {
  const labels = (issue.labels || []).map((l) =>
    typeof l === "string" ? l : l && l.name
  );
  const aliases = config.typeAliases || {};
  // Applica prima gli alias (es. enhancement → richiesta), poi confronta coi
  // tipi con colonna board.
  const resolved = labels.map((l) =>
    aliases[l] !== undefined ? aliases[l] : l
  );

  // Board types da config.boardTypes: l'ordine definisce la precedenza
  // (storico bug > idea > richiesta). "audit" non è in boardTypes e quindi
  // non mappa mai a un tipo board (resta null), comportamento storico.
  const boardTypes = config.boardTypes || ["bug", "idea", "richiesta"];
  return boardTypes.find((t) => resolved.includes(t)) || null;
}

export function kanbanColumn(issue, config) {
  const labels = (issue.labels || []).map((l) =>
    typeof l === "string" ? l : l && l.name
  );
  const ts = getTriageState(issue, config);
  const type = typeOf(issue, config);
  // Struttura fissa della board: colonna 1 = tipo "solo" (Bug), colonna 2 =
  // tipi "raggruppati" (Richieste/Idee). I nomi canonici arrivano da
  // config.boardTypes (ordine = precedenza), non da destrutturazione
  // posizionale di config.types.
  const soloType = config.boardTypes[0];
  const groupTypes = config.boardTypes.slice(1);

  // Una issue chiusa non richiede più triage né chiarimenti: può comparire
  // solo nelle colonne di tipo (con badge "chiusa") come storico, mai in
  // Triage o Chiarimenti. Senza tipo non ha colonna (#641).
  if (issue.state === "closed") {
    if (type === soloType) return 1;
    if (groupTypes.includes(type)) return 2;
    return -1;
  }

  // 3. Chiarimenti/feedback (priorità massima)
  if (
    ts === "needs_feedback" ||
    labels.includes(config.labels.awaiting_human_response)
  ) {
    return 3;
  }

  // 1. Bug (analizzate / approvate / in esecuzione)
  if (type === soloType) {
    return 1;
  }

  // 2. Richieste e idee
  if (groupTypes.includes(type)) {
    return 2;
  }

  // 0. Triage (da analizzare + non classificate)
  return 0;
}

export function selectPendingFeedback(issues, config) {
  return (issues || []).filter(function (i) {
    const labels = (i.labels || []).map(function (l) {
      return l.name;
    });
    const L = config.labels;
    const inProgressBlocked =
      labels.indexOf(L.in_progress) >= 0 && !!i.__blocked;
    const needsFeedback = labels.indexOf(L.needs_feedback) >= 0;
    const awaiting = labels.indexOf(L.awaiting_human_response) >= 0;
    return (
      i.state === "open" && (inProgressBlocked || needsFeedback || awaiting)
    );
  });
}

export function hasResolvedComment(i, config) {
  const comments = Array.isArray(i && i.__comments) ? i.__comments : [];
  const pattern = config.releaseNotePattern;
  if (
    comments.some((c) =>
      c && c.body ? c.body.includes(pattern) : false
    )
  ) {
    return true;
  }
  if (i && i.__blocked && (i.__blocked.body || "").includes(pattern)) {
    return true;
  }
  return false;
}

// Pattern generico di versione release (resta cablato: è una convenzione di
// formato, non un valore project-specific).
const RELEASE_VERSION_PATTERN = "v\\d+\\.\\d+\\.\\d+(?:-[a-z0-9.]+)?";

// Costruisce la regex di estrazione release a partire da releaseNotePattern
// (es. "Risolto in v") + il pattern versione. Il pattern termina con la "v"
// condivisa con il prefisso versione: la "v" finale va rimossa dal prefisso
// letterale per non duplicarla (comportamento storico preservato).
function buildReleaseRegex(releaseNotePattern) {
  const prefix = String(releaseNotePattern).replace(/v\s*$/, "");
  return new RegExp(
    escapeRegExp(prefix) +
      "(" + RELEASE_VERSION_PATTERN + ")" +
      "(?:,\\s*(" + RELEASE_VERSION_PATTERN + "))*",
    "g"
  );
}

export function extractReleaseVersions(comments, config) {
  if (!comments || !Array.isArray(comments)) return [];
  const re = buildReleaseRegex(config.releaseNotePattern);
  const found = new Set();
  for (const c of comments) {
    if (!c || !c.body) continue;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(c.body)) !== null) {
      for (let i = 1; i < m.length; i++) {
        if (m[i]) found.add(m[i]);
      }
      // Guardia anti-loop infinito: se nessun match ha progredito, esci.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // Sort by version semver-ish (numeric compare on tuple).
  return [...found].sort((a, b) => {
    const pa = a.replace(/^v/, "").split(/[.-]/);
    const pb = b.replace(/^v/, "").split(/[.-]/);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = Number(pa[i] || 0);
      const nb = Number(pb[i] || 0);
      if (isNaN(na) || isNaN(nb)) return a.localeCompare(b);
      if (na !== nb) return na - nb;
    }
    return 0;
  });
}

export function countByState(issues, config) {
  const counts = { open: 0, in_progress: 0, closed: 0, released: 0 };
  const L = config.labels;
  for (const i of issues) {
    if (i.state === "open") {
      counts.open++;
      const labels = (i.labels || []).map((l) => l.name);
      if (labels.includes(L.in_progress)) counts.in_progress++;
    } else if (i.state === "closed") {
      counts.closed++;
      const labels = (i.labels || []).map((l) => l.name);
      // "Rilasciate" heuristic: closed + has release comment OR label released
      if (labels.includes(L.released) || hasResolvedComment(i, config))
        counts.released++;
    }
  }
  return counts;
}

export function selectResumableIssues(issues, commentsByIssue, config) {
  if (!Array.isArray(issues)) return [];
  const L = config.labels;
  return issues
    .filter((i) => i && i.state === "open")
    .filter((i) => {
      const labels = (i.labels || []).map((l) =>
        typeof l === "string" ? l : l.name
      );
      const isAwaiting = labels.includes(L.awaiting_human_response);
      const isNeedsFeedback = labels.includes(L.needs_feedback);
      const isInProgress = labels.includes(L.in_progress);
      if (isAwaiting || isNeedsFeedback) return true;
      if (isInProgress) {
        const comments = (commentsByIssue && commentsByIssue[i.number]) || [];
        const blockedLegacy = (config.markers || {}).blockedLegacy || [];
        const lastBlocked = comments.find((c) =>
          c && c.body
            ? blockedLegacy.some((p) => (c.body || "").includes(p))
            : false
        );
        return !!lastBlocked;
      }
      return false;
    })
    .sort((a, b) => (b.number || 0) - (a.number || 0));
}

export function buildResumeComment(responseText) {
  if (
    !responseText ||
    typeof responseText !== "string" ||
    !responseText.trim()
  ) {
    throw new Error("responseText obbligatorio per /resume");
  }
  return `/resume\n\n${responseText.trim()}`;
}

export function computeResumeLabelSwap(currentLabels, config) {
  const labels = (currentLabels || []).map((l) =>
    typeof l === "string" ? l : (l && l.name) || ""
  );
  const L = config.labels;
  const add = [L.human_responded];
  const remove = [];
  if (labels.includes(L.awaiting_human_response))
    remove.push(L.awaiting_human_response);
  // Anche `needs_feedback` va rimosso al resume: altrimenti l'issue resta
  // "in attesa feedback" e non torna in coda `approved`.
  if (labels.includes(L.needs_feedback)) remove.push(L.needs_feedback);
  // in_progress viene lasciato se già presente; se mancante, va aggiunto
  if (!labels.includes(L.in_progress)) add.push(L.in_progress);
  return { add, remove };
}

export function approveRejectButtonsState(issue, config) {
  if (!issue || issue.state === "open") {
    return { approveClass: "btn-approve", rejectClass: "btn-reject" };
  }
  // Issue chiusa
  const labels = (issue.labels || []).map(function (l) {
    return typeof l === "string" ? l : l && l.name;
  });
  const isRejected = labels.indexOf(config.labels.rejected) >= 0;
  if (isRejected) {
    return { approveClass: "btn-inactive", rejectClass: "btn-rejected" };
  }
  return { approveClass: "btn-approve", rejectClass: "btn-inactive" };
}

// Quoting minimo per gli argomenti shell del comando `sf new` (T3.7): nessun
// quoting se il valore è un token "sicuro" (lettere/cifre/._-), altrimenti
// virgolette doppie con escape dei caratteri pericolosi per la shell.
function shellQuote(arg) {
  const s = String(arg);
  if (/^[A-Za-z0-9_.-]+$/.test(s)) return s;
  return (
    '"' +
    s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\$/g, "\\$")
      .replace(/`/g, "\\`") +
    '"'
  );
}

// Costruisce il comando `sf new <projectName> <prdFileName>` da eseguire
// localmente. Pura e testabile: nessuna esecuzione, nessun accesso al DOM/fs.
// `prdFileName` di default è "prd.md"; projectName vuoto lancia un errore.
export function buildNewProjectCommand(projectName, prdFileName = "prd.md") {
  if (typeof projectName !== "string" || projectName.trim() === "") {
    throw new Error("projectName obbligatorio per sf new");
  }
  const name = projectName.trim();
  const file =
    prdFileName == null || prdFileName === ""
      ? "prd.md"
      : String(prdFileName).trim();
  return `sf new ${shellQuote(name)} ${shellQuote(file)}`;
}

// Path di un asset read-only nel sito pubblicato. Con un nome di progetto,
// l'asset vive in `projects/<name>/<file>` (architettura multi-progetto F11);
// senza, vive alla radice (single-project / home). Pura: nessun fetch.
export function buildProjectPath(projectName, file) {
  const f = String(file || "");
  if (!f) return "";
  const name = projectName == null ? "" : String(projectName).trim();
  if (!name) return f;
  return `projects/${encodeURIComponent(name)}/${f}`;
}

// Messaggio user-facing per un asset read-only assente (es. `dossier/plan.md`
// non creato, o fetch fallito). Il placeholder CSS `:empty::before` non si
// applica perché `<pre>` non è considerato vuoto dal browser (contiene un
// newline iniziale): serve un messaggio testuale esplicito. Pura: solo
// formattazione della stringa.
export function emptyAssetMessage(filename) {
  const f = String(filename || "asset");
  return (
    `${f} non disponibile. Creane uno o lancia \`sf docs status\`.`
  );
}

// Pannello "Docs" read-only (ADR-0011 U3-coda): consuma `docs-status.json`
// (emesso da `sf docs status`), NON ricalcola il drift — il motore è la CLI.
// Puro: `status` (oggetto o null) → HTML. `now` iniettato per la data relativa.
export function renderDocsPanel(status, now) {
  if (!status || typeof status !== "object") {
    return (
      '<section class="docs-panel"><div class="card">' +
      "<h2>📄 Docs — deriva</h2>" +
      '<p class="docs-empty">Non ancora generato — lancia <code>sf docs status --out cockpit/docs-status.json</code>.</p>' +
      "</div></section>"
    );
  }
  const findings = Array.isArray(status.findings) ? status.findings : [];
  const counts = status.issueCounts || {};
  const badge = findings.length === 0 ? "🟢 in pari" : `🟡 ${findings.length} drift`;
  const findingsHtml = findings
    .map((f) => `<li class="docs-finding"><code>${f.id}</code> · ${f.kind}</li>`)
    .join("");
  const skipNote = status.issuesSkipped
    ? '<p class="docs-skip">stato-issue: skippato — gh non disponibile.</p>'
    : "";
  const generated = status.generatedAt
    ? `<p class="docs-generated">aggiornato ${typeof now === "number" ? relativeTime(status.generatedAt, now) : status.generatedAt}</p>`
    : "";
  return (
    '<section class="docs-panel">' +
    '<div class="card"><h2>📄 Docs — deriva</h2><span class="docs-badge">' +
    badge +
    "</span>" +
    (findingsHtml ? `<ul class="docs-findings">${findingsHtml}</ul>` : "") +
    skipNote +
    "</div>" +
    '<div class="card"><h2>🧮 Derivato (issue)</h2><ul class="docs-counts">' +
    `<li>Issue aperte totali: <strong>${counts.openTotal ?? "—"}</strong></li>` +
    `<li>Issue aperte <code>approved</code>: <strong>${counts.openApproved ?? "—"}</strong></li>` +
    "</ul></div>" +
    generated +
    "</section>"
  );
}

function relativeTime(generatedAt, now) {
  const t = new Date(generatedAt).getTime();
  if (Number.isNaN(t)) return String(generatedAt);
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  return `${Math.floor(mins / 60)} h fa`;
}

# Piano — softwarefactory

> File versionato (vedi seq 482 owner+Claude, F17). Le modifiche passano dalla normale review PR.

## Fatto

<!-- sf:derived:done -->
### Issue rilasciate

- #33 — CI: workflow GitHub Actions minimo (npm test + tsc --noEmit) su push e PR _(2026-08-17)_

### PR mergiate (ultimi 90 giorni)

- #194 — docs(backlog): F17 — Piano per-progetto (fatto derivato + pointer backlog) _(2026-08-24)_
- #192 — docs(scheduling): nota switch LLM MiniMax M3 (ago 2026, owner-approved) _(2026-08-24)_
- #191 — chore(tsc): JSDoc esplicito su validateRequest (capabilities.js) — sblocca CI tsc verde _(2026-08-24)_
- #190 — fix(cockpit): UX Plan vuoto esplicito + bottoni card 2-per-riga su desktop _(2026-08-24)_
- #189 — fix(cockpit): renderManifestPlan prefissa con projects/<name>/ (F11 architettura A) _(2026-08-24)_
- #188 — fix(cockpit): publishRepo → alkex/sf-deck (switch Pages target, F13) _(2026-08-24)_
- #185 — feat(scheduling): §8 push auth opzione B + label autonomous + nota PR coder _(2026-08-24)_
- #181 — fix(vcs): listLabels pagina con restAll _(2026-08-24)_
- #179 — docs(backlog): A15 (sf adopt) + C8 (E29→C1/cockpit) _(2026-08-24)_
- #176 — docs(parity): area #10 85%→90% (F9 tier-3 slice) + F9 completo sui 3 tier _(2026-08-24)_
- #175 — docs: ADR-0021 (parity doc alla chiusura di ogni item) + C7 gate GDPR _(2026-08-24)_
- #172 — feat(replay): F9 tier-3 — gate-replay capabilityGate slice _(2026-08-23)_
- #173 — docs(parity): nota ⚠ area #2 — analyze/converge contratto payload sub-agent mai verificato end-to-end _(2026-08-23)_
- #167 — refactor(phases): export openRevertPr/recordWatchdogTrigger per drill ad-hoc _(2026-08-23)_
- #169 — docs(parity): area #5 chiusa via drill watchdog + A14/B10 + TOOLS-WATCHLIST _(2026-08-23)_
- #166 — feat(metrics): D1 — sf metrics (DORA dai dati) + persistenza watchdog_events SQLite (#24) _(2026-08-23)_
- #165 — feat(template): F14 (a) — template strutturale parità/milestone + changeset BACKLOG (#164) _(2026-08-23)_
- #163 — feat(shadow): F9 tier-2 — classificazione mismatch (error vs benign) + exit non-zero (#162) _(2026-08-23)_
- #161 — docs(parity): footer audit trail — giro di chiusura (numeri invariati) _(2026-08-23)_
- #160 — feat(loc): sf loc — conteggio righe di codice deterministico zero-dep (#158) _(2026-08-23)_
- #159 — docs(mailbox): regole permanenti formato report (branch esplicito, TL;DR, changeset) _(2026-08-23)_
- #157 — feat(docs): sf docs sync-cross-repo — conteggi cross-repo nel tracker parità (#148) _(2026-08-23)_
- #156 — feat(cockpit): sf cockpit serve — server statico locale 127.0.0.1 (#150) _(2026-08-23)_
- #155 — feat(telemetry): U2 — wiring automatico spawnExecutor → telemetria (ADR-0020) _(2026-08-23)_
- #154 — docs(backlog): F10 → COMPLETATO (dogfooding PAT verificato end-to-end) _(2026-08-23)_
- #152 — fix(secrets): copy wizard ('Mostrami la guida') + rimuovi bottone ridondante step 2 _(2026-08-23)_
- #153 — docs(parity): refresh tracker 23 ago (area #9 chiusa — PAT registrato) _(2026-08-23)_
- #151 — docs(parity): refresh tracker 23 ago + BACKLOG F14 (nota generalizzazione) _(2026-08-23)_
- #149 — feat(secrets): wizard — guida PAT + countdown differito alla conferma (#145) _(2026-08-23)_
- #147 — feat(secrets): scoping per-progetto del PAT — --project sul wizard + fallback in resolveSecret (#146) _(2026-08-23)_
- #144 — feat(telemetry): U1 — store SQLite + sf telemetry log + toggle (ADR-0020) _(2026-08-23)_
- #143 — docs(backlog): pulizia retroattiva issue-first (ADR-0018) — 8 stale + 4 issue _(2026-08-23)_
- #138 — feat(mailbox): canale multi-slot + archive automatico + staleness check (ADR-0019) _(2026-08-22)_
- #136 — feat(tooling): sf task-state su github-rest (niente gh CLI) _(2026-08-22)_
- #134 — feat(tooling): sf pr-gate su github-rest (niente gh CLI) _(2026-08-22)_
- #133 — feat(tooling): sf selfcheck _(2026-08-22)_
- #137 — docs(adr): ADR-0015 prontezza Art.14 CRA per Formalyzer (ratificata) _(2026-08-22)_
- #135 — feat(vcs): github-rest — listPrs + getBranch + headRefName _(2026-08-22)_
- #132 — fix(cockpit): 3b — chiarisce messaggio token + nasconde box guida vuoto _(2026-08-22)_
- #127 — docs(mailbox): regola gate — PR sempre in Draft fino al READY (opzione B) _(2026-08-22)_
- #126 — F12-min (3b) — messaggi guida Pages/token (verifica-e-segnala) _(2026-08-22)_
- #131 — feat(vcs): github-rest — stato PR completo + getPages + createPr draft + markPrReady GraphQL _(2026-08-22)_
- #130 — feat(secrets): sf secrets wizard — inserimento PAT locale via browser (A12) _(2026-08-22)_
- #125 — F12-min (3a) — campo impostazioni publishRepo/publishBranch nel cockpit _(2026-08-22)_
- #124 — docs(mailbox): regola 'riferimento a contenuto non ricevuto' (punto 7 hardening) + BACKLOG F5→#122, F12-min→#121 _(2026-08-22)_
- #123 — F13 follow-up — completa la pubblicazione esterna su Pages (publishRepo + pre-flight + doc hardening) _(2026-08-22)_
- #120 — ci(cockpit): F13 — workflow GitHub Pages che rigenera l'indice multi-progetto _(2026-08-22)_
- #116 — feat(cockpit): F11 — home multi-progetto (indice + config per-progetto + hash-routing) _(2026-08-22)_
- #119 — feat(vcs): A11 — VCS provider senza gh (fallback API REST, detect-and-adapt) _(2026-08-21)_
- #114 — feat(shadow): F9 tier-1 — managed:"shadow" (decide senza scrivere) + sf replay storico _(2026-08-21)_
- #112 — feat(mailbox): ADR-0017 — seq per-direzione + scrittura atomica + sf mailbox send _(2026-08-21)_
- #111 — docs(sources): catalogo fonti ENISA/CRA + 4 analisi + link v1 alle citazioni (doc-only) _(2026-08-21)_
- #110 — feat(managed): F8 — flag managed per-progetto (osservato/gestito) + managed:true su sf.project.json _(2026-08-21)_
- #109 — feat(compliance): C1 — blocco compliance (CRA/GDPR/PSNC) in sf.project.json + check doctor compliance-scope _(2026-08-21)_
- #108 — feat(secrets): A12 — keychain backend Windows (Credential Manager via PowerShell) + GH_TOKEN wiring + doctor guidance _(2026-08-21)_
- #107 — docs(parity): persiste il tracker di parità in-repo (sf-parity-formalyzer.html) + link in BACKLOG _(2026-08-21)_
- #105 — docs(enisa): B2-B4 vincolo adapter + peer-review equiv + THREAT-MODEL.md (doc-only, playbook 4.9/4.11) _(2026-08-21)_
- #104 — docs(adr): ADR-0016 modello distribuzione per-progetto + BACKLOG C6 (doc-only) _(2026-08-21)_
- #103 — fix(wake): wakeSetupCommand legge config.watch.wake (allinea al runtime resolveWakeConfig) _(2026-08-21)_
- #102 — feat(validate): ADR-0012 U2/U3 — cabla validateExec nel nodo development (implement→validateExec→converge) _(2026-08-21)_
- #106 — ci(enisa): Gitleaks + Semgrep non bloccanti in ci.yml (playbook 4.9, shadow) _(2026-08-21)_
- #101 — docs(backlog): B9 notifica per-progetto (CSIRT/security.txt/runbook) + C1 campi GDPR minimi _(2026-08-21)_
- #100 — feat(triage): ADR-0014 U2 — screenshot tier-2 captioning-guidato (triageCaption + SCREENSHOT_CAPTION) _(2026-08-21)_
- #99 — docs(backlog): riscrive Fase ATTIVA — parità Formalyzer aggiornata (artifact sf-parity-formalyzer) _(2026-08-21)_
- #98 — feat(deploy): ADR-0013 U5 — watchdog su build rotto + knownGood reale (con sf wake setup) _(2026-08-20)_
- #97 — feat(deploy): ADR-0013 U4 — cablaggio build-watchdog nel nodo watchdog (revert-PR reale) _(2026-08-20)_
- #96 — docs: GETTING-STARTED — guida di setup ex-novo _(2026-08-20)_
- #95 — feat(deploy): ADR-0013 U3 — build&publish iOS via EAS (adapter eas-ios) _(2026-08-20)_
- #93 — feat(validate): ADR-0012 U3 — slow-path emulatore Android (chooseExecPath + emulatorExecAdapter) _(2026-08-20)_
- #92 — docs(adr): sposta ADR-0013 in dossier/decisions + crea ADR-0014 screenshot-routing _(2026-08-20)_
- #91 — docs: .gitattributes anti-CRLF + §Watch report con orario device (no-op datato) _(2026-08-20)_
- #90 — feat(triage): ADR-0014 U1 — screenshot-routing (detectScreenshot/routeTriage + triageValidateVisual) _(2026-08-20)_
- #89 — docs: hardening CLAUDE.md anti cross-repo + archivia M6-RIPRESA (stale cron Formalyzer) _(2026-08-20)_
- #88 — feat(watch): ADR-0010 U2a — wake to-claude + fire-wake locale + freni _(2026-08-20)_
- #87 — fix(wake): ADR-0010 U2b HOLD-SECURITY — env+jq anti script-injection nel notify-merge _(2026-08-20)_
- #86 — feat(wake): ADR-0010 U2b — trigger GitHub notify-merge + sf wake setup _(2026-08-20)_
- #85 — feat(deploy): ADR-0013 U2 — build-watchdog (retry/bisect/culprit/revert-PR/breaker) _(2026-08-20)_
- #84 — feat(mailbox): sf mailbox stamp — fp scritto per ultimo _(2026-08-20)_
- #83 — feat(mailbox): ADR-0009 hardening — fingerprint che verifica _(2026-08-20)_
- #82 — feat(deploy): ADR-0013 U1 — adapter Android locale deterministico _(2026-08-19)_
- #81 — feat(watch): ADR-0010 U3 — freni e osservabilità del battito _(2026-08-19)_
- #80 — feat(validate): ADR-0012 U2 — validazione-eseguendo fast-path headless _(2026-08-19)_
- #79 — feat(dedup): ADR-0012 U1 — dedup deterministico (fase dedup nella pipeline triage) _(2026-08-19)_
- #78 — docs(adr): ADR-0012 seam-validazione + dedup — landing _(2026-08-19)_
- #77 — feat(cockpit): ADR-0011 U3-coda — sf docs status + pannello Docs read-only _(2026-08-19)_
- #76 — feat(docs): ADR-0011 U3 — sf docs sync (blocco generato) _(2026-08-19)_
- #75 — feat(docs): ADR-0011 U2 — CI shadow + stato-issue via gh _(2026-08-19)_
- #74 — chore(docs): curatela 7 drift — ancore RF-10/11/71 + allowlist RNF-1/2/4/5 _(2026-08-19)_
- #73 — feat(docs): ADR-0011 U1 — sf docs verify (motore RF↔ancore) _(2026-08-19)_
- #72 — docs(adr): ADR-0011 sf docs (validazione-doc concreta) — landing _(2026-08-19)_
- #71 — feat(watch): ADR-0010 U1 — sf watch (watcher + hook configurabile) _(2026-08-19)_
- #70 — docs(adr): ADR-0010 loop-autonomo (battito) — landing _(2026-08-19)_
- #69 — feat(triage): proponi-priorità default alle whitelisted auto-approvate (RF-21) _(2026-08-19)_
- #68 — docs(adr): ADR-0009 spec canale nel repo + hardening _(2026-08-19)_
- #67 — ADR-0008 U3 — validazione analyzer + priorità onora-o-proponi _(2026-08-19)_
- #66 — ADR-0008 U2 — pipeline triage + intake deterministica _(2026-08-19)_
- #65 — ADR-0008 U1 — resolver identità + whitelist (logica pura) _(2026-08-19)_
- #64 — docs(adr): ADR-0008 whitelist-auto-approva + bonifica deriva documentale _(2026-08-19)_
- #63 — docs(prd): RNF-8 P→I + chore: ancore [RF-NN] bonifica pass-1 _(2026-08-18)_
- #62 — docs(adr): ADR-0006 protocollo canale + ADR-0007 governance scrittura repo _(2026-08-18)_
- #59 — fix(implement): BRANCH_NAME deterministico nel dispatch coder _(2026-08-18)_
- #61 — fix(state): resetCycleState clear-all-except cross-cycle _(2026-08-18)_
- #60 — fix(log): LOG CONTRACT per-phase allineato a createLogger _(2026-08-18)_
- #58 — fix(coder): hardening restoreMainBranch — guardia dirty-tree + log fallimento (follow-up #40) _(2026-08-18)_
- #57 — fix(coder): ripristina main a inizio ciclo development _(2026-08-18)_
- #56 — docs: A2 → COMPLETATO (chiude Fase 0 tipizzazione) _(2026-08-18)_
- #55 — fix(queue): disaccoppia fetch-limit da maxPerCycle (fetch ampio → sort → slice) _(2026-08-18)_
- #54 — feat(types): U3 A2-enforcement — State aperto-tipizzato (chiude A2) _(2026-08-18)_
- #53 — feat(types): U2 A2-enforcement — applica DevCtx a Phase + typetest PhaseResult _(2026-08-18)_
- #52 — feat(types): U1 fondazione tipi A2-enforcement (typedef ctx development, non applicati) _(2026-08-18)_
- #51 — docs(dossier): riconciliazione Fase 0 allo stato su main (A1/A3 COMPLETATO, A2 PARZIALE) _(2026-08-18)_
- #50 — docs(prd): riconciliazione allo stato su main (sf run, schedulazione, link ADR) _(2026-08-18)_
- #49 — docs(dossier): ADR-0005 convenzioni operative di sessione _(2026-08-18)_
- #48 — docs(dossier): ADR-0004 validazione documentazione (ratificata) _(2026-08-18)_
- #47 — docs(dossier): ADR-0003 ancore tracciabilità (ratificata) _(2026-08-18)_
- #46 — docs(dossier): ADR-0002 governo documentazione (ratificata) _(2026-08-18)_
- #45 — docs(dossier): ADR-0001 ratificata + BACKLOG a due sezioni (WIP/issue) _(2026-08-18)_
- #38 — ci: add minimal GitHub Actions workflow (npm test + tsc --noEmit) _(2026-08-17)_
- #42 — fix(vcs): getPr derive merged from state instead of unsupported gh field (#39) _(2026-08-17)_
- #36 — feat(scheduling): cron core — base pipeline merge-aware + sf tick + prompt-guscio _(2026-08-17)_
- #35 — feat(scheduling): hardening seam — parser SF_EXIT/SF_DATA fail-closed + handoff atomico con seq _(2026-08-17)_
- #32 — feat(claim): claim atomico + lock anti-overlap — i due prerequisiti dell'autonomia _(2026-08-17)_
- #27 — fix(executors): freeze KNOWN_EXIT_CODES to honor ReadonlySet contract _(2026-08-16)_
- #20 — feat(standards): E31-bis — gate PRD↔manifest simmetrico al gate richieste _(2026-08-14)_
- #19 — fix(discovery): tre incongruenze del lato PRD trovate dogfooding _(2026-08-14)_
- #18 — docs: PRD completo del framework + fix parsePrd su '## Title' _(2026-08-14)_
- #17 — feat(standards): E31 — capability gate bidirezionale + manifest compilato dal PRD _(2026-08-14)_
- #16 — feat(standards): E30 — criterio 'modifica sostanziale' (CRA) _(2026-08-14)_
- #15 — feat(agents): E27 — AI Gateway GDPR (residenza dati + PII stripping) _(2026-08-14)_
- #14 — feat(standards): E29 — governance normativa a moduli (compliance) _(2026-08-14)_
- #13 — feat(standards): E28 — ciclo di ottimizzazione PDCA data-driven (8 assi) _(2026-08-14)_
- #12 — feat(agents): E26 — Preserved Thinking (reasoning block persistence) _(2026-08-14)_
- #11 — feat(agents): E25 — multi-provider model catalog _(2026-08-14)_
- #10 — feat(agents): E24 — agent data permissions (least-privilege) _(2026-08-14)_
- #9 — feat(agents): E24-bis — test-time compute budget _(2026-08-14)_
- #8 — docs: roadmap estensioni _(2026-08-14)_
- #7 — feat: E19-E23 — preset, persona-frames, anti-patterns, step-router _(2026-08-14)_
- #6 — feat(agents): E22 — domain skill packs _(2026-08-14)_
- #5 — docs: estendi catalogo skill di dominio (rag/voice/gen-ui/...) _(2026-08-14)_
- #4 — docs: catalogo skill di dominio (finance/midnight/content) _(2026-08-14)_
- #3 — feat(standards): E18 — constitution _(2026-08-14)_
- #2 — feat(standards): E17 — gate analyze + converge _(2026-08-14)_
- #1 — feat(discovery): E16 — artefatti tecnici (Spec Kit absorption) _(2026-08-14)_

<!-- /sf:derived -->

## Prossimo

3-5 item prioritari da `BACKLOG.md` §Fase ATTIVA (estratto manuale al commit, non auto-derivato — la sezione è un pointer sottile, non una seconda roadmap).

_(Da popolare quando i primi item sono pronti.)_

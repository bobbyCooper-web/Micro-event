// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(compression());

// =======================
// STATIC (Hub + jeux)
// =======================
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir, { maxAge: "1h", etag: true }));

// =======================
// Helpers fichiers
// =======================
function resolveFile(...candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// =======================
// ACCESS CODES (Hub -> jeux)
// =======================
const accessCodesPathPublic = path.join(publicDir, "access-codes.json");
const accessCodesPathRoot = path.join(__dirname, "access-codes.json");

let accessCodesFile = null;
let accessCodes = [];

function loadAccessCodes() {
  accessCodesFile = resolveFile(accessCodesPathPublic, accessCodesPathRoot);
  if (!accessCodesFile) {
    console.warn("⚠️ Aucun access-codes.json trouvé (public/ ou racine).");
    accessCodes = [];
    return;
  }
  try {
    const raw = fs.readFileSync(accessCodesFile, "utf-8");
    const parsed = JSON.parse(raw);
    accessCodes = Array.isArray(parsed) ? parsed : [];
    console.log(`✅ Access codes chargés (${accessCodes.length}) depuis ${path.relative(__dirname, accessCodesFile)}`);
  } catch (err) {
    console.error("❌ Erreur access-codes.json :", err.message);
    accessCodes = [];
  }
}
loadAccessCodes();

if (accessCodesFile) {
  fs.watchFile(accessCodesFile, { interval: 1000 }, () => {
    console.log("🔄 access-codes.json modifié → rechargement…");
    loadAccessCodes();
  });
}

// Route utilisée par le HUB
app.post("/api/access", (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Code requis." });

  const found = accessCodes.find(
    (x) => String(x.code || "").trim().toLowerCase() === code.toLowerCase()
  );
  if (!found) return res.status(401).json({ ok: false, error: "Code invalide." });

  const p = String(found.path || "");
  // Sécurité basique : path interne uniquement
  if (!p.startsWith("/")) return res.status(500).json({ ok: false, error: "Configuration invalide (path)." });

  return res.json({ ok: true, path: p, label: found.label || null });
});

// =======================
// STEPS (Rally)
// =======================
const stepsPathRally = path.join(publicDir, "rallyphoto", "steps.json");
const stepsPathPublic = path.join(publicDir, "steps.json");
const stepsPathRoot = path.join(__dirname, "steps.json");

let stepsFile = null;
let steps = [];

function loadSteps() {
  stepsFile = resolveFile(stepsPathRally, stepsPathPublic, stepsPathRoot);
  if (!stepsFile) {
    console.warn("⚠️ Aucun steps.json trouvé.");
    steps = [];
    return;
  }
  try {
    const raw = fs.readFileSync(stepsFile, "utf-8");
    steps = JSON.parse(raw);
    console.log(`✅ Steps chargées (${steps.length}) depuis ${path.relative(__dirname, stepsFile)}`);
  } catch (err) {
    console.error("❌ Erreur steps.json :", err.message);
    steps = [];
  }
}
loadSteps();

if (stepsFile) {
  fs.watchFile(stepsFile, { interval: 1000 }, () => {
    console.log("🔄 steps.json modifié → rechargement…");
    loadSteps();
  });
}

// =======================
// Rally helpers (zones, shuffle, routes)
// =======================
function z(v) {
  const s = String(v || "").toLowerCase();
  if (s === "n" || s === "north") return "north";
  if (s === "s" || s === "south") return "south";
  if (s === "all") return "all";
  return s;
}
function fyShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildRoute(allSteps) {
  const byZone = allSteps.reduce((acc, s) => {
    const key = z(s.zone);
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});
  const all = (byZone["all"] || []).sort((a, b) => a.id - b.id);
  const north = byZone["north"] || [];
  const south = byZone["south"] || [];

  if (all.length < 2) throw new Error("Besoin d’au moins 2 étapes zone=all (départ & arrivée).");

  const start = all[0];
  const finish = all[all.length - 1];

  const nShuf = fyShuffle(north).map((s) => s.id);
  const sShuf = fyShuffle(south).map((s) => s.id);
  const flip = Math.random() < 0.5;

  const middle = flip ? nShuf.concat(sShuf) : sShuf.concat(nShuf);
  return [start.id, ...middle, finish.id];
}

// =======================
// Mémoire équipes Rally (en RAM)
// =======================
let teams = [];

function getOrCreateTeam(name) {
  let team = teams.find((t) => t.name === name);
  if (!team) {
    const route = buildRoute(steps);
    team = {
      name,
      routeIds: route,
      routeIndex: 0,
      startAt: null,
      finishAt: null,
      durationMs: null,
      hintsUsed: 0,
      wrongCodes: 0,
    };
    teams.push(team);
  } else {
    if (!Array.isArray(team.routeIds) || !Number.isFinite(team.routeIndex)) {
      const route = buildRoute(steps);
      team.routeIds = route;
      team.routeIndex = 0;
    }
    if (typeof team.hintsUsed !== "number") team.hintsUsed = 0;
    if (typeof team.wrongCodes !== "number") team.wrongCodes = 0;
  }
  return team;
}

// =======================
// Rally API (compat front existant)
// =======================
app.get("/steps", (req, res) => res.json(steps));

app.get("/team/:name", (req, res) => {
  const name = String(req.params.name || "").trim();
  const team = teams.find((t) => t.name === name);
  if (!team) return res.json({ exists: false });
  return res.json({ exists: true, team });
});

app.get("/team-route/:name", (req, res) => {
  const name = String(req.params.name || "").trim();
  const team = teams.find((t) => t.name === name);
  if (!team) return res.status(404).json({ ok: false, error: "Équipe inconnue" });

  const orderedSteps = team.routeIds
    .map((id) => steps.find((s) => +s.id === +id))
    .filter(Boolean);

  res.json({ ok: true, steps: orderedSteps, routeIndex: team.routeIndex });
});

app.post("/register", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Nom d'équipe requis" });

  try {
    const team = getOrCreateTeam(String(name).trim());
    res.json({ ok: true, team });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Erreur création parcours" });
  }
});

app.post("/unregister", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Nom requis" });

  const before = teams.length;
  teams = teams.filter((t) => t.name !== String(name).trim());
  res.json({ ok: true, removed: before !== teams.length });
});

app.post("/submit", (req, res) => {
  const { name, stepId, zip } = req.body || {};
  if (!name || !Number.isFinite(Number(stepId))) {
    return res.status(400).json({ ok: false, error: "Paramètres invalides" });
  }

  let team;
  try {
    team = getOrCreateTeam(String(name).trim());
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Erreur création parcours" });
  }

  const expectedId = team.routeIds[team.routeIndex];
  if (+stepId !== +expectedId) {
    return res.json({ ok: false, message: "Ce n’est pas la prochaine étape de votre parcours." });
  }

  const stepObj = steps.find((s) => +s.id === +stepId);
  if (!stepObj) return res.status(404).json({ ok: false, error: "Étape introuvable" });

  const isCorrect = String(stepObj.zip) === String(zip);
  if (!isCorrect) {
    team.wrongCodes = (team.wrongCodes || 0) + 1;
    return res.json({ ok: false, message: "Code incorrect" });
  }

  if (team.routeIndex === 0 && !team.startAt) team.startAt = new Date().toISOString();
  team.routeIndex += 1;

  const finished = team.routeIndex >= team.routeIds.length;
  if (finished && !team.finishAt) {
    team.finishAt = new Date().toISOString();
    if (team.startAt) team.durationMs = new Date(team.finishAt) - new Date(team.startAt);
  }

  return res.json({
    ok: true,
    message: "Code correct !",
    timing: {
      started: !!team.startAt,
      finished: !!team.finishAt,
      startAt: team.startAt,
      finishAt: team.finishAt,
      durationMs: team.durationMs,
    },
    routeIndex: team.routeIndex,
    total: team.routeIds.length,
  });
});

app.post("/progress", (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Nom requis" });
  try {
    getOrCreateTeam(String(name).trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Erreur création parcours" });
  }
});

app.get("/hint/:stepId", (req, res) => {
  const stepId = Number(req.params.stepId);
  const name = String(req.query.name || "").trim();

  if (!Number.isFinite(stepId)) return res.status(400).json({ hint: null, error: "stepId invalide" });

  const step = steps.find((s) => +s.id === +stepId);
  if (!step) return res.status(404).json({ hint: null, error: "Étape introuvable" });

  if (name) {
    try {
      const team = getOrCreateTeam(name);
      team.hintsUsed = (team.hintsUsed || 0) + 1;
    } catch {}
  }

  return res.json({ hint: step.hint || null });
});

// =======================
// Leaderboard (Rally)
// =======================
function computeLeaderboard() {
  const now = new Date();
  return teams
    .map((t) => {
      const runningElapsedMs = !t.finishAt && t.startAt ? now - new Date(t.startAt) : null;
      return {
        name: t.name,
        routeIndex: t.routeIndex,
        total: t.routeIds?.length || 0,
        finished: !!t.finishAt,
        startAt: t.startAt,
        finishAt: t.finishAt,
        durationMs: t.durationMs,
        runningElapsedMs,
      };
    })
    .sort((a, b) => {
      if (a.finished && b.finished) return (a.durationMs || Infinity) - (b.durationMs || Infinity);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (b.routeIndex !== a.routeIndex) return b.routeIndex - a.routeIndex;
      if (a.runningElapsedMs != null && b.runningElapsedMs != null)
        return a.runningElapsedMs - b.runningElapsedMs;
      return 0;
    });
}
app.get("/leaderboard", (req, res) => res.json({ ok: true, leaderboard: computeLeaderboard() }));

// =======================
// Admin (clé)
// =======================
const ADMIN_KEY = process.env.ADMIN_KEY || null;

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return res.status(501).json({ ok: false, error: "ADMIN_KEY non configurée." });
  const key = req.header("x-admin-key");
  if (key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: "Clé admin invalide." });
  next();
}

// =======================
// Admin Rally (existant)
// =======================
app.get("/api/admin/overview", requireAdmin, (req, res) => {
  const teamsWithCodes = teams.map((t) => {
    const nextId = t.routeIds?.[t.routeIndex];
    const stepObj = steps.find((s) => +s.id === +nextId);
    const now = new Date();
    const runningElapsedMs = !t.finishAt && t.startAt ? now - new Date(t.startAt) : null;

    const stepPhoto = stepObj ? stepObj.photo || stepObj.image || null : null;
    const stepHint = stepObj ? stepObj.hint || null : null;
    const stepName = stepObj ? stepObj.name || stepObj.title || stepObj.label || null : null;

    const total = t.routeIds?.length || 0;
    const stepOrder = t.routeIndex < total ? t.routeIndex + 1 : total;

    return {
      name: t.name,
      step: nextId ?? t.routeIds?.[total - 1],
      routeIndex: t.routeIndex,
      total,
      codeToSend: stepObj ? String(stepObj.zip) : null,
      stepPhoto,
      stepHint,
      stepName,
      stepOrder,
      timing: {
        started: !!t.startAt,
        finished: !!t.finishAt,
        startAt: t.startAt,
        finishAt: t.finishAt,
        durationMs: t.durationMs,
        runningElapsedMs,
      },
      isOnFirstStep: t.routeIndex === 0,
      isOnLastStep: t.routeIndex >= total - 1,
      hintsUsed: t.hintsUsed || 0,
      wrongCodes: t.wrongCodes || 0,
    };
  });

  res.json({ ok: true, totalSteps: steps.length, teams: teamsWithCodes });
});

app.get("/api/admin/leaderboard", requireAdmin, (req, res) =>
  res.json({ ok: true, leaderboard: computeLeaderboard() })
);

app.post("/api/admin/set-step", requireAdmin, (req, res) => {
  const { name, step } = req.body || {};
  if (!name || !Number.isFinite(Number(step))) {
    return res.status(400).json({ ok: false, error: "Paramètres invalides" });
  }
  const team = getOrCreateTeam(String(name).trim());
  const idx = team.routeIds.findIndex((id) => +id === +step);
  if (idx === -1) return res.status(404).json({ ok: false, error: "Étape absente de la route de l’équipe" });
  team.routeIndex = idx;
  res.json({ ok: true, team });
});

app.post("/api/admin/shift-index", requireAdmin, (req, res) => {
  const { name, delta } = req.body || {};
  if (!name || !Number.isFinite(Number(delta))) {
    return res.status(400).json({ ok: false, error: "Paramètres invalides" });
  }
  const team = getOrCreateTeam(String(name).trim());
  const total = team.routeIds.length;
  let next = team.routeIndex + Number(delta);
  next = Math.max(0, Math.min(total, next));
  team.routeIndex = next;
  res.json({ ok: true, team });
});

app.post("/api/admin/reset-team", requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: "Nom requis" });
  teams = teams.filter((t) => t.name !== String(name).trim());
  res.json({ ok: true });
});

// =====================================================================
// CARLO GAME (SECURE) — public config in /public/carlo, private in /private/carlo
// =====================================================================
const carloPublicPath = path.join(publicDir, "carlo", "gamecarlo.public.json");
const carloPrivatePath = path.join(__dirname, "private", "carlo", "gamecarlo.private.json");

let carloPublic = null;
let carloPrivate = null;

function loadCarloConfigs() {
  try {
    carloPublic = JSON.parse(fs.readFileSync(carloPublicPath, "utf-8"));
    console.log("✅ Carlo public chargé:", path.relative(__dirname, carloPublicPath));
  } catch (e) {
    console.warn("⚠️ Impossible de charger carlo public:", e.message);
    carloPublic = null;
  }

  try {
    carloPrivate = JSON.parse(fs.readFileSync(carloPrivatePath, "utf-8"));
    console.log("✅ Carlo private chargé:", path.relative(__dirname, carloPrivatePath));
  } catch (e) {
    console.warn("⚠️ Impossible de charger carlo private:", e.message);
    carloPrivate = null;
  }
}
loadCarloConfigs();

// Hot reload en dev (facultatif mais utile)
fs.watchFile(carloPublicPath, { interval: 1000 }, () => {
  console.log("🔄 carlo public modifié → rechargement…");
  loadCarloConfigs();
});
fs.watchFile(carloPrivatePath, { interval: 1000 }, () => {
  console.log("🔄 carlo private modifié → rechargement…");
  loadCarloConfigs();
});

// RAM state Carlo
const carloStates = {}; // teamId -> state

function initCarloTeam(teamId) {
  if (!carloStates[teamId]) {
    carloStates[teamId] = {
      teamId,
      routeIndex: 0,
      validatedSteps: [],
      fragments: {},
      flags: {},
      wrongAttempts: 0,
      startAt: null,
      finishAt: null,
      durationMs: null,
      history: []
    };
  }
  return carloStates[teamId];
}

function getCarloTeam(teamId) {
  if (!carloPublic) return null;
  return carloPublic.teams?.find(t => t.id === teamId) || null;
}

function getCurrentCarloStepId(teamId) {
  const team = getCarloTeam(teamId);
  const st = carloStates[teamId];
  if (!team || !st) return null;
  return team.route?.[st.routeIndex] || null;
}

function applyCarloGrants(state, grants = []) {
  for (const g of grants) {
    if (!g || !g.type) continue;
    if (g.type === "fragment") {
      state.fragments[g.chapter] = g.value;
    } else if (g.type === "flag") {
      state.flags[g.key] = g.value;
    }
  }
}

// ---- Carlo: enter (code équipe)
app.post("/api/carlo/enter", (req, res) => {
  if (!carloPublic) return res.status(500).json({ ok: false, error: "Config carlo public manquante." });
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "Code requis." });

  const team = carloPublic.teams.find(t => String(t.accessCode || "").trim().toLowerCase() === code.toLowerCase());
  if (!team) return res.status(401).json({ ok: false, error: "Code invalide." });

  initCarloTeam(team.id);
  return res.json({ ok: true, teamId: team.id, label: team.label || team.id });
});

// ---- Carlo: state (ce que le joueur peut voir)
app.get("/api/carlo/state/:teamId", (req, res) => {
  if (!carloPublic) return res.status(500).json({ ok: false, error: "Config carlo public manquante." });
  const teamId = String(req.params.teamId || "").trim();
  const team = getCarloTeam(teamId);
  const state = carloStates[teamId];
  if (!team || !state) return res.status(404).json({ ok: false, error: "Équipe inconnue." });

  const stepId = getCurrentCarloStepId(teamId);
  const step = stepId ? carloPublic.steps?.[stepId] : null;

  // archive/frise: on renvoie les cards validées (public only)
  const archive = state.validatedSteps
    .map(id => carloPublic.steps?.[id]?.archiveCard ? { stepId: id, ...carloPublic.steps[id].archiveCard } : null)
    .filter(Boolean);

    const isCurrentValidated = stepId ? state.validatedSteps.includes(stepId) : false;

  return res.json({
  ok: true,
  teamId,
  label: team.label || team.id,
  stepId,
  step,
  archive,
  routeIndex: state.routeIndex,
  routeTotal: team.route?.length || 0,
  flags: state.flags,
  isCurrentStepAlreadyValidated: isCurrentValidated
});
});

// ---- Carlo: submit (validation sécurisée via private)
app.post("/api/carlo/submit", (req, res) => {
  if (!carloPublic) return res.status(500).json({ ok: false, error: "Config carlo public manquante." });
  if (!carloPrivate) return res.status(500).json({ ok: false, error: "Config carlo private manquante." });

  const teamId = String(req.body?.teamId || "").trim();
  const inputRaw = req.body?.input;

  const team = getCarloTeam(teamId);
  const state = carloStates[teamId];
  if (!team || !state) return res.status(404).json({ ok: false, error: "Équipe inconnue." });

  const stepId = getCurrentCarloStepId(teamId);
  if (!stepId) return res.status(400).json({ ok: false, error: "Aucune étape en cours." });

  // Vérifie que step existe côté public
  const stepPublic = carloPublic.steps?.[stepId];
  if (!stepPublic) return res.status(500).json({ ok: false, error: "Étape public introuvable." });
  // Prépare la récompense (révélée côté client uniquement après validation)
const reveal = {
  stepId,
  title: stepPublic?.title || "Étape validée",
  textSuccess: stepPublic?.onSuccess?.textSuccess || "",
  unlockImages: Array.isArray(stepPublic?.onSuccess?.unlockImages) ? stepPublic.onSuccess.unlockImages : [],
  archiveCard: stepPublic?.archiveCard || null
};

  // Règles privées
  const rule = carloPrivate.steps?.[stepId] || null;
  if (!rule) {
    // Pas de règle privée => on considère validé (rare, mais pratique pour des écrans purement narratifs)
    if (!state.startAt) state.startAt = new Date().toISOString();
    state.validatedSteps.push(stepId);
    state.routeIndex += 1;
    state.history.push({ stepId, input: null, ok: true, at: Date.now() });
    return res.json({ ok: true, message: "OK" });
  }

  // Gestion requires (flags)
  if (Array.isArray(rule.requires)) {
    for (const r of rule.requires) {
      if (r?.type === "flag") {
        if (state.flags?.[r.key] !== r.value) {
          return res.json({ ok: false, message: "Accès verrouillé." });
        }
      }
    }
  }

  const input = (inputRaw == null) ? "" : String(inputRaw).trim();

  let isValid = false;

  switch (rule.answerType) {
    case "none":
      isValid = true;
      break;
    case "number":
    case "zip":
      isValid = String(rule.answer) === input;
      break;
    case "code4":
      isValid = String(rule.answer) === input;
      break;
    case "manualGate":
      // Validation manuelle: on attend un flag défini dans rule.manualFlag
      if (!rule.manualFlag) return res.status(500).json({ ok: false, error: "manualFlag manquant en private." });
      isValid = state.flags?.[rule.manualFlag] === true;
      break;
    default:
      return res.status(500).json({ ok: false, error: `answerType inconnu: ${rule.answerType}` });
  }

  if (!isValid) {
    state.wrongAttempts += 1;
    state.history.push({ stepId, input, ok: false, at: Date.now() });
    return res.json({ ok: false, message: "Incorrect" });
  }

  // Succès
  if (!state.startAt) state.startAt = new Date().toISOString();

  applyCarloGrants(state, rule.grant || rule.grants || []);

  state.validatedSteps.push(stepId);
  state.routeIndex += 1;
  state.history.push({ stepId, input, ok: true, at: Date.now() });

  
  // Fin ?
  const finished = state.routeIndex >= (team.route?.length || 0);
  if (finished && !state.finishAt) {
    state.finishAt = new Date().toISOString();
    state.durationMs = state.startAt ? (new Date(state.finishAt) - new Date(state.startAt)) : null;
  }

  return res.json({
  ok: true,
  message: "OK",
  finished,
  reveal
});

});

// ---- Carlo: Admin overview (sans réponses)
app.get("/api/admin/carlo/overview", requireAdmin, (req, res) => {
  if (!carloPublic) return res.status(500).json({ ok: false, error: "Config carlo public manquante." });

  const out = (carloPublic.teams || []).map(t => {
    const st = carloStates[t.id] || null;
    const routeTotal = t.route?.length || 0;

    if (!st) {
      return {
        teamId: t.id,
        label: t.label || t.id,
        status: "not_started",
        routeIndex: 0,
        routeTotal,
        stepId: t.route?.[0] || null,
        stepTitle: t.route?.[0] ? (carloPublic.steps?.[t.route[0]]?.title || null) : null,
        timing: null,
        fragments: {},
        flags: {}
      };
    }

    const stepId = t.route?.[st.routeIndex] || null;
    const stepTitle = stepId ? (carloPublic.steps?.[stepId]?.title || null) : null;

    return {
      teamId: t.id,
      label: t.label || t.id,
      status: st.finishAt ? "finished" : "running",
      routeIndex: st.routeIndex,
      routeTotal,
      stepId,
      stepTitle,
      timing: {
        started: !!st.startAt,
        finished: !!st.finishAt,
        startAt: st.startAt,
        finishAt: st.finishAt,
        durationMs: st.durationMs
      },
      wrongAttempts: st.wrongAttempts || 0,
      fragments: st.fragments || {},
      flags: st.flags || {}
    };
  });

  return res.json({ ok: true, teams: out });
});

// ---- Carlo: Admin set flag (valider caravane/phare etc.)
app.post("/api/admin/carlo/flag", requireAdmin, (req, res) => {
  const { teamId, flag, value } = req.body || {};
  const tid = String(teamId || "").trim();
  const key = String(flag || "").trim();
  const val = (value === undefined) ? true : value;

  if (!tid || !key) return res.status(400).json({ ok: false, error: "teamId et flag requis" });

  const team = getCarloTeam(tid);
  if (!team) return res.status(404).json({ ok: false, error: "Équipe inconnue" });

  const st = initCarloTeam(tid);
  st.flags[key] = val;

  return res.json({ ok: true });
});

// =======================
// Pages
// =======================
app.get("/admin", (req, res) => {
  // ton admin rally est dans public/rallyphoto/admin.html
  res.sendFile(path.join(publicDir, "rallyphoto", "admin.html"));
});

app.get("/admin/carlo", (req, res) => {
  res.sendFile(path.join(publicDir, "carlo", "admin-carlo.html"));
});

// Fallback → HUB
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// =======================
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));

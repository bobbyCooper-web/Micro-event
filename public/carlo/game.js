(function () {
  // ---- DOM refs ----
  const qs = (id) => document.getElementById(id);

  const teamLabelEl    = qs("teamLabel");
  const refreshBtn     = qs("refreshBtn");
  const changeTeamBtn  = qs("changeTeamBtn");
  const stepTitleEl    = qs("stepTitle");
  const textIntroEl    = qs("textIntro");
  const mainImgEl      = qs("mainImg");
  const promptEl       = qs("prompt");
  const answerInputEl  = qs("answerInput");
  const submitBtnEl    = qs("submitBtn");
  const feedbackEl     = qs("feedback");
  const progressLabelEl= qs("progressLabel");
  const timelineBarEl  = qs("timelineBar");
  const unlockedWrapEl = qs("unlockedWrap");
  const unlockedGridEl = qs("unlockedGrid");
  const revealTitleEl  = qs("revealTitle");
  const revealTextEl   = qs("revealText");
  const continueBtnEl  = qs("continueBtn");
  const memoryModalEl  = qs("memoryModal");
  const memoryTitleEl  = qs("memoryTitle");
  const memoryTextEl   = qs("memoryText");
  const memoryImgEl    = qs("memoryImg");
  const memoryCloseEl  = qs("memoryClose");

  // ---- Stockage archive en mémoire (évite tout problème d'encoding JSON dans le DOM) ----
  // clé : stepId (string), valeur : { title, thumb, content }
  const archiveStore = new Map();

  // ---- Modale mémoire ----
  function openMemoryCard(data) {
    if (!memoryModalEl) { console.warn("memoryModal introuvable dans le DOM"); return; }
    if (memoryTitleEl) memoryTitleEl.textContent = data.title   || "Mémoire";
    if (memoryTextEl)  memoryTextEl.textContent  = data.content || "";
    if (memoryImgEl) {
      if (data.thumb) {
        memoryImgEl.src          = data.thumb;
        memoryImgEl.style.display = "block";
      } else {
        memoryImgEl.src          = "";
        memoryImgEl.style.display = "none";
      }
    }
    memoryModalEl.classList.remove("hidden");
  }

  function closeMemoryCard() {
    if (memoryModalEl) memoryModalEl.classList.add("hidden");
  }

  // ---- UI helpers ----
  function setFeedback(msg, isErr = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || "";
    feedbackEl.className   = isErr ? "err" : "muted";
  }

  function getTeamIdFromUrl() {
    return new URL(window.location.href).searchParams.get("teamId");
  }

  // ---- API ----
  async function fetchState(teamId) {
    const res = await fetch(`/api/carlo/state/${encodeURIComponent(teamId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`STATE HTTP ${res.status}`);
    return res.json();
  }

  async function submitAnswer(teamId, input) {
    const res = await fetch("/api/carlo/submit", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ teamId, input }),
    });
    if (!res.ok) throw new Error(`SUBMIT HTTP ${res.status}`);
    return res.json();
  }

  // ---- Reveal ----
  let revealVisible = false;

  function hideReveal() {
    revealVisible = false;
    if (unlockedWrapEl) unlockedWrapEl.classList.add("hidden");
    if (unlockedGridEl) unlockedGridEl.innerHTML = "";
    if (revealTitleEl)  revealTitleEl.textContent = "Dossier débloqué";
    if (revealTextEl)   revealTextEl.textContent  = "";
    if (continueBtnEl)  continueBtnEl.onclick = null;
  }

  function showReveal(reveal) {
    if (!reveal) return;
    revealVisible = true;
    if (revealTitleEl) revealTitleEl.textContent = reveal.title       || "Dossier débloqué";
    if (revealTextEl)  revealTextEl.textContent  = reveal.textSuccess || "";

    const imgs = Array.isArray(reveal.unlockImages) ? reveal.unlockImages : [];
    if (unlockedGridEl) {
      unlockedGridEl.innerHTML = imgs.map((src) =>
        `<a href="${src}" target="_blank" class="thumbLink">
           <img class="thumbImg" src="${src}" alt="" />
         </a>`
      ).join("");
    }
    if (unlockedWrapEl) unlockedWrapEl.classList.remove("hidden");
  }

  // ---- Timeline / Frise ----
  function renderTimeline(archive) {
    if (!timelineBarEl) return;
    const items = Array.isArray(archive) ? archive : [];

    // Mettre à jour le store avec les données reçues du serveur
    for (const a of items) {
      if (!a.stepId) continue;
      archiveStore.set(a.stepId, {
        title:   a.title   || "Élément validé",
        thumb:   a.thumb   || "",
        content: a.content || "",
      });
    }

    if (!items.length) {
      timelineBarEl.innerHTML = `<div class="muted small">Aucun élément validé pour le moment.</div>`;
      return;
    }

    // On met uniquement le stepId en data attribute — pas de JSON dans le DOM
    timelineBarEl.innerHTML = items.map((a) => {
      const thumb  = a.thumb  || "";
      const title  = a.title  || "Élément validé";
      const stepId = a.stepId || "";
      return `<button class="tlItem" data-step-id="${stepId}" title="${title.replace(/"/g, '&quot;')}">
                <img src="${thumb}" alt="${title}" loading="lazy" />
              </button>`;
    }).join("");

    // Bind des clics via le store
    timelineBarEl.querySelectorAll(".tlItem").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-step-id");
        const obj = archiveStore.get(sid);
        if (obj) {
          openMemoryCard(obj);
        } else {
          console.warn("Archive introuvable pour stepId:", sid);
        }
      });
    });
  }

  // ---- Signature état (diff pour éviter re-render inutile) ----
  function stateSignature(state) {
    if (!state?.ok) return "ERR";
    const step    = state.step || {};
    const archive = Array.isArray(state.archive) ? state.archive : [];
    return [
      state.teamId     || "",
      state.routeIndex ?? -1,
      state.routeTotal ?? -1,
      step.title          || "",
      step.imageMain      || "",
      step.questionPrompt || "",
      step.textIntro      || "",
      archive.length,
      archive.length ? (archive[archive.length - 1].stepId || "") : "",
    ].join("|");
  }

  let lastSig      = "";
  let pollTimer    = null;
  let isSubmitting = false;

  function isUserTyping() {
    if (!answerInputEl) return false;
    return document.activeElement === answerInputEl && (answerInputEl.value || "").trim().length > 0;
  }

  // ---- Render ----
  function render(state, { preserveInput = false } = {}) {
    if (!state?.ok) { setFeedback(state?.error || "Impossible de charger l'état.", true); return; }

    if (teamLabelEl)   teamLabelEl.textContent = state.label || state.teamId || "—";

    const step = state.step || null;
    if (stepTitleEl)  stepTitleEl.textContent = step?.title      || "Étape";
    if (textIntroEl)  textIntroEl.textContent = step?.textIntro  || "";

    const img = step?.imageMain || "";
    if (mainImgEl) { mainImgEl.src = img; mainImgEl.style.display = img ? "block" : "none"; }

    if (promptEl) promptEl.textContent = step?.questionPrompt || "";

    if (progressLabelEl) {
      progressLabelEl.textContent = `${(state.routeIndex ?? 0) + 1} / ${state.routeTotal ?? "?"}`;
    }

    renderTimeline(state.archive);

    if (answerInputEl && !preserveInput) { answerInputEl.value = ""; answerInputEl.focus(); }
    if (!revealVisible) setFeedback("");
  }

  // ---- Boot ----
  async function boot() {
    let teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) { window.location.href = "/carlo/index.html"; return; }
    localStorage.setItem("CARLO_TEAM_ID", teamId);

    setFeedback("Chargement…");
    try {
      const state = await fetchState(teamId);
      lastSig = stateSignature(state);
      hideReveal();
      render(state);
    } catch (e) {
      console.error(e);
      setFeedback("Erreur réseau. Serveur en ligne ?", true);
    }
    startPolling();
  }

  // ---- Polling 2s ----
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function startPolling() {
    stopPolling();
    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) return;

    pollTimer = setInterval(async () => {
      if (revealVisible || isSubmitting) return;
      try {
        const st  = await fetchState(teamId);
        const sig = stateSignature(st);
        if (sig === lastSig) return;
        lastSig = sig;
        render(st, { preserveInput: isUserTyping() });
      } catch (e) { console.warn("Polling:", e?.message || e); }
    }, 2000);
  }

  // ---- Submit ----
  async function onSubmit() {
    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) { window.location.href = "/carlo/index.html"; return; }
    if (!submitBtnEl) return;

    isSubmitting = true;
    submitBtnEl.disabled = true;

    const input = (answerInputEl?.value || "").trim();

    try {
      const r = await submitAnswer(teamId, input);
      if (!r?.ok) { setFeedback(r?.message || "Incorrect.", true); return; }

      setFeedback("✅ Validé.");

      if (r.reveal) {
        showReveal(r.reveal);
        if (continueBtnEl) {
          continueBtnEl.onclick = async () => {
            hideReveal();
            const st = await fetchState(teamId);
            lastSig = stateSignature(st);
            render(st);
          };
        }
        return;
      }

      const st = await fetchState(teamId);
      lastSig = stateSignature(st);
      render(st);

    } catch (e) {
      console.error(e);
      setFeedback("Erreur réseau.", true);
    } finally {
      submitBtnEl.disabled = false;
      isSubmitting = false;
    }
  }

  // ---- Events ----
  if (submitBtnEl)   submitBtnEl.addEventListener("click", onSubmit);
  if (answerInputEl) answerInputEl.addEventListener("keydown", e => { if (e.key === "Enter") onSubmit(); });
  if (refreshBtn)    refreshBtn.addEventListener("click", () => boot());
  if (changeTeamBtn) changeTeamBtn.addEventListener("click", () => {
    stopPolling();
    localStorage.removeItem("CARLO_TEAM_ID");
    window.location.href = "/carlo/index.html";
  });

  if (memoryCloseEl) memoryCloseEl.addEventListener("click", closeMemoryCard);
  if (memoryModalEl) memoryModalEl.addEventListener("click", e => { if (e.target === memoryModalEl) closeMemoryCard(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMemoryCard(); });
  window.addEventListener("beforeunload", () => stopPolling());

  boot();
})();

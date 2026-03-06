(function () {
  // ---------- Helpers DOM ----------
  const qs = (id) => document.getElementById(id);

  // Header
  const teamLabelEl = qs("teamLabel");
  const refreshBtn = qs("refreshBtn");
  const changeTeamBtn = qs("changeTeamBtn");

  // Left panel
  const stepTitleEl = qs("stepTitle");
  const textIntroEl = qs("textIntro");

  // Center image
  const mainImgEl = qs("mainImg");

  // Right validation
  const promptEl = qs("prompt");
  const answerInputEl = qs("answerInput");
  const submitBtnEl = qs("submitBtn");
  const feedbackEl = qs("feedback");
  const progressLabelEl = qs("progressLabel");

  // Timeline
  const timelineBarEl = qs("timelineBar");

  // Reveal / Unlock section
  const unlockedWrapEl = qs("unlockedWrap");
  const unlockedGridEl = qs("unlockedGrid");
  const revealTitleEl = qs("revealTitle");
  const revealTextEl = qs("revealText");
  const continueBtnEl = qs("continueBtn");

  // Memory card modal
  const memoryModalEl = qs("memoryModal");
  const memoryTitleEl = qs("memoryTitle");
  const memoryTextEl = qs("memoryText");
  const memoryImgEl = qs("memoryImg");
  const memoryCloseEl = qs("memoryClose");

  // ---------- Stockage en mémoire des archive cards ----------
  // On stocke les objets complets ici plutôt que dans des data-attributes HTML
  // pour éviter tout problème d'encoding avec les caractères spéciaux.
  const archiveStore = new Map(); // stepId -> { title, thumb, content }

  function openMemoryCard({ title, thumb, content }) {
    if (memoryTitleEl) memoryTitleEl.textContent = title || "Mémoire";
    if (memoryTextEl)  memoryTextEl.textContent  = content || "";
    if (memoryImgEl) {
      if (thumb) {
        memoryImgEl.src = thumb;
        memoryImgEl.style.display = "block";
      } else {
        memoryImgEl.src = "";
        memoryImgEl.style.display = "none";
      }
    }
    if (memoryModalEl) memoryModalEl.classList.remove("hidden");
  }

  function closeMemoryCard() {
    if (memoryModalEl) memoryModalEl.classList.add("hidden");
  }

  // ---------- UI helpers ----------
  function setFeedback(msg, isErr = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || "";
    feedbackEl.className = isErr ? "err" : "muted";
  }


  // ---------- Finale FX ----------
  let finalePlayed = false;

  function ensureFinaleOverlay() {
    if (document.getElementById("finaleOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "finaleOverlay";
    ov.className = "finale-overlay";
    document.body.appendChild(ov);

    const title = document.createElement("div");
    title.id = "finaleTitle";
    title.className = "finale-title";
    title.textContent = "Dossier final débloqué";
    document.body.appendChild(title);
  }

  function launchFinaleFX() {
    if (finalePlayed) return;
    finalePlayed = true;
    ensureFinaleOverlay();
    document.body.classList.add("finale");

    // confettis (JS only, pas besoin d'assets)
    const colors = ["#ffd166", "#34d399", "#60a5fa", "#f87171", "#e5e7eb"];
    const n = 44;

    for (let i = 0; i < n; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--x", ((Math.random() * 2 - 1) * 180).toFixed(0) + "px");
      c.style.setProperty("--r", (240 + Math.random() * 520).toFixed(0) + "deg");
      c.style.setProperty("--d", (2.2 + Math.random() * 1.6).toFixed(2) + "s");
      c.style.opacity = (0.75 + Math.random() * 0.25).toFixed(2);
      document.body.appendChild(c);

      // cleanup
      c.addEventListener("animationend", () => c.remove());
    }

    // stop overlay after a few seconds (les confettis se nettoient seuls)
    setTimeout(() => {
      document.body.classList.remove("finale");
    }, 5200);
  }


  function toAbs(url) {
    if (!url) return "";
    return url;
  }

  function getTeamIdFromUrl() {
    const u = new URL(window.location.href);
    return u.searchParams.get("teamId");
  }

  // ---------- API ----------
  async function fetchState(teamId) {
    const res = await fetch(`/api/carlo/state/${encodeURIComponent(teamId)}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`STATE HTTP ${res.status}`);
    return await res.json();
  }

  async function submitAnswer(teamId, input) {
    const res = await fetch(`/api/carlo/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, input }),
    });
    if (!res.ok) throw new Error(`SUBMIT HTTP ${res.status}`);
    return await res.json();
  }

  // ---------- Reveal / Unlock ----------
  let revealVisible = false;

  function hideReveal() {
    revealVisible = false;
    if (unlockedWrapEl) unlockedWrapEl.classList.add("hidden");
    if (unlockedGridEl) unlockedGridEl.innerHTML = "";
    if (revealTitleEl)  revealTitleEl.textContent = "Dossier débloqué";
    if (revealTextEl)   revealTextEl.textContent = "";
    if (continueBtnEl)  continueBtnEl.onclick = null;
  }

  function showReveal(reveal) {
    if (!reveal) return;
    revealVisible = true;

    if (revealTitleEl) revealTitleEl.textContent = reveal.title || "Dossier débloqué";
    if (revealTextEl)  revealTextEl.textContent = reveal.textSuccess || "";

    const imgs = Array.isArray(reveal.unlockImages) ? reveal.unlockImages : [];
    if (unlockedGridEl) {
      unlockedGridEl.innerHTML = imgs
        .map((src) => {
          return `<a href="${src}" target="_blank" class="thumbLink">
                    <img class="thumbImg" src="${src}" alt="" />
                  </a>`;
        })
        .join("");
    }

    if (unlockedWrapEl) unlockedWrapEl.classList.remove("hidden");
  }

  // ---------- Timeline ----------
  function renderTimeline(archive) {
    const items = Array.isArray(archive) ? archive : [];
    if (!timelineBarEl) return;

    // Met à jour le store avec les nouvelles archive cards
    for (const a of items) {
      if (a.stepId) {
        archiveStore.set(a.stepId, {
          title:   a.title   || "Élément validé",
          thumb:   a.thumb   || "",
          content: a.content || "",
        });
      }
    }

    if (!items.length) {
      timelineBarEl.innerHTML = `<div class="muted small">Aucun élément validé pour le moment.</div>`;
      return;
    }

    // On utilise data-step-id (juste l'id, pas de JSON encodé)
    timelineBarEl.innerHTML = items
      .map((a) => {
        const thumb = a.thumb || "";
        const title = a.title || "Élément validé";
        const stepId = a.stepId || "";
        return `
          <button class="tlItem" data-step-id="${stepId}" title="${title}">
            <img src="${thumb}" alt="${title}" loading="lazy" />
          </button>
        `;
      })
      .join("");

    timelineBarEl.querySelectorAll(".tlItem").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sid = btn.getAttribute("data-step-id");
        const obj = archiveStore.get(sid);
        if (obj) openMemoryCard(obj);
      });
    });
  }

  // ---------- Diff / Smart refresh ----------
  function stateSignature(state) {
    if (!state?.ok) return "ERR";

    const teamId     = state.teamId     || "";
    const routeIndex = state.routeIndex ?? -1;
    const routeTotal = state.routeTotal ?? -1;

    const step      = state.step || {};
    const stepTitle = step.title          || "";
    const stepImg   = step.imageMain      || "";
    const stepPrompt = step.questionPrompt || "";
    const stepIntro  = step.textIntro     || "";

    const archive        = Array.isArray(state.archive) ? state.archive : [];
    const archiveLen     = archive.length;
    const archiveLastThumb = archiveLen ? (archive[archiveLen - 1].thumb || "") : "";
    const archiveLastTitle = archiveLen ? (archive[archiveLen - 1].title || "") : "";

    return [
      teamId, routeIndex, routeTotal,
      stepTitle, stepImg, stepPrompt, stepIntro,
      archiveLen, archiveLastThumb, archiveLastTitle,
    ].join("|");
  }

  let lastSig = "";
  let pollTimer = null;
  let isSubmitting = false;

  function isUserTyping() {
    if (!answerInputEl) return false;
    const active  = document.activeElement === answerInputEl;
    const hasText = (answerInputEl.value || "").trim().length > 0;
    return active && hasText;
  }

  // ---------- Render main state ----------
  function render(state, { preserveInput = false } = {}) {
    if (!state?.ok) {
      setFeedback(state?.error || "Impossible de charger l'état.", true);
      return;
    }

    if (teamLabelEl) teamLabelEl.textContent = state.label || state.teamId || "—";

    const step = state.step || null;
    if (stepTitleEl)  stepTitleEl.textContent  = step?.title      || "Étape";
    if (textIntroEl)  textIntroEl.textContent  = step?.textIntro  || "";

    const img = step?.imageMain || "";
    if (mainImgEl) {
      mainImgEl.src = img;
      mainImgEl.style.display = img ? "block" : "none";
    }

    if (promptEl) promptEl.textContent = step?.questionPrompt || "";

    if (progressLabelEl) {
      const idx   = (state.routeIndex ?? 0) + 1;
      const total = state.routeTotal ?? "?";
      progressLabelEl.textContent = `${idx} / ${total}`;
    }

    renderTimeline(state.archive);

    // Finale : si le jeu est terminé (flag serveur), on déclenche un FX léger côté web
    if (state?.flags?.game_completed) {
      launchFinaleFX();
    }

    // Par défaut, on reset l’input à chaque render.
    // Mais en refresh auto on préserve si l’utilisateur est en train de taper.
    if (answerInputEl && !preserveInput) {
      answerInputEl.value = "";
      answerInputEl.focus();
    }

    if (!revealVisible) setFeedback("");
  }

  // ---------- Boot ----------
  async function boot() {
    let teamId = getTeamIdFromUrl();
    if (!teamId) teamId = localStorage.getItem("CARLO_TEAM_ID");

    if (!teamId) {
      window.location.href = "/carlo/index.html";
      return;
    }

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

  // ---------- Polling (2s) ----------
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

        const preserve = isUserTyping();
        render(st, { preserveInput: preserve });
      } catch (e) {
        console.warn("Polling error:", e?.message || e);
      }
    }, 2000);
  }

  // ---------- Submit ----------
  async function onSubmit() {
    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) { window.location.href = "/carlo/index.html"; return; }
    if (!submitBtnEl) return;

    isSubmitting = true;
    submitBtnEl.disabled = true;

    const input = (answerInputEl?.value || "").trim();

    try {
      const r = await submitAnswer(teamId, input);

      if (!r?.ok) {
        setFeedback(r?.message || "Incorrect.", true);
        return;
      }

      setFeedback("✅ Validé.");

      if (r.reveal) {
        showReveal(r.reveal);

        // Si c\'est la toute dernière étape (coffre), on joue l\'effet de finale
        if (r.reveal?.stepId === "ch5_safe") {
          launchFinaleFX();
        }

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

      // Fallback sans reveal
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

  // ---------- Events ----------
  if (submitBtnEl)   submitBtnEl.addEventListener("click", onSubmit);
  if (answerInputEl) answerInputEl.addEventListener("keydown", e => { if (e.key === "Enter") onSubmit(); });

  if (refreshBtn)    refreshBtn.addEventListener("click", () => boot());
  if (changeTeamBtn) changeTeamBtn.addEventListener("click", () => {
    stopPolling();
    localStorage.removeItem("CARLO_TEAM_ID");
    window.location.href = "/carlo/index.html";
  });

  if (memoryCloseEl) memoryCloseEl.addEventListener("click", closeMemoryCard);
  if (memoryModalEl) {
    memoryModalEl.addEventListener("click", e => {
      if (e.target === memoryModalEl) closeMemoryCard();
    });
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMemoryCard(); });

  window.addEventListener("beforeunload", () => stopPolling());

  boot();
})();

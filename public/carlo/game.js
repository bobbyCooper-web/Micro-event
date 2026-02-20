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

  // Reveal / Unlock section (must exist in game.html)
  const unlockedWrapEl = qs("unlockedWrap");
  const unlockedGridEl = qs("unlockedGrid");
  const revealTitleEl = qs("revealTitle");
  const revealTextEl = qs("revealText");
  const continueBtnEl = qs("continueBtn");

  // Memory card modal (si présent dans ton HTML)
  const memoryModalEl = qs("memoryModal");
  const memoryTitleEl = qs("memoryTitle");
  const memoryTextEl = qs("memoryText");
  const memoryImgEl = qs("memoryImg");
  const memoryCloseEl = qs("memoryClose");

  function openMemoryCard({ title, thumb, content }) {
    if (memoryTitleEl) memoryTitleEl.textContent = title || "Mémoire";
    if (memoryTextEl) memoryTextEl.textContent = content || "";
    if (memoryImgEl) {
      memoryImgEl.src = thumb || "";
      memoryImgEl.style.display = thumb ? "block" : "none";
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
    if (revealTitleEl) revealTitleEl.textContent = "Dossier débloqué";
    if (revealTextEl) revealTextEl.textContent = "";
    if (continueBtnEl) continueBtnEl.onclick = null;
  }

  function showReveal(reveal) {
    // reveal: { title, textSuccess, unlockImages[] }
    if (!reveal) return;

    revealVisible = true;

    if (revealTitleEl) revealTitleEl.textContent = reveal.title || "Dossier débloqué";
    if (revealTextEl) revealTextEl.textContent = reveal.textSuccess || "";

    const imgs = Array.isArray(reveal.unlockImages) ? reveal.unlockImages : [];
    if (unlockedGridEl) {
      unlockedGridEl.innerHTML = imgs
        .map((src) => {
          const s = toAbs(src);
          return `<a href="${s}" target="_blank" class="thumbLink">
                    <img class="thumbImg" src="${s}" alt="" />
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

    if (!items.length) {
      timelineBarEl.innerHTML = `<div class="muted small">Aucun élément validé pour le moment.</div>`;
      return;
    }

    timelineBarEl.innerHTML = items
      .map((a) => {
        const thumb = toAbs(a.thumb);
        const title = a.title || "Élément validé";
        const content = a.content || "";
        const payload = encodeURIComponent(JSON.stringify({ title, thumb, content }));
        return `
          <button class="tlItem" data-archive="${payload}" title="${title}">
            <img src="${thumb}" alt="${title}" />
          </button>
        `;
      })
      .join("");

    timelineBarEl.querySelectorAll(".tlItem").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-archive");
        if (!raw) return;
        const obj = JSON.parse(decodeURIComponent(raw));
        openMemoryCard(obj);
      });
    });
  }

  // ---------- Diff / Smart refresh ----------
  // On calcule une “signature” simple de l’état pour éviter de rerender si rien n’a changé.
  function stateSignature(state) {
    if (!state?.ok) return "ERR";

    // Champs généralement suffisants pour détecter un changement visible
    const teamId = state.teamId || "";
    const routeIndex = state.routeIndex ?? -1;
    const routeTotal = state.routeTotal ?? -1;

    const step = state.step || {};
    const stepTitle = step.title || "";
    const stepImg = step.imageMain || "";
    const stepPrompt = step.questionPrompt || "";
    const stepIntro = step.textIntro || "";

    const archive = Array.isArray(state.archive) ? state.archive : [];
    const archiveLen = archive.length;
    const archiveLastThumb = archiveLen ? (archive[archiveLen - 1].thumb || "") : "";
    const archiveLastTitle = archiveLen ? (archive[archiveLen - 1].title || "") : "";

    // Signature string
    return [
      teamId,
      routeIndex,
      routeTotal,
      stepTitle,
      stepImg,
      stepPrompt,
      stepIntro,
      archiveLen,
      archiveLastThumb,
      archiveLastTitle,
    ].join("|");
  }

  let lastSig = "";
  let pollTimer = null;
  let isSubmitting = false;

  function isUserTyping() {
    if (!answerInputEl) return false;
    const active = document.activeElement === answerInputEl;
    const hasText = (answerInputEl.value || "").trim().length > 0;
    // Si focus + texte en cours, on évite de reset le champ
    return active && hasText;
  }

  // ---------- Render main state ----------
  function render(state, { preserveInput = false } = {}) {
    // Important : si reveal visible, on ne force pas hideReveal ici
    // (sinon le polling fermerait l'écran de révélation)
    if (!state?.ok) {
      setFeedback(state?.error || "Impossible de charger l’état.", true);
      return;
    }

    if (teamLabelEl) teamLabelEl.textContent = state.label || state.teamId || "—";

    const step = state.step || null;
    if (stepTitleEl) stepTitleEl.textContent = step?.title || "Étape";
    if (textIntroEl) textIntroEl.textContent = step?.textIntro || "";

    const img = toAbs(step?.imageMain);
    if (mainImgEl) {
      mainImgEl.src = img;
      mainImgEl.style.display = img ? "block" : "none";
    }

    if (promptEl) promptEl.textContent = step?.questionPrompt || "";

    if (progressLabelEl) {
      const idx = (state.routeIndex ?? 0) + 1;
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

    // Si on n'est pas en train d’afficher un reveal, on nettoie le feedback
    if (!revealVisible) setFeedback("");
  }

  // ---------- Boot (manual) ----------
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
      hideReveal(); // au chargement initial, on part propre
      render(state);
    } catch (e) {
      console.error(e);
      setFeedback("Erreur réseau. Serveur en ligne ?", true);
    }

    // Lance (ou relance) le polling après boot
    startPolling();
  }

  // ---------- Polling (refresh auto 2s) ----------
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    // évite de démarrer plusieurs fois
    stopPolling();

    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) return;

    pollTimer = setInterval(async () => {
      // Règles : si reveal affiché ou submit en cours, on ne refresh pas l’écran
      if (revealVisible || isSubmitting) return;

      try {
        const st = await fetchState(teamId);
        const sig = stateSignature(st);

        // Si aucun changement, on ne fait rien
        if (sig === lastSig) return;
        lastSig = sig;

        // Si l’utilisateur tape, on rerender mais sans effacer l’input
        const preserve = isUserTyping();
        render(st, { preserveInput: preserve });
      } catch (e) {
        // On évite de spam l’UI en cas de micro-coupure réseau
        console.warn("Polling error:", e?.message || e);
      }
    }, 2000);
  }

  // ---------- Submit ----------
  async function onSubmit() {
    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) {
      window.location.href = "/carlo/index.html";
      return;
    }

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

      // Si le serveur renvoie une révélation, on l’affiche et on attend “Continuer”
      if (r.reveal) {
        showReveal(r.reveal);

        // Si c\'est la toute dernière étape (coffre), on joue l\'effet de finale
        if (r.reveal?.stepId === "ch5_safe") {
          launchFinaleFX();
        }

        if (continueBtnEl) {
          continueBtnEl.onclick = async () => {
            // Quand on clique “Continuer”, on ferme reveal puis on recharge l’état
            hideReveal();
            const st = await fetchState(teamId);
            lastSig = stateSignature(st);
            render(st);
          };
        }

        return; // IMPORTANT : ne pas avancer automatiquement sans “Continuer”
      }

      // Fallback si pas de reveal : on recharge l’état directement
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
  if (submitBtnEl) submitBtnEl.addEventListener("click", onSubmit);
  if (answerInputEl) {
    answerInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onSubmit();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      // Refresh manuel : recharge + relance polling
      boot();
    });
  }

  if (changeTeamBtn) {
    changeTeamBtn.addEventListener("click", () => {
      stopPolling();
      localStorage.removeItem("CARLO_TEAM_ID");
      window.location.href = "/carlo/index.html";
    });
  }

  if (memoryCloseEl) memoryCloseEl.addEventListener("click", closeMemoryCard);
  if (memoryModalEl) {
    memoryModalEl.addEventListener("click", (e) => {
      if (e.target === memoryModalEl) closeMemoryCard();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMemoryCard();
  });

  // Stop polling on page unload (propre)
  window.addEventListener("beforeunload", () => stopPolling());

  // Start
  boot();
})();

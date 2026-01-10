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

  // ---------- UI helpers ----------
  function setFeedback(msg, isErr = false) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg || "";
    feedbackEl.className = isErr ? "err" : "muted";
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
    const res = await fetch(`/api/carlo/state/${encodeURIComponent(teamId)}`);
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
  function hideReveal() {
    if (unlockedWrapEl) unlockedWrapEl.classList.add("hidden");
    if (unlockedGridEl) unlockedGridEl.innerHTML = "";
    if (revealTitleEl) revealTitleEl.textContent = "Dossier débloqué";
    if (revealTextEl) revealTextEl.textContent = "";
    if (continueBtnEl) continueBtnEl.onclick = null;
  }

  function showReveal(reveal) {
    // reveal: { title, textSuccess, unlockImages[] }
    if (!reveal) return;

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
        // Simple pour l’instant : alerte. On pourra remplacer par une modale ensuite.
        alert(`${obj.title}\n\n${obj.content}`);
      });
    });
  }

  // ---------- Render main state ----------
  function render(state) {
    // Toujours cacher la révélation lors d’un simple rechargement d’état
    hideReveal();

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

    if (answerInputEl) {
      answerInputEl.value = "";
      answerInputEl.focus();
    }

    if (progressLabelEl) {
      const idx = (state.routeIndex ?? 0) + 1;
      const total = state.routeTotal ?? "?";
      progressLabelEl.textContent = `${idx} / ${total}`;
    }

    renderTimeline(state.archive);

    setFeedback("");
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
      render(state);
    } catch (e) {
      console.error(e);
      setFeedback("Erreur réseau. Serveur en ligne ?", true);
    }
  }

  // ---------- Submit ----------
  async function onSubmit() {
    const teamId = getTeamIdFromUrl() || localStorage.getItem("CARLO_TEAM_ID");
    if (!teamId) {
      window.location.href = "/carlo/index.html";
      return;
    }

    if (!submitBtnEl) return;

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

        if (continueBtnEl) {
          continueBtnEl.onclick = async () => {
            hideReveal();
            const st = await fetchState(teamId);
            render(st);
          };
        }

        return; // IMPORTANT : ne pas avancer automatiquement sans “Continuer”
      }

      // Fallback si pas de reveal : on recharge l’état directement
      const st = await fetchState(teamId);
      render(st);

    } catch (e) {
      console.error(e);
      setFeedback("Erreur réseau.", true);
    } finally {
      submitBtnEl.disabled = false;
    }
  }

  // ---------- Events ----------
  if (submitBtnEl) submitBtnEl.addEventListener("click", onSubmit);
  if (answerInputEl) {
    answerInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onSubmit();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener("click", boot);

  if (changeTeamBtn) {
    changeTeamBtn.addEventListener("click", () => {
      localStorage.removeItem("CARLO_TEAM_ID");
      window.location.href = "/carlo/index.html";
    });
  }

  // Start
  boot();
})();

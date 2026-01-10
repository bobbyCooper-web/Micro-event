(function () {
  const qs = (id) => document.getElementById(id);

  const teamLabelEl = qs("teamLabel");
  const stepTitleEl = qs("stepTitle");
  const textIntroEl = qs("textIntro");
  const mainImgEl = qs("mainImg");
  const promptEl = qs("prompt");
  const answerInputEl = qs("answerInput");
  const submitBtnEl = qs("submitBtn");
  const feedbackEl = qs("feedback");
  const progressLabelEl = qs("progressLabel");
  const timelineBarEl = qs("timelineBar");

  const unlockedWrapEl = qs("unlockedWrap");
  const unlockedGridEl = qs("unlockedGrid");

  const refreshBtn = qs("refreshBtn");
  const changeTeamBtn = qs("changeTeamBtn");

  function setFeedback(msg, isErr = false) {
    feedbackEl.textContent = msg || "";
    feedbackEl.className = isErr ? "err" : "muted";
  }

  function getTeamIdFromUrl() {
    const u = new URL(window.location.href);
    return u.searchParams.get("teamId");
  }

  function toAbs(url) {
    // évite les erreurs si url est vide
    if (!url) return "";
    return url;
  }

  async function fetchState(teamId) {
    const res = await fetch(`/api/carlo/state/${encodeURIComponent(teamId)}`);
    return await res.json();
  }

  async function submitAnswer(teamId, input) {
    const res = await fetch(`/api/carlo/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, input })
    });
    return await res.json();
  }

  function renderUnlocked(step, state) {
    const canShow = !!state?.isCurrentStepAlreadyValidated;
if (!canShow) {
  unlockedWrapEl.classList.add("hidden");
  unlockedGridEl.innerHTML = "";
  return;
}
    const unlocked = step?.onSuccess?.unlockImages || [];
    if (!Array.isArray(unlocked) || unlocked.length === 0) {
      unlockedWrapEl.classList.add("hidden");
      unlockedGridEl.innerHTML = "";
      return;
    }
    unlockedWrapEl.classList.remove("hidden");
    unlockedGridEl.innerHTML = unlocked.map((src) => {
      const s = toAbs(src);
      return `<a href="${s}" target="_blank" class="thumbLink">
                <img class="thumbImg" src="${s}" alt="" />
              </a>`;
    }).join("");
  }

  function renderTimeline(archive) {
    const items = Array.isArray(archive) ? archive : [];
    if (!items.length) {
      timelineBarEl.innerHTML = `<div class="muted small">Aucun élément validé pour le moment.</div>`;
      return;
    }

    timelineBarEl.innerHTML = items.map((a) => {
      const thumb = toAbs(a.thumb);
      const title = a.title || "Élément validé";
      const content = a.content || "";
      const payload = encodeURIComponent(JSON.stringify({ title, thumb, content }));
      return `
        <button class="tlItem" data-archive="${payload}" title="${title}">
          <img src="${thumb}" alt="${title}" />
        </button>
      `;
    }).join("");

    // clic = petite modal native (simple)
    timelineBarEl.querySelectorAll(".tlItem").forEach(btn => {
      btn.addEventListener("click", () => {
        const raw = btn.getAttribute("data-archive");
        if (!raw) return;
        const obj = JSON.parse(decodeURIComponent(raw));
        alert(`${obj.title}\n\n${obj.content}`);
      });
    });
  }

  function render(state) {
    if (!state?.ok) {
      setFeedback(state?.error || "Impossible de charger l’état.", true);
      return;
    }

    teamLabelEl.textContent = state.label || state.teamId || "—";
    const step = state.step;

    stepTitleEl.textContent = step?.title || "Étape";
    textIntroEl.textContent = step?.textIntro || "";

    const img = toAbs(step?.imageMain);
    mainImgEl.src = img;
    mainImgEl.style.display = img ? "block" : "none";

    promptEl.textContent = step?.questionPrompt || "";

    // UX : si pas de questionPrompt, on laisse le champ mais on ne bloque pas.
    answerInputEl.value = "";
    answerInputEl.focus();

    progressLabelEl.textContent = `${(state.routeIndex ?? 0) + 1} / ${state.routeTotal ?? "?"}`;

    renderTimeline(state.archive);
    renderUnlocked(step, state);

    setFeedback("");
  }

  async function boot() {
    let teamId = getTeamIdFromUrl();
    if (!teamId) {
      // fallback localStorage
      teamId = localStorage.getItem("CARLO_TEAM_ID");
      if (teamId) {
        window.location.href = `/carlo/game.html?teamId=${encodeURIComponent(teamId)}`;
        return;
      }
      window.location.href = "/carlo/index.html";
      return;
    }

    localStorage.setItem("CARLO_TEAM_ID", teamId);

    setFeedback("Chargement…");
    const state = await fetchState(teamId).catch(() => null);
    if (!state) {
      setFeedback("Erreur réseau. Serveur en ligne ?", true);
      return;
    }
    render(state);
  }

  async function onSubmit() {
    const teamId = getTeamIdFromUrl();
    if (!teamId) return;

    submitBtnEl.disabled = true;
    const input = answerInputEl.value.trim();

    try {
      const r = await submitAnswer(teamId, input);
      if (!r?.ok) {
        setFeedback(r?.message || "Incorrect.", true);
        return;
      }

      setFeedback("✅ Validé.");
      const st = await fetchState(teamId);
      render(st);
    } catch {
      setFeedback("Erreur réseau.", true);
    } finally {
      submitBtnEl.disabled = false;
    }
  }

  submitBtnEl.addEventListener("click", onSubmit);
  answerInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSubmit();
  });

  refreshBtn.addEventListener("click", boot);
  changeTeamBtn.addEventListener("click", () => {
    localStorage.removeItem("CARLO_TEAM_ID");
    window.location.href = "/carlo/index.html";
  });

  boot();
})();

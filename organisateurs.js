(() => {
  "use strict";

  const { storageKey: STORAGE_KEY, drawsStorageKey: DRAWS_STORAGE_KEY, initialMatches } = window.RESE_CUP_DATA;
  const $ = (selector, root = document) => root.querySelector(selector);
  const sportLabels = { football: "Football", basketball: "Basketball" };
  let matches = loadMatches();
  let activeFilter = "all";
  let draws = loadDraws();
  let toastTimer;
  let latestSavedMatch = null;
  let draftEvents = [];
  let selectedFixture = null;
  const eventLabels = { goal: "But", save: "Arrêt", yellow: "Carton jaune", red: "Carton rouge", substitution: "Remplacement" };

  function loadDraws() {
    try {
      const saved = localStorage.getItem(DRAWS_STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some((draw) =>
        !draw || typeof draw.id !== "string" ||
        !["football", "basketball"].includes(draw.sport) ||
        !Array.isArray(draw.rounds)
      )) throw new Error("Le format des tirages enregistrés est invalide.");
      return parsed;
    } catch (error) {
      console.error("Impossible de charger les tirages :", error);
      if (!window.confirm("Le tirage enregistré est illisible. Voulez-vous vraiment effacer les matchs et le tirage de cet appareil ?")) return [];
      matches = [...initialMatches];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMatches));
        localStorage.setItem(DRAWS_STORAGE_KEY, "[]");
      } catch (storageError) {
        console.error("Impossible de nettoyer les donn?es locales :", storageError);
      }
      return [];
    }
  }

  function persistDraws() {
    try {
      localStorage.setItem(DRAWS_STORAGE_KEY, JSON.stringify(draws));
      window.RESE_SHARED_STORE?.publish();
      return true;
    } catch (error) {
      console.error("Impossible d'enregistrer les tirages :", error);
      showToast("Sauvegarde du tirage impossible.");
      return false;
    }
  }

  function isValidMatch(match) {
    return match &&
      typeof match.id === "string" &&
      (match.sport === "football" || match.sport === "basketball") &&
      typeof match.home === "string" &&
      match.home.trim().length > 0 &&
      typeof match.away === "string" &&
      match.away.trim().length > 0 &&
      ["played", "upcoming", "live"].includes(match.status) &&
      (!match.events || (Array.isArray(match.events) && match.events.every((item) => item && Number.isInteger(Number(item.minute)) && Number(item.minute) >= 0 && ["goal", "save", "yellow", "red", "substitution"].includes(item.type) && ["home", "away"].includes(item.team) && typeof item.player === "string"))) &&
      (!match.goalkeeperSaves || ["home", "away"].every((side) => Number.isInteger(Number(match.goalkeeperSaves[side])) && Number(match.goalkeeperSaves[side]) >= 0)) &&
      typeof match.date === "string" &&
      parseDate(match.date) !== null &&
      (match.status === "upcoming" || (match.status === "live" && (match.homeScore === null || match.homeScore === undefined || match.awayScore === null || match.awayScore === undefined)) ||
        (match.homeScore !== null && match.homeScore !== "" &&
          match.awayScore !== null && match.awayScore !== "" &&
          Number.isInteger(Number(match.homeScore)) && Number(match.homeScore) >= 0 &&
          Number.isInteger(Number(match.awayScore)) && Number(match.awayScore) >= 0));
  }

  function loadMatches() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [...initialMatches];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some((match) => !isValidMatch(match))) {
        throw new Error("Le format des matchs enregistrés n'est pas valide.");
      }
      return parsed;
    } catch (error) {
      console.error("Impossible de charger les matchs :", error);
      if (!window.confirm("Les matchs enregistrés sont illisibles. Voulez-vous vraiment les effacer avec le tirage de cet appareil ?")) return [];
      showToast("Anciennes donnees invalides effacees. Matchs et equipes reinitialises.");
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMatches));
        localStorage.setItem(DRAWS_STORAGE_KEY, "[]");
      } catch (storageError) {
        console.error("Impossible de nettoyer les données locales :", storageError);
      }
      return [];
    }
  }

  function persistMatches() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
      window.RESE_SHARED_STORE?.publish();
      return true;
    } catch (error) {
      console.error("Impossible d'enregistrer les matchs :", error);
      showToast("Enregistrement impossible. Vérifiez l'espace disponible du navigateur.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseDate(value);
    return date
      ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
      : "Date à confirmer";
  }

  function liveStatusLabel(match) {
    return ({ "1H": "1RE MI-TEMPS", HT: "MI-TEMPS", "2H": "2E MI-TEMPS", ET1: "PROLONGATION 1", EXHT: "PAUSE PROLONGATION", ET2: "PROLONGATION 2", PEN: "TIRS AU BUT" })[match.clock?.period] || "EN DIRECT";
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function renderMatches() {
    const filtered = matches
      .filter((match) => activeFilter === "all" || match.sport === activeFilter)
      .sort((a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0));
    $("#match-count").textContent = `(${filtered.length})`;
    $("#admin-match-list").innerHTML = filtered.length
      ? filtered.map((match, index) => `
        <article class="organizer-match-row" style="animation-delay:${Math.min(index, 8) * 35}ms">
          <div>
            <div class="organizer-match-title">${escapeHTML(match.home)} <span aria-hidden="true">—</span> ${escapeHTML(match.away)}</div>
          <div class="organizer-match-meta">${escapeHTML(match.bracketRef ? `${draws.find((item) => item.id === match.bracketRef.drawId)?.rounds?.[match.bracketRef.roundIndex]?.name || "Tour"} · Affiche ${match.bracketRef.matchIndex + 1}` : sportLabels[match.sport])} · ${escapeHTML(formatDate(match.date))} · ${escapeHTML(match.venue || "Lieu à confirmer")}${match.star ? ` · ${escapeHTML(match.star)}` : ""}</div>
          </div>
          <div class="organizer-match-score">
            ${match.status !== "upcoming" ? `${escapeHTML(match.homeScore)} – ${escapeHTML(match.awayScore)}` : "VS"}
            <span class="organizer-match-status ${match.status === "upcoming" ? "upcoming" : match.status === "live" ? "live" : ""}">${match.status === "played" ? "TERMINÉ" : match.status === "live" ? liveStatusLabel(match) : "À VENIR"}</span>
          </div>
          <div class="organizer-row-actions">
            ${match.status === "upcoming" && match.sport === "football" ? `<button type="button" data-start-match="${escapeHTML(match.id)}">Démarrer</button>` : ""}
            <button type="button" data-edit="${escapeHTML(match.id)}">${match.status === "live" ? "Suivre le match" : "Modifier"}</button>
            <button class="delete-match" type="button" data-delete="${escapeHTML(match.id)}">Supprimer</button>
          </div>
        </article>
      `).join("")
      : '<p class="organizer-empty">Aucun match dans cette catégorie.</p>';
  }

  function renderOrganizerBracket() {
    const draw = draws.find((item) => item.sport === "football");
    window.RESE_renderBracket($("#organizer-bracket"), draw, { fixtureMatches: matches });
    renderFixtureOptions();
  }

  function renderFixtureOptions(keepValue = $("#form-fixture").value) {
    const draw = draws.find((item) => item.sport === "football");
    const select = $("#form-fixture");
    if (!draw) {
      select.innerHTML = '<option value="">Publiez d’abord le tirage officiel</option>';
      select.disabled = true;
      selectedFixture = null;
      return;
    }
    select.disabled = false;
    const currentId = $("#match-id").value;
    const options = [];
    draw.rounds.forEach((round, roundIndex) => round.matches.forEach((fixture, matchIndex) => {
      if (!fixture.home || !fixture.away || fixture.bye) return;
      const value = `${roundIndex}:${matchIndex}`;
      const current = matches.find((item) => item.id === currentId);
      const assigned = matches.some((item) => item.id !== currentId && item.bracketRef?.drawId === draw.id && item.bracketRef.roundIndex === roundIndex && item.bracketRef.matchIndex === matchIndex);
      if (fixture.winner && (current?.bracketRef?.roundIndex !== roundIndex || current?.bracketRef?.matchIndex !== matchIndex)) return;
      if (assigned) return;
      options.push(`<option value="${value}">${escapeHTML(round.name || `Tour ${roundIndex + 1}`)} · ${escapeHTML(fixture.home)} vs ${escapeHTML(fixture.away)}${fixture.winner ? " · terminé" : ""}</option>`);
    }));
    select.innerHTML = `<option value="">Choisir une affiche à programmer</option>${options.join("")}`;
    if (keepValue && [...select.options].some((option) => option.value === keepValue)) select.value = keepValue;
    applyFixtureSelection(select.value);
  }

  function applyFixtureSelection(value) {
    const draw = draws.find((item) => item.sport === "football");
    const [roundIndex, matchIndex] = (value || "").split(":").map(Number);
    const fixture = draw?.rounds[roundIndex]?.matches[matchIndex];
    selectedFixture = fixture ? { drawId: draw.id, roundIndex, matchIndex } : null;
    if (fixture) {
      $("#form-home").value = fixture.home;
      $("#form-away").value = fixture.away;
      refreshRosterLabels();
      $("#form-tiebreak-winner").options[1].textContent = fixture.home;
      $("#form-tiebreak-winner").options[2].textContent = fixture.away;
      $("#event-team").options[0].textContent = fixture.home;
      $("#event-team").options[1].textContent = fixture.away;
    } else if (!$("#match-id").value) {
      $("#form-home").value = "";
      $("#form-away").value = "";
    }
  }

  function updateEventTeamLabels() {
    $("#event-team").options[0].textContent = $("#form-home").value || "Équipe A";
    $("#event-team").options[1].textContent = $("#form-away").value || "Équipe B";
  }
  function rosterFromInput(selector) {
    const names = $(selector).value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    return [...new Map(names.map((name) => [name.toLocaleLowerCase(), name])).values()];
  }

  function refreshRosterLabels() {
    $("#home-roster-label").firstChild.textContent = `Joueurs ${$("#form-home").value || "équipe A"}`;
    $("#away-roster-label").firstChild.textContent = `Joueurs ${$("#form-away").value || "équipe B"}`;
    const players = [...rosterFromInput("#home-roster"), ...rosterFromInput("#away-roster")];
    const unique = [...new Map(players.map((name) => [name.toLocaleLowerCase(), name])).values()];
    $("#event-player-options").innerHTML = unique.map((name) => `<option value="${escapeHTML(name)}"></option>`).join("");
  }

  $("#form-home").addEventListener("input", () => { updateEventTeamLabels(); refreshRosterLabels(); });
  $("#form-away").addEventListener("input", () => { updateEventTeamLabels(); refreshRosterLabels(); });
  $("#home-roster").addEventListener("input", refreshRosterLabels);
  $("#away-roster").addEventListener("input", refreshRosterLabels);

  $("#form-fixture").addEventListener("change", (event) => applyFixtureSelection(event.target.value));
  $("#form-sport").addEventListener("change", (event) => {
    const football = event.target.value === "football";
    $("#fixture-picker-wrap").hidden = !football;
    $("#form-fixture").required = football;
    $("#form-home").readOnly = football;
    $("#form-away").readOnly = football;
    if (football) renderFixtureOptions();
    else selectedFixture = null;
    const current = matches.find((item) => item.id === $("#match-id").value);
    $("#match-clock-controls").hidden = !football || current?.status === "played" || !current;
  });

  function makeFixedBracket(teams) {
    return {
      id: `bracket-${Date.now()}`,
      sport: "football",
      teams,
      createdAt: new Date().toISOString(),
      rounds: [
        {
          name: "Huitièmes de finale",
          matches: Array.from({ length: 8 }, (_, index) => ({
            home: teams[index * 2],
            away: teams[index * 2 + 1],
            homeScore: null,
            awayScore: null,
            winner: null,
          })),
        },
        { name: "Quarts de finale", matches: Array.from({ length: 4 }, () => ({ home: null, away: null, homeScore: null, awayScore: null, winner: null })) },
        { name: "Demi-finales", matches: Array.from({ length: 2 }, () => ({ home: null, away: null, homeScore: null, awayScore: null, winner: null })) },
        { name: "Grande finale", matches: [{ home: null, away: null, homeScore: null, awayScore: null, winner: null }] },
      ],
    };
  }

  function showTeamEditor() {
    const existing = draws.find((item) => item.sport === "football");
    $("#draw-entry").hidden = false;
    $("#draw-teams-grid").innerHTML = Array.from({ length: 16 }, (_, index) => `
      <label>Équipe ${String(index + 1).padStart(2, "0")}
        <input type="text" maxlength="50" required data-team-slot="${index}" value="${escapeHTML(existing?.teams[index] || "")}" placeholder="Nom de l’équipe" />
      </label>
    `).join("");
    $("#draw-error").hidden = true;
  }

  $("#edit-draw-teams").addEventListener("click", showTeamEditor);
  $("#cancel-draw-edit").addEventListener("click", () => {
    $("#draw-entry").hidden = true;
    $("#draw-error").hidden = true;
  });

  $("#clear-draw-selection").addEventListener("click", () => {
    const inputs = [...$("#draw-teams-grid").querySelectorAll("[data-team-slot]")];
    inputs.forEach((input) => { input.value = ""; });
    $("#draw-error").hidden = true;
    inputs[0]?.focus();
    showToast("La sélection des équipes a été effacée.");
  });

  $("#save-draw").addEventListener("click", () => {
    const teams = [...$("#draw-teams-grid").querySelectorAll("[data-team-slot]")].map((input) => input.value.trim());
    const error = $("#draw-error");
    const unique = new Set(teams.map((team) => team.toLocaleLowerCase()));
    if (teams.length !== 16 || teams.some((team) => !team) || unique.size !== 16) {
      error.textContent = "Renseignez les 16 équipes du tirage officiel. Chaque équipe doit être différente.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    const previous = draws;
    const previousMatches = matches;
    const current = draws.find((item) => item.sport === "football");
    const teamsChanged = current && teams.some((team, index) => team !== current.teams[index]);
    if (current && !teamsChanged) {
      $("#draw-entry").hidden = true;
      showToast("Les affiches officielles sont inchangées.");
      return;
    }
    if (teamsChanged && !window.confirm("Modifier les affiches réinitialisera les scores et les tours déjà joués, et supprimera les matchs programmés depuis ce tirage. Continuer ?")) return;
    if (teamsChanged && current) {
      matches = matches.filter((item) => item.bracketRef?.drawId !== current.id);
      if (!persistMatches()) { matches = previousMatches; return; }
    }
    const draw = makeFixedBracket(teams);
    draws = [draw, ...draws.filter((item) => item.sport !== "football")];
    if (!persistDraws()) {
      draws = previous;
      matches = previousMatches;
      persistMatches();
      return;
    }
    $("#draw-entry").hidden = true;
    renderOrganizerBracket();
    renderMatches();
    showToast("Les 16 affiches officielles sont publiées.");
  });

  function advanceWinners(draw, firstChangedRound) {
    for (let roundIndex = firstChangedRound + 1; roundIndex < draw.rounds.length; roundIndex += 1) {
      draw.rounds[roundIndex].matches.forEach((match) => {
        match.home = null;
        match.away = null;
        match.homeScore = null;
        match.awayScore = null;
        match.winner = null;
      });
    }
    for (let roundIndex = 0; roundIndex < draw.rounds.length - 1; roundIndex += 1) {
      const currentRound = draw.rounds[roundIndex];
      const nextRound = draw.rounds[roundIndex + 1];
      currentRound.matches.forEach((match, matchIndex) => {
        const nextMatch = nextRound.matches[Math.floor(matchIndex / 2)];
        if (!nextMatch || !match.winner) return;
        if (matchIndex % 2 === 0) nextMatch.home = match.winner;
        else nextMatch.away = match.winner;
      });
    }
  }

  $("#organizer-bracket").addEventListener("click", (event) => {
    const button = event.target.closest("[data-save-round]");
    if (!button) return;
    const draw = draws.find((item) => item.sport === "football");
    if (!draw) return;
    const roundIndex = Number(button.dataset.saveRound);
    const matchIndex = Number(button.dataset.saveMatch);
    const match = draw.rounds[roundIndex]?.matches[matchIndex];
    if (!match || !match.home || !match.away) return;
    const homeScore = $(`[data-score-round="${roundIndex}"][data-score-match="${matchIndex}"][data-score-side="home"]`, $("#organizer-bracket")).value;
    const awayScore = $(`[data-score-round="${roundIndex}"][data-score-match="${matchIndex}"][data-score-side="away"]`, $("#organizer-bracket")).value;
    const winnerChoice = $(`[data-winner-round="${roundIndex}"][data-winner-match="${matchIndex}"]`, $("#organizer-bracket")).value;
    const error = $("#draw-error");
    if (homeScore === "" || awayScore === "") {
      error.textContent = "Saisissez les deux scores avant de valider ce match.";
      error.hidden = false;
      return;
    }
    if (homeScore === awayScore && !winnerChoice) {
      error.textContent = "En cas d’égalité, choisissez l’équipe qualifiée aux tirs au but.";
      error.hidden = false;
      return;
    }
    const previous = JSON.stringify(draws);
    match.homeScore = Number(homeScore);
    match.awayScore = Number(awayScore);
    match.winner = match.homeScore === match.awayScore
      ? winnerChoice === "home" ? match.home : match.away
      : match.homeScore > match.awayScore ? match.home : match.away;
    match.completedAt = new Date().toISOString();
    advanceWinners(draw, roundIndex);
    if (!persistDraws()) {
      draws = JSON.parse(previous);
      renderOrganizerBracket();
      return;
    }
    error.hidden = true;
    renderOrganizerBracket();
    showToast(`${match.winner} se qualifie pour le tour suivant.`);
    latestSavedMatch = {
      id: `bracket-result-${draw.id}-${roundIndex}-${matchIndex}`,
      sport: "football",
      home: match.home,
      away: match.away,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: "played",
      date: match.completedAt,
      star: "",
    };
    window.setTimeout(() => window.RESE_createResultPoster(latestSavedMatch), 250);
  });

  if (!draws.some((item) => item.sport === "football")) showTeamEditor();

  function resetForm() {
    $("#match-form").reset();
    $("#match-id").value = "";
    $("#form-title").textContent = "Ajouter un match";
    $("#save-match").textContent = "Enregistrer le match";
    $("#cancel-edit").hidden = true;
    $("#form-home-score").disabled = true;
    $("#form-away-score").disabled = true;
    $("#form-home-score").required = false;
    $("#form-away-score").required = false;
    $("#form-error").hidden = true;
    selectedFixture = null;
    $("#form-fixture").value = "";
    $("#form-tiebreak-winner").value = "";
    draftEvents = [];
    $("#home-saves").value = "0";
    $("#away-saves").value = "0";
    $("#match-clock-controls").hidden = true;
    $("#form-sport").dispatchEvent(new Event("change"));
    $("#form-sport").disabled = false;
    refreshRosterLabels();
    renderDraftEvents();
  }

  function beginEdit(match) {
    resetForm();
    $("#match-id").value = match.id;
    $("#form-title").textContent = "Modifier le match";
    $("#save-match").textContent = "Enregistrer les modifications";
    $("#cancel-edit").hidden = false;
    $("#form-sport").value = match.sport;
    $("#form-sport").disabled = Boolean(match.bracketRef);
    $("#form-status").value = match.status;
    $("#form-home").value = match.home;
    $("#form-away").value = match.away;
    $("#home-roster").value = (match.rosters?.home || []).join("\n");
    $("#away-roster").value = (match.rosters?.away || []).join("\n");
    refreshRosterLabels();
    $("#fixture-picker-wrap").hidden = match.sport !== "football";
    $("#form-fixture").required = Boolean(match.bracketRef);
    $("#form-home").readOnly = match.sport === "football" && Boolean(match.bracketRef);
    $("#form-away").readOnly = match.sport === "football" && Boolean(match.bracketRef);
    selectedFixture = match.bracketRef || null;
    renderFixtureOptions(match.bracketRef ? `${match.bracketRef.roundIndex}:${match.bracketRef.matchIndex}` : "");
    if (match.bracketRef) $("#form-fixture").value = `${match.bracketRef.roundIndex}:${match.bracketRef.matchIndex}`;
    $("#form-tiebreak-winner").options[1].textContent = match.home;
    $("#form-tiebreak-winner").options[2].textContent = match.away;
    updateEventTeamLabels();
    $("#form-tiebreak-winner").value = match.tiebreakWinner || "";
    $("#form-venue").value = match.venue || "";
    $("#form-star").value = match.star || "";
    draftEvents = Array.isArray(match.events) ? [...match.events] : [];
    $("#home-saves").value = match.goalkeeperSaves?.home ?? 0;
    $("#away-saves").value = match.goalkeeperSaves?.away ?? 0;
    $("#form-home-score").value = match.homeScore ?? "";
    $("#form-away-score").value = match.awayScore ?? "";
    $("#form-home-score").disabled = match.status === "upcoming";
    $("#form-away-score").disabled = match.status === "upcoming";
    $("#form-home-score").required = match.status !== "upcoming";
    $("#form-away-score").required = match.status !== "upcoming";
    renderDraftEvents();
    $("#match-clock-controls").hidden = match.status === "played" || match.sport !== "football";
    renderMatchClock(match);

    const date = parseDate(match.date);
    if (date) {
      const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      $("#form-date").value = localDate.toISOString().slice(0, 16);
    }
    $("#form-home").focus();
    $("#match-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  $("#form-status").addEventListener("change", (event) => {
    const hasScore = event.target.value !== "upcoming";
    $("#match-clock-controls").hidden = event.target.value === "played";
    $("#form-home-score").disabled = !hasScore;
    $("#form-away-score").disabled = !hasScore;
    $("#form-home-score").required = hasScore;
    $("#form-away-score").required = hasScore;
    if (!hasScore) {
      $("#form-home-score").value = "";
      $("#form-away-score").value = "";
    }
  });

  function renderDraftEvents() {
    $("#match-event-list").innerHTML = draftEvents.map((item, index) => `<li><span><b>${escapeHTML(item.minute)}′</b> ${escapeHTML(eventLabels[item.type] || item.type)} · ${escapeHTML(item.team === "home" ? $("#form-home").value || "Équipe A" : $("#form-away").value || "Équipe B")}${item.player ? ` — ${escapeHTML(item.player)}` : ""}</span><button type="button" data-remove-event="${index}" aria-label="Retirer cette action">×</button></li>`).join("");
  }

  function elapsedClockSeconds(clock) {
    return Math.max(0, Number(clock?.elapsedSeconds) || 0) + (clock?.running && clock.startedAt ? Math.max(0, Math.floor((Date.now() - clock.startedAt) / 1000)) : 0);
  }

  function renderMatchClock(match) {
    const clock = match?.clock;
    const running = Boolean(clock?.running);
    const period = clock?.period || "READY";
    const total = ["ET1", "ET2"].includes(period) ? 15 * 60 : 45 * 60;
    const elapsed = elapsedClockSeconds(clock || {});
    const display = ["HT", "EXHT", "PEN", "FT"].includes(period)
      ? ({ HT: "PAUSE", EXHT: "PAUSE", PEN: "TIRS", FT: "FIN" })[period]
      : elapsed <= total
        ? Math.max(0, total - elapsed)
        : `+${Math.floor((elapsed - total) / 60)}:${String((elapsed - total) % 60).padStart(2, "0")}`;
    const periodLabels = { READY: "PRÊT", "1H": "1RE MI-TEMPS", HT: "MI-TEMPS", "2H": "2E MI-TEMPS", ET1: "PROLONGATION 1", EXHT: "PAUSE PROLONGATION", ET2: "PROLONGATION 2", PEN: "TIRS AU BUT", FT: "TERMINÉ" };
    $("#clock-period").textContent = `${periodLabels[period] || period}${clock?.addedMinutes ? ` · +${clock.addedMinutes}′` : ""}`;
    $("#clock-display").textContent = typeof display === "number" ? `${String(Math.floor(display / 60)).padStart(2, "0")}:${String(display % 60).padStart(2, "0")}` : display;
    $("#clock-start").hidden = Boolean(clock);
    $("#clock-halftime").hidden = !running || period !== "1H";
    $("#clock-second-half").hidden = period !== "HT";
    $("#clock-add-time").hidden = !running || (period !== "1H" && period !== "2H");
    $("#clock-extra-time").hidden = period !== "2H";
    $("#clock-extra-break").hidden = !running || period !== "ET1";
    $("#clock-extra-second").hidden = period !== "EXHT";
    $("#clock-penalties").hidden = period !== "ET2";
    $("#clock-finish").hidden = !clock || period === "FT";
  }

  function updateClock(nextClock, status = "live") {
    const id = $("#match-id").value;
    const index = matches.findIndex((item) => item.id === id);
    if (index < 0) { showToast("Enregistrez d’abord le match à programmer."); return; }
    const previous = matches;
    matches = matches.map((item) => item.id === id ? { ...item, status, clock: nextClock,
      date: Number.isNaN(new Date($("#form-date").value).getTime()) ? item.date : new Date($("#form-date").value).toISOString(),
      homeScore: Number($("#form-home-score").value) || Number(item.homeScore) || 0,
      awayScore: Number($("#form-away-score").value) || Number(item.awayScore) || 0,
    } : item);
    if (!persistMatches()) { matches = previous; return; }
    const match = matches.find((item) => item.id === id);
    window.RESE_NOTIFICATIONS?.notifyChanges(matches, previous);
    $("#form-status").value = status;
    $("#match-clock-controls").hidden = status === "played";
    renderMatchClock(match);
    renderMatches();
    showToast(status === "played" ? "Match terminé. Enregistrez le résultat pour qualifier le vainqueur." : "Chronomètre mis à jour.");
  }

  $("#clock-start").addEventListener("click", () => {
    if ($("#form-sport").value !== "football") { showToast("Le chronomètre en mi-temps est réservé au football."); return; }
    $("#form-home-score").value ||= "0"; $("#form-away-score").value ||= "0";
    $("#form-home-score").disabled = false; $("#form-away-score").disabled = false;
    const now = Date.now();
    $("#form-date").value = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    updateClock({ period: "1H", startedAt: now, elapsedSeconds: 0, addedMinutes: 0, running: true });
  });
  $("#clock-halftime").addEventListener("click", () => {
    const match = matches.find((item) => item.id === $("#match-id").value);
    if (match?.clock) updateClock({ ...match.clock, period: "HT", elapsedSeconds: elapsedClockSeconds(match.clock), running: false, startedAt: null });
  });
  $("#clock-second-half").addEventListener("click", () => updateClock({ period: "2H", startedAt: Date.now(), elapsedSeconds: 0, addedMinutes: 0, running: true }));
  $("#clock-add-time").addEventListener("click", () => {
    const match = matches.find((item) => item.id === $("#match-id").value);
    if (match?.clock) updateClock({ ...match.clock, addedMinutes: (Number(match.clock.addedMinutes) || 0) + 1 });
  });
  $("#clock-extra-time").addEventListener("click", () => updateClock({ period: "ET1", startedAt: Date.now(), elapsedSeconds: 0, addedMinutes: 0, running: true }));
  $("#clock-extra-break").addEventListener("click", () => {
    const match = matches.find((item) => item.id === $("#match-id").value);
    if (match?.clock) updateClock({ ...match.clock, period: "EXHT", elapsedSeconds: elapsedClockSeconds(match.clock), running: false, startedAt: null });
  });
  $("#clock-extra-second").addEventListener("click", () => updateClock({ period: "ET2", startedAt: Date.now(), elapsedSeconds: 0, addedMinutes: 0, running: true }));
  $("#clock-penalties").addEventListener("click", () => updateClock({ period: "PEN", startedAt: null, elapsedSeconds: 0, addedMinutes: 0, running: false }));
  $("#clock-finish").addEventListener("click", () => {
    if (selectedFixture && $("#form-home-score").value !== "" && Number($("#form-home-score").value) === Number($("#form-away-score").value) && !$("#form-tiebreak-winner").value) {
      $("#form-error").textContent = "Choisissez le vainqueur aux tirs au but avant de terminer ce match à élimination directe.";
      $("#form-error").hidden = false;
      return;
    }
    $("#form-error").hidden = true;
    $("#form-status").value = "played";
    $("#form-status").dispatchEvent(new Event("change"));
    $("#form-status").value = "played";
    $("#form-home-score").value ||= "0"; $("#form-away-score").value ||= "0";
    $("#match-form").requestSubmit();
  });

  window.setInterval(() => {
    const match = matches.find((item) => item.id === $("#match-id").value);
    if (match?.clock?.running && !$("#match-clock-controls").hidden) renderMatchClock(match);
  }, 1000);

  function publishLiveDraft() {
    const id = $("#match-id").value;
    if (!id || $("#form-status").value !== "live") return false;
    const previous = matches;
    const date = new Date($("#form-date").value);
    if (Number.isNaN(date.getTime())) return false;
    matches = matches.map((match) => match.id === id ? {
      ...match,
      sport: $("#form-sport").value,
      status: "live",
      home: $("#form-home").value.trim(),
      away: $("#form-away").value.trim(),
      date: date.toISOString(),
      venue: $("#form-venue").value.trim(),
      homeScore: Number($("#form-home-score").value) || 0,
      awayScore: Number($("#form-away-score").value) || 0,
      events: [...draftEvents],
      rosters: { home: rosterFromInput("#home-roster"), away: rosterFromInput("#away-roster") },
      goalkeeperSaves: { home: Number($("#home-saves").value) || 0, away: Number($("#away-saves").value) || 0 },
    } : match);
    if (!persistMatches()) { matches = previous; return false; }
    window.RESE_NOTIFICATIONS?.notifyChanges(matches, previous);
    renderMatches();
    return true;
  }

  $("#add-match-event").addEventListener("click", () => {
    const minute = Number($("#event-minute").value);
    const type = $("#event-type").value;
    const team = $("#event-team").value;
    const player = $("#event-player").value.trim();
    if (!$("#event-minute").value || !player) { showToast("Indiquez la minute et le nom du joueur."); return; }
    const eventItem = { id: `event-${Date.now()}`, minute, type, team, player };
    const rosterField = team === "home" ? $("#home-roster") : $("#away-roster");
    if (!rosterFromInput(team === "home" ? "#home-roster" : "#away-roster").some((name) => name.toLocaleLowerCase() === player.toLocaleLowerCase())) {
      rosterField.value = [...rosterFromInput(team === "home" ? "#home-roster" : "#away-roster"), player].join("\n");
      refreshRosterLabels();
    }
    draftEvents.push(eventItem);
    draftEvents.sort((a, b) => Number(a.minute) - Number(b.minute));
    if (type === "goal") {
      if ($("#form-status").value === "upcoming") {
        $("#form-home-score").value = "0";
        $("#form-away-score").value = "0";
      }
      const score = team === "home" ? $("#form-home-score") : $("#form-away-score");
      score.value = String((Number(score.value) || 0) + 1);
      if ($("#form-status").value === "upcoming") $("#form-status").value = "live";
      $("#form-home-score").disabled = false; $("#form-away-score").disabled = false;
      $("#form-home-score").required = true; $("#form-away-score").required = true;
    }
    if (type === "save") {
      const saves = team === "home" ? $("#home-saves") : $("#away-saves");
      saves.value = String((Number(saves.value) || 0) + 1);
    }
    $("#event-minute").value = ""; $("#event-player").value = "";
    renderDraftEvents();
    if (publishLiveDraft()) showToast("Action et score publiés en direct.");
    else showToast(type === "goal" ? "But ajouté, score actualisé. Enregistrez pour publier." : "Action ajoutée. Enregistrez pour publier.");
  });

  $("#match-event-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-event]");
    if (!button) return;
    const removed = draftEvents.splice(Number(button.dataset.removeEvent), 1)[0];
    if (removed?.type === "goal") {
      const score = removed.team === "home" ? $("#form-home-score") : $("#form-away-score");
      score.value = String(Math.max(0, (Number(score.value) || 0) - 1));
    }
    if (removed?.type === "save") {
      const saves = removed.team === "home" ? $("#home-saves") : $("#away-saves");
      saves.value = String(Math.max(0, (Number(saves.value) || 0) - 1));
    }
    renderDraftEvents();
    if (publishLiveDraft()) showToast("Action supprimée et suivi actualisé.");
  });

  $("#match-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const status = $("#form-status").value;
    const homeScore = $("#form-home-score").value;
    const awayScore = $("#form-away-score").value;
    const home = $("#form-home").value.trim();
    const away = $("#form-away").value.trim();
    const existingMatch = matches.find((item) => item.id === $("#match-id").value);

    if (existingMatch?.bracketRef && existingMatch.status === "played" && status !== "played") {
      $("#form-error").textContent = "Une affiche terminée ne peut pas être remise en programmation. Corrigez plutôt son score.";
      $("#form-error").hidden = false;
      return;
    }

    if (home.toLocaleLowerCase() === away.toLocaleLowerCase()) {
      $("#form-error").textContent = "Une équipe ne peut pas jouer contre elle-même.";
      $("#form-error").hidden = false;
      return;
    }
    if (status !== "upcoming" && (homeScore === "" || awayScore === "")) {
      $("#form-error").textContent = "Un match en cours ou terminé doit avoir deux scores.";
      $("#form-error").hidden = false;
      return;
    }
    if (status === "played" && selectedFixture && Number(homeScore) === Number(awayScore) && !$("#form-tiebreak-winner").value) {
      $("#form-error").textContent = "Choisissez l’équipe qualifiée aux tirs au but pour compléter le tableau.";
      $("#form-error").hidden = false;
      return;
    }

    const dateValue = $("#form-date").value;
    const date = new Date(dateValue);
    if (!dateValue || Number.isNaN(date.getTime())) {
      $("#form-error").textContent = "Veuillez choisir une date et une heure valides.";
      $("#form-error").hidden = false;
      return;
    }

    const id = $("#match-id").value || `match-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const match = {
      id,
      sport: $("#form-sport").value,
      status,
      home,
      away,
      date: date.toISOString(),
      venue: $("#form-venue").value.trim(),
      homeScore: status === "upcoming" ? null : Number(homeScore),
      awayScore: status === "upcoming" ? null : Number(awayScore),
      star: $("#form-star").value.trim(),
      events: [...draftEvents],
      rosters: { home: rosterFromInput("#home-roster"), away: rosterFromInput("#away-roster") },
      goalkeeperSaves: { home: Number($("#home-saves").value) || 0, away: Number($("#away-saves").value) || 0 },
      bracketRef: selectedFixture,
      tiebreakWinner: $("#form-tiebreak-winner").value || null,
      clock: existingMatch?.clock || null,
    };
    if (status === "played" && match.clock) {
      match.clock = { ...match.clock, period: "FT", elapsedSeconds: elapsedClockSeconds(match.clock), running: false, startedAt: null };
    }
    const previous = matches;
    const previousDraws = JSON.parse(JSON.stringify(draws));
    const existingIndex = matches.findIndex((item) => item.id === id);
    matches = existingIndex < 0
      ? [...matches, match]
      : matches.map((item) => item.id === id ? match : item);

    if (status === "played" && match.bracketRef) {
      const draw = draws.find((item) => item.id === match.bracketRef.drawId);
      const fixture = draw?.rounds[match.bracketRef.roundIndex]?.matches[match.bracketRef.matchIndex];
      if (!fixture || fixture.home !== home || fixture.away !== away) {
        matches = previous;
        $("#form-error").textContent = "Cette affiche n’est plus disponible dans le tableau. Rechargez la sélection.";
        $("#form-error").hidden = false;
        return;
      }
      fixture.homeScore = Number(homeScore);
      fixture.awayScore = Number(awayScore);
      fixture.winner = Number(homeScore) === Number(awayScore)
        ? $("#form-tiebreak-winner").value === "home" ? home : away
        : Number(homeScore) > Number(awayScore) ? home : away;
      fixture.completedAt = new Date().toISOString();
      advanceWinners(draw, match.bracketRef.roundIndex);
      if (!persistDraws()) { draws = previousDraws; matches = previous; return; }
      renderOrganizerBracket();
    }

    if (!persistMatches()) {
      matches = previous;
      draws = previousDraws;
      persistDraws();
      renderOrganizerBracket();
      return;
    }
    window.RESE_NOTIFICATIONS?.notifyChanges(matches, previous);
    resetForm();
    renderMatches();
    showToast("Match enregistré.");
    if (match.status === "played") {
      latestSavedMatch = match;
      window.setTimeout(() => window.RESE_createResultPoster(match), 350);
    }
  });

  $("#cancel-edit").addEventListener("click", resetForm);

  $("#admin-match-list").addEventListener("click", (event) => {
    const startButton = event.target.closest("[data-start-match]");
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (startButton) {
      const match = matches.find((item) => item.id === startButton.dataset.startMatch);
      if (match) { beginEdit(match); $("#clock-start").click(); }
    }
    if (editButton) {
      const match = matches.find((item) => item.id === editButton.dataset.edit);
      if (match) beginEdit(match);
    }
    if (deleteButton) {
      const match = matches.find((item) => item.id === deleteButton.dataset.delete);
      if (!match || !window.confirm(`Supprimer le match ${match.home} — ${match.away} ?`)) return;
      const previous = matches;
      const previousDraws = JSON.parse(JSON.stringify(draws));
      if (match.bracketRef) {
        if (!window.confirm("Cette affiche appartient au tableau. Supprimer aussi les matchs des tours suivants qui dependent de ce resultat ?")) return;
        const draw = draws.find((item) => item.id === match.bracketRef.drawId);
        const fixture = draw?.rounds[match.bracketRef.roundIndex]?.matches[match.bracketRef.matchIndex];
        if (fixture) {
          fixture.homeScore = null; fixture.awayScore = null; fixture.winner = null; delete fixture.completedAt;
          advanceWinners(draw, match.bracketRef.roundIndex);
        }
        matches = matches.filter((item) => item.id !== match.id && !(item.bracketRef?.drawId === match.bracketRef.drawId && item.bracketRef.roundIndex > match.bracketRef.roundIndex));
        if (!persistDraws()) { draws = previousDraws; matches = previous; renderOrganizerBracket(); return; }
      } else {
        matches = matches.filter((item) => item.id !== match.id);
      }
      if (persistMatches()) {
        renderOrganizerBracket();
        renderMatches();
        showToast("Match supprimé.");
      } else {
        matches = previous;
        draws = previousDraws;
        persistDraws();
        renderOrganizerBracket();
      }
    }
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderMatches();
    });
  });

  $("#export-data").addEventListener("click", () => {
    const file = new Blob([JSON.stringify(matches, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rese-excellence-cup-matchs.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Sauvegarde exportée.");
  });

  $("#reset-tournament-data").addEventListener("click", () => {
    if (!window.confirm("Voulez-vous vraiment effacer tous les matchs et toutes les equipes du tournoi ? Cette action ne peut pas etre annulee.")) return;
    const previousMatches = matches;
    const previousDraws = draws;
    matches = [...initialMatches];
    draws = [];
    if (!persistMatches()) {
      matches = previousMatches;
      draws = previousDraws;
      return;
    }
    if (!persistDraws()) {
      matches = previousMatches;
      draws = previousDraws;
      persistMatches();
      renderMatches();
      renderOrganizerBracket();
      return;
    }
    resetForm();
    $("#draw-entry").hidden = true;
    renderMatches();
    renderOrganizerBracket();
    showToast("Tous les matchs et équipes du tournoi ont été réinitialisés.");
    const publicResetUrl = new URL("index.html", window.location.href);
    publicResetUrl.searchParams.set("resetTournamentData", "1");
    publicResetUrl.searchParams.set("confirmed", "1");
    if (!window.open(publicResetUrl.href, "_blank")) window.location.assign(publicResetUrl.href);
  });

  $("#import-data").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!Array.isArray(imported) || imported.some((match) => !isValidMatch(match))) {
        throw new Error("Le fichier sélectionné ne contient pas une liste de matchs valide.");
      }
      const previous = matches;
      matches = imported;
      if (persistMatches()) {
        renderMatches();
        showToast("Sauvegarde importée.");
      } else {
        matches = previous;
      }
    } catch (error) {
      console.error("Échec de l'import :", error);
      showToast(error instanceof SyntaxError ? "Le fichier JSON est illisible." : error.message);
    } finally {
      event.target.value = "";
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === DRAWS_STORAGE_KEY) {
      try {
        draws = event.newValue ? JSON.parse(event.newValue) : [];
        renderOrganizerBracket();
      } catch (error) {
        console.error("Échec de synchronisation des tirages :", error);
      }
      return;
    }
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const updated = JSON.parse(event.newValue);
      if (!Array.isArray(updated) || updated.some((match) => !isValidMatch(match))) {
        throw new Error("Le format des matchs reçus n'est pas valide.");
      }
      matches = updated;
      renderMatches();
    } catch (error) {
      console.error("Échec de la synchronisation des matchs :", error);
      showToast("Les données reçues entre onglets ne sont pas valides.");
    }
  });

  function closePoster() {
    $("#result-poster-modal").hidden = true;
    window.RESE_revokeResultVideo();
    $("#download-video").disabled = true;
  }

  $("#poster-close").addEventListener("click", closePoster);
  $("#result-poster-modal").addEventListener("click", (event) => {
    if (event.target === $("#result-poster-modal")) closePoster();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#result-poster-modal").hidden) closePoster();
  });
  $("#replay-video").addEventListener("click", () => {
    if (latestSavedMatch) window.RESE_createResultPoster(latestSavedMatch);
  });
  $("#download-video").addEventListener("click", () => {
    const url = $("#download-video").dataset.url;
    if (url) window.RESE_downloadFile(url, "rese-excellence-cup-resultat.webm");
  });
  $("#download-image").addEventListener("click", () => {
    if (latestSavedMatch) window.RESE_downloadPoster(latestSavedMatch);
  });

  renderMatches();
  renderOrganizerBracket();
  window.RESE_NOTIFICATIONS?.notifyUpcoming(matches);
  window.setInterval(() => window.RESE_NOTIFICATIONS?.notifyUpcoming(matches), 30_000);
  window.RESE_SHARED_STORE?.start();
})();

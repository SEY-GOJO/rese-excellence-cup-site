(() => {
  "use strict";

  const { storageKey: STORAGE_KEY, drawsStorageKey: DRAWS_STORAGE_KEY, initialMatches } = window.RESE_CUP_DATA;

  const resetParams = new URLSearchParams(window.location.search);
  if (resetParams.has("resetTournamentData")) {
    const resetConfirmed = resetParams.has("confirmed") || window.confirm("Voulez-vous vraiment effacer tous les matchs et toutes les equipes de ce site ?");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("resetTournamentData");
    cleanUrl.searchParams.delete("confirmed");
    if (!resetConfirmed) {
      if (window.location.protocol === "file:") window.location.replace(cleanUrl.href);
      else window.history.replaceState(null, "", cleanUrl.href);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMatches));
        localStorage.setItem(DRAWS_STORAGE_KEY, "[]");
        if (window.location.protocol === "file:") {
          window.location.replace(cleanUrl.href);
          return;
        }
        window.history.replaceState(null, "", cleanUrl.href);
      } catch (error) {
        console.error("Could not reset public tournament data.", error);
      }
    }
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sportLabels = { football: "Football", basketball: "Basketball" };

  let matches = loadMatches();
  let activeSport = "football";
  let rankSport = "football";
  let bracketSport = "football";
  let draws = [];
  let freshResultId = null;
  let freshGoalId = null;
  let freshGoalTeam = null;
  let toastTimer;

  function loadMatches() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [...initialMatches];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some((match) => !isValidMatch(match))) {
        throw new Error("Format invalide.");
      }
      return parsed;
    } catch (error) {
      console.error("Saved matches are invalid; clearing tournament data.", error);
      if (!window.confirm("Les matchs enregistrés sont illisibles. Voulez-vous vraiment les effacer avec le tirage de cet appareil ?")) return [];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialMatches));
        localStorage.setItem(DRAWS_STORAGE_KEY, "[]");
      } catch (storageError) {
        console.error("Could not clear invalid local data.", storageError);
      }
      return [];
    }
  }

  function isValidMatch(match) {
    return (
      match &&
      typeof match.id === "string" &&
      (match.sport === "football" || match.sport === "basketball") &&
      typeof match.home === "string" &&
      typeof match.away === "string" &&
      ["played", "upcoming", "live"].includes(match.status) &&
      (!match.events || (Array.isArray(match.events) && match.events.every((item) => item && Number.isInteger(Number(item.minute)) && Number(item.minute) >= 0 && ["goal", "save", "yellow", "red", "substitution"].includes(item.type) && ["home", "away"].includes(item.team) && typeof item.player === "string"))) &&
      typeof match.date === "string"
    );
  }

  function persistMatches() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
      return true;
    } catch (error) {
      console.error("Impossible d'écrire dans le stockage :", error);
      showToast("Enregistrement impossible. Vérifiez le navigateur.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function toDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateLabel(value, option = { day: "2-digit", month: "short" }) {
    const date = toDate(value);
    if (!date) return "Date à confirmer";
    return new Intl.DateTimeFormat("fr-FR", option).format(date);
  }

  function timeLabel(value) {
    const date = toDate(value);
    return date ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date) : "—";
  }

  function stageLabel(match) {
    if (!match.bracketRef) return "";
    const draw = draws.find((item) => item.id === match.bracketRef.drawId);
    const round = draw?.rounds?.[match.bracketRef.roundIndex];
    return round ? `${round.name} · Affiche ${match.bracketRef.matchIndex + 1}` : "";
  }

  function clockText(match) {
    const clock = match.clock;
    if (!clock) return `${Math.max(1, Math.floor((Date.now() - (toDate(match.date)?.getTime() || Date.now())) / 60000))}′`;
    if (clock.period === "HT") return "MI-TEMPS";
    if (clock.period === "EXHT") return "PAUSE PROLONGATION";
    if (clock.period === "PEN") return "TIRS AU BUT";
    if (clock.period === "FT") return "TERMINÉ";
    const elapsed = Math.max(0, Number(clock.elapsedSeconds) || 0) + (clock.running && clock.startedAt ? Math.max(0, Math.floor((Date.now() - clock.startedAt) / 1000)) : 0);
    const length = ["ET1", "ET2"].includes(clock.period) ? 15 * 60 : 45 * 60;
    const label = ({ "1H": "1RE MI-TEMPS", "2H": "2E MI-TEMPS", ET1: "PROLONGATION 1", ET2: "PROLONGATION 2" })[clock.period] || "EN DIRECT";
    const time = elapsed <= length
      ? `${String(Math.floor((length - elapsed) / 60)).padStart(2, "0")}:${String((length - elapsed) % 60).padStart(2, "0")} restantes`
      : `${clock.period === "ET1" || clock.period === "ET2" ? "15+" : "45+"}${String(Math.floor((elapsed - length) / 60)).padStart(2, "0")}:${String((elapsed - length) % 60).padStart(2, "0")}`;
    return `${label} · ${time}${clock.addedMinutes ? ` · +${clock.addedMinutes}′ annoncées` : ""}`;
  }

  function crest(teamName) {
    const initials = String(teamName || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
    return initials || "R";
  }

  function getSportMatches(sport) {
    return matches
      .filter((match) => match.sport === sport)
      .sort((a, b) => {
        const priority = { live: 0, upcoming: 1, played: 2 };
        if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status];
        const direction = a.status === "upcoming" ? 1 : -1;
        return direction * ((toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0));
      });
  }

  function renderMatches() {
    const list = $("#match-list");
    const sportMatches = getSportMatches(activeSport).slice(0, 4);

    list.innerHTML = sportMatches.length
      ? sportMatches
          .map((match) => {
            const played = match.status === "played";
            const live = match.status === "live";
            const scoreDisplay = played || live ? `<span class="score-number home-score-number">${String(Number(match.homeScore) || 0).padStart(2, "0")}</span><span class="score-versus">VS</span><span class="score-number away-score-number">${String(Number(match.awayScore) || 0).padStart(2, "0")}</span>` : "VS";
            const badgeLabel = played ? "TERMINÉ" : live ? "EN DIRECT" : "À VENIR";
            const badgeClass = live ? "live" : played ? "" : "scheduled";
            const meta = live ? `${clockText(match)} · ${escapeHTML(match.venue || "Match en cours")}` : played ? dateLabel(match.date) : `${dateLabel(match.date)} · ${timeLabel(match.date)}`;
            const stage = stageLabel(match);
            const eventLabels = { goal: "⚽", save: "🧤", yellow: "🟨", red: "🟥", substitution: "🔁" };
            const timeline = Array.isArray(match.events) && match.events.length ? `<div class="match-timeline">${[...match.events].sort((a,b) => Number(a.minute)-Number(b.minute)).slice(-4).map(item => `<span class="timeline-event"><b>${escapeHTML(item.minute)}′</b> ${eventLabels[item.type] || "•"} ${escapeHTML(item.player || "Action")}<small>${escapeHTML(item.team === "home" ? match.home : match.away)}</small></span>`).join("")}</div>` : "";
            const keepers = (match.goalkeeperSaves && (Number(match.goalkeeperSaves.home) || Number(match.goalkeeperSaves.away))) ? `<div class="keeper-line"><span>🧤 ${escapeHTML(match.goalkeeperSaves.home || 0)} arrêts</span><span>${escapeHTML(match.goalkeeperSaves.away || 0)} arrêts 🧤</span></div>` : "";
            const rosters = match.rosters || {};
            const lineupSides = [
              { key: "home", team: match.home },
              { key: "away", team: match.away },
            ].map(({ key, team }) => {
              const players = [...new Map([
                ...(Array.isArray(rosters[key]) ? rosters[key] : []),
                ...(match.events || []).filter((item) => item.team === key && item.player).map((item) => item.player),
              ].map((player) => [String(player).trim().toLocaleLowerCase(), String(player).trim()])).values()];
              if (!players.length) return "";
              const rows = players.map((player) => {
                const actions = (match.events || []).filter((item) => item.team === key && String(item.player || "").trim().toLocaleLowerCase() === String(player).trim().toLocaleLowerCase());
                const count = (type) => actions.filter((item) => item.type === type).length;
                const tags = [
                  count("goal") ? `<span class="player-stat goal-stat">⚽ ${count("goal")}${count("goal") > 1 ? " buts" : ""}</span>` : "",
                  count("yellow") ? `<span class="player-stat yellow-stat">🟨 ${count("yellow") > 1 ? `×${count("yellow")}` : ""}</span>` : "",
                  count("red") ? `<span class="player-stat red-stat">🟥 ${count("red") > 1 ? `×${count("red")}` : "EXCLU"}</span>` : "",
                  count("save") ? `<span class="player-stat save-stat">🧤 ${count("save")} arrêt${count("save") > 1 ? "s" : ""}</span>` : "",
                  count("substitution") ? `<span class="player-stat">🔁 ${count("substitution") > 1 ? `×${count("substitution")}` : "entré(e)"}</span>` : "",
                ].filter(Boolean).join("");
                return `<li><span class="lineup-player-name">${escapeHTML(player)}</span><span class="player-stats">${tags || `<span class="player-stat quiet-stat">${actions.length ? "Action" : ""}</span>`}</span></li>`;
              }).join("");
              return `<section class="lineup-team"><h4>${escapeHTML(team)} <span>${players.length} joueur${players.length > 1 ? "s" : ""}</span></h4><ul>${rows}</ul></section>`;
            }).filter(Boolean).join("");
            const lineupPanel = lineupSides ? `<details class="match-lineups"><summary>Compositions et statistiques</summary><div class="lineup-grid">${lineupSides}</div></details>` : "";

            return `
              <article class="match-card ${live ? `live-match ${match.id === freshResultId ? "live-score-update" : ""}` : played ? match.id === freshResultId ? "recent-result" : "" : "upcoming-card"} ${freshGoalId === match.id ? "goal-score-card" : ""}">
                <div class="team">
                  <span class="team-crest">${escapeHTML(crest(match.home))}</span>
                  <span class="team-name">${escapeHTML(match.home)}</span>
                </div>
                <div class="match-center">
                  <span class="match-status ${badgeClass}">${badgeLabel}</span>
                  <strong class="match-score ${match.status === "upcoming" ? "upcoming" : "scoreline"} ${freshGoalId === match.id ? `goal-score-flash goal-${freshGoalTeam}` : ""}">${scoreDisplay}</strong>
                  <span class="match-meta" ${live ? `data-clock="${escapeHTML(JSON.stringify(match.clock || {}))}" data-kickoff="${escapeHTML(match.date)}" data-venue="${escapeHTML(match.venue || "Match en cours")}"` : ""}>${escapeHTML(meta)}</span>
                </div>
                <div class="team away">
                  <span class="team-name">${escapeHTML(match.away)}</span>
                  <span class="team-crest">${escapeHTML(crest(match.away))}</span>
                </div>
                ${stage ? `<span class="match-stage">${escapeHTML(stage)}</span>` : ""}
                ${timeline}${keepers}${lineupPanel}
              </article>
            `;
          })
          .join("")
      : "";

    $("#match-empty").hidden = sportMatches.length > 0;
  }

  function calculateStandings(sport) {
    const teams = new Map();

    getSportMatches(sport)
      .filter((match) => match.status === "played")
      .forEach((match) => {
        [match.home, match.away].forEach((teamName) => {
          if (!teams.has(teamName)) {
            teams.set(teamName, {
              name: teamName,
              played: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              scored: 0,
              conceded: 0,
              points: 0,
            });
          }
        });

        const home = teams.get(match.home);
        const away = teams.get(match.away);
        const homeScore = Number(match.homeScore);
        const awayScore = Number(match.awayScore);

        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;

        home.played += 1;
        away.played += 1;
        home.scored += homeScore;
        home.conceded += awayScore;
        away.scored += awayScore;
        away.conceded += homeScore;

        if (homeScore > awayScore) {
          home.wins += 1;
          home.points += 3;
          away.losses += 1;
        } else if (awayScore > homeScore) {
          away.wins += 1;
          away.points += 3;
          home.losses += 1;
        } else if (match.tiebreakWinner === "home" || match.tiebreakWinner === "away") {
          const winner = match.tiebreakWinner === "home" ? home : away;
          const loser = winner === home ? away : home;
          winner.wins += 1;
          winner.points += 3;
          loser.losses += 1;
        } else {
          home.draws += 1;
          away.draws += 1;
          home.points += 1;
          away.points += 1;
        }
      });

    return [...teams.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const goalDiffA = a.scored - a.conceded;
      const goalDiffB = b.scored - b.conceded;
      if (goalDiffB !== goalDiffA) return goalDiffB - goalDiffA;
      if (b.scored !== a.scored) return b.scored - a.scored;
      return a.name.localeCompare(b.name, "fr");
    });
  }

  function renderStandings() {
    const body = $("#standings-body");
    const standings = calculateStandings(rankSport);

    body.innerHTML = standings.length
      ? standings.slice(0, 5).map((team, index) => `
          <tr class="${index < 2 ? "qualifying" : ""}">
            <td>${String(index + 1).padStart(2, "0")}</td>
            <td><span class="standings-team"><span class="mini-crest">${escapeHTML(crest(team.name))}</span>${escapeHTML(team.name)}</span></td>
            <td>${team.played}</td>
            <td>${team.points}</td>
          </tr>
        `).join("")
      : '<tr><td colspan="4" class="empty-state">Aucun classement disponible.</td></tr>';
  }

  function renderUpcoming() {
    const list = $("#upcoming-list");
    const upcoming = matches
      .filter((match) => match.status === "upcoming")
      .sort((a, b) => (toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0))
      .slice(0, 3);

    list.innerHTML = upcoming.length
      ? upcoming.map((match) => {
          const date = toDate(match.date);
          const day = date ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(date) : "—";
          const month = date ? new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date).replace(".", "") : "Date";
          return `
            <div class="upcoming-item">
              <span class="date-block"><strong>${escapeHTML(day)}</strong><small>${escapeHTML(month)}</small></span>
              <span class="upcoming-teams"><strong>${escapeHTML(match.home)} vs ${escapeHTML(match.away)}</strong><span>${escapeHTML(match.venue || "Lieu à confirmer")} · ${escapeHTML(timeLabel(match.date))}</span></span>
              <span class="sport-chip">${match.sport === "football" ? "FOOT" : "BASKET"}</span>
            </div>
          `;
        }).join("")
      : '<p class="spotlight-empty">Aucun match programmé pour le moment.</p>';
  }

  function renderSpotlight() {
    const content = $("#spotlight-content");
    const featured = matches
      .filter((match) => match.status === "played" && match.star && match.star.trim())
      .sort((a, b) => (toDate(b.date)?.getTime() ?? 0) - (toDate(a.date)?.getTime() ?? 0))[0];

    if (!featured) {
      content.innerHTML = '<p class="spotlight-empty">Les performances des joueurs et joueuses seront affichées ici.</p>';
      return;
    }

    const parts = featured.star.split("—").map((part) => part.trim());
    const playerName = parts[0] || "Joueur";
    const playerTeam = parts[1] || featured.home;
    const playerStat = parts[2] || "Performance";
    const statParts = playerStat.split(/\s+/);
    const statValue = statParts[0] || "0";
    const statLabel = statParts.slice(1).join(" ") || "performance";

    content.innerHTML = `
      <span class="player-avatar">${escapeHTML(crest(playerName))}</span>
      <div class="player-details">
        <strong>${escapeHTML(playerName)}</strong>
        <span>${escapeHTML(playerTeam)} · ${escapeHTML(sportLabels[featured.sport])}</span>
      </div>
      <div class="player-stat">
        <strong>${escapeHTML(statValue)}</strong>
        <small>${escapeHTML(statLabel)}</small>
      </div>
    `;
  }

  function renderStats() {
    const played = matches.filter((match) => match.status === "played");
    const teams = new Set(matches.flatMap((match) => [match.home, match.away]));
    const scores = played.reduce((total, match) => total + (Number(match.homeScore) || 0) + (Number(match.awayScore) || 0), 0);
    const nextMatch = matches
      .filter((match) => match.status === "upcoming")
      .sort((a, b) => (toDate(a.date)?.getTime() ?? 0) - (toDate(b.date)?.getTime() ?? 0))[0];

    $("#stat-played").textContent = String(played.length);
    $("#stat-teams").textContent = String(teams.size);
    $("#stat-scores").textContent = String(scores);
    $("#stat-next").textContent = nextMatch ? `${sportLabels[nextMatch.sport]} · ${timeLabel(nextMatch.date)}` : "À confirmer";
    $("#stat-next-date").textContent = nextMatch ? dateLabel(nextMatch.date, { weekday: "short", month: "short", day: "2-digit" }) : "Aucun match prévu";
  }

  function renderAll() {
    renderMatches();
    renderStandings();
    renderUpcoming();
    renderSpotlight();
    renderStats();
    renderPublicBracket();
  }

  function renderPublicBracket() {
    const draw = draws.find((item) => item.sport === bracketSport);
    window.RESE_renderBracket($("#public-bracket"), draw, { fixtureMatches: matches });
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  $$(".sport-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeSport = tab.dataset.sport;
      $$(".sport-tab").forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      renderMatches();
    });
  });

  $$(".rank-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      rankSport = tab.dataset.rank;
      $$(".rank-tab").forEach((item) => item.classList.toggle("active", item === tab));
      renderStandings();
    });

  });

  $$("[data-bracket]").forEach((tab) => {
    tab.addEventListener("click", () => {
      bracketSport = tab.dataset.bracket;
      $$("[data-bracket]").forEach((item) => item.classList.toggle("active", item === tab));
      renderPublicBracket();
    });
  });

  $("#mobile-menu").addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
  });

  $$(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      $$(".nav-link").forEach((item) => item.classList.toggle("active", item === link));
      $("#sidebar").classList.remove("open");
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key === DRAWS_STORAGE_KEY) {
      try {
        draws = event.newValue ? JSON.parse(event.newValue) : [];
        renderPublicBracket();
      } catch (error) {
        console.error("Les tirages partagés sont invalides :", error);
      }
      return;
    }
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const updated = JSON.parse(event.newValue);
      if (!Array.isArray(updated) || updated.some((match) => !isValidMatch(match))) {
        throw new Error("Format invalide.");
      }
      freshResultId = updated.find((match) => {
        if (match.status !== "played" && match.status !== "live") return false;
        const previous = matches.find((item) => item.id === match.id);
        return !previous || previous.status !== match.status ||
          previous.homeScore !== match.homeScore || previous.awayScore !== match.awayScore ||
          (previous.events?.length || 0) !== (match.events?.length || 0);
      })?.id ?? null;
      const scoredGoal = updated.find((match) => {
        if (match.status !== "live") return false;
        const previous = matches.find((item) => item.id === match.id);
        return previous && ((Number(match.homeScore) || 0) > (Number(previous.homeScore) || 0) || (Number(match.awayScore) || 0) > (Number(previous.awayScore) || 0));
      });
      freshGoalId = scoredGoal?.id ?? null;
      if (scoredGoal) {
        const previous = matches.find((item) => item.id === scoredGoal.id);
        freshGoalTeam = (Number(scoredGoal.homeScore) || 0) > (Number(previous.homeScore) || 0) ? "home" : "away";
      } else freshGoalTeam = null;
      window.RESE_NOTIFICATIONS?.notifyChanges(updated, matches);
      matches = updated;
      renderAll();
    } catch (error) {
      console.error("Les données partagées entre onglets sont invalides :", error);
    }
  });

  try {
    const savedDraws = localStorage.getItem(DRAWS_STORAGE_KEY);
    draws = savedDraws ? JSON.parse(savedDraws) : [];
    if (!Array.isArray(draws)) throw new Error("Invalid bracket format.");
  } catch (error) {
    console.error("Saved bracket is invalid; clearing tournament data.", error);
    if (!window.confirm("Le tirage enregistré est illisible. Voulez-vous vraiment effacer les matchs et le tirage de cet appareil ?")) {
      draws = [];
    } else {
    matches = [];
    draws = [];
    try {
      localStorage.setItem(STORAGE_KEY, "[]");
      localStorage.setItem(DRAWS_STORAGE_KEY, "[]");
    } catch (storageError) {
      console.error("Could not clear invalid local data.", storageError);
    }
    }
  }


  const animatedElements = $$(".hero-content, .stats-row, .content-grid, .bottom-grid, .page-footer");
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        currentObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 });

    animatedElements.forEach((element) => {
      element.classList.add("reveal");
      observer.observe(element);
    });
  } else {
    animatedElements.forEach((element) => element.classList.add("is-visible"));
  }

  window.setInterval(() => {
    $$(".match-meta[data-kickoff]").forEach((label) => {
      let clock = null;
      try { clock = JSON.parse(label.dataset.clock || "null"); } catch { clock = null; }
      label.textContent = `${clockText({ clock, date: label.dataset.kickoff })} · ${label.dataset.venue}`;
    });
  }, 1000);

  window.RESE_NOTIFICATIONS?.init("#notification-toggle", showToast);
  window.RESE_NOTIFICATIONS?.notifyUpcoming(matches);
  window.setInterval(() => window.RESE_NOTIFICATIONS?.notifyUpcoming(matches), 30_000);
  renderAll();
})();

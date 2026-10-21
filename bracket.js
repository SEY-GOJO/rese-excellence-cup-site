(() => {
  "use strict";

  const roundNames = ["Huitièmes de finale", "Quarts de finale", "Demi-finales", "Grande finale"];

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function renderBracket(container, draw, options = {}) {
    if (!draw || !Array.isArray(draw.rounds) || !draw.rounds.length) {
      container.innerHTML = '<p class="bracket-empty">Le tableau des 16 équipes sera publié après le tirage officiel réalisé par les organisateurs.</p>';
      return;
    }

    const createdAt = new Date(draw.createdAt);
    const createdLabel = Number.isNaN(createdAt.getTime())
      ? "date à confirmer"
      : new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(createdAt);
    const teamCount = Array.isArray(draw.teams) ? draw.teams.length : 0;

    container.innerHTML = `
      <div class="bracket-header">
        <span>${draw.sport === "football" ? "⚽ FOOTBALL · TABLEAU À 16 ÉQUIPES" : "🏀 BASKETBALL"}</span>
        <strong>${escapeHTML(teamCount)} équipes · tirage du ${escapeHTML(createdLabel)}</strong>
      </div>
      <div class="bracket-scroll">
        <div class="bracket-rounds">
          ${draw.rounds.map((round, roundIndex) => `
            <section class="bracket-round">
              <h3>${escapeHTML(round.name || roundNames[Math.min(roundIndex, roundNames.length - 1)] || `Tour ${roundIndex + 1}`)}</h3>
              <div class="bracket-games" style="--game-count:${round.matches.length}">
                ${round.matches.map((match, matchIndex) => {
                  const left = match.home || `Vainqueur M${matchIndex * 2 + 1}`;
                  const right = match.away || `Vainqueur M${matchIndex * 2 + 2}`;
                  const homeWon = match.winner && match.winner === match.home;
                  const awayWon = match.winner && match.winner === match.away;
                  const bye = match.bye || match.home === "Exempt" || match.away === "Exempt";
                  const isResolved = Boolean(match.winner);
                  const canEnterScore = options.editable && match.home && match.away;
                  const planned = options.fixtureMatches?.find((item) => item.bracketRef?.drawId === draw.id && item.bracketRef.roundIndex === roundIndex && item.bracketRef.matchIndex === matchIndex);
                  const plannedDate = planned ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(planned.date)) : "";
                  const gameStatus = planned?.status === "live" ? "EN DIRECT" : planned?.status === "played" ? "TERMINÉ" : planned ? "PROGRAMMÉ" : isResolved ? "QUALIFIÉ" : "À PROGRAMMER";
                  return `<article class="bracket-game ${isResolved ? "game-resolved" : ""}">
                    <span class="bracket-game-number">${roundIndex === 0 ? `MATCH ${String(matchIndex + 1).padStart(2, "0")}` : `AFFICHE ${matchIndex + 1}`}</span>
                    <span class="bracket-fixture-status ${planned?.status === "live" ? "is-live" : ""}">${gameStatus}${plannedDate ? ` · ${escapeHTML(plannedDate)}` : ""}</span>
                    <div class="bracket-team ${homeWon || (bye && match.home !== "Exempt") ? "winner" : ""} ${match.home ? "" : "placeholder"}">${escapeHTML(left)}${homeWon ? " <span>✓</span>" : ""}</div>
                    <div class="bracket-team ${awayWon || (bye && match.away !== "Exempt") ? "winner" : ""} ${match.away ? "" : "placeholder"}">${escapeHTML(right)}${awayWon ? " <span>✓</span>" : ""}</div>
                    ${match.homeScore !== null && match.homeScore !== undefined
                      ? `<div class="bracket-score">${escapeHTML(match.homeScore)} – ${escapeHTML(match.awayScore)}</div>`
                      : ""}
                    ${bye ? '<span class="bye-label">EXEMPT</span>' : ""}
                    ${canEnterScore ? `<div class="bracket-score-editor">
                      <label class="sr-only" for="bracket-home-${roundIndex}-${matchIndex}">Score de ${escapeHTML(match.home)}</label>
                      <input id="bracket-home-${roundIndex}-${matchIndex}" type="number" min="0" max="99" placeholder="0" value="${match.homeScore ?? ""}" data-score-round="${roundIndex}" data-score-match="${matchIndex}" data-score-side="home" />
                      <span aria-hidden="true">–</span>
                      <label class="sr-only" for="bracket-away-${roundIndex}-${matchIndex}">Score de ${escapeHTML(match.away)}</label>
                      <input id="bracket-away-${roundIndex}-${matchIndex}" type="number" min="0" max="99" placeholder="0" value="${match.awayScore ?? ""}" data-score-round="${roundIndex}" data-score-match="${matchIndex}" data-score-side="away" />
                      <select aria-label="Vainqueur en cas d’égalité" data-winner-round="${roundIndex}" data-winner-match="${matchIndex}">
                        <option value="">Vainqueur si égalité</option>
                        <option value="home" ${match.winner === match.home ? "selected" : ""}>${escapeHTML(match.home)}</option>
                        <option value="away" ${match.winner === match.away ? "selected" : ""}>${escapeHTML(match.away)}</option>
                      </select>
                      <button type="button" data-save-round="${roundIndex}" data-save-match="${matchIndex}">${isResolved ? "Corriger" : "Valider"}</button>
                    </div>` : ""}
                    ${roundIndex === draw.rounds.length - 1 && match.winner
                      ? `<div class="bracket-champion">🏆 VAINQUEUR<br /><strong>${escapeHTML(match.winner)}</strong></div>`
                      : ""}
                  </article>`;
                }).join("")}
              </div>
            </section>
          `).join("")}
        </div>
      </div>`;
  }

  window.RESE_renderBracket = renderBracket;
})();

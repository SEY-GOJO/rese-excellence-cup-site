(() => {
  "use strict";

  const API_URL = "./api/state";
  const PASSWORD_KEY = "rese-excellence-cup-organizer-session-v1";
  const { storageKey: MATCHES_KEY, drawsStorageKey: DRAWS_KEY } = window.RESE_CUP_DATA;
  const isOrganizer = document.body.classList.contains("organizer-page");
  const statusElement = document.querySelector("#shared-sync-status");
  let enabled = false;
  let version = 0;
  let lastSnapshot = null;
  let queue = Promise.resolve();
  let polling = false;

  function setStatus(message, state = "") {
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.dataset.state = state;
  }

  function localState() {
    let matches = [];
    let draws = [];
    try { matches = JSON.parse(localStorage.getItem(MATCHES_KEY) || "[]"); } catch { /* Keep a safe empty fallback. */ }
    try { draws = JSON.parse(localStorage.getItem(DRAWS_KEY) || "[]"); } catch { /* Keep a safe empty fallback. */ }
    return { matches: Array.isArray(matches) ? matches : [], draws: Array.isArray(draws) ? draws : [] };
  }

  function announceStorageChange(key, oldValue, newValue) {
    window.dispatchEvent(new StorageEvent("storage", {
      key,
      oldValue,
      newValue,
      storageArea: localStorage,
      url: window.location.href,
    }));
  }

  function applyRemoteState(state) {
    const entries = [
      [MATCHES_KEY, state.matches],
      [DRAWS_KEY, state.draws],
    ];
    for (const [key, value] of entries) {
      const next = JSON.stringify(value);
      const previous = localStorage.getItem(key);
      if (previous === next) continue;
      localStorage.setItem(key, next);
      announceStorageChange(key, previous, next);
    }
    lastSnapshot = JSON.stringify(state);
  }

  async function fetchRemote() {
    const response = await fetch(`${API_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (response.status === 404 || response.status === 405) {
      enabled = false;
      setStatus("Synchronisation partagée indisponible sur cet hébergement.", "offline");
      return null;
    }
    if (response.status === 503) {
      enabled = false;
      setStatus("Base partagée à configurer sur Vercel.", "offline");
      return null;
    }
    if (!response.ok) throw new Error("Impossible de lire les données partagées.");
    const result = await response.json();
    if (!result || !Number.isInteger(result.version) ||
        (result.state && (!Array.isArray(result.state.matches) || !Array.isArray(result.state.draws)))) {
      throw new Error("Réponse de synchronisation invalide.");
    }
    enabled = true;
    version = result.version;
    if (result.state) applyRemoteState(result.state);
    setStatus("Données partagées · actualisation automatique", "online");
    return result;
  }

  async function poll() {
    if (!enabled || polling || document.visibilityState === "hidden") return;
    polling = true;
    try {
      await fetchRemote();
    } catch (error) {
      setStatus("Connexion interrompue · nouvelle tentative automatique", "offline");
      console.error("Shared tournament data could not be refreshed.", error);
    } finally {
      polling = false;
    }
  }

  function getOrganizerPassword() {
    let password = "";
    try { password = sessionStorage.getItem(PASSWORD_KEY) || ""; } catch { /* Continue with a prompt. */ }
    if (password) return password;
    password = window.prompt("Mot de passe organisateur pour enregistrer le tournoi sur tous les appareils :") || "";
    if (password) {
      try { sessionStorage.setItem(PASSWORD_KEY, password); } catch { /* The current edit can still be sent. */ }
    }
    return password;
  }

  function publish() {
    if (!isOrganizer || !enabled) return Promise.resolve(false);
    const state = localState();
    const snapshot = JSON.stringify(state);
    queue = queue.then(async () => {
      const password = getOrganizerPassword();
      if (!password) {
        setStatus("Modification conservée sur cet appareil seulement.", "offline");
        return false;
      }
      setStatus("Enregistrement des données partagées…", "pending");
      const response = await fetch(API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Organizer-Password": password },
        body: JSON.stringify({ state, version }),
        cache: "no-store",
      });
      if (response.status === 401) {
        try { sessionStorage.removeItem(PASSWORD_KEY); } catch { /* Ignore unavailable session storage. */ }
        setStatus("Mot de passe incorrect. La modification reste locale.", "offline");
        return false;
      }
      if (response.status === 409) {
        await fetchRemote();
        setStatus("Le tournoi a changé sur un autre appareil. Données rechargées, recommence cette modification.", "offline");
        return false;
      }
      if (!response.ok) {
        setStatus("Enregistrement partagé impossible. Vérifie la base Vercel.", "offline");
        return false;
      }
      const result = await response.json();
      version = result.version;
      lastSnapshot = snapshot;
      setStatus("Enregistré · visible sur les autres appareils", "online");
      return true;
    }).catch((error) => {
      setStatus("Connexion interrompue · modification gardée sur cet appareil", "offline");
      console.error("Shared tournament data could not be saved.", error);
      return false;
    });
    return queue;
  }

  async function start() {
    if (!window.location.protocol.startsWith("http")) return;
    try {
      const result = await fetchRemote();
      if (!result || !enabled) return;
      if (!result.state) lastSnapshot = JSON.stringify(localState());
      window.setInterval(poll, 4000);
      window.addEventListener("online", poll);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") poll();
      });
    } catch (error) {
      setStatus("Serveur partagé non configuré ou injoignable.", "offline");
      console.error("Shared tournament data could not start.", error);
    }
  }

  window.RESE_SHARED_STORE = { start, publish };
})();

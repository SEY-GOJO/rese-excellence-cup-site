(() => {
  "use strict";

  const PREFERENCE_KEY = "rese-excellence-cup-notifications-v1";
  let registrationPromise = null;
  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const installButton = document.querySelector("#install-app");
    if (installButton) installButton.hidden = false;
  });

  document.querySelector("#install-app")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    const button = document.querySelector("#install-app");
    if (button) button.hidden = true;
  });

  function enabled() {
    try { return localStorage.getItem(PREFERENCE_KEY) === "on"; } catch { return false; }
  }

  function savePreference(value) {
    try { localStorage.setItem(PREFERENCE_KEY, value ? "on" : "off"); } catch { /* Private browsing may block storage. */ }
  }

  function isSecureForNotifications() {
    return window.isSecureContext || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  }

  function registerServiceWorker() {
    if (!isSecureForNotifications() || !("serviceWorker" in navigator)) return Promise.resolve(null);
    if (!registrationPromise) {
      registrationPromise = navigator.serviceWorker.register("./service-worker.js")
        .then((registration) => registration)
        .catch((error) => {
          console.warn("Service worker unavailable:", error);
          return null;
        });
    }
    return registrationPromise;
  }

  function refreshButton(button) {
    if (!button) return;
    const active = enabled() && window.Notification?.permission === "granted";
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("notifications-active", active);
    button.querySelector("[data-notification-label]").textContent = active ? "Alertes actives" : "Activer les alertes";
  }

  async function notify(title, body, tag) {
    if (!enabled() || !("Notification" in window) || Notification.permission !== "granted") return;
    const markerKey = `rese-notification-delivered-${tag}`;
    try { if (localStorage.getItem(markerKey)) return; } catch { /* Notifications can work without persistent storage. */ }
    const options = { body, icon: "./app-icon-192.png", badge: "./app-icon-192.png", tag, data: { url: "./index.html#matchs" } };
    try {
      const registration = await registerServiceWorker();
      if (registration?.showNotification) await registration.showNotification(title, options);
      else new Notification(title, options);
      try { localStorage.setItem(markerKey, "1"); } catch { /* Notifications can work without persistent storage. */ }
    } catch (error) {
      console.warn("Could not display match notification:", error);
    }
  }

  function notifyChanges(updatedMatches, previousMatches) {
    if (!enabled() || !("Notification" in window) || Notification.permission !== "granted") return;
    const previousById = new Map(previousMatches.map((match) => [match.id, match]));
    updatedMatches.forEach((match) => {
      const previous = previousById.get(match.id);
      if (!previous) return;
      const previousEventIds = new Set((previous.events || []).map((item) => item.id).filter(Boolean));
      const newEvents = (match.events || []).filter((item) => item.id && !previousEventIds.has(item.id));
      newEvents.forEach((item) => {
        const team = item.team === "home" ? match.home : match.away;
        const labels = {
          goal: ["BUT !", `${item.player} · ${team} · ${item.minute}′`],
          yellow: ["Carton jaune", `${item.player} · ${team} · ${item.minute}′`],
          red: ["Carton rouge", `${item.player} · ${team} · ${item.minute}′`],
          save: ["Arrêt du gardien", `${item.player} · ${team} · ${item.minute}′`],
          substitution: ["Remplacement", `${item.player} · ${team} · ${item.minute}′`],
        };
        const message = labels[item.type];
        if (message) void notify(message[0], `${message[1]} — ${match.home} ${match.homeScore ?? 0} : ${match.awayScore ?? 0} ${match.away}`, `event-${item.id}`);
      });
      if (match.status === "live" && previous.status !== "live" && !newEvents.some((item) => item.type === "goal")) {
        void notify("Le match a commencé", `${match.home} contre ${match.away}`, `started-${match.id}`);
      }
      if (match.status === "played" && previous.status !== "played") {
        void notify("Match terminé", `${match.home} ${match.homeScore} : ${match.awayScore} ${match.away}`, `finished-${match.id}`);
      }
    });
  }

  function notifyUpcoming(matches) {
    if (!enabled() || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = Date.now();
    matches.filter((match) => match.status === "upcoming").forEach((match) => {
      const kickoff = new Date(match.date).getTime();
      if (!Number.isFinite(kickoff)) return;
      const remaining = kickoff - now;
      if (remaining > 0 && remaining <= 15 * 60 * 1000) {
        notifyOnce(`reminder-${match.id}`, "Match dans 15 minutes", `${match.home} contre ${match.away}`);
      } else if (remaining <= 0 && remaining >= -10 * 60 * 1000) {
        notifyOnce(`kickoff-${match.id}`, "Coup d’envoi prévu", `${match.home} contre ${match.away}`);
      }
    });
  }

  function notifyOnce(key, title, body) {
    const sessionKey = `rese-notified-${key}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "1");
    } catch { /* The notification still works for this check. */ }
    void notify(title, body, key);
  }

  function init(buttonSelector, showToast) {
    const button = document.querySelector(buttonSelector);
    if (button) {
      refreshButton(button);
      button.addEventListener("click", async () => {
        if (enabled()) {
          savePreference(false);
          refreshButton(button);
          showToast("Alertes désactivées sur cet appareil.");
          return;
        }
        if (!("Notification" in window)) {
          showToast("Les notifications ne sont pas prises en charge par ce navigateur.");
          return;
        }
        if (!isSecureForNotifications()) {
          showToast("Pour les alertes sur téléphone, ouvrez le site avec une adresse HTTPS.");
          return;
        }
        let permission;
        try { permission = await Notification.requestPermission(); }
        catch (error) {
          console.warn("Notification permission request failed:", error);
          showToast("L’autorisation des alertes n’a pas pu être demandée.");
          return;
        }
        if (permission !== "granted") {
          showToast(permission === "denied" ? "Autorisez les notifications dans les réglages du navigateur." : "Aucune autorisation de notification n’a été accordée.");
          return;
        }
        savePreference(true);
        await registerServiceWorker();
        refreshButton(button);
        showToast("Alertes activées pour les matchs, buts et cartons.");
      });
    }
    void registerServiceWorker();
  }

  window.RESE_NOTIFICATIONS = { init, notifyChanges, notifyUpcoming };
  void registerServiceWorker();
})();

(() => {
  "use strict";

  const canvas = document.querySelector("#result-canvas");
  const context = canvas.getContext("2d");
  const modal = document.querySelector("#result-poster-modal");
  let currentVideoUrl = null;
  let animationFrame = 0;
  let activeRecorder = null;
  let activeStream = null;

  function roundedRect(ctx, x, y, width, height, radius, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawPoster(match, progress = 1) {
    const { width, height } = canvas;
    const ctx = context;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#103c70");
    gradient.addColorStop(0.6, "#15559a");
    gradient.addColorStop(1, "#0c315d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    for (let row = -1; row < 12; row += 1) {
      for (let column = -1; column < 9; column += 1) {
        const x = column * 180 + ((progress * 65) % 180);
        const y = row * 180 + ((progress * 40) % 180);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.fillStyle = "#f6d66d";
    ctx.fillRect(70, 70, 110, 8);
    ctx.font = "700 34px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("RES.E EXCELLENCE CUP", 70, 130);
    ctx.font = "600 24px Arial, sans-serif";
    ctx.fillStyle = "#d4e5f6";
    ctx.fillText(match.sport === "football" ? "FOOTBALL INTER-CLASSES" : "BASKETBALL INTER-PROMOTIONS", 70, 177);

    roundedRect(ctx, 70, 238, 940, 720, 34, "#ffffff");
    ctx.textAlign = "center";
    ctx.font = "800 34px Arial, sans-serif";
    ctx.fillStyle = "#51804e";
    ctx.fillText("RÉSULTAT FINAL", width / 2, 322);
    ctx.font = "600 22px Arial, sans-serif";
    ctx.fillStyle = "#7890a0";
    const date = new Date(match.date);
    const dateText = Number.isNaN(date.getTime())
      ? "RES.E · ENI-ABT"
      : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
    ctx.fillText(dateText.toLocaleUpperCase("fr-FR"), width / 2, 365);

    const scoreProgress = Math.min(1, Math.max(0, (progress - 0.24) / 0.55));
    const scale = 0.85 + 0.15 * scoreProgress;
    ctx.save();
    ctx.translate(width / 2, 565);
    ctx.scale(scale, scale);
    ctx.font = "800 112px Arial, sans-serif";
    ctx.fillStyle = "#103c70";
    ctx.fillText(String(match.homeScore ?? 0), -112, 0);
    ctx.fillStyle = "#ff9418";
    ctx.font = "800 84px Arial, sans-serif";
    ctx.fillText(":", 0, -3);
    ctx.fillStyle = "#103c70";
    ctx.font = "800 112px Arial, sans-serif";
    ctx.fillText(String(match.awayScore ?? 0), 112, 0);
    ctx.restore();

    ctx.font = "700 29px Arial, sans-serif";
    ctx.fillStyle = "#24425b";
    ctx.fillText(match.home.slice(0, 28), 320, 640, 400);
    ctx.fillText(match.away.slice(0, 28), 760, 640, 400);

    if (match.star) {
      roundedRect(ctx, 150, 714, 780, 108, 18, "#edf5e9");
      ctx.font = "700 21px Arial, sans-serif";
      ctx.fillStyle = "#538247";
      ctx.fillText("JOUEUR / JOUEUSE À L'HONNEUR", width / 2, 757);
      ctx.font = "600 25px Arial, sans-serif";
      ctx.fillStyle = "#284a35";
      ctx.fillText(match.star.slice(0, 54), width / 2, 797);
    } else {
      ctx.font = "600 25px Arial, sans-serif";
      ctx.fillStyle = "#688092";
      ctx.fillText("Une rencontre, un esprit d'équipe.", width / 2, 770);
    }

    ctx.textAlign = "left";
    ctx.font = "700 25px Arial, sans-serif";
    ctx.fillStyle = "#ff9418";
    ctx.fillText("ENSEMBLE CULTIVONS L'EXCELLENCE", 70, 1080);
    ctx.font = "800 31px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("RES.E ★", 70, 1150);
    ctx.textAlign = "right";
    ctx.font = "600 22px Arial, sans-serif";
    ctx.fillStyle = "#d4e5f6";
    ctx.fillText("ENI-ABT", 1010, 1150);

    if (progress < 1) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.8 - progress);
      ctx.fillStyle = "#fff7d4";
      ctx.font = "800 42px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(progress < 0.3 ? "LE MATCH EST TERMINÉ…" : "VOICI LE SCORE !", width / 2, 1015);
      ctx.restore();
    }
  }

  function downloadFile(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  function downloadPoster(match) {
    drawPoster(match, 1);
    canvas.toBlob((blob) => {
      if (!blob) {
        document.querySelector("#poster-status").textContent = "L’image n’a pas pu être créée. Réessayez avec un autre navigateur.";
        return;
      }
      const url = URL.createObjectURL(blob);
      downloadFile(url, "rese-excellence-cup-resultat.png");
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, "image/png");
  }

  async function createResultPoster(match) {
    window.RESE_LAST_RESULT = match;
    window.cancelAnimationFrame(animationFrame);
    modal.hidden = false;
    document.querySelector("#poster-status").textContent = "Création de l’animation vidéo…";
    document.querySelector("#download-video").disabled = true;
    drawPoster(match, 0);

    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }

    const supportsVideo = typeof MediaRecorder !== "undefined" &&
      typeof canvas.captureStream === "function";
    if (!supportsVideo) {
      drawPoster(match, 1);
      document.querySelector("#poster-status").textContent =
        "L’animation vidéo n’est pas prise en charge dans ce navigateur ; l’affiche PNG reste exportable.";
      return;
    }

    let stream;
    try {
      stream = canvas.captureStream(30);
      activeStream = stream;
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      activeRecorder = recorder;
      const chunks = [];
      const completion = new Promise((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("error", () => reject(new Error("L’enregistrement vidéo a échoué.")), { once: true });
        recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" })), { once: true });
      });
      recorder.start();
      const start = performance.now();
      const duration = 5200;
      const renderFrame = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        drawPoster(match, progress);
        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(renderFrame);
        } else {
          window.setTimeout(() => recorder.state === "recording" && recorder.stop(), 350);
        }
      };
      animationFrame = window.requestAnimationFrame(renderFrame);
      const blob = await completion;
      stream.getTracks().forEach((track) => track.stop());
      activeRecorder = null;
      activeStream = null;
      if (modal.hidden) return;
      if (blob.size === 0) throw new Error("La vidéo créée est vide.");
      currentVideoUrl = URL.createObjectURL(blob);
      const downloadButton = document.querySelector("#download-video");
      downloadButton.disabled = false;
      downloadButton.dataset.url = currentVideoUrl;
      document.querySelector("#poster-status").textContent = "Affiche prête. La vidéo est animée et peut être téléchargée.";
    } catch (error) {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      activeRecorder = null;
      activeStream = null;
      console.error("Impossible de créer l’animation vidéo :", error);
      drawPoster(match, 1);
      document.querySelector("#poster-status").textContent = "La vidéo n’a pas pu être créée ; vous pouvez télécharger l’affiche PNG.";
    }
  }

  window.RESE_createResultPoster = createResultPoster;
  window.RESE_downloadPoster = downloadPoster;
  window.RESE_downloadFile = downloadFile;
  window.RESE_revokeResultVideo = () => {
    window.cancelAnimationFrame(animationFrame);
    if (activeRecorder?.state === "recording") activeRecorder.stop();
    if (activeStream) activeStream.getTracks().forEach((track) => track.stop());
    activeRecorder = null;
    activeStream = null;
    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = null;
  };
})();

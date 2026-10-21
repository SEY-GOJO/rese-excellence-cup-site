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

  function drawVideoPoster(match, progress = 1) {
    const { width, height } = canvas;
    const ctx = context;
    const clamp = (value) => Math.max(0, Math.min(1, value));
    const ease = (value) => 1 - (1 - clamp(value)) ** 3;
    const textAcross = (text, center, y, spacing) => {
      const letters = [...text];
      const widthOfText = letters.reduce((sum, letter) => sum + ctx.measureText(letter).width, 0) + spacing * (letters.length - 1);
      let x = center - widthOfText / 2;
      letters.forEach((letter) => {
        ctx.fillText(letter, x, y);
        x += ctx.measureText(letter).width + spacing;
      });
    };
    const drawCross = (x, y, alpha, scale) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 21;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(-28, -28);
      ctx.lineTo(28, 28);
      ctx.moveTo(28, -28);
      ctx.lineTo(-28, 28);
      ctx.stroke();
      ctx.restore();
    };

    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#15549a");
    background.addColorStop(0.48, "#103c70");
    background.addColorStop(1, "#0b2d56");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width / 2, height * 0.57, 20, width / 2, height * 0.57, width * 0.7);
    glow.addColorStop(0, "rgba(246,214,109,.22)");
    glow.addColorStop(1, "rgba(246,214,109,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let index = -4; index < 9; index += 1) {
      const offset = (progress * 260) % 260 - 260;
      ctx.beginPath();
      ctx.moveTo(index * 280 + offset, 0);
      ctx.lineTo(index * 280 + offset + 420, height);
      ctx.stroke();
    }
    ctx.restore();

    const sweepX = -500 + progress * (width + 1000);
    const sweep = ctx.createLinearGradient(sweepX - 240, 0, sweepX + 240, 0);
    sweep.addColorStop(0, "rgba(255,255,255,0)");
    sweep.addColorStop(0.5, "rgba(255,255,255,.14)");
    sweep.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.save();
    ctx.globalAlpha = ease(progress / 0.2);
    ctx.fillStyle = "#f6d66d";
    ctx.font = "700 27px Arial, sans-serif";
    textAcross("FINAL SCORE", width / 2, 136, 14);
    ctx.restore();

    const arrowPulse = 0.35 + 0.65 * (0.5 + Math.sin(progress * Math.PI * 8) / 2);
    ctx.save();
    ctx.globalAlpha = arrowPulse;
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 52px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("»»»", 115, 132);
    ctx.textAlign = "right";
    ctx.fillText("«««", width - 115, 132);
    ctx.restore();

    const sportName = match.sport === "football" ? "FOOTBALL" : "BASKETBALL";
    const titleProgress = ease((progress - 0.08) / 0.36);
    ctx.save();
    ctx.globalAlpha = titleProgress;
    ctx.translate(width / 2, 0);
    ctx.scale(0.92 + titleProgress * 0.08, 0.92 + titleProgress * 0.08);
    ctx.textAlign = "center";
    ctx.font = match.sport === "football" ? "900 226px Arial Black, Arial, sans-serif" : "900 188px Arial Black, Arial, sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,.94)";
    ctx.fillStyle = "rgba(255,255,255,.04)";
    ctx.strokeText(sportName, 0, 370, 1640);
    ctx.fillText(sportName, 0, 370, 1640);
    ctx.restore();

    const teamsProgress = ease((progress - 0.27) / 0.28);
    const barY = 463;
    const barWidth = 530;
    const barHeight = 112;
    const homeX = 550 - (1 - teamsProgress) * 360;
    const awayX = 1370 + (1 - teamsProgress) * 360;
    const homeGradient = ctx.createLinearGradient(homeX - barWidth / 2, 0, homeX + barWidth / 2, 0);
    homeGradient.addColorStop(0, "rgba(246,214,109,.06)");
    homeGradient.addColorStop(1, "rgba(246,214,109,.29)");
    const awayGradient = ctx.createLinearGradient(awayX - barWidth / 2, 0, awayX + barWidth / 2, 0);
    awayGradient.addColorStop(0, "rgba(246,214,109,.29)");
    awayGradient.addColorStop(1, "rgba(246,214,109,.06)");
    ctx.save();
    ctx.globalAlpha = teamsProgress;
    roundedRect(ctx, homeX - barWidth / 2, barY, barWidth, barHeight, 8, homeGradient);
    roundedRect(ctx, awayX - barWidth / 2, barY, barWidth, barHeight, 8, awayGradient);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 45px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(match.home || "ÉQUIPE A").toLocaleUpperCase("fr-FR"), homeX, barY + 70, barWidth - 44);
    ctx.fillText(String(match.away || "ÉQUIPE B").toLocaleUpperCase("fr-FR"), awayX, barY + 70, barWidth - 44);
    ctx.restore();

    const scoreProgress = ease((progress - 0.45) / 0.32);
    const scoreY = 620;
    const scoreWidth = 250;
    const scoreHeight = 145;
    const homeScoreX = 550 - (1 - scoreProgress) * 70;
    const awayScoreX = 1370 + (1 - scoreProgress) * 70;
    const drawScorePlate = (x, side) => {
      ctx.save();
      ctx.globalAlpha = scoreProgress;
      ctx.translate(x, scoreY + scoreHeight / 2);
      ctx.rotate((1 - scoreProgress) * (side === "home" ? -0.16 : 0.16));
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      if (side === "home") {
        ctx.moveTo(-scoreWidth / 2 + 35, -scoreHeight / 2);
        ctx.lineTo(scoreWidth / 2, -scoreHeight / 2);
        ctx.lineTo(scoreWidth / 2 - 35, scoreHeight / 2);
        ctx.lineTo(-scoreWidth / 2, scoreHeight / 2);
      } else {
        ctx.moveTo(-scoreWidth / 2, -scoreHeight / 2);
        ctx.lineTo(scoreWidth / 2 - 35, -scoreHeight / 2);
        ctx.lineTo(scoreWidth / 2, scoreHeight / 2);
        ctx.lineTo(-scoreWidth / 2 + 35, scoreHeight / 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawScorePlate(homeScoreX, "home");
    drawScorePlate(awayScoreX, "away");

    ctx.fillStyle = "#123e6d";
    ctx.font = "900 98px Arial Black, Arial, sans-serif";
    ctx.textAlign = "center";
    const homeScore = Math.round((Number(match.homeScore) || 0) * scoreProgress).toString().padStart(2, "0");
    const awayScore = Math.round((Number(match.awayScore) || 0) * scoreProgress).toString().padStart(2, "0");
    ctx.fillText(homeScore, homeScoreX, scoreY + 105);
    ctx.fillText(awayScore, awayScoreX, scoreY + 105);

    const vsScale = 0.6 + 0.4 * scoreProgress;
    ctx.save();
    ctx.translate(width / 2, 518);
    ctx.scale(vsScale, vsScale);
    ctx.fillStyle = "#103c70";
    ctx.strokeStyle = "#f6d66d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-72, -62);
    ctx.lineTo(72, -62);
    ctx.lineTo(57, 92);
    ctx.lineTo(-57, 92);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 48px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VS", 0, 17);
    ctx.restore();

    const crossPulse = 0.25 + 0.75 * (0.5 + Math.sin(progress * Math.PI * 10) / 2);
    drawCross(175, 690, crossPulse, 0.72 + 0.28 * crossPulse);
    drawCross(width - 175, 690, crossPulse, 0.72 + 0.28 * crossPulse);

    ctx.fillStyle = "rgba(246,214,109,.9)";
    ctx.fillRect(180, 875, width - 360, 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 27px Arial, sans-serif";
    textAcross("RES.E EXCELLENCE CUP", width / 2, 934, 6);
    ctx.fillStyle = "#d4e5f6";
    ctx.font = "500 19px Arial, sans-serif";
    textAcross("ENI-ABT  ·  LE SPORT NOUS UNIT", width / 2, 979, 4);
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
    drawVideoPoster(match, 1);
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
    drawVideoPoster(match, 0);

    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }

    const supportsVideo = typeof MediaRecorder !== "undefined" &&
      typeof canvas.captureStream === "function";
    if (!supportsVideo) {
      drawVideoPoster(match, 1);
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
      const duration = 6500;
      const renderFrame = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        drawVideoPoster(match, progress);
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
      drawVideoPoster(match, 1);
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

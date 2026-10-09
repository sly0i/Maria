(() => {
  const STORAGE_KEY = "site_age_verified";
  const videoId = location.pathname.split("/").filter(Boolean).pop();

  const els = {
    logo: document.getElementById("site-logo"),
    brandName: document.getElementById("site-brand-name"),
    title: document.getElementById("watch-title"),
    player: document.getElementById("watch-player"),
    locked: document.getElementById("watch-locked"),
    lockedText: document.getElementById("watch-locked-text"),
    unlockBtn: document.getElementById("watch-unlock-btn"),
  };

  if (!sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) === "no") {
    location.replace("/");
    return;
  }

  const auth = window.SiteAuth.createAuthController({
    autoOpenOnEntry: false,
    onApproved() {
      loadPlayer();
    },
    onStatusChange(member) {
      if (member?.status === "approved") {
        loadPlayer();
        return;
      }
      showLocked(member);
    },
  });

  function applyBrand(cfg) {
    const name = cfg.brandName || "EroticX";
    const logo = cfg.logoPath || "/assets/logo.svg";
    document.title = `${els.title?.textContent || "Vidéo"} — ${name}`;
    if (els.brandName) els.brandName.textContent = name;
    if (els.logo) {
      els.logo.src = `${logo}?t=${Date.now()}`;
      els.logo.alt = `Logo ${name}`;
    }
  }

  function showLocked(member) {
    if (!els.locked || !els.player) return;
    els.player.hidden = true;
    els.player.removeAttribute("src");
    els.player.load();
    els.locked.hidden = false;

    if (member?.status === "pending") {
      els.lockedText.textContent =
        "Ton compte attend la validation d’un admin. Tu pourras regarder les vidéos après acceptation.";
      els.unlockBtn.textContent = "Voir mon statut";
    } else if (member?.status === "awaiting_code") {
      els.lockedText.textContent = "Entre le code à 4 chiffres pour finaliser ton inscription.";
      els.unlockBtn.textContent = "Entrer mon code";
    } else {
      els.lockedText.textContent = "Connecte-toi ou crée un compte pour regarder cette vidéo.";
      els.unlockBtn.textContent = "Se connecter / Créer un compte";
    }
  }

  function trackStat(type) {
    try {
      const body = JSON.stringify({ type });
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/stats/event", blob);
        return;
      }
      fetch("/api/stats/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  let playerStarted = false;

  function loadPlayer() {
    if (!auth.isApproved() || !els.player) {
      showLocked(auth.getMember());
      return;
    }
    els.locked.hidden = true;
    els.player.hidden = false;
    els.player.src = `/api/videos/${encodeURIComponent(videoId)}/stream`;
    if (!playerStarted) {
      playerStarted = true;
      trackStat("watch_view");
    }
  }

  async function loadVideoMeta() {
    const res = await fetch(`/api/videos/${encodeURIComponent(videoId)}`);
    if (!res.ok) {
      if (els.title) els.title.textContent = "Vidéo introuvable";
      showLocked(null);
      els.unlockBtn.hidden = true;
      return null;
    }
    const data = await res.json();
    if (els.title) els.title.textContent = data.video?.title || "Vidéo";
    document.title = `${data.video?.title || "Vidéo"} — ${els.brandName?.textContent || "Maria"}`;
    return data.video;
  }

  els.unlockBtn?.addEventListener("click", () => {
    auth.requireAccess();
  });

  Promise.all([
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => cfg && applyBrand(cfg)),
    loadVideoMeta(),
    auth.refreshMember(),
  ]).then(() => {
    if (auth.isApproved()) {
      loadPlayer();
    } else {
      showLocked(auth.getMember());
      auth.requireAccess();
    }
  });
})();

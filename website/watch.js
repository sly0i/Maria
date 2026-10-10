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
    more: document.getElementById("watch-more"),
    moreList: document.getElementById("watch-more-list"),
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

  function timeLabel(video) {
    const secs = Number(video?.duration);
    if (Number.isFinite(secs) && secs > 0) {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return "00:04";
  }

  function renderMore(videos) {
    if (!els.more || !els.moreList) return;
    const others = (videos || []).filter((v) => v.id !== videoId).slice(0, 8);
    if (!others.length) {
      els.more.hidden = true;
      return;
    }
    els.more.hidden = false;
    els.moreList.innerHTML = "";
    const tones = ["a", "b", "c", "d", "e"];
    others.forEach((video, index) => {
      const link = document.createElement("a");
      link.className = `watch__more-card shot shot--${tones[index % tones.length]}`;
      link.href = video.watchUrl || `/watch/${video.id}`;
      link.innerHTML = `
        <div class="shot__frame">
          <span class="shot__art" aria-hidden="true"></span>
          <span class="shot__veil" aria-hidden="true"></span>
          <span class="shot__play" aria-hidden="true"></span>
          <span class="shot__hd">HD</span>
          <span class="shot__time"></span>
        </div>
        <div class="shot__info">
          <h3 class="shot__title"></h3>
        </div>
      `;
      if (video.thumbnail) {
        const img = document.createElement("img");
        img.className = "shot__thumb";
        img.src = video.thumbnail;
        img.alt = "";
        img.loading = "lazy";
        link.querySelector(".shot__art")?.after(img);
      }
      link.querySelector(".shot__title").textContent = video.title || "Sans titre";
      link.querySelector(".shot__time").textContent = timeLabel(video);
      link.addEventListener("click", (event) => {
        if (auth.isApproved()) return;
        event.preventDefault();
        auth.requireAccess();
      });
      els.moreList.appendChild(link);
    });
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
    document.title = `${data.video?.title || "Vidéo"} — ${els.brandName?.textContent || "EroticX"}`;
    return data.video;
  }

  async function loadMore() {
    try {
      const res = await fetch("/api/videos");
      if (!res.ok) return;
      const data = await res.json();
      renderMore(data.videos || []);
    } catch (_) {}
  }

  els.unlockBtn?.addEventListener("click", () => {
    auth.requireAccess();
  });

  Promise.all([
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => cfg && applyBrand(cfg)),
    loadVideoMeta(),
    loadMore(),
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

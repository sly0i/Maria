(() => {
  const STORAGE_KEY = "site_age_verified";

  const els = {
    gate: document.getElementById("age-gate"),
    site: document.getElementById("site"),
    prompt: document.getElementById("age-prompt"),
    denied: document.getElementById("age-denied"),
    btnConfirm: document.getElementById("btn-confirm"),
    btnDeny: document.getElementById("btn-deny"),
    ageBrandTrigger: document.getElementById("age-brand-trigger"),
    siteBrand: document.getElementById("site-brand"),
    ageLogo: document.getElementById("age-logo"),
    siteLogo: document.getElementById("site-logo"),
    ageBrandName: document.getElementById("age-brand-name"),
    siteBrandName: document.getElementById("site-brand-name"),
    heroBrand: document.getElementById("hero-brand"),
    heroTagline: document.getElementById("hero-tagline"),
    siteDescription: document.getElementById("site-description"),
    videoList: document.getElementById("video-list"),
    videoEmpty: document.getElementById("video-empty"),
    adsSection: document.getElementById("ads-section"),
    adsList: document.getElementById("ads-list"),
  };

  const auth = window.SiteAuth.createAuthController({
    autoOpenOnEntry: true,
  });

  function applyBrand(cfg) {
    const name = cfg.brandName || "Mon site";
    const logo = cfg.logoPath || "/assets/logo.svg";

    document.title = name;

    [els.ageBrandName, els.siteBrandName, els.heroBrand].forEach((node) => {
      if (node) node.textContent = name;
    });

    [els.ageLogo, els.siteLogo].forEach((img) => {
      if (!img) return;
      img.src = `${logo}?t=${Date.now()}`;
      img.alt = `Logo ${name}`;
    });

    if (els.heroTagline) {
      els.heroTagline.textContent = cfg.tagline || "";
    }

    if (els.siteDescription) {
      els.siteDescription.textContent =
        cfg.description || "Regarde les dernières publications";
    }
  }

  const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
  let allVideos = [];
  let activeFilter = "all";

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

  function isNewVideo(video) {
    const created = Number(video.createdAt) || 0;
    return created > 0 && Date.now() - created < NEW_WINDOW_MS;
  }

  function videosForFilter(filter) {
    if (filter === "new") return allVideos.filter(isNewVideo);
    return allVideos;
  }

  function renderVideos(videos) {
    if (!els.videoList) return;
    els.videoList.innerHTML = "";

    if (!videos.length) {
      if (els.videoEmpty) {
        els.videoEmpty.hidden = false;
        els.videoEmpty.textContent =
          activeFilter === "new"
            ? "Aucune nouvelle vidéo (24 h)."
            : "Aucune vidéo pour le moment.";
      }
      return;
    }

    if (els.videoEmpty) els.videoEmpty.hidden = true;

    for (const video of videos) {
      const article = document.createElement("article");
      article.className = "video-card";

      const link = document.createElement("a");
      link.className = "video-card__link";
      link.href = video.watchUrl || `/watch/${video.id}`;
      link.setAttribute("aria-label", `Regarder ${video.title}`);

      link.innerHTML = `
        <div class="video-card__thumb">
          <span class="video-card__play" aria-hidden="true"></span>
          <span class="video-card__hd">HD</span>
          <span class="video-card__time">10:24</span>
        </div>
        <h3 class="video-card__title"></h3>
      `;
      link.querySelector(".video-card__title").textContent = video.title;
      const mins = String((Number(video.createdAt) % 17) + 4).padStart(2, "0");
      const secs = String((Number(video.createdAt) % 50) + 10).padStart(2, "0");
      link.querySelector(".video-card__time").textContent = `${mins}:${secs}`;

      link.addEventListener("click", (event) => {
        trackStat("video_click");
        if (auth.isApproved()) return;
        event.preventDefault();
        auth.requireAccess();
      });

      article.appendChild(link);
      els.videoList.appendChild(article);
    }
  }

  function setFilter(filter) {
    activeFilter = filter === "new" ? "new" : "all";
    document.querySelectorAll(".cat-bar__item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.filter === activeFilter);
    });
    const title = document.getElementById("gallery-title");
    if (title) title.textContent = activeFilter === "new" ? "Nouveau" : "Vidéos";
    renderVideos(videosForFilter(activeFilter));
  }

  function renderAds(ads) {
    if (!els.adsSection || !els.adsList) return;
    els.adsList.innerHTML = "";

    if (!ads.length) {
      els.adsSection.hidden = true;
      return;
    }

    els.adsSection.hidden = false;

    for (const ad of ads) {
      const link = document.createElement("a");
      link.className = "ad-card";
      link.href = ad.redirectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", ad.title ? `Publicité : ${ad.title}` : "Ouvrir la publicité");

      if (ad.mediaType === "video") {
        link.innerHTML = `<video class="ad-card__media" muted loop playsinline autoplay preload="metadata" src="${ad.url}"></video>`;
      } else {
        link.innerHTML = `<img class="ad-card__media" src="${ad.url}" alt="" />`;
      }

      link.addEventListener("click", () => trackStat("ad_click"));
      els.adsList.appendChild(link);
    }
  }

  async function loadPublicData() {
    const [configRes, videosRes, adsRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/videos"),
      fetch("/api/ads"),
    ]);

    if (configRes.ok) {
      applyBrand(await configRes.json());
    }

    if (videosRes.ok) {
      const data = await videosRes.json();
      allVideos = data.videos || [];
      setFilter(activeFilter);
    }

    if (adsRes.ok) {
      const data = await adsRes.json();
      renderAds(data.ads || []);
    } else {
      renderAds([]);
    }
  }

  function showGate(mode = "prompt") {
    els.site.hidden = true;
    els.gate.hidden = false;
    els.prompt.hidden = mode !== "prompt";
    els.denied.hidden = mode !== "denied";
  }

  function enterSite() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "yes");
    } catch (_) {}
    els.gate.hidden = true;
    els.site.hidden = false;
    trackStat("age_confirm");
    trackStat("page_view");
    auth.maybeAutoOpen();
  }

  function denyAccess() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "no");
    } catch (_) {}
    showGate("denied");
  }

  function reopenAgeMessage() {
    showGate("prompt");
  }

  function isVerified() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "yes";
    } catch (_) {
      return false;
    }
  }

  function wasDenied() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "no";
    } catch (_) {
      return false;
    }
  }

  els.btnConfirm?.addEventListener("click", enterSite);
  els.btnDeny?.addEventListener("click", denyAccess);
  els.ageBrandTrigger?.addEventListener("click", () => {
    if (els.denied && !els.denied.hidden) showGate("prompt");
  });
  els.siteBrand?.addEventListener("click", reopenAgeMessage);

  document.querySelectorAll(".cat-bar__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFilter(btn.dataset.filter || "all");
    });
  });

  // Hide gate content until brand is applied, so old placeholder name/logo never stick
  if (els.gate) els.gate.style.visibility = "hidden";

  Promise.all([
    loadPublicData().catch(() => {
      applyBrand({
        brandName: document.getElementById("age-brand-name")?.textContent || "Mon site",
        logoPath: document.getElementById("age-logo")?.getAttribute("src") || "/assets/logo.svg",
        tagline: document.getElementById("hero-tagline")?.textContent || "",
        description: document.getElementById("site-description")?.textContent || "",
      });
    }),
    auth.refreshMember(),
  ]).then(() => {
    if (els.gate) els.gate.style.visibility = "";
    if (isVerified()) {
      els.gate.hidden = true;
      els.site.hidden = false;
      trackStat("page_view");
      auth.maybeAutoOpen();
    } else if (wasDenied()) {
      showGate("denied");
    } else {
      showGate("prompt");
    }
  });
})();

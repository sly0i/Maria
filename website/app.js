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
    heroBrandKicker: document.getElementById("hero-brand-kicker"),
    heroTagline: document.getElementById("hero-tagline"),
    siteDescription: document.getElementById("site-description"),
    videoList: document.getElementById("video-list"),
    videoEmpty: document.getElementById("video-empty"),
    adsSection: document.getElementById("ads-section"),
    adsList: document.getElementById("ads-list"),
    adsDots: document.getElementById("ads-dots"),
    videoSearch: document.getElementById("video-search"),
    introAuth: document.getElementById("intro-auth"),
    dockAuth: document.getElementById("dock-auth"),
  };

  let adsTimer = null;
  let adsIndex = 0;

  const auth = window.SiteAuth.createAuthController({
    autoOpenOnEntry: true,
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function brandHtml(name) {
    const raw = String(name || "EroticX").slice(0, 60);
    if (/x$/i.test(raw) && raw.length > 1) {
      return `${escapeHtml(raw.slice(0, -1))}<span class="brand__x">X</span>`;
    }
    return escapeHtml(raw);
  }

  function safeLogoPath(value) {
    const s = String(value || "");
    if (
      (s.startsWith("/uploads/logo/") || s.startsWith("/assets/")) &&
      !s.includes("..") &&
      !s.includes("\\")
    ) {
      return s;
    }
    return "/assets/logo.svg";
  }

  function applyBrand(cfg) {
    const name = String(cfg.brandName || "EroticX").slice(0, 60);
    const logo = safeLogoPath(cfg.logoPath);

    document.title = name;

    [els.ageBrandName, els.siteBrandName].forEach((node) => {
      if (!node) return;
      node.innerHTML = brandHtml(name);
    });

    if (els.heroBrand) els.heroBrand.textContent = name;
    if (els.heroBrandKicker) els.heroBrandKicker.textContent = name.toUpperCase();

    [els.ageLogo, els.siteLogo].forEach((img) => {
      if (!img) return;
      img.src = `${logo}?t=${Date.now()}`;
      img.alt = `Logo ${name}`;
    });

    if (els.heroTagline) {
      // Short punchy headline (tagline config is often the age notice — keep it out of the hero H1)
      els.heroTagline.textContent = "Regarde sans limite.";
    }

    if (els.siteDescription) {
      els.siteDescription.textContent =
        cfg.description || cfg.tagline || "Regarde les dernières publications";
    }
  }

  const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
  let allVideos = [];
  let activeFilter = "all";
  let searchQuery = "";

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

  function videosForView() {
    let list = activeFilter === "new" ? allVideos.filter(isNewVideo) : allVideos;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((v) => String(v.title || "").toLowerCase().includes(q));
    }
    return list;
  }

  function timeLabel(seed) {
    const n = Number(seed) || 0;
    return `${String((n % 17) + 5).padStart(2, "0")}:${String((n % 50) + 10).padStart(2, "0")}`;
  }

  function viewsLabel(seed) {
    const n = Number(seed) || 0;
    const v = 1400 + (n % 9200);
    return `${(v / 1000).toFixed(1)}k`;
  }

  function renderVideos(videos) {
    if (!els.videoList) return;
    els.videoList.innerHTML = "";

    if (!videos.length) {
      if (els.videoEmpty) {
        els.videoEmpty.hidden = false;
        if (searchQuery.trim()) {
          els.videoEmpty.textContent = "Aucune vidéo ne correspond à ta recherche.";
        } else if (activeFilter === "new") {
          els.videoEmpty.textContent = "Aucune nouvelle vidéo (24 h).";
        } else {
          els.videoEmpty.textContent = "Aucune vidéo pour le moment.";
        }
      }
      return;
    }

    if (els.videoEmpty) els.videoEmpty.hidden = true;

    const tones = ["a", "b", "c"];

    videos.forEach((video, index) => {
      const tone = tones[index % 3];
      const fresh = isNewVideo(video);
      const link = document.createElement("a");
      link.className = `shot shot--${tone}`;
      link.href = video.watchUrl || `/watch/${video.id}`;
      link.setAttribute("aria-label", `Regarder ${video.title || "vidéo"}`);

      link.innerHTML = `
        <div class="shot__frame">
          <span class="shot__art" aria-hidden="true"></span>
          <span class="shot__veil" aria-hidden="true"></span>
          <span class="shot__play" aria-hidden="true"></span>
          <span class="shot__badge"></span>
          <span class="shot__hd">HD</span>
          <div class="shot__foot">
            <h4 class="shot__title"></h4>
            <p class="shot__meta">
              <span class="shot__views"></span>
              <span class="shot__time"></span>
            </p>
          </div>
        </div>
      `;

      link.querySelector(".shot__badge").textContent = fresh ? "Nouveau" : "Tendance";
      link.querySelector(".shot__title").textContent = video.title || "Sans titre";
      link.querySelector(".shot__views").textContent = `${viewsLabel(video.createdAt || index)} vues`;
      link.querySelector(".shot__time").textContent = timeLabel(video.createdAt || index);

      link.addEventListener("click", (event) => {
        trackStat("video_click");
        if (auth.isApproved()) return;
        event.preventDefault();
        auth.requireAccess();
      });

      els.videoList.appendChild(link);
    });
  }

  function refreshList() {
    const title = document.getElementById("gallery-title");
    if (title) {
      title.textContent = activeFilter === "new" ? "Nouveau" : "Tendances";
    }
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("is-on", btn.dataset.filter === activeFilter);
    });
    renderVideos(videosForView());
  }

  function setFilter(filter) {
    activeFilter = filter === "new" ? "new" : "all";
    refreshList();
  }

  function stopAdsCarousel() {
    if (adsTimer) {
      clearInterval(adsTimer);
      adsTimer = null;
    }
  }

  function showAdSlide(index) {
    const slides = els.adsList?.querySelectorAll(".hero__slide");
    if (!slides?.length) return;
    adsIndex = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-on", i === adsIndex);
      const video = slide.querySelector("video");
      if (video) {
        if (i === adsIndex) video.play?.().catch(() => {});
        else video.pause?.();
      }
    });
    els.adsDots?.querySelectorAll("button").forEach((dot, i) => {
      dot.classList.toggle("is-on", i === adsIndex);
    });
  }

  function startAdsCarousel(count) {
    stopAdsCarousel();
    if (count <= 1) return;
    adsTimer = setInterval(() => showAdSlide(adsIndex + 1), 5000);
  }

  function renderAds(ads) {
    if (!els.adsSection || !els.adsList) return;
    stopAdsCarousel();
    els.adsList.innerHTML = "";
    if (els.adsDots) {
      els.adsDots.innerHTML = "";
      els.adsDots.hidden = true;
    }

    if (!ads.length) {
      els.adsSection.hidden = true;
      return;
    }

    els.adsSection.hidden = false;
    adsIndex = 0;

    ads.forEach((ad, index) => {
      const link = document.createElement("a");
      link.className = "hero__slide" + (index === 0 ? " is-on" : "");
      link.href = ad.redirectUrl || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", ad.title ? `Publicité : ${ad.title}` : "Ouvrir la publicité");

      if (ad.mediaType === "video") {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = "metadata";
        video.setAttribute("playsinline", "");
        video.src = ad.url;
        link.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = ad.url;
        img.alt = "";
        link.appendChild(img);
      }

      const shade = document.createElement("span");
      shade.className = "hero__shade";
      shade.setAttribute("aria-hidden", "true");
      link.appendChild(shade);

      const meta = document.createElement("span");
      meta.className = "hero__meta";
      meta.innerHTML = `
        <span class="hero__badge">Pub</span>
        <p class="hero__title"></p>
        <p class="hero__cta">Découvrir ➔</p>
      `;
      meta.querySelector(".hero__title").textContent = ad.title || "Sponsor";
      link.appendChild(meta);

      link.addEventListener("click", () => trackStat("ad_click"));
      els.adsList.appendChild(link);
    });

    if (ads.length > 1 && els.adsDots) {
      els.adsDots.hidden = false;
      ads.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        if (index === 0) dot.className = "is-on";
        dot.setAttribute("aria-label", `Publicité ${index + 1}`);
        dot.addEventListener("click", () => {
          showAdSlide(index);
          startAdsCarousel(ads.length);
        });
        els.adsDots.appendChild(dot);
      });
    }

    showAdSlide(0);
    startAdsCarousel(ads.length);
  }

  async function loadPublicData() {
    const [configRes, videosRes, adsRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/videos"),
      fetch("/api/ads"),
    ]);

    if (configRes.ok) applyBrand(await configRes.json());

    if (videosRes.ok) {
      const data = await videosRes.json();
      allVideos = data.videos || [];
      refreshList();
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

  function openAuth() {
    auth.requireAccess();
  }

  els.btnConfirm?.addEventListener("click", enterSite);
  els.btnDeny?.addEventListener("click", denyAccess);
  els.ageBrandTrigger?.addEventListener("click", () => {
    if (els.denied && !els.denied.hidden) showGate("prompt");
  });
  els.siteBrand?.addEventListener("click", reopenAgeMessage);
  els.introAuth?.addEventListener("click", openAuth);
  els.dockAuth?.addEventListener("click", openAuth);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter || "all"));
  });

  els.videoSearch?.addEventListener("input", () => {
    searchQuery = els.videoSearch.value || "";
    refreshList();
  });

  if (els.gate) els.gate.style.visibility = "hidden";

  Promise.all([
    loadPublicData().catch(() => {
      applyBrand({
        brandName: "EroticX",
        logoPath: "/assets/logo.svg",
        tagline: "Regarde sans limite.",
        description: "Regarde les dernières publications",
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

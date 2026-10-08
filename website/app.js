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
    adsDots: document.getElementById("ads-dots"),
  };

  let adsTimer = null;
  let adsIndex = 0;

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

  function stopAdsCarousel() {
    if (adsTimer) {
      clearInterval(adsTimer);
      adsTimer = null;
    }
  }

  function showAdSlide(index) {
    const slides = els.adsList?.querySelectorAll(".ad-card");
    if (!slides?.length) return;
    adsIndex = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === adsIndex);
      const video = slide.querySelector("video");
      if (video) {
        if (i === adsIndex) {
          video.play?.().catch(() => {});
        } else {
          video.pause?.();
        }
      }
    });
    els.adsDots?.querySelectorAll(".ads-dots__dot").forEach((dot, i) => {
      dot.classList.toggle("is-active", i === adsIndex);
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
      link.className = "ad-card" + (index === 0 ? " is-active" : "");
      link.href = ad.redirectUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", ad.title ? `Publicité : ${ad.title}` : "Ouvrir la publicité");

      const title = ad.title ? String(ad.title) : "";
      if (ad.mediaType === "video") {
        const video = document.createElement("video");
        video.className = "ad-card__media";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = "metadata";
        video.src = ad.url;
        link.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.className = "ad-card__media";
        img.src = ad.url;
        img.alt = "";
        link.appendChild(img);
      }

      const shade = document.createElement("span");
      shade.className = "ad-card__shade";
      shade.setAttribute("aria-hidden", "true");
      link.appendChild(shade);

      const badge = document.createElement("span");
      badge.className = "ad-card__badge";
      badge.textContent = "Pub";
      link.appendChild(badge);

      const meta = document.createElement("span");
      meta.className = "ad-card__meta";
      if (title) {
        const titleEl = document.createElement("span");
        titleEl.className = "ad-card__title";
        titleEl.textContent = title;
        meta.appendChild(titleEl);
      }
      const cta = document.createElement("span");
      cta.className = "ad-card__cta";
      cta.textContent = "Voir l’offre ➔";
      meta.appendChild(cta);
      link.appendChild(meta);

      link.addEventListener("click", () => trackStat("ad_click"));
      els.adsList.appendChild(link);
    });

    if (ads.length > 1 && els.adsDots) {
      els.adsDots.hidden = false;
      ads.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "ads-dots__dot" + (index === 0 ? " is-active" : "");
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

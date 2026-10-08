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
    galleryDescription: document.getElementById("gallery-description"),
    videoList: document.getElementById("video-list"),
    videoEmpty: document.getElementById("video-empty"),
    heroAds: document.getElementById("hero-ads"),
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

    if (els.galleryDescription) {
      els.galleryDescription.textContent =
        cfg.description || "Regarde les dernières publications";
    }
  }

  function renderVideos(videos) {
    if (!els.videoList) return;
    els.videoList.innerHTML = "";

    if (!videos.length) {
      if (els.videoEmpty) els.videoEmpty.hidden = false;
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
        </div>
        <h3 class="video-card__title"></h3>
      `;
      link.querySelector(".video-card__title").textContent = video.title;

      link.addEventListener("click", (event) => {
        if (auth.isApproved()) return;
        event.preventDefault();
        auth.requireAccess();
      });

      article.appendChild(link);
      els.videoList.appendChild(article);
    }
  }

  function stopAdsCarousel() {
    if (adsTimer) {
      clearInterval(adsTimer);
      adsTimer = null;
    }
  }

  function showAdSlide(slides, index) {
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      const video = slide.querySelector("video");
      if (video) {
        if (active) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    });
  }

  function renderAds(ads) {
    if (!els.heroAds) return;
    stopAdsCarousel();
    adsIndex = 0;

    const fallback = els.heroAds.querySelector(".hero__visual");
    els.heroAds.innerHTML = "";
    if (fallback) els.heroAds.appendChild(fallback);

    if (!ads.length) {
      els.heroAds.classList.remove("has-ads");
      if (fallback) fallback.hidden = false;
      return;
    }

    els.heroAds.classList.add("has-ads");
    if (fallback) fallback.hidden = true;

    const track = document.createElement("div");
    track.className = "hero-ads__track";

    for (const ad of ads) {
      const slide = document.createElement("a");
      slide.className = "hero-ads__slide";
      slide.href = ad.redirectUrl;
      slide.target = "_blank";
      slide.rel = "noopener noreferrer";
      slide.setAttribute("aria-label", ad.title ? `Publicité : ${ad.title}` : "Ouvrir la publicité");

      if (ad.mediaType === "video") {
        slide.innerHTML = `<video muted loop playsinline autoplay preload="metadata" src="${ad.url}"></video>`;
      } else {
        slide.innerHTML = `<img src="${ad.url}" alt="" />`;
      }

      slide.addEventListener("click", (event) => {
        // Keep native link behavior; stop video click quirks on iOS
        event.stopPropagation();
      });

      track.appendChild(slide);
    }

    els.heroAds.appendChild(track);

    const slides = [...track.querySelectorAll(".hero-ads__slide")];
    showAdSlide(slides, 0);

    if (slides.length > 1) {
      const dots = document.createElement("div");
      dots.className = "hero-ads__dots";
      slides.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "hero-ads__dot";
        dot.setAttribute("aria-label", `Publicité ${i + 1}`);
        dot.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          adsIndex = i;
          showAdSlide(slides, adsIndex);
          dots.querySelectorAll(".hero-ads__dot").forEach((d, di) => {
            d.classList.toggle("is-active", di === adsIndex);
          });
        });
        dots.appendChild(dot);
      });
      dots.children[0]?.classList.add("is-active");
      els.heroAds.appendChild(dots);

      adsTimer = setInterval(() => {
        adsIndex = (adsIndex + 1) % slides.length;
        showAdSlide(slides, adsIndex);
        dots.querySelectorAll(".hero-ads__dot").forEach((d, di) => {
          d.classList.toggle("is-active", di === adsIndex);
        });
      }, 5500);
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
      renderVideos(data.videos || []);
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

  // Hide gate content until brand is applied, so old placeholder name/logo never stick
  if (els.gate) els.gate.style.visibility = "hidden";

  Promise.all([
    loadPublicData().catch(() => {
      applyBrand({
        brandName: document.getElementById("age-brand-name")?.textContent || "Mon site",
        logoPath: document.getElementById("age-logo")?.getAttribute("src") || "/assets/logo.svg",
        tagline: document.getElementById("hero-tagline")?.textContent || "",
        description: document.getElementById("gallery-description")?.textContent || "",
      });
    }),
    auth.refreshMember(),
  ]).then(() => {
    if (els.gate) els.gate.style.visibility = "";
    if (isVerified()) {
      els.gate.hidden = true;
      els.site.hidden = false;
      auth.maybeAutoOpen();
    } else if (wasDenied()) {
      showGate("denied");
    } else {
      showGate("prompt");
    }
  });
})();

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
  };

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

  function bindVideoError(videoEl) {
    const media = videoEl.closest(".video-card__media");
    if (!media) return;
    videoEl.addEventListener("error", () => {
      media.classList.add("is-broken");
      if (!media.querySelector(".video-card__error")) {
        const msg = document.createElement("p");
        msg.className = "video-card__error";
        msg.textContent =
          "Vidéo illisible. Ré-uploade-la depuis l’admin (conversion MP4 automatique).";
        media.appendChild(msg);
      }
    });
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
      article.innerHTML = `
        <div class="video-card__media">
          <video controls playsinline preload="metadata">
            <source src="${video.url}" type="video/mp4" />
          </video>
        </div>
        <h3 class="video-card__title"></h3>
      `;
      article.querySelector(".video-card__title").textContent = video.title;
      const videoEl = article.querySelector("video");
      bindVideoError(videoEl);
      els.videoList.appendChild(article);
    }
  }

  async function loadPublicData() {
    const [configRes, videosRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/videos"),
    ]);

    if (configRes.ok) {
      applyBrand(await configRes.json());
    }

    if (videosRes.ok) {
      const data = await videosRes.json();
      renderVideos(data.videos || []);
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

  loadPublicData().catch(() => {
    applyBrand({ brandName: "Maria", logoPath: "/assets/logo.svg", tagline: "" });
  });

  if (isVerified()) {
    els.gate.hidden = true;
    els.site.hidden = false;
  } else if (wasDenied()) {
    showGate("denied");
  } else {
    showGate("prompt");
  }
})();

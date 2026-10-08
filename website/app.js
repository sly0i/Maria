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

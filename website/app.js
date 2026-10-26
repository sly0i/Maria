(() => {
  const STORAGE_KEY = "site_age_verified";
  const SNAP_MS = 8000;

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
    storiesRail: document.getElementById("stories-rail"),
    videoEmpty: document.getElementById("video-empty"),
    openFirst: document.getElementById("open-first"),
    viewer: document.getElementById("viewer"),
    viewerProgress: document.getElementById("viewer-progress"),
    viewerMedia: document.getElementById("viewer-media"),
    viewerTitle: document.getElementById("viewer-title"),
    viewerClose: document.getElementById("viewer-close"),
    viewerPrev: document.getElementById("viewer-prev"),
    viewerNext: document.getElementById("viewer-next"),
  };

  let snaps = [];
  let index = 0;
  let timer = null;
  let activeVideo = null;

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

    if (els.heroTagline) els.heroTagline.textContent = cfg.tagline || "";
    if (els.galleryDescription) {
      els.galleryDescription.textContent =
        cfg.description || "Regarde les dernières publications";
    }
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (activeVideo) {
      activeVideo.pause();
      activeVideo = null;
    }
  }

  function closeViewer() {
    clearTimer();
    if (els.viewer) els.viewer.hidden = true;
    if (els.viewerMedia) els.viewerMedia.innerHTML = "";
  }

  function buildProgress() {
    if (!els.viewerProgress) return;
    els.viewerProgress.innerHTML = "";
    snaps.forEach((_, i) => {
      const seg = document.createElement("div");
      seg.className = "viewer__seg";
      if (i < index) seg.classList.add("is-done");
      if (i === index) seg.classList.add("is-active");
      seg.innerHTML = '<div class="viewer__seg-fill"></div>';
      els.viewerProgress.appendChild(seg);
    });
  }

  function scheduleAdvance(ms) {
    clearTimeout(timer);
    const fill = els.viewerProgress?.querySelector(".viewer__seg.is-active .viewer__seg-fill");
    if (fill) {
      fill.style.animationDuration = `${ms}ms`;
    }
    timer = setTimeout(() => showSnap(index + 1), ms);
  }

  function showSnap(i) {
    if (!snaps.length) return;
    if (i < 0) {
      index = 0;
      return;
    }
    if (i >= snaps.length) {
      closeViewer();
      return;
    }

    clearTimer();
    index = i;
    const snap = snaps[index];
    els.viewer.hidden = false;
    els.viewerTitle.textContent = snap.title || "";
    buildProgress();
    els.viewerMedia.innerHTML = "";

    const video = document.createElement("video");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.src = snap.url;
    video.setAttribute("type", "video/mp4");
    els.viewerMedia.appendChild(video);
    activeVideo = video;

    const startProgress = (ms) => scheduleAdvance(ms);

    video.addEventListener(
      "loadedmetadata",
      () => {
        const ms = Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(Math.max(video.duration * 1000, 2500), 30000)
          : SNAP_MS;
        startProgress(ms);
      },
      { once: true }
    );

    video.addEventListener(
      "error",
      () => {
        els.viewerMedia.innerHTML =
          '<p style="padding:2rem;text-align:center;color:#bbb">Snap illisible — ré-uploade depuis l’admin.</p>';
        startProgress(2500);
      },
      { once: true }
    );

    video.play().catch(() => {
      startProgress(SNAP_MS);
    });
  }

  function renderStories(videos) {
    snaps = videos || [];
    if (!els.storiesRail) return;
    els.storiesRail.innerHTML = "";

    if (!snaps.length) {
      if (els.videoEmpty) els.videoEmpty.hidden = false;
      if (els.openFirst) els.openFirst.hidden = true;
      return;
    }

    if (els.videoEmpty) els.videoEmpty.hidden = true;
    if (els.openFirst) els.openFirst.hidden = false;

    snaps.forEach((snap, i) => {
      const label = snap.title || `Snap ${i + 1}`;
      const initial = label.trim().charAt(0).toUpperCase() || "•";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "story-chip";
      btn.innerHTML = `
        <span class="story-chip__ring">
          <span class="story-chip__ring-inner">
            <span class="story-chip__avatar"></span>
          </span>
        </span>
        <span class="story-chip__label"></span>
      `;
      btn.querySelector(".story-chip__avatar").textContent = initial;
      btn.querySelector(".story-chip__label").textContent = label;
      btn.addEventListener("click", () => showSnap(i));
      els.storiesRail.appendChild(btn);
    });
  }

  async function loadPublicData() {
    const [configRes, videosRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/videos"),
    ]);

    if (configRes.ok) applyBrand(await configRes.json());
    if (videosRes.ok) {
      const data = await videosRes.json();
      renderStories(data.videos || []);
    }
  }

  function showGate(mode = "prompt") {
    els.site.hidden = true;
    closeViewer();
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
  els.siteBrand?.addEventListener("click", () => showGate("prompt"));
  els.openFirst?.addEventListener("click", () => showSnap(0));
  els.viewerClose?.addEventListener("click", closeViewer);
  els.viewerPrev?.addEventListener("click", () => showSnap(index - 1));
  els.viewerNext?.addEventListener("click", () => showSnap(index + 1));

  document.addEventListener("keydown", (event) => {
    if (els.viewer?.hidden) return;
    if (event.key === "Escape") closeViewer();
    if (event.key === "ArrowRight") showSnap(index + 1);
    if (event.key === "ArrowLeft") showSnap(index - 1);
  });

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

(() => {
  const NEW_MS = 24 * 60 * 60 * 1000;

  const els = {
    gate: document.getElementById("gate"),
    app: document.getElementById("app"),
    gateEnter: document.getElementById("gate-enter"),
    gateLeave: document.getElementById("gate-leave"),
    gateLogo: document.getElementById("gate-logo"),
    gateBrand: document.getElementById("gate-brand"),
    navLogo: document.getElementById("nav-logo"),
    navName: document.getElementById("nav-name"),
    siteDesc: document.getElementById("site-desc"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
  };

  let allVideos = [];
  let filter = "all";

  function applyBrand(cfg) {
    const name = cfg.brandName || "EroticX";
    const logo = `${cfg.logoPath || "/assets/logo.svg"}?t=${Date.now()}`;
    const desc = cfg.description || "Regarde les dernières publications";
    document.title = `Démo — ${name}`;
    if (els.gateBrand) els.gateBrand.textContent = name;
    if (els.navName) els.navName.textContent = name;
    if (els.siteDesc) els.siteDesc.textContent = desc;
    [els.gateLogo, els.navLogo].forEach((img) => {
      if (!img) return;
      img.src = logo;
      img.alt = name;
    });
  }

  function isNew(video) {
    const t = Number(video.createdAt) || 0;
    return t > 0 && Date.now() - t < NEW_MS;
  }

  function filtered() {
    if (filter === "new") return allVideos.filter(isNew);
    return allVideos;
  }

  function durationLabel(seed) {
    const n = Number(seed) || 0;
    const mins = String((n % 17) + 4).padStart(2, "0");
    const secs = String((n % 50) + 10).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function makeCard(title, seed, meta) {
    const a = document.createElement("a");
    a.className = "card";
    a.href = "#";
    a.setAttribute("aria-label", title);
    a.innerHTML = `
      <div class="card__thumb">
        <span class="card__play" aria-hidden="true"></span>
        <span class="card__hd">HD</span>
        <span class="card__time"></span>
      </div>
      <h3 class="card__title"></h3>
      <p class="card__meta"></p>
    `;
    a.querySelector(".card__time").textContent = durationLabel(seed);
    a.querySelector(".card__title").textContent = title;
    a.querySelector(".card__meta").textContent = meta;
    a.addEventListener("click", (e) => e.preventDefault());
    return a;
  }

  function render() {
    if (!els.grid) return;
    els.grid.innerHTML = "";
    const videos = filtered();

    if (!videos.length && filter === "new") {
      if (els.empty) {
        els.empty.hidden = false;
        els.empty.textContent = "Aucune nouvelle vidéo (24 h).";
      }
      return;
    }

    if (els.empty) els.empty.hidden = true;

    videos.forEach((video) => {
      els.grid.appendChild(
        makeCard(video.title || "Vidéo", video.createdAt, filter === "new" ? "Nouveau" : "HD · 1080p")
      );
    });

    // Fill so the demo looks dense on every device
    if (filter === "all" && videos.length < 10) {
      const names = [
        "Night session",
        "Private cut",
        "After dark",
        "Raw take",
        "Close up",
        "Hotel room",
        "Weekend",
        "Soft light",
        "First time",
        "Late call",
      ];
      for (let i = videos.length; i < 10; i += 1) {
        els.grid.appendChild(makeCard(names[i % names.length], i * 911, "Aperçu démo"));
      }
    }
  }

  async function boot() {
    try {
      const [cfgRes, vidRes] = await Promise.all([fetch("/api/config"), fetch("/api/videos")]);
      if (cfgRes.ok) applyBrand(await cfgRes.json());
      if (vidRes.ok) {
        const data = await vidRes.json();
        allVideos = data.videos || [];
      }
    } catch {
      applyBrand({});
      allVideos = [];
    }
    render();
  }

  function enter() {
    if (els.gate) els.gate.hidden = true;
    if (els.app) els.app.hidden = false;
    // iOS: force a reflow so sticky/nav paints correctly after unlock
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
  }

  els.gateEnter?.addEventListener("click", enter);
  els.gateLeave?.addEventListener("click", () => {
    window.location.href = "https://www.google.com";
  });

  document.querySelectorAll(".cats__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cats__item").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      filter = btn.dataset.filter === "new" ? "new" : "all";
      render();
    });
  });

  document.querySelectorAll(".tabs__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs__btn").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
    });
  });

  boot();
})();

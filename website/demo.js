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
    heroBrand: document.getElementById("hero-brand"),
    heroLine: document.getElementById("hero-line"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
  };

  let allVideos = [];
  let filter = "all";

  function applyBrand(cfg) {
    const name = cfg.brandName || "EroticX";
    const logo = `${cfg.logoPath || "/assets/logo.svg"}?t=${Date.now()}`;
    const desc = cfg.description || "Une expérience adulte plus douce, plus moderne.";
    document.title = `Démo DA — ${name}`;
    [els.gateBrand, els.navName, els.heroBrand].forEach((n) => {
      if (n) n.textContent = name;
    });
    if (els.heroLine) els.heroLine.textContent = desc;
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

  function list() {
    if (filter === "new") return allVideos.filter(isNew);
    return allVideos;
  }

  function timeLabel(seed) {
    const n = Number(seed) || 0;
    return `${String((n % 17) + 4).padStart(2, "0")}:${String((n % 50) + 10).padStart(2, "0")}`;
  }

  function card(title, seed, meta, tag) {
    const a = document.createElement("a");
    a.className = "tile";
    a.href = "#feed";
    a.innerHTML = `
      <div class="tile__media">
        <span class="tile__tag"></span>
        <span class="tile__time"></span>
      </div>
      <div class="tile__body">
        <h3 class="tile__title"></h3>
        <p class="tile__meta"></p>
      </div>
    `;
    a.querySelector(".tile__tag").textContent = tag;
    a.querySelector(".tile__time").textContent = timeLabel(seed);
    a.querySelector(".tile__title").textContent = title;
    a.querySelector(".tile__meta").textContent = meta;
    a.addEventListener("click", (e) => e.preventDefault());
    return a;
  }

  function render() {
    if (!els.grid) return;
    els.grid.innerHTML = "";
    const videos = list();

    if (!videos.length && filter === "new") {
      if (els.empty) {
        els.empty.hidden = false;
        els.empty.textContent = "Pas de nouveauté sur 24 h.";
      }
      return;
    }
    if (els.empty) els.empty.hidden = true;

    videos.forEach((v) => {
      els.grid.appendChild(
        card(v.title || "Sans titre", v.createdAt, "Contenu membre", isNew(v) ? "New" : "4K")
      );
    });

    if (filter !== "new" && videos.length < 7) {
      const names = [
        "Lueur d’après-minuit",
        "Chambre 12",
        "Silence chaud",
        "Velours",
        "Basse lumière",
        "Weekend privé",
        "Peau & néon",
      ];
      for (let i = videos.length; i < 7; i += 1) {
        els.grid.appendChild(card(names[i % names.length], i * 733, "Aperçu démo", "Demo"));
      }
    }
  }

  async function boot() {
    try {
      const [c, v] = await Promise.all([fetch("/api/config"), fetch("/api/videos")]);
      if (c.ok) applyBrand(await c.json());
      if (v.ok) allVideos = (await v.json()).videos || [];
    } catch {
      applyBrand({});
    }
    render();
  }

  els.gateEnter?.addEventListener("click", () => {
    if (els.gate) els.gate.hidden = true;
    if (els.app) els.app.hidden = false;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  });

  els.gateLeave?.addEventListener("click", () => {
    window.location.href = "https://www.google.com";
  });

  document.querySelectorAll(".filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((b) => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      filter = btn.dataset.filter === "new" ? "new" : "all";
      render();
    });
  });

  boot();
})();

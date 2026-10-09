(() => {
  const els = {
    gate: document.getElementById("gate"),
    app: document.getElementById("app"),
    gateEnter: document.getElementById("gate-enter"),
    gateLeave: document.getElementById("gate-leave"),
    gateLogo: document.getElementById("gate-logo"),
    gateBrand: document.getElementById("gate-brand"),
    navLogo: document.getElementById("nav-logo"),
    navName: document.getElementById("nav-name"),
    mobileLogo: document.getElementById("mobile-logo"),
    mobileName: document.getElementById("mobile-name"),
    railDesc: document.getElementById("rail-desc"),
    heroBrand: document.getElementById("hero-brand"),
    heroLine: document.getElementById("hero-line"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
  };

  function applyBrand(cfg) {
    const name = cfg.brandName || "EroticX";
    const logo = `${cfg.logoPath || "/assets/logo.svg"}?t=${Date.now()}`;
    const desc = cfg.description || "Une vitrine adulte plus éditoriale, plus désir.";
    document.title = `DA Nightlife — ${name}`;
    [els.gateBrand, els.navName, els.mobileName, els.heroBrand].forEach((n) => {
      if (n) n.textContent = name;
    });
    if (els.heroLine) els.heroLine.textContent = desc;
    if (els.railDesc) els.railDesc.textContent = desc;
    [els.gateLogo, els.navLogo, els.mobileLogo].forEach((img) => {
      if (!img) return;
      img.src = logo;
      img.alt = name;
    });
  }

  function timeLabel(seed) {
    const n = Number(seed) || 0;
    return `${String((n % 17) + 5).padStart(2, "0")}:${String((n % 50) + 10).padStart(2, "0")}`;
  }

  function shot(title, seed, meta, badge) {
    const a = document.createElement("a");
    a.className = "shot";
    a.href = "#wall";
    a.innerHTML = `
      <div class="shot__frame">
        <span class="shot__badge"></span>
        <span class="shot__time"></span>
      </div>
      <div>
        <h4 class="shot__title"></h4>
        <p class="shot__meta"></p>
      </div>
    `;
    a.querySelector(".shot__badge").textContent = badge;
    a.querySelector(".shot__time").textContent = timeLabel(seed);
    a.querySelector(".shot__title").textContent = title;
    a.querySelector(".shot__meta").textContent = meta;
    a.addEventListener("click", (e) => e.preventDefault());
    return a;
  }

  function render(videos) {
    if (!els.grid) return;
    els.grid.innerHTML = "";

    const names = [
      "Rouge minuit",
      "Suite 18",
      "Néon & peau",
      "After hours",
      "Velours noir",
      "Private cut",
    ];

    if (!videos.length) {
      names.forEach((title, i) => {
        els.grid.appendChild(shot(title, i * 811, "Aperçu démo éditorial", "Featured"));
      });
      if (els.empty) els.empty.hidden = true;
      return;
    }

    if (els.empty) els.empty.hidden = true;
    videos.forEach((v, i) => {
      els.grid.appendChild(
        shot(v.title || "Sans titre", v.createdAt || i, "Contenu membre", i === 0 ? "Tonight" : "Cut")
      );
    });

    for (let i = videos.length; i < 6; i += 1) {
      els.grid.appendChild(shot(names[i % names.length], i * 701, "Aperçu démo", "Demo"));
    }
  }

  async function boot() {
    try {
      const [c, v] = await Promise.all([fetch("/api/config"), fetch("/api/videos")]);
      if (c.ok) applyBrand(await c.json());
      else applyBrand({});
      if (v.ok) render((await v.json()).videos || []);
      else render([]);
    } catch {
      applyBrand({});
      render([]);
    }
  }

  els.gateEnter?.addEventListener("click", () => {
    if (els.gate) els.gate.hidden = true;
    if (els.app) els.app.hidden = false;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  });

  els.gateLeave?.addEventListener("click", () => {
    window.location.href = "https://www.google.com";
  });

  boot();
})();

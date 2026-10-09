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
    adStage: document.getElementById("ad-stage"),
    adDots: document.getElementById("ad-dots"),
    adEmpty: document.getElementById("ad-empty"),
  };

  let adTimer = null;
  let adIndex = 0;

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

  function viewsLabel(seed) {
    const n = Number(seed) || 0;
    const v = 1200 + (n % 8800);
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k vues`;
    return `${v} vues`;
  }

  function shot(title, seed, meta, badge, tone) {
    const a = document.createElement("a");
    a.className = `shot shot--${tone || "a"}`;
    a.href = "#wall";
    a.innerHTML = `
      <div class="shot__frame">
        <span class="shot__glow" aria-hidden="true"></span>
        <span class="shot__veil" aria-hidden="true"></span>
        <span class="shot__shine" aria-hidden="true"></span>
        <span class="shot__play" aria-hidden="true"></span>
        <span class="shot__badge"></span>
        <span class="shot__hd">HD</span>
        <span class="shot__time"></span>
      </div>
      <div class="shot__body">
        <h4 class="shot__title"></h4>
        <p class="shot__meta"><span class="shot__dot" aria-hidden="true"></span><span class="shot__metaText"></span></p>
      </div>
    `;
    a.querySelector(".shot__badge").textContent = badge;
    a.querySelector(".shot__time").textContent = timeLabel(seed);
    a.querySelector(".shot__title").textContent = title;
    a.querySelector(".shot__metaText").textContent = `${meta} · ${viewsLabel(seed)}`;
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

    const tones = ["a", "b", "c"];

    if (!videos.length) {
      names.forEach((title, i) => {
        els.grid.appendChild(
          shot(title, i * 811, "Éditorial", i === 0 ? "Tonight" : "Cut", tones[i % 3])
        );
      });
      if (els.empty) els.empty.hidden = true;
      return;
    }

    if (els.empty) els.empty.hidden = true;
    videos.forEach((v, i) => {
      els.grid.appendChild(
        shot(
          v.title || "Sans titre",
          v.createdAt || i,
          "Membre",
          i === 0 ? "Tonight" : "New",
          tones[i % 3]
        )
      );
    });

    for (let i = videos.length; i < 6; i += 1) {
      els.grid.appendChild(
        shot(names[i % names.length], i * 701, "Demo", "Cut", tones[i % 3])
      );
    }
  }

  function showAd(index) {
    const slides = els.adStage?.querySelectorAll(".billboard__slide");
    if (!slides?.length) return;
    adIndex = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("is-on", i === adIndex));
    els.adDots?.querySelectorAll("button").forEach((d, i) => {
      d.classList.toggle("is-on", i === adIndex);
    });
  }

  function renderAds(ads) {
    if (!els.adStage) return;
    if (adTimer) {
      clearInterval(adTimer);
      adTimer = null;
    }
    els.adStage.innerHTML = "";
    if (els.adDots) {
      els.adDots.innerHTML = "";
      els.adDots.hidden = true;
    }

    const frame = els.adStage.closest(".billboard__frame");

    if (!ads.length) {
      if (els.adEmpty) els.adEmpty.hidden = false;
      if (frame) frame.classList.add("is-empty");
      return;
    }

    if (els.adEmpty) els.adEmpty.hidden = true;
    if (frame) frame.classList.remove("is-empty");

    ads.forEach((ad, index) => {
      const link = document.createElement("a");
      link.className = "billboard__slide" + (index === 0 ? " is-on" : "");
      link.href = ad.redirectUrl || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      if (ad.mediaType === "video") {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
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
      shade.className = "billboard__shade";
      link.appendChild(shade);

      const meta = document.createElement("span");
      meta.className = "billboard__meta";
      meta.innerHTML = `
        <span class="billboard__badge">Pub</span>
        <p class="billboard__title"></p>
        <p class="billboard__cta">Découvrir ➔</p>
      `;
      meta.querySelector(".billboard__title").textContent = ad.title || "Sponsor";
      link.appendChild(meta);
      els.adStage.appendChild(link);
    });

    if (ads.length > 1 && els.adDots) {
      els.adDots.hidden = false;
      ads.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        if (index === 0) dot.className = "is-on";
        dot.setAttribute("aria-label", `Publicité ${index + 1}`);
        dot.addEventListener("click", () => {
          showAd(index);
          if (adTimer) clearInterval(adTimer);
          adTimer = setInterval(() => showAd(adIndex + 1), 5000);
        });
        els.adDots.appendChild(dot);
      });
      adTimer = setInterval(() => showAd(adIndex + 1), 5000);
    }
  }

  async function boot() {
    try {
      const [c, v, a] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/videos"),
        fetch("/api/ads"),
      ]);
      if (c.ok) applyBrand(await c.json());
      else applyBrand({});
      if (v.ok) render((await v.json()).videos || []);
      else render([]);
      if (a.ok) renderAds((await a.json()).ads || []);
      else renderAds([]);
    } catch {
      applyBrand({});
      render([]);
      renderAds([]);
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

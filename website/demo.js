(() => {
  const els = {
    gate: document.getElementById("gate"),
    shell: document.getElementById("shell"),
    gateEnter: document.getElementById("gate-enter"),
    gateLeave: document.getElementById("gate-leave"),
    gateLogo: document.getElementById("gate-logo"),
    gateBrand: document.getElementById("gate-brand"),
    topLogo: document.getElementById("top-logo"),
    topName: document.getElementById("top-name"),
    heroBrand: document.getElementById("hero-brand"),
    heroLine: document.getElementById("hero-line"),
    videoGrid: document.getElementById("video-grid"),
    videoEmpty: document.getElementById("video-empty"),
    adStage: document.getElementById("ad-stage"),
    adEmpty: document.getElementById("ad-empty"),
    adDots: document.getElementById("ad-dots"),
  };

  let adTimer = null;
  let adIndex = 0;

  function applyBrand(cfg) {
    const name = cfg.brandName || "EroticX";
    const logo = cfg.logoPath || "/assets/logo.svg";
    const desc = cfg.description || "Regarde les dernières publications";
    document.title = `Démo esthétique — ${name}`;
    [els.gateBrand, els.topName, els.heroBrand].forEach((n) => {
      if (n) n.textContent = name;
    });
    [els.gateLogo, els.topLogo].forEach((img) => {
      if (!img) return;
      img.src = `${logo}?t=${Date.now()}`;
      img.alt = `Logo ${name}`;
    });
    if (els.heroLine) els.heroLine.textContent = desc;
  }

  function renderVideos(videos) {
    if (!els.videoGrid) return;
    els.videoGrid.innerHTML = "";
    if (!videos.length) {
      if (els.videoEmpty) els.videoEmpty.hidden = false;
      return;
    }
    if (els.videoEmpty) els.videoEmpty.hidden = true;

    videos.forEach((video, i) => {
      const a = document.createElement("a");
      a.className = "vcard";
      a.href = video.watchUrl || `/watch/${video.id}`;
      a.setAttribute("aria-label", video.title || "Vidéo");
      const mins = String(((Number(video.createdAt) || i * 97) % 17) + 4).padStart(2, "0");
      const secs = String(((Number(video.createdAt) || i * 53) % 50) + 10).padStart(2, "0");
      a.innerHTML = `
        <div class="vcard__thumb">
          <span class="vcard__play" aria-hidden="true"></span>
          <span class="vcard__hd">HD</span>
          <span class="vcard__time">${mins}:${secs}</span>
        </div>
        <h3 class="vcard__title"></h3>
        <p class="vcard__meta">Membre · 4K ready</p>
      `;
      a.querySelector(".vcard__title").textContent = video.title || "Sans titre";
      a.addEventListener("click", (e) => {
        e.preventDefault();
      });
      els.videoGrid.appendChild(a);
    });

    // Fill demo grid if few real videos so the aesthetic reads well
    if (videos.length < 8) {
      const fillers = [
        "After hours",
        "Velvet room",
        "Night drive",
        "Soft focus",
        "Private cut",
        "Red hour",
        "Silent film",
        "Heatwave",
      ];
      for (let i = videos.length; i < 8; i += 1) {
        const a = document.createElement("a");
        a.className = "vcard";
        a.href = "#videos";
        a.innerHTML = `
          <div class="vcard__thumb">
            <span class="vcard__play" aria-hidden="true"></span>
            <span class="vcard__hd">HD</span>
            <span class="vcard__time">12:0${i % 9}</span>
          </div>
          <h3 class="vcard__title"></h3>
          <p class="vcard__meta">Aperçu démo · placeholder</p>
        `;
        a.querySelector(".vcard__title").textContent = fillers[i % fillers.length];
        a.addEventListener("click", (e) => e.preventDefault());
        els.videoGrid.appendChild(a);
      }
    }
  }

  function showAd(index) {
    const slides = els.adStage?.querySelectorAll(".ad-slide");
    if (!slides?.length) return;
    adIndex = ((index % slides.length) + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === adIndex));
    els.adDots?.querySelectorAll("button").forEach((d, i) => {
      d.classList.toggle("is-active", i === adIndex);
    });
  }

  function renderAds(ads) {
    if (!els.adStage) return;
    if (adTimer) clearInterval(adTimer);
    els.adStage.innerHTML = "";
    if (els.adDots) {
      els.adDots.innerHTML = "";
      els.adDots.hidden = true;
    }

    if (!ads.length) {
      els.adStage.hidden = true;
      if (els.adEmpty) els.adEmpty.hidden = false;
      return;
    }

    if (els.adEmpty) els.adEmpty.hidden = true;
    els.adStage.hidden = false;

    ads.forEach((ad, index) => {
      const link = document.createElement("a");
      link.className = "ad-slide" + (index === 0 ? " is-active" : "");
      link.href = ad.redirectUrl || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      if (ad.mediaType === "video") {
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.src = ad.url;
        link.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = ad.url;
        img.alt = "";
        link.appendChild(img);
      }

      const shade = document.createElement("span");
      shade.className = "ad-slide__shade";
      link.appendChild(shade);

      const meta = document.createElement("span");
      meta.className = "ad-slide__meta";
      const title = document.createElement("strong");
      title.textContent = ad.title || "Sponsor";
      const cta = document.createElement("span");
      cta.textContent = "Découvrir ➔";
      meta.appendChild(title);
      meta.appendChild(cta);
      link.appendChild(meta);
      els.adStage.appendChild(link);
    });

    if (ads.length > 1 && els.adDots) {
      els.adDots.hidden = false;
      ads.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = index === 0 ? "is-active" : "";
        dot.setAttribute("aria-label", `Pub ${index + 1}`);
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
      const [cfgRes, vidRes, adsRes] = await Promise.all([
        fetch("/api/config"),
        fetch("/api/videos"),
        fetch("/api/ads"),
      ]);
      if (cfgRes.ok) applyBrand(await cfgRes.json());
      if (vidRes.ok) {
        const data = await vidRes.json();
        renderVideos(data.videos || []);
      } else {
        renderVideos([]);
      }
      if (adsRes.ok) {
        const data = await adsRes.json();
        renderAds(data.ads || []);
      } else {
        renderAds([]);
      }
    } catch {
      applyBrand({});
      renderVideos([]);
      renderAds([]);
    }
  }

  els.gateEnter?.addEventListener("click", () => {
    if (els.gate) els.gate.hidden = true;
    if (els.shell) els.shell.hidden = false;
  });

  els.gateLeave?.addEventListener("click", () => {
    location.href = "https://www.google.com";
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
  });

  boot();
})();

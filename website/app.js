(() => {
  const STORAGE_KEY = "site_age_verified";
  const cfg = window.SITE_CONFIG || {};
  const age = cfg.ageGate || {};

  const els = {
    gate: document.getElementById("age-gate"),
    site: document.getElementById("site"),
    prompt: document.getElementById("age-prompt"),
    denied: document.getElementById("age-denied"),
    title: document.getElementById("age-title"),
    message: document.getElementById("age-message"),
    deniedTitle: document.getElementById("denied-title"),
    deniedMessage: document.getElementById("denied-message"),
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
  };

  function applyBrand() {
    const name = cfg.brandName || "Mon site";
    const logo = cfg.logoPath || "assets/logo.svg";

    document.title = name;

    [els.ageBrandName, els.siteBrandName, els.heroBrand].forEach((node) => {
      if (node) node.textContent = name;
    });

    [els.ageLogo, els.siteLogo].forEach((img) => {
      if (!img) return;
      img.src = logo;
      img.alt = `Logo ${name}`;
    });

    if (els.heroTagline) {
      els.heroTagline.textContent = cfg.tagline || "";
    }

    if (els.title) els.title.textContent = age.title || "Vérification d’âge";
    if (els.message) els.message.textContent = age.message || "";
    if (els.btnConfirm) els.btnConfirm.textContent = age.confirmLabel || "J’ai 18 ans";
    if (els.btnDeny) els.btnDeny.textContent = age.denyLabel || "Je n’ai pas 18 ans";
    if (els.deniedTitle) els.deniedTitle.textContent = age.deniedTitle || "Accès refusé";
    if (els.deniedMessage) els.deniedMessage.textContent = age.deniedMessage || "";
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
    } catch (_) {
      /* ignore private mode failures */
    }
    els.gate.hidden = true;
    els.site.hidden = false;
  }

  function denyAccess() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "no");
    } catch (_) {
      /* ignore */
    }
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

  applyBrand();

  els.btnConfirm?.addEventListener("click", enterSite);
  els.btnDeny?.addEventListener("click", denyAccess);

  // Clic sur le nom / logo → message préventif (vérification d’âge)
  els.ageBrandTrigger?.addEventListener("click", () => {
    if (els.denied && !els.denied.hidden) {
      showGate("prompt");
      return;
    }
    els.title?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  els.siteBrand?.addEventListener("click", reopenAgeMessage);

  if (isVerified()) {
    els.gate.hidden = true;
    els.site.hidden = false;
  } else if (wasDenied()) {
    showGate("denied");
  } else {
    showGate("prompt");
  }
})();

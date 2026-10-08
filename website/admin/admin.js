(() => {
  const loginView = document.getElementById("login-view");
  const adminView = document.getElementById("admin-view");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");
  const brandForm = document.getElementById("brand-form");
  const brandName = document.getElementById("brand-name");
  const brandTagline = document.getElementById("brand-tagline");
  const brandDescription = document.getElementById("brand-description");
  const brandStatus = document.getElementById("brand-status");
  const logoForm = document.getElementById("logo-form");
  const logoPreview = document.getElementById("logo-preview");
  const logoStatus = document.getElementById("logo-status");
  const videoForm = document.getElementById("video-form");
  const videoStatus = document.getElementById("video-status");
  const videoList = document.getElementById("admin-video-list");
  const videoEmpty = document.getElementById("admin-video-empty");

  function setStatus(el, message, ok) {
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("is-ok", Boolean(ok));
    el.classList.toggle("is-err", Boolean(message) && !ok);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Erreur");
    }
    return data;
  }

  function showAdmin(authenticated) {
    loginView.hidden = authenticated;
    adminView.hidden = !authenticated;
  }

  async function loadConfig() {
    const cfg = await api("/api/config");
    brandName.value = cfg.brandName || "";
    brandTagline.value = cfg.tagline || "";
    brandDescription.value = cfg.description || "";
    logoPreview.src = `${cfg.logoPath || "/assets/logo.svg"}?t=${Date.now()}`;
    document.title = `Admin — ${cfg.brandName || "Site"}`;
  }

  async function loadVideos() {
    const data = await api("/api/videos");
    const videos = data.videos || [];
    videoList.innerHTML = "";

    if (!videos.length) {
      videoEmpty.hidden = false;
      return;
    }

    videoEmpty.hidden = true;

    for (const video of videos) {
      const row = document.createElement("article");
      row.className = "admin-video";
      row.innerHTML = `
        <video controls playsinline preload="metadata">
          <source src="${video.url}" type="video/mp4" />
        </video>
        <div class="admin-video__meta">
          <h3 class="admin-video__title"></h3>
          <button type="button" class="btn btn--danger" data-id="${video.id}">Supprimer</button>
        </div>
      `;
      row.querySelector(".admin-video__title").textContent = video.title;
      row.querySelector("button").addEventListener("click", async () => {
        if (!confirm(`Supprimer « ${video.title} » ?`)) return;
        try {
          await api(`/api/admin/videos/${video.id}`, { method: "DELETE" });
          await loadVideos();
        } catch (err) {
          alert(err.message);
        }
      });
      videoList.appendChild(row);
    }
  }

  async function bootAdmin() {
    await loadConfig();
    await loadVideos();
    showAdmin(true);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: document.getElementById("password").value }),
      });
      await bootAdmin();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" });
    showAdmin(false);
  });

  brandForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(brandStatus, "Enregistrement…", true);
    try {
      await api("/api/admin/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: brandName.value.trim(),
          tagline: brandTagline.value.trim(),
          description: brandDescription.value.trim(),
        }),
      });
      setStatus(brandStatus, "Identité enregistrée.", true);
      document.title = `Admin — ${brandName.value.trim()}`;
    } catch (err) {
      setStatus(brandStatus, err.message, false);
    }
  });

  logoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = document.getElementById("logo-file").files[0];
    if (!file) return;
    const body = new FormData();
    body.append("logo", file);
    setStatus(logoStatus, "Upload du logo…", true);
    try {
      const data = await api("/api/admin/logo", { method: "POST", body });
      logoPreview.src = `${data.logoPath}?t=${Date.now()}`;
      logoForm.reset();
      setStatus(logoStatus, "Logo mis à jour.", true);
    } catch (err) {
      setStatus(logoStatus, err.message, false);
    }
  });

  videoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("video-title").value.trim();
    const file = document.getElementById("video-file").files[0];
    if (!title || !file) return;

    const body = new FormData();
    body.append("title", title);
    body.append("video", file);
    setStatus(videoStatus, "Upload + conversion MP4 en cours (peut prendre un moment)…", true);

    try {
      await api("/api/admin/videos", { method: "POST", body });
      videoForm.reset();
      setStatus(videoStatus, "Vidéo publiée (compatible mobile).", true);
      await loadVideos();
    } catch (err) {
      setStatus(videoStatus, err.message, false);
    }
  });

  api("/api/admin/me")
    .then(() => bootAdmin())
    .catch(() => showAdmin(false));
})();

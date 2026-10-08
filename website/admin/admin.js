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
  const membersList = document.getElementById("members-list");
  const membersEmpty = document.getElementById("members-empty");
  const codesList = document.getElementById("codes-list");
  const codesEmpty = document.getElementById("codes-empty");
  const codesValidatedList = document.getElementById("codes-validated-list");
  const codesValidatedEmpty = document.getElementById("codes-validated-empty");
  const tabButtons = document.querySelectorAll(".tabs__btn");
  const tabPanels = {
    content: document.getElementById("tab-content"),
    members: document.getElementById("tab-members"),
    codes: document.getElementById("tab-codes"),
    "codes-validated": document.getElementById("tab-codes-validated"),
  };

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

  function switchTab(name) {
    for (const [key, panel] of Object.entries(tabPanels)) {
      if (panel) panel.hidden = key !== name;
    }
    tabButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === name);
    });
    if (name === "members") loadMembers().catch((err) => alert(err.message));
    if (name === "codes") loadCodes().catch((err) => alert(err.message));
    if (name === "codes-validated") loadValidatedCodes().catch((err) => alert(err.message));
  }

  function statusLabel(status) {
    if (status === "pending") return "En attente";
    if (status === "awaiting_code") return "Code non saisi";
    if (status === "approved") return "Validé";
    if (status === "rejected") return "Refusé";
    return status;
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
          <source src="/api/videos/${video.id}/stream" type="video/mp4" />
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

  async function loadMembers() {
    const data = await api("/api/admin/members");
    // Demandes = après validation du code SMS (pending) ou refusées
    const pending = (data.members || []).filter(
      (m) => m.status === "pending" || m.status === "rejected"
    );
    membersList.innerHTML = "";

    if (!pending.length) {
      membersEmpty.hidden = false;
      return;
    }

    membersEmpty.hidden = true;

    for (const member of pending) {
      const row = document.createElement("article");
      row.className = "member-card";
      row.innerHTML = `
        <div class="member-card__info">
          <strong class="member-card__email"></strong>
          <span class="member-card__phone"></span>
          <span class="member-card__status"></span>
        </div>
        <div class="member-card__actions">
          <button type="button" class="btn btn--primary" data-action="approve">Valider</button>
          <button type="button" class="btn btn--danger" data-action="reject">Refuser</button>
        </div>
      `;
      row.querySelector(".member-card__email").textContent = member.email;
      row.querySelector(".member-card__phone").textContent = member.phone;
      row.querySelector(".member-card__status").textContent = statusLabel(member.status);

      const approveBtn = row.querySelector('[data-action="approve"]');
      const rejectBtn = row.querySelector('[data-action="reject"]');

      if (member.status === "rejected") {
        rejectBtn.hidden = true;
      }

      approveBtn.addEventListener("click", async () => {
        try {
          await api(`/api/admin/members/${member.id}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          await loadMembers();
          await loadCodes();
          await loadValidatedCodes();
        } catch (err) {
          alert(err.message);
        }
      });

      rejectBtn.addEventListener("click", async () => {
        if (!confirm(`Refuser ${member.email} ?`)) return;
        try {
          await api(`/api/admin/members/${member.id}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          await loadMembers();
          await loadCodes();
          await loadValidatedCodes();
        } catch (err) {
          alert(err.message);
        }
      });

      membersList.appendChild(row);
    }
  }

  function renderCodeCard(entry, statusText) {
    const row = document.createElement("article");
    row.className = "code-card";
    row.innerHTML = `
      <div class="code-card__phone"></div>
      <div class="code-card__code"></div>
      <div class="code-card__meta">
        <span class="code-card__email"></span>
        <span class="code-card__status"></span>
      </div>
    `;
    row.querySelector(".code-card__phone").textContent = entry.phone;
    row.querySelector(".code-card__code").textContent = entry.code;
    row.querySelector(".code-card__email").textContent = entry.email;
    row.querySelector(".code-card__status").textContent = statusText;
    return row;
  }

  async function loadCodes() {
    const data = await api("/api/admin/codes");
    const codes = data.codes || [];
    codesList.innerHTML = "";

    if (!codes.length) {
      codesEmpty.hidden = false;
      return;
    }

    codesEmpty.hidden = true;

    for (const entry of codes) {
      codesList.appendChild(renderCodeCard(entry, statusLabel(entry.status)));
    }
  }

  async function loadValidatedCodes() {
    const data = await api("/api/admin/codes/validated");
    const codes = data.codes || [];
    codesValidatedList.innerHTML = "";

    if (!codes.length) {
      codesValidatedEmpty.hidden = false;
      return;
    }

    codesValidatedEmpty.hidden = true;

    for (const entry of codes) {
      codesValidatedList.appendChild(renderCodeCard(entry, "Inscription acceptée"));
    }
  }

  async function bootAdmin() {
    await loadConfig();
    await loadVideos();
    showAdmin(true);
    switchTab("content");
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

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

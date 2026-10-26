(() => {
  const AUTH_DISMISSED_KEY = "site_auth_dismissed";

  function $(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = hidden;
  }

  function setText(el, text, hidden = false) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = hidden || !text;
  }

  function rejectedCopy(member) {
    const left = Number(member?.attemptsLeft);
    const n = Number.isFinite(left) ? Math.max(0, left) : 2;
    const essais = n <= 1 ? "essai" : "essais";
    return (
      `Ta demande a été refusée car ton numéro était incorrect. ` +
      `Il te reste ${n} ${essais} afin de pouvoir te faire valider. ` +
      `Si tu ne respectes pas la vérification, tu seras banni définitivement.`
    );
  }

  async function api(url, options = {}) {
    const { headers, ...rest } = options;
    const res = await fetch(url, {
      credentials: "same-origin",
      ...rest,
      headers: {
        ...(rest.body && !(rest.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Erreur");
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function createAuthController(options = {}) {
    const onApproved = typeof options.onApproved === "function" ? options.onApproved : () => {};
    const onStatusChange =
      typeof options.onStatusChange === "function" ? options.onStatusChange : () => {};
    const autoOpenOnEntry = options.autoOpenOnEntry !== false;

    let member = null;

    const els = {
      modal: $("auth-modal"),
      close: $("auth-close"),
      choice: $("auth-choice"),
      login: $("auth-login"),
      register: $("auth-register"),
      gotoLogin: $("auth-goto-login"),
      gotoRegister: $("auth-goto-register"),
      loginForm: $("login-form"),
      loginBack: $("login-back"),
      loginError: $("login-error"),
      pseudoForm: $("pseudo-form"),
      registerForm: $("register-form"),
      codeForm: $("code-form"),
      registerBack: $("register-back"),
      pseudoError: $("pseudo-error"),
      registerError: $("register-error"),
      stepLabel: $("snap-step"),
      recents: $("snap-recents"),
      registerPending: $("register-pending"),
      registerRejected: $("register-rejected"),
      registerRejectedText: $("register-rejected-text"),
      retryPhoneForm: $("retry-phone-form"),
      retryPhone: $("retry-phone"),
      retryPhoneError: $("retry-phone-error"),
      registerBanned: $("register-banned"),
      registerBannedText: $("register-banned-text"),
      openBtn: $("auth-open"),
      logoutBtn: $("auth-logout"),
      badge: $("member-badge"),
    };

    function wasDismissed() {
      try {
        return sessionStorage.getItem(AUTH_DISMISSED_KEY) === "1";
      } catch {
        return false;
      }
    }

    function markDismissed() {
      try {
        sessionStorage.setItem(AUTH_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
    }

    function showSection(name) {
      setHidden(els.choice, name !== "choice");
      setHidden(els.login, name !== "login");
      setHidden(els.register, name !== "register");
    }

    function setStep(n, total = 3) {
      if (els.stepLabel) els.stepLabel.textContent = `Étape ${n} / ${total}`;
    }

    function fillRecents() {
      if (!els.recents || els.recents.dataset.ready === "1") return;
      const names = ["lea_x", "noah92", "maya.off", "kilian", "zoe.m", "ryan__", "nina.k", "tom.v"];
      const times = ["30s", "1m", "2m", "4m", "5m", "8m", "12m", "15m"];
      els.recents.innerHTML = names
        .map(
          (n, i) =>
            `<div class="snap-auth__recent"><strong>${n}</strong><span>inscrit · ${times[i]}</span></div>`
        )
        .join("");
      els.recents.dataset.ready = "1";
    }

    function resetRegisterStep(step = "pseudo") {
      // map legacy "form" (username+phone) to phone step after pseudo exists
      if (step === "form") step = "pseudo";
      setHidden(els.pseudoForm, step !== "pseudo");
      setHidden(els.registerForm, step !== "phone");
      setHidden(els.codeForm, step !== "code");
      setHidden(els.registerPending, step !== "pending");
      setHidden(els.registerRejected, step !== "rejected");
      setHidden(els.registerBanned, step !== "banned");
      setText(els.pseudoError, "", true);
      setText(els.registerError, "", true);
      setText(els.retryPhoneError, "", true);

      if (step === "pseudo") setStep(1);
      else if (step === "phone") setStep(2);
      else if (step === "code") setStep(3);
      else if (step === "pending") setStep(3);
      else if (els.stepLabel) els.stepLabel.textContent = "Compte";

      if (step === "rejected" && els.registerRejectedText) {
        els.registerRejectedText.textContent = rejectedCopy(member);
        if (els.retryPhone) els.retryPhone.value = "";
      }
      if (step === "banned" && els.registerBannedText) {
        els.registerBannedText.textContent =
          "Tu es banni définitivement pour non-respect de la vérification. Tu ne peux plus créer de compte.";
      }
    }

    function updateChrome() {
      const approved = member?.status === "approved";
      const pending = member?.status === "pending";
      const awaiting = member?.status === "awaiting_code";
      const rejected = member?.status === "rejected";
      const banned = member?.status === "banned";

      if (els.badge) {
        if (approved) {
          els.badge.hidden = false;
          els.badge.textContent = "Membre";
        } else if (pending) {
          els.badge.hidden = false;
          els.badge.textContent = "En attente";
        } else if (awaiting) {
          els.badge.hidden = false;
          els.badge.textContent = "Code requis";
        } else if (rejected) {
          els.badge.hidden = false;
          els.badge.textContent = "Refusé";
        } else if (banned) {
          els.badge.hidden = false;
          els.badge.textContent = "Banni";
        } else {
          els.badge.hidden = true;
          els.badge.textContent = "";
        }
      }

      if (els.openBtn) {
        els.openBtn.hidden = approved;
        els.openBtn.textContent = member ? "Mon compte" : "Connexion";
      }
      if (els.logoutBtn) {
        els.logoutBtn.hidden = !member;
      }

      onStatusChange(member);
    }

    function openRegisterForMember() {
      openModal("register");
      if (member?.status === "banned") resetRegisterStep("banned");
      else if (member?.status === "rejected") resetRegisterStep("rejected");
      else if (member?.status === "pending") resetRegisterStep("pending");
      else if (member?.status === "awaiting_code") resetRegisterStep("code");
      else resetRegisterStep("pseudo");
    }

    function openModal(section = "choice") {
      if (!els.modal) return;
      els.modal.hidden = false;
      document.body.classList.add("auth-open");
      fillRecents();
      showSection(section);
      if (section === "choice") setStep(1);
      if (section === "login") setStep(1, 2);
      if (section === "register") {
        if (member?.status === "banned") resetRegisterStep("banned");
        else if (member?.status === "rejected") resetRegisterStep("rejected");
        else if (member?.status === "pending") resetRegisterStep("pending");
        else if (member?.status === "awaiting_code") resetRegisterStep("code");
        else resetRegisterStep("pseudo");
      }
    }

    function closeModal() {
      if (!els.modal) return;
      els.modal.hidden = true;
      document.body.classList.remove("auth-open");
      markDismissed();
    }

    function requireAccess(reason) {
      if (member?.status === "approved") return true;
      if (
        member?.status === "pending" ||
        member?.status === "awaiting_code" ||
        member?.status === "rejected" ||
        member?.status === "banned"
      ) {
        openRegisterForMember();
        return false;
      }
      openModal(reason === "login" ? "login" : "choice");
      return false;
    }

    async function refreshMember() {
      try {
        const data = await api("/api/auth/me");
        member = data.member || null;
      } catch {
        member = null;
      }
      updateChrome();
      return member;
    }

    els.close?.addEventListener("click", closeModal);
    els.modal?.addEventListener("click", (event) => {
      if (event.target === els.modal) closeModal();
    });

    els.gotoLogin?.addEventListener("click", () => {
      showSection("login");
      setStep(1, 2);
    });
    els.gotoRegister?.addEventListener("click", () => {
      showSection("register");
      if (member?.status === "banned") resetRegisterStep("banned");
      else if (member?.status === "rejected") resetRegisterStep("rejected");
      else resetRegisterStep("pseudo");
    });
    els.loginBack?.addEventListener("click", () => {
      showSection("choice");
      setStep(1);
    });
    els.registerBack?.addEventListener("click", () => {
      const phoneVisible = els.registerForm && !els.registerForm.hidden;
      const codeVisible = els.codeForm && !els.codeForm.hidden;
      if (codeVisible) {
        resetRegisterStep("phone");
        return;
      }
      if (phoneVisible) {
        resetRegisterStep("pseudo");
        return;
      }
      showSection("choice");
      setStep(1);
    });
    els.openBtn?.addEventListener("click", () => {
      if (
        member?.status === "pending" ||
        member?.status === "awaiting_code" ||
        member?.status === "rejected" ||
        member?.status === "banned"
      ) {
        openRegisterForMember();
        return;
      }
      openModal("choice");
    });

    els.logoutBtn?.addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      member = null;
      updateChrome();
      openModal("choice");
    });

    els.loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setText(els.loginError, "", true);
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: $("login-username").value,
            code: $("login-code").value,
          }),
        });
        member = data.member;
        updateChrome();
        if (data.step === "approved") {
          closeModal();
          onApproved(member);
          return;
        }
        if (data.step === "pending") {
          showSection("register");
          resetRegisterStep("pending");
          return;
        }
        if (data.step === "code") {
          showSection("register");
          resetRegisterStep("code");
          if ($("register-username")) $("register-username").value = $("login-username").value;
        }
      } catch (err) {
        if (err.data?.step === "rejected" || err.data?.member?.status === "rejected") {
          member = err.data.member || member;
          updateChrome();
          showSection("register");
          resetRegisterStep("rejected");
          return;
        }
        if (err.data?.step === "banned" || err.data?.member?.status === "banned") {
          member = err.data.member || member;
          updateChrome();
          showSection("register");
          resetRegisterStep("banned");
          return;
        }
        setText(els.loginError, err.message);
      }
    });

    els.pseudoForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      setText(els.pseudoError, "", true);
      const username = String($("register-username")?.value || "").trim();
      if (!/^[A-Za-z0-9._-]{3,24}$/.test(username)) {
        setText(els.pseudoError, "Pseudo invalide (3–24 caractères : lettres, chiffres, . _ -)");
        return;
      }
      resetRegisterStep("phone");
    });

    els.registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setText(els.registerError, "", true);
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: $("register-username").value,
            phone: $("register-phone").value,
          }),
        });
        member = data.member;
        updateChrome();
        resetRegisterStep("code");
      } catch (err) {
        if (err.data?.member?.status === "pending") {
          member = err.data.member;
          updateChrome();
          resetRegisterStep("pending");
          return;
        }
        if (err.data?.step === "banned" || err.data?.member?.status === "banned") {
          member = err.data.member || member;
          updateChrome();
          resetRegisterStep("banned");
          return;
        }
        setText(els.registerError, err.message);
      }
    });

    els.retryPhoneForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setText(els.retryPhoneError, "", true);
      if (!member?.username) {
        setText(els.retryPhoneError, "Reconnecte-toi avec ton pseudo pour réessayer.");
        return;
      }
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: member.username,
            phone: els.retryPhone?.value,
          }),
        });
        member = data.member;
        updateChrome();
        if ($("register-username")) $("register-username").value = member.username || "";
        resetRegisterStep("code");
      } catch (err) {
        if (err.data?.step === "banned" || err.data?.member?.status === "banned") {
          member = err.data.member || member;
          updateChrome();
          resetRegisterStep("banned");
          return;
        }
        setText(els.retryPhoneError, err.message);
      }
    });

    els.codeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const codeInput = $("register-code");
      const codeError = $("code-error");
      setText(codeError, "", true);
      try {
        const data = await api("/api/auth/verify-code", {
          method: "POST",
          body: JSON.stringify({
            username: $("register-username").value || member?.username,
            code: codeInput?.value,
          }),
        });
        member = data.member;
        updateChrome();
        resetRegisterStep("pending");
      } catch {
        if (codeInput) codeInput.value = "";
        setText(codeError, "", true);
      }
    });

    return {
      api,
      refreshMember,
      openModal,
      closeModal,
      requireAccess,
      getMember: () => member,
      isApproved: () => member?.status === "approved",
      maybeAutoOpen() {
        if (!autoOpenOnEntry) return;
        if (member?.status === "approved") return;
        if (wasDismissed()) return;
        if (member?.status === "rejected" || member?.status === "banned") {
          openRegisterForMember();
          return;
        }
        openModal("choice");
      },
    };
  }

  window.SiteAuth = { createAuthController, api };
})();

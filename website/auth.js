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
      registerForm: $("register-form"),
      codeForm: $("code-form"),
      registerBack: $("register-back"),
      registerError: $("register-error"),
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

    function resetRegisterStep(step = "form") {
      setHidden(els.registerForm, step !== "form");
      setHidden(els.codeForm, step !== "code");
      setHidden(els.registerPending, step !== "pending");
      setHidden(els.registerRejected, step !== "rejected");
      setHidden(els.registerBanned, step !== "banned");
      setText(els.registerError, "", true);
      setText(els.retryPhoneError, "", true);

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
      else resetRegisterStep("form");
    }

    function openModal(section = "choice") {
      if (!els.modal) return;
      els.modal.hidden = false;
      document.body.classList.add("auth-open");
      showSection(section);
      if (section === "register") {
        if (member?.status === "banned") resetRegisterStep("banned");
        else if (member?.status === "rejected") resetRegisterStep("rejected");
        else if (member?.status === "pending") resetRegisterStep("pending");
        else if (member?.status === "awaiting_code") resetRegisterStep("code");
        else resetRegisterStep("form");
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

    els.gotoLogin?.addEventListener("click", () => showSection("login"));
    els.gotoRegister?.addEventListener("click", () => {
      showSection("register");
      if (member?.status === "banned") resetRegisterStep("banned");
      else if (member?.status === "rejected") resetRegisterStep("rejected");
      else resetRegisterStep("form");
    });
    els.loginBack?.addEventListener("click", () => showSection("choice"));
    els.registerBack?.addEventListener("click", () => showSection("choice"));
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
            email: $("login-email").value,
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
          if ($("register-email")) $("register-email").value = $("login-email").value;
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

    els.registerForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setText(els.registerError, "", true);
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: $("register-email").value,
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
      if (!member?.email) {
        setText(els.retryPhoneError, "Reconnecte-toi avec ton e-mail pour réessayer.");
        return;
      }
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: member.email,
            phone: els.retryPhone?.value,
          }),
        });
        member = data.member;
        updateChrome();
        if ($("register-email")) $("register-email").value = member.email || "";
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
            email: $("register-email").value || member?.email,
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

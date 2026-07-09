/** DOM helpers, boot overlay, status bar. */
(function (global) {
  const SC = global.ScenarioConsole;

  const el = (id) => document.getElementById(id);
  const statusEl = el("status");

  function setBootStep(msg) {
    const step = el("walk-boot-step");
    if (step) step.textContent = msg;
  }

  function finishBoot() {
    document.body.classList.remove("walk-loading");
    const boot = el("walk-boot");
    if (boot) {
      boot.hidden = true;
      boot.setAttribute("aria-busy", "false");
    }
    el("walk-layout")?.removeAttribute("hidden");
  }

  function failBoot(msg) {
    setBootStep(msg);
    el("walk-boot")?.classList.add("walk-boot-err");
    const actions = el("walk-boot-actions");
    if (actions) actions.hidden = false;
    const isKeyErr = /admin api key|encrypted files|admin key required/i.test(msg);
    const retry = el("walk-boot-retry");
    if (retry) retry.hidden = !isKeyErr;
    setStatus(msg, false);
  }

  function setStatus(msg, ok) {
    if (!msg) {
      statusEl.textContent = "";
      statusEl.className = "status idle";
      return;
    }
    statusEl.textContent = msg;
    statusEl.className = "status" + (ok === true ? " ok" : ok === false ? " err" : "");
  }

  function btnLoading(btn, loading) {
    if (!btn) return () => {};
    if (loading) {
      btn.disabled = true;
      btn.classList.add("loading");
    } else {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  el("walk-boot-retry")?.addEventListener("click", () => {
    window.__clearScenarioKeys?.();
    location.reload();
  });

  el("walk-boot-continue")?.addEventListener("click", () => {
    finishBoot();
    SC.ensureMapReady();
  });

  Object.assign(SC, { el, statusEl, setBootStep, finishBoot, failBoot, setStatus, btnLoading });
})(typeof window !== "undefined" ? window : globalThis);

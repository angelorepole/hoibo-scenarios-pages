/** Phone picker, device reachability, prep state. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const C = SC.constants;
  const el = SC.el;
  const escapeHtml = SC.escapeHtml;
  const isHostedConsole = SC.isHostedConsole;
  const api = SC.api;

  function alwaysOnSlots() {
    const locked = C.ALWAYS_ON_BY_ENV[S.consoleEnvSlug] || [];
    const visible = new Set(devicesForPicker().map((d) => String(d.slot)));
    return locked.filter((slot) => visible.has(String(slot)));
  }

  function devicePickStorageKey() {
    return `${C.DEVICES_PICK_KEY}_${S.consoleEnvSlug}`;
  }

  function phonePrepStorageKey() {
    return `${C.PHONE_PREP_KEY}_${S.consoleEnvSlug}`;
  }

  function savedOptionalDeviceSlots() {
    try {
      const locked = new Set(alwaysOnSlots());
      const raw = JSON.parse(localStorage.getItem(devicePickStorageKey()) || "[]");
      return raw.filter((s) => !locked.has(String(s)));
    } catch (_) {
      return [];
    }
  }

  function persistOptionalDevicePick() {
    const locked = new Set(alwaysOnSlots());
    const slots = [...el("phone-rows").querySelectorAll("input[data-phone-slot]:checked")]
      .map((i) => i.value)
      .filter((s) => !locked.has(String(s)));
    localStorage.setItem(devicePickStorageKey(), JSON.stringify(slots));
  }

  function resetOptionalDevicePick() {
    localStorage.removeItem(devicePickStorageKey());
    renderDevicePick();
  }

  function loadPhonePrepState() {
    try {
      return JSON.parse(sessionStorage.getItem(phonePrepStorageKey()) || "{}");
    } catch (_) {
      return {};
    }
  }

  function savePhonePrepState(state) {
    sessionStorage.setItem(phonePrepStorageKey(), JSON.stringify(state));
  }

  function setPhonePrep(slot, ready) {
    const st = loadPhonePrepState();
    if (ready) st[slot] = true;
    else delete st[slot];
    savePhonePrepState(st);
  }

  function selectedDevices() {
    const boxes = el("phone-rows").querySelectorAll("input[data-phone-slot]:checked");
    const slots = new Set([...boxes].map((b) => b.value));
    alwaysOnSlots().forEach((s) => slots.add(String(s)));
    return S.registryDevices.filter((d) => slots.has(String(d.slot)));
  }

  function devicesForPicker() {
    return S.registryDevices.filter((d) => (d.backend_env || "stage") === S.consoleEnvSlug);
  }

  function deviceReachabilityForSlot(slot) {
    return (S.deviceReachabilityState?.devices || []).find((d) => String(d.slot) === String(slot)) || null;
  }

  function isDeviceReachable(slot) {
    if (isHostedConsole()) return true;
    const hit = deviceReachabilityForSlot(slot);
    return !hit || hit.reachable !== false;
  }

  function phoneUnavailableHtml(slot) {
    const hit = deviceReachabilityForSlot(slot);
    if (!hit || hit.reachable !== false) return "";
    const tip = escapeHtml(hit.help || "This phone is not reachable from the Mac.");
    return `<span class="phone-unavail-wrap"><span class="phone-unavail-tag">unavailable</span><details class="phone-unavail-details"><summary>What to do</summary><div class="phone-unavail-body">${tip}</div></details></span>`;
  }

  async function loadDeviceReachabilityIfLocal() {
    if (isHostedConsole()) {
      S.deviceReachabilityState = null;
      return;
    }
    try {
      const res = await fetch("/api/device-reachability", { cache: "no-store" });
      S.deviceReachabilityState = await res.json();
    } catch (_) {
      S.deviceReachabilityState = null;
    }
  }

  function deviceBuildStatusForSlot(slot) {
    if (!S.deviceBuildState?.ok) return null;
    return S.deviceBuildState.devices.find((d) => d.slot === slot) || null;
  }

  async function loadDeviceBuildsIfLocal() {
    if (isHostedConsole()) return;
    try {
      const res = await fetch("/api/device-builds", { cache: "no-store" });
      S.deviceBuildState = await res.json();
    } catch (_) {
      S.deviceBuildState = null;
    }
  }

  async function refreshPhonePanel() {
    if (isHostedConsole()) return;
    await Promise.all([loadDeviceReachabilityIfLocal(), loadDeviceBuildsIfLocal()]);
    renderDevicePick();
    SC.updateRunButtons();
  }

  function phonePrepStatusHtml(slot) {
    const hit = deviceBuildStatusForSlot(slot);
    if (!hit?.configured) return "";
    if (hit.check_failed) return `<span class="phone-warn">Couldn't check app — unlock phone and keep USB connected</span>`;
    if (hit.missing) return `<span class="phone-warn">App not on device — Run will install it</span>`;
    if (hit.behind) return `<span class="phone-warn">Out of date</span>`;
    return `<span class="phone-ok">Up to date (${hit.installed})</span>`;
  }

  function renderPhoneRows() {
    const box = el("phone-rows");
    const hint = el("phones-hint");
    if (!box || S.currentRun) return;
    const visible = devicesForPicker();
    if (!S.registryDevices.length) {
      box.innerHTML = `<p class="hint mb-0">No devices.json</p>`;
      return;
    }
    if (!visible.length) {
      box.innerHTML = `<p class="hint mb-0">No phones for ${S.consoleEnvLabel}.</p>`;
      return;
    }

    const locked = new Set(alwaysOnSlots());
    const saved = new Set(savedOptionalDeviceSlots().filter((slot) => isDeviceReachable(slot)));
    const prep = loadPhonePrepState();
    locked.forEach((slot) => {
      prep[slot] = true;
    });
    savePhonePrepState(prep);

    box.innerHTML = visible
      .map((d) => {
        const slot = String(d.slot);
        const isLocked = locked.has(slot);
        const warn = phonePrepStatusHtml(slot);
        const unavail = phoneUnavailableHtml(slot);
        const reachable = isDeviceReachable(slot);
        const warnHtml = warn ? `<br />${warn}` : "";
        if (isLocked) {
          return `<label class="phone-row phone-row-locked${reachable ? "" : " phone-row-unavail"}"><input type="checkbox" checked disabled aria-label="${d.name} always in run" /><span>${d.name} <span class="phone-locked-tag">· always in run</span>${unavail}${warnHtml}</span></label>`;
        }
        const checked = reachable && saved.has(slot) ? " checked" : "";
        const disabled = reachable ? "" : " disabled";
        const rowClass = reachable ? "phone-row" : "phone-row phone-row-unavail";
        return `<label class="${rowClass}"><input type="checkbox" data-phone-slot="${slot}" value="${slot}"${checked}${disabled} /><span>${d.name}${unavail}${warnHtml}</span></label>`;
      })
      .join("");

    if (hint) hint.hidden = false;

    box.querySelectorAll("input[data-phone-slot]").forEach((inp) => {
      inp.onchange = () => {
        if (inp.disabled) return;
        persistOptionalDevicePick();
        setPhonePrep(inp.value, inp.checked);
        syncRunDevices();
        SC.updateRunButtons();
      };
    });
    box.querySelectorAll(".phone-unavail-details").forEach((details) => {
      details.addEventListener("click", (e) => e.stopPropagation());
    });
    box.querySelectorAll("input[data-phone-slot]:checked").forEach((inp) => setPhonePrep(inp.value, true));
  }

  function phonesReadyForRun() {
    const selected = selectedDevices();
    if (!selected.length) return { ok: false, reason: "Tick at least one phone." };
    const blocked = selected.filter((d) => !isDeviceReachable(String(d.slot)));
    if (blocked.length) {
      return {
        ok: false,
        reason: `${blocked.map((d) => d.name || d.slot).join(", ")} unavailable — tap What to do on the phone row for fixes.`,
      };
    }
    return { ok: true };
  }

  function renderDevicePick() {
    renderPhoneRows();
  }

  function applyRunDevicesToPick(devices) {
    const locked = new Set(alwaysOnSlots());
    const slots = new Set((devices || []).map((d) => String(d.slot)));
    locked.forEach((s) => slots.add(String(s)));
    el("phone-rows").querySelectorAll("input[data-phone-slot]").forEach((input) => {
      input.checked = slots.has(input.value);
    });
    localStorage.setItem(
      devicePickStorageKey(),
      JSON.stringify([...slots].filter((s) => !locked.has(String(s)))),
    );
  }

  async function syncRunDevices() {
    if (!S.currentRun?.run_id) return;
    try {
      const data = await api(`/api/scenarios/run/${S.currentRun.run_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: selectedDevices() }),
      });
      S.currentRun = data.run;
    } catch (_) {
      /* run may have been removed */
    }
  }

  Object.assign(SC, {
    alwaysOnSlots,
    resetOptionalDevicePick,
    selectedDevices,
    devicesForPicker,
    loadDeviceReachabilityIfLocal,
    loadDeviceBuildsIfLocal,
    refreshPhonePanel,
    renderDevicePick,
    phonesReadyForRun,
    applyRunDevicesToPick,
    syncRunDevices,
  });
})(typeof window !== "undefined" ? window : globalThis);

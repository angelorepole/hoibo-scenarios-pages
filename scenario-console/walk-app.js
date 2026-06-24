/** Extracted from index.html — edit here, not inline in HTML. */
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
    const boot = el("walk-boot");
    if (boot) boot.classList.add("walk-boot-err");
    const actions = el("walk-boot-actions");
    if (actions) actions.hidden = false;
    const isKeyErr = /admin api key|encrypted files|admin key required/i.test(msg);
    const retry = el("walk-boot-retry");
    if (retry) retry.hidden = !isKeyErr;
    setStatus(msg, false);
  }

  el("walk-boot-retry")?.addEventListener("click", () => {
    window.__clearScenarioKeys?.();
    location.reload();
  });

  el("walk-boot-continue")?.addEventListener("click", () => {
    finishBoot();
    ensureMapReady();
  });

  (function () {
    const h = location.hostname;
    const onDevConsole =
      (h === "127.0.0.1" || h === "localhost") && location.port === "8765";
    if (
      (h === "127.0.0.1" || h === "localhost") &&
      !onDevConsole &&
      !location.search.includes("local=1")
    ) {
      location.replace("https://angelorepole.github.io/hoibo-scenarios-pages/scenario-console/");
    }
  })();
  const PHONE_SLOT_KEY = "walk_scenario_phone_slot";
  const CENTER_KEY = "walk_scenario_center";
  const DEVICES_SH = "dev_console/scripts/app/devices.sh";

  let catalog = null;
  let scenarioList = [];
  let customerPhones = [];
  let deviceReachabilityState = null;
  let registryDevices = [];
  let envStatus = null;
  let consoleEnvLabel = "STAGE";
  let consoleEnvSlug = "stage";
  let currentRun = null;
  let deviceBuildState = null;
  let map;
  let centerMarker = null;
  let radiusCircle = null;
  let shopMarkers = [];
  let draftZones = [];
  let runZoneOverlays = [];
  let radiusM = 800;
  let hasCenter = false;
  let suppressNextClick = false;
  let lastAnalysis = null;
  let lastCloudLogMeta = {
    scenario_id: null,
    run_id: null,
    uploaded_at: null,
    memory_trace: null,
    tech_log: null,
    tech_log_present: null,
    selected_path: null,
    pick_reason: null,
  };
  let isSeeding = false;
  let runProgressLabel = "";
  let playbookProgress = [];
  let manualDoneSteps = {};
  let lastPlaybook = { steps: [], allSteps: [], expects: [], multiDay: false };
  let redeemExpectedForRun = false;

  function playbookExpectsRedeem(playbook) {
    if (window.ScenarioDisplay?.playbookExpectsRedeem) {
      return ScenarioDisplay.playbookExpectsRedeem(playbook);
    }
    const walk = (playbook || []).find((step) => {
      const who = String(step?.who || "");
      return who === "Walk" || who === "Field";
    });
    return walk ? String(walk.do || "").toLowerCase().includes("redeem") : false;
  }

  function syncRedeemUi(run) {
    const playbook = run?.playbook || lastPlaybook.allSteps || [];
    redeemExpectedForRun = playbookExpectsRedeem(playbook);
    const block = el("redeem-phone-block");
    if (block) {
      block.hidden = !redeemExpectedForRun || isHostedConsole() || !currentRun;
    }
    const mapHint = el("map-hint");
    if (mapHint && currentRun) {
      mapHint.textContent = redeemExpectedForRun
        ? "Active run — visit the pins · tap a shop to test redeem"
        : "Active run — follow the playbook · move near the pins (no redeem)";
    }
    if (redeemExpectedForRun && run) {
      applyRedeemPhoneFromRun(run);
    } else if (el("phone-hint")) {
      el("phone-hint").textContent = "";
    }
  }

  const DEVICES_PICK_KEY = "walk_scenario_device_slots";
  const PHONE_PREP_KEY = "walk_scenario_phone_prep";
  /** Locked in every run for this env — iPad on Stage, AR14 on Prod. */
  const ALWAYS_ON_BY_ENV = {
    stage: ["merchant-ipad"],
    prod: ["ar14"],
  };

  function activeScenarioId() {
    return currentRun?.scenario_id || currentRun?.preset_id || el("preset").value;
  }

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch (_) {
      return iso.slice(0, 16);
    }
  }

  function formatRunWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (_) {
      return iso.slice(0, 16);
    }
  }

  function lastOfferRefreshIso(run) {
    return run?.seeded_at || run?.started_at || null;
  }

  function appendLastOfferRefreshNote(message, run) {
    const base = String(message || "").trim();
    const refreshIso = lastOfferRefreshIso(run);
    if (!refreshIso) return base;
    const when = formatRunWhen(refreshIso);
    if (!when || when === "—") return base;
    if (base.toLowerCase().includes("last offer refresh")) return base;
    return `${base} Last offer refresh: ${when}.`;
  }

  function formatDuration(seconds) {
    if (seconds == null) return "";
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  }

  function statusTag(row) {
    const st = row.status || "unknown";
    const out = row.outcome;
    if (st === "in_progress") return '<span class="tag progress">in progress</span>';
    if (out === "pass") return '<span class="tag pass">pass</span>';
    if (out === "fail") return '<span class="tag fail">fail</span>';
    if (out === "partial") return '<span class="tag">partial</span>';
    if (out === "aborted") return '<span class="tag aborted">aborted</span>';
    if (st === "completed") return '<span class="tag pass">done</span>';
    if (st === "abandoned") return '<span class="tag fail">abandoned</span>';
    if (st === "superseded") return '<span class="tag">superseded</span>';
    if (st === "failed") return '<span class="tag fail">seed failed</span>';
    return `<span class="tag">${st}</span>`;
  }

  function deviceNames(devices) {
    if (!devices?.length) return "—";
    return devices.map((d) => d.name || d.slot || "?").join(", ");
  }

  function selectedDevices() {
    const boxes = el("phone-rows").querySelectorAll('input[data-phone-slot]:checked');
    const slots = new Set([...boxes].map((b) => b.value));
    alwaysOnSlots().forEach((s) => slots.add(String(s)));
    return registryDevices.filter((d) => slots.has(String(d.slot)));
  }

  function alwaysOnSlots() {
    const locked = ALWAYS_ON_BY_ENV[consoleEnvSlug] || [];
    const visible = new Set(devicesForPicker().map((d) => String(d.slot)));
    return locked.filter((slot) => visible.has(String(slot)));
  }

  function devicePickStorageKey() {
    return `${DEVICES_PICK_KEY}_${consoleEnvSlug}`;
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

  function phonePrepStorageKey() {
    return `${PHONE_PREP_KEY}_${consoleEnvSlug}`;
  }

  function selectedDeviceSlotsForPrep() {
    const locked = alwaysOnSlots();
    const optional = [...el("phone-rows").querySelectorAll("input[data-phone-slot]:checked")].map(
      (b) => b.value,
    );
    return [...new Set([...locked, ...optional])];
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

  function clearPhonePrepForSlots(removedSlots) {
    const state = loadPhonePrepState();
    removedSlots.forEach((s) => delete state[s]);
    savePhonePrepState(state);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function playbookWhoLabel(who) {
    const label = String(who || "").trim();
    if (label === "Walk") return "Field";
    return label || "Step";
  }

  function deviceReachabilityForSlot(slot) {
    const rows = deviceReachabilityState?.devices || [];
    return rows.find((d) => String(d.slot) === String(slot)) || null;
  }

  function isDeviceReachable(slot) {
    if (typeof window.__hostedScenariosApi === "function") return true;
    const hit = deviceReachabilityForSlot(slot);
    if (!hit) return true;
    return hit.reachable !== false;
  }

  function phoneUnavailableHtml(slot) {
    const hit = deviceReachabilityForSlot(slot);
    if (!hit || hit.reachable !== false) return "";
    const tip = escapeHtml(hit.help || "This phone is not reachable from the Mac.");
    return `<span class="phone-unavail-wrap"><span class="phone-unavail-tag">unavailable</span><details class="phone-unavail-details"><summary>What to do</summary><div class="phone-unavail-body">${tip}</div></details></span>`;
  }

  async function loadDeviceReachabilityIfLocal() {
    if (typeof window.__hostedScenariosApi === "function") {
      deviceReachabilityState = null;
      return;
    }
    try {
      const res = await fetch("/api/device-reachability", { cache: "no-store" });
      deviceReachabilityState = await res.json();
    } catch (_) {
      deviceReachabilityState = null;
    }
  }

  async function refreshPhonePanel() {
    if (typeof window.__hostedScenariosApi === "function") return;
    await Promise.all([loadDeviceReachabilityIfLocal(), loadDeviceBuildsIfLocal()]);
    renderDevicePick();
    updateRunButtons();
  }

  function deviceBuildStatusForSlot(slot) {
    if (!deviceBuildState?.ok) return null;
    return deviceBuildState.devices.find((d) => d.slot === slot) || null;
  }

  async function loadDeviceBuildsIfLocal() {
    if (typeof window.__hostedScenariosApi === "function") return;
    try {
      const res = await fetch("/api/device-builds", { cache: "no-store" });
      deviceBuildState = await res.json();
    } catch (_) {
      deviceBuildState = null;
    }
  }

  function phonePrepStatusHtml(slot) {
    const hit = deviceBuildStatusForSlot(slot);
    if (!hit?.configured) return "";
    if (hit.check_failed) {
      return `<span class="phone-warn">Couldn't check app — unlock phone and keep USB connected</span>`;
    }
    if (hit.missing) {
      return `<span class="phone-warn">App not on device — Run will install it</span>`;
    }
    if (hit.behind) {
      return `<span class="phone-warn">Out of date</span>`;
    }
    return `<span class="phone-ok">Up to date (${hit.installed})</span>`;
  }

  function setPhonePrep(slot, ready) {
    const st = loadPhonePrepState();
    if (ready) st[slot] = true;
    else delete st[slot];
    savePhonePrepState(st);
  }

  function renderPhoneRows() {
    const box = el("phone-rows");
    const hint = el("phones-hint");
    if (!box) return;
    if (currentRun) return;
    const visible = devicesForPicker();
    if (!registryDevices.length) {
      box.innerHTML = `<p class="hint mb-0">No devices.json</p>`;
      return;
    }
    if (!visible.length) {
      box.innerHTML = `<p class="hint mb-0">No phones for ${consoleEnvLabel}.</p>`;
      return;
    }
    const locked = new Set(alwaysOnSlots());
    const saved = new Set(
      savedOptionalDeviceSlots().filter((slot) => isDeviceReachable(slot)),
    );
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
        if (isLocked) {
          return `<label class="phone-row phone-row-locked${reachable ? "" : " phone-row-unavail"}"><input type="checkbox" checked disabled aria-label="${d.name} always in run" /><span>${d.name} <span class="phone-locked-tag">· always in run</span>${unavail}${warn ? `<br />${warn}` : ""}</span></label>`;
        }
        const checked = reachable && saved.has(slot) ? " checked" : "";
        const disabled = reachable ? "" : " disabled";
        const rowClass = reachable ? "phone-row" : "phone-row phone-row-unavail";
        return `<label class="${rowClass}"><input type="checkbox" data-phone-slot="${slot}" value="${slot}"${checked}${disabled} /><span>${d.name}${unavail}${warn ? `<br />${warn}` : ""}</span></label>`;
      })
      .join("");
    if (hint) {
      hint.hidden = false;
    }
    box.querySelectorAll("input[data-phone-slot]").forEach((inp) => {
      inp.onchange = () => {
        if (inp.disabled) return;
        persistOptionalDevicePick();
        setPhonePrep(inp.value, inp.checked);
        syncRunDevices();
        updateRunButtons();
      };
    });
    box.querySelectorAll(".phone-unavail-details").forEach((details) => {
      details.addEventListener("click", (e) => e.stopPropagation());
    });
    // Sync prep checkboxes for optional phones already ticked
    box.querySelectorAll("input[data-phone-slot]:checked").forEach((inp) => {
      setPhonePrep(inp.value, true);
    });
  }

  function phonesReadyForRun() {
    const selected = selectedDevices();
    if (!selected.length) {
      return { ok: false, reason: "Tick at least one phone." };
    }
    const blocked = selected.filter((d) => !isDeviceReachable(String(d.slot)));
    if (blocked.length) {
      const names = blocked.map((d) => d.name || d.slot).join(", ");
      return {
        ok: false,
        reason: `${names} unavailable — tap What to do on the phone row for fixes.`,
      };
    }
    return { ok: true };
  }

  function devicesForPicker() {
    return registryDevices.filter(
      (d) => (d.backend_env || "stage") === consoleEnvSlug,
    );
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
    if (!currentRun?.run_id) return;
    try {
      const data = await api(`/api/scenarios/run/${currentRun.run_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devices: selectedDevices() }),
      });
      currentRun = data.run;
    } catch (_) {
      /* ignore — run may have been removed */
    }
  }

  function historyRowsForEnv(rows) {
    return (rows || []).filter(
      (r) => String(r.console_env || "stage").toLowerCase() === consoleEnvSlug,
    );
  }

  function updateRunHistoryHeading() {
    el("run-history-heading").textContent = `Run log — ${consoleEnvLabel}`;
  }

  async function loadRunHistory() {
    const empty = el("run-history-empty");
    const table = el("run-history-table");
    const body = el("run-history-body");
    updateRunHistoryHeading();
    body.innerHTML = "";
    table.hidden = true;
    try {
      const data = await api("/api/scenarios/history");
      const rows = historyRowsForEnv(data.history || data.runs || []);
      if (!rows.length) {
        empty.hidden = false;
        empty.textContent = `No runs on ${consoleEnvLabel} yet.`;
        return;
      }
      empty.hidden = true;
      table.hidden = false;
      body.innerHTML = rows
        .slice(0, 25)
        .map((r) => {
          const dur = formatDuration(r.duration_seconds);
          const when = `${formatWhen(r.started_at)}${dur ? ` · ${dur}` : ""}`;
          const label = r.scenario_label || r.scenario_id || "—";
          const rid = r.run_id || "";
          const canDelete =
            r.status !== "in_progress" && rid && rid !== currentRun?.run_id;
          const delBtn = canDelete
            ? `<button type="button" class="run-del" data-run-id="${rid}" title="Remove from log">Remove</button>`
            : "";
          return `<tr>
            <td>${when}<br /><span class="hint">${r.short_id || rid.slice(0, 8)}</span></td>
            <td>${label}</td>
            <td>${deviceNames(r.devices)}</td>
            <td>${statusTag(r)}${delBtn}</td>
          </tr>`;
        })
        .join("");
      body.querySelectorAll(".run-del").forEach((btn) => {
        btn.onclick = () => deleteHistoryRun(btn.dataset.runId);
      });
    } catch (e) {
      empty.hidden = false;
      empty.textContent = `Could not load run log for ${consoleEnvLabel}.`;
      setStatus(String(e.message || e), false);
    }
  }

  async function deleteHistoryRun(runId) {
    if (!runId || !canControlRuns()) return;
    if (!confirm("Remove this run from the log? (Archived copy in cloud storage is deleted.)")) return;
    try {
      await api("/api/scenarios/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, delete_log_only: true }),
      });
      setStatus("Run removed from log.", true);
      await loadRunHistory();
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes("404")) {
        setStatus("Remove failed — restart Dev Console (server.py) and try again.", false);
      } else {
        setStatus(msg, false);
      }
    }
  }

  function cleanupHintText(run) {
    if (run?.cleanup_when) return `When to remove: ${run.cleanup_when}`;
    const p = scenarioList.find((x) => x.id === (run?.scenario_id || run?.preset_id || el("preset").value));
    if (p?.cleanupWhen) return `When to remove: ${p.cleanupWhen}`;
    return "When to remove: after field log check PASS (see playbook last step).";
  }

  function updateCleanupHint(run) {
    el("cleanup-hint").textContent = currentRun
      ? cleanupHintText(currentRun)
      : cleanupHintText(null);
  }

  function syncPresetFromRun(run) {
    if (!run) return;
    const id = run.scenario_id || run.preset_id;
    if (!id) return;
    const match = scenarioList.find((s) => s.id === id);
    const catSel = el("category");
    const presetSel = el("preset");
    if (!match || !catSel || !presetSel) return;
    catSel.value = match.category || "intent";
    presetSel.innerHTML = "";
    scenarioList
      .filter((p) => (p.category || "intent") === catSel.value)
      .forEach((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.label;
        presetSel.appendChild(o);
      });
    presetSel.value = id;
    syncScenarioUi(match);
  }

  function playbookStepStatus(step, prog) {
    if (manualDoneSteps[String(step.step)]) return "pass";
    return prog?.status || (step.verify === "manual" ? "manual" : "pending");
  }

  function visiblePlaybookSteps(steps) {
    const list = steps || [];
    if (
      isHostedConsole() &&
      currentRun &&
      window.ScenarioDisplay?.filterPlaybookForHosted
    ) {
      return ScenarioDisplay.filterPlaybookForHosted(list, true);
    }
    return list;
  }

  function updatePlaybookHeading() {
    const heading = el("playbook-heading");
    if (!heading) return;
    if (!currentRun) {
      heading.textContent = "What to do";
      return;
    }
    const steps = lastPlaybook.steps;
    const byStep = Object.fromEntries(
      (playbookProgress || []).map((p) => [String(p.step), p])
    );
    const passed = steps.filter((s) => playbookStepStatus(s, byStep[String(s.step)]) === "pass").length;
    const failed = steps.filter((s) => playbookStepStatus(s, byStep[String(s.step)]) === "fail").length;
    const hosted = isHostedConsole();
    let line = hosted
      ? `Your steps — ${passed} of ${steps.length} done`
      : `Progress — ${passed} of ${steps.length} done`;
    if (failed) line += ` · ${failed} need attention`;
    heading.textContent = line;
  }

  function updateRunUiMode() {
    applyConsoleModeBanner();
    const active = !!currentRun;
    const hosted = isHostedConsole();
    const picker = el("scenario-picker-block");
    const setup = el("scenario-setup-block");
    const banner = el("scenario-active-banner");
    const actions = el("scenario-run-actions");
    const history = el("run-history");
    const categorySel = el("category");
    const presetSel = el("preset");
    const playbook = el("playbook-preview");
    const idleHint = el("hosted-idle-hint");

    if (hosted && !active) {
      if (picker) picker.hidden = true;
      if (setup) setup.hidden = true;
      if (actions) actions.hidden = true;
      if (playbook) playbook.hidden = true;
      if (banner) banner.hidden = true;
      if (history) history.hidden = false;
      if (idleHint) idleHint.hidden = false;
    } else {
      if (idleHint) idleHint.hidden = true;
      if (picker) picker.hidden = active;
      if (setup) setup.hidden = active;
      if (actions) actions.hidden = !active;
      if (banner) banner.hidden = !active;
      if (history) history.hidden = active;
      if (playbook) playbook.hidden = active ? !lastPlaybook.allSteps.length : false;
    }

    const phoneRows = el("phone-rows");
    if (phoneRows) phoneRows.hidden = active;
    const phonesHint = el("phones-hint");
    if (phonesHint) phonesHint.hidden = active;

    const runBtn = el("btn-run");
    const cleanupBtn = el("btn-cleanup");
    const refreshSeedBtn = el("btn-refresh-seed");
    const abandonBtn = el("btn-abandon");
    if (runBtn) runBtn.hidden = false;
    if (cleanupBtn) cleanupBtn.hidden = false;
    if (refreshSeedBtn) refreshSeedBtn.hidden = !active;
    if (abandonBtn) abandonBtn.hidden = !active;
    syncRedeemUi(currentRun);
    el("btn-gps")?.toggleAttribute("disabled", active);

    if (categorySel) categorySel.disabled = active || isSeeding;
    if (presetSel) presetSel.disabled = active || isSeeding;

    if (active && banner) {
      const label =
        currentRun.scenario_label ||
        currentRun.preset_label ||
        currentRun.scenario_id ||
        "Scenario";
      el("active-run-title").textContent = label;
      const centre = currentRun.center
        ? `${currentRun.center.lat.toFixed(5)}, ${currentRun.center.lng.toFixed(5)}`
        : "—";
      const devices = deviceNames(currentRun.devices);
      el("active-run-meta").innerHTML =
        `<span class="run-id">${currentRun.short_id || (currentRun.run_id || "").slice(0, 8)}</span>` +
        ` · ${consoleEnvLabel} · ${devices}<br />` +
        `Started <strong>${formatRunWhen(currentRun.started_at)}</strong><br />` +
        `Phone field log should show run <strong>${currentRun.short_id || (currentRun.run_id || "").slice(0, 8)}</strong>` +
        `<br />After fresh install: verify <strong>App id</strong> on phone matches <code>shared/devices.json</code>` +
        `<br />Centre ${centre} · ${currentRun.radius_m || radiusM} m` +
        `<br />Last offer refresh: <strong>${formatRunWhen(lastOfferRefreshIso(currentRun))}</strong>`;
    }

    const mapHint = el("map-hint");
    if (mapHint) {
      if (active) {
        mapHint.textContent = redeemExpectedForRun
          ? "Active run — visit the pins · tap a shop to test redeem"
          : "Active run — follow the playbook · move near the pins (no redeem)";
      } else {
        mapHint.textContent = "Pan anywhere · click map to set centre pin";
      }
    }

    updatePlaybookHeading();
    requestAnimationFrame(() => refreshMapSize());
  }

  function updateRunButtons() {
    const runBtn = el("btn-run");
    const cleanupBtn = el("btn-cleanup");
    const refreshSeedBtn = el("btn-refresh-seed");
    const abandonBtn = el("btn-abandon");
    const hint = el("run-hint");
    const env = consoleEnvLabel || "STAGE";
    if (!canControlRuns()) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = currentRun
          ? "Follow the playbook and check logs. Finish the run on your Mac when done."
          : "No active run — open Mac Dev Console → Scenarios to start one.";
      }
      updateRunUiMode();
      return;
    }
    if (isSeeding) {
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = `Resetting phones…`;
        runBtn.classList.add("loading");
      }
      cleanupBtn.disabled = true;
      if (refreshSeedBtn) refreshSeedBtn.disabled = true;
      if (abandonBtn) abandonBtn.disabled = true;
      if (hint) hint.hidden = true;
      return;
    } else {
      if (runBtn) runBtn.classList.remove("loading");
    }
    clearRunProgress();
    runBtn.textContent = currentRun
      ? "Finish current run first"
      : `Run scenario on ${env}`;
    runBtn.disabled = !hasCenter || !!currentRun || !phonesReadyForRun().ok;
    cleanupBtn.disabled = !currentRun;
    if (refreshSeedBtn) {
      refreshSeedBtn.hidden = !currentRun;
      refreshSeedBtn.disabled = !currentRun;
    }
    if (abandonBtn) {
      abandonBtn.hidden = !currentRun;
      abandonBtn.disabled = !currentRun;
    }
    const presetSel = el("preset");
    const p = scenarioList.find((x) => x.id === presetSel?.value);
    const isMultiarea = !!(p && p.seed && p.seed.multiarea);

    if (!hasCenter) {
      hint.hidden = false;
      hint.textContent = isMultiarea
        ? "Select commute zones (1-4) on map first — then Run scenario."
        : "Set centre pin first — then Run scenario.";
    } else if (currentRun) {
      hint.hidden = false;
      hint.textContent =
        `Run ${currentRun.short_id} is live. Follow the playbook, then Finish & remove (or Abandon). You cannot start another until this one is closed.`;
    } else {
      hint.hidden = false;
      const prep = phonesReadyForRun();
      hint.textContent = prep.ok
        ? (isMultiarea
          ? `Ready — confirm the commute zones on the map, then Run (fresh-install + seed on ${env}).`
          : `Ready — confirm the orange circle on the map, then Run (fresh-install + seed on ${env}).`)
        : prep.reason;
    }
    updateRunUiMode();
  }

  function setRunProgress(msg, title) {
    const box = el("run-progress");
    const text = el("run-progress-text");
    const heading = el("run-progress-title");
    if (box) box.hidden = false;
    if (heading) heading.textContent = title || "Resetting phones…";
    if (text) text.textContent = msg;
  }

  function clearRunProgress() {
    const box = el("run-progress");
    if (box) box.hidden = true;
  }

  function formatRunSummary(run, radiusM) {
    const title = `Run ${run.short_id} — ${run.scenario_label || run.preset_label}`;
    const seed =
      run.seed_line || `${run.shop_count} merchants, ${run.offer_count || "?"} offers`;
    const centre = run.center
      ? `${run.center.lat.toFixed(5)}, ${run.center.lng.toFixed(5)}`
      : "—";
    const bullets = [
      `• Started: ${formatRunWhen(run.started_at)}`,
      `• Seed: ${seed}`,
      `• Last offer refresh: ${formatRunWhen(lastOfferRefreshIso(run))}`,
      `• Centre: ${centre}`,
      `• Radius: ${radiusM} m`,
    ];
    if (run.summary) bullets.push(`• Summary: ${run.summary}`);
    if (run.purpose && run.purpose !== run.summary) {
      bullets.push(`• Goal: ${run.purpose}`);
    }
    if (run.multi_day) {
      bullets.push("• Multi-day: do NOT cleanup until playbook finished.");
    }
    const ids = (run.acceptance_ids || []).filter(Boolean).join(", ");
    if (ids) bullets.push(`• IDs: ${ids}`);
    return `${title}\n\n${bullets.join("\n")}`;
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

  async function api(path, opts) {
    opts = opts || {};
    const method = (opts.method || "GET").toUpperCase();
    if (method === "GET" && opts.cache == null) {
      opts = { ...opts, cache: "no-store" };
    }
    if (typeof window.__hostedScenariosApi === "function") {
      return window.__hostedScenariosApi(path, opts);
    }
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  const LEAFLET_IMAGES = "https://unpkg.com/leaflet@1.9.4/dist/images/";
  const centrePinIcon = L.divIcon({
    className: "center-pin",
    html: '<div class="center-pin-dot"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  const shopPinIcon = L.icon({
    iconUrl: `${LEAFLET_IMAGES}marker-icon.png`,
    iconRetrievalUrl: `${LEAFLET_IMAGES}marker-icon-2x.png`,
    shadowUrl: `${LEAFLET_IMAGES}marker-shadow.png`,
    iconSize: [28, 46],
    iconAnchor: [14, 46],
    popupAnchor: [1, -40],
    shadowSize: [46, 46],
    shadowAnchor: [14, 46],
  });

  const MAP_MIN_ZOOM = 2;

  function refreshMapSize() {
    if (!map) return;
    map.invalidateSize({ pan: false });
  }

  function resetMapContainer() {
    const old = document.getElementById("map");
    if (!old) return null;
    const fresh = document.createElement("div");
    fresh.id = "map";
    old.replaceWith(fresh);
    return fresh;
  }

  let mapResizeHooked = false;
  let lastCenterPlaceMs = 0;

  function initMap() {
    if (map) return;

    const container = document.getElementById("map");
    if (!container) return;
    if (container._leaflet_id != null) {
      resetMapContainer();
    }

    map = L.map("map", {
      tapTolerance: 15,
      minZoom: MAP_MIN_ZOOM,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      minZoom: MAP_MIN_ZOOM,
      maxZoom: 19,
    }).addTo(map);

    map.setView([51.5074, -0.2214], 13);

    if (!mapResizeHooked) {
      mapResizeHooked = true;
      window.addEventListener("resize", refreshMapSize);
    }

    map.on("click", (e) => {
      if (!canPlaceCenterPin()) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (placeCenterAt(e.latlng.lat, e.latlng.lng)) {
        setStatus("Centre pin set.", true);
      }
    });

    setupMapCenterInput();

    if (location.hostname === "127.0.0.1" && location.port === "8765") {
      window.__hoiboWalkMap = map;
    }
  }

  function ensureMapReady() {
    initMap();
    refreshMapSize();
    requestAnimationFrame(() => refreshMapSize());
  }

  function latLngFromPointerEvent(ev) {
    const px = map.mouseEventToContainerPoint(ev);
    return map.containerPointToLatLng(px);
  }

  function placeCenterAt(lat, lng) {
    if (!canPlaceCenterPin()) return false;
    const now = Date.now();
    if (now - lastCenterPlaceMs < 80) return false;
    lastCenterPlaceMs = now;

    const presetSel = el("preset");
    const p = scenarioList.find((x) => x.id === presetSel.value);
    const isMultiarea = !!(p && p.seed && p.seed.multiarea);

    if (isMultiarea) {
      if (draftZones.length >= 4) {
        setStatus("Max 4 commute zones allowed.", false);
        return false;
      }
      const marker = L.marker([lat, lng], {
        icon: centrePinIcon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map);

      const circle = L.circle([lat, lng], {
        radius: radiusM,
        color: "#f59207",
        weight: 2,
        fillColor: "#f59207",
        fillOpacity: 0.08,
        dashArray: "6 4",
        interactive: false,
      }).addTo(map);

      draftZones.push({ lat, lng, marker, circle });
      updateDraftZonesUi();
      setStatus("Commute zone added.", true);
      return true;
    } else {
      setCenter(lat, lng, { pan: false });
      return true;
    }
  }

  function setupMapCenterInput() {
    const container = document.getElementById("map");
    if (!container || container.dataset.centerInputHooked === "1") return;
    container.dataset.centerInputHooked = "1";

    let pointerDown = null;
    let longPressTimer = null;
    const TAP_MOVE_PX = 12;

    const clearLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const finishTouchTap = (t, fromLongPress = false) => {
      if (!pointerDown) return;
      const down = pointerDown;
      pointerDown = null;
      clearLongPress();
      if (!canPlaceCenterPin()) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (!fromLongPress && Math.hypot(t.clientX - down.x, t.clientY - down.y) > TAP_MOVE_PX) return;
      const latlng = latLngFromPointerEvent(t);
      if (placeCenterAt(latlng.lat, latlng.lng)) {
        setStatus(fromLongPress ? "Centre pin set (long-press)." : "Centre pin set.", true);
      }
    };

    const startPointer = (ev) => {
      if (!canPlaceCenterPin()) return;
      const latlng = latLngFromPointerEvent(ev);
      pointerDown = { x: ev.clientX, y: ev.clientY, lat: latlng.lat, lng: latlng.lng };
      clearLongPress();
      if (ev.pointerType !== "touch") return;
      longPressTimer = setTimeout(() => {
        if (!pointerDown || !canPlaceCenterPin()) return;
        suppressNextClick = true;
        if (placeCenterAt(pointerDown.lat, pointerDown.lng)) {
          setStatus("Centre pin set (long-press).", true);
        }
        pointerDown = null;
        clearLongPress();
      }, 480);
    };

    const movePointer = (ev) => {
      if (!pointerDown) return;
      if (Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y) > TAP_MOVE_PX) {
        pointerDown = null;
        clearLongPress();
      }
    };

    const endPointer = (ev) => {
      if (!pointerDown) return;
      if (ev.pointerType === "touch") {
        finishTouchTap(
          { clientX: ev.clientX, clientY: ev.clientY },
          false,
        );
        return;
      }
      pointerDown = null;
      clearLongPress();
    };

    container.addEventListener("pointerdown", startPointer);
    container.addEventListener("pointermove", movePointer);
    container.addEventListener("pointerup", endPointer);
    container.addEventListener("pointercancel", () => {
      pointerDown = null;
      clearLongPress();
    });
  }

  function clearDraftMapOverlays() {
    if (centerMarker) {
      map.removeLayer(centerMarker);
      centerMarker = null;
    }
    if (radiusCircle) {
      map.removeLayer(radiusCircle);
      radiusCircle = null;
    }
    hasCenter = false;
    if (el("lat")) el("lat").value = "";
    if (el("lng")) el("lng").value = "";
    clearDraftZones();
  }

  function clearDraftZones() {
    draftZones.forEach((z) => {
      if (z.marker) map.removeLayer(z.marker);
      if (z.circle) map.removeLayer(z.circle);
    });
    draftZones = [];
    updateDraftZonesUi();
  }

  function clearRunZoneOverlays() {
    runZoneOverlays.forEach((ol) => map.removeLayer(ol));
    runZoneOverlays = [];
  }

  function updateDraftZonesUi() {
    const list = el("multiarea-zones-list");
    const clearBtn = el("btn-clear-zones");
    if (!list) return;
    list.innerHTML = "";
    
    const zonesSource = currentRun && currentRun.zones ? currentRun.zones : draftZones;
    const isEditing = !currentRun;
    
    if (zonesSource.length === 0) {
      list.innerHTML = "<li>No zones selected. Click the map to add a zone.</li>";
      if (clearBtn) clearBtn.style.display = "none";
      hasCenter = false;
    } else {
      zonesSource.forEach((z, i) => {
        const li = document.createElement("li");
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        
        const span = document.createElement("span");
        span.textContent = `Zone ${i + 1}: ${z.lat.toFixed(5)}, ${z.lng.toFixed(5)}`;
        
        li.appendChild(span);
        
        if (isEditing) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-link btn-xs text-danger";
          btn.style.padding = "0";
          btn.style.width = "auto";
          btn.textContent = "Remove";
          btn.onclick = (e) => {
            e.stopPropagation();
            removeDraftZoneAt(i);
          };
          li.appendChild(btn);
        }
        
        list.appendChild(li);
      });
      if (clearBtn) clearBtn.style.display = isEditing ? "block" : "none";
      hasCenter = true;
    }
    updateRunButtons();
  }

  function removeDraftZoneAt(index) {
    const z = draftZones[index];
    if (z) {
      if (z.marker) map.removeLayer(z.marker);
      if (z.circle) map.removeLayer(z.circle);
    }
    draftZones.splice(index, 1);
    updateDraftZonesUi();
  }

  function syncScenarioUi(p) {
    const isMultiarea = !!(p && p.seed && p.seed.multiarea);
    const coordsRow = el("coords-row");
    const multiareaBlock = el("multiarea-zones-block");
    if (isMultiarea) {
      if (coordsRow) coordsRow.hidden = true;
      if (multiareaBlock) multiareaBlock.hidden = false;
      if (centerMarker) {
        map.removeLayer(centerMarker);
        centerMarker = null;
      }
      if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
      }
      hasCenter = draftZones.length > 0;
      updateDraftZonesUi();
    } else {
      if (coordsRow) coordsRow.hidden = false;
      if (multiareaBlock) multiareaBlock.hidden = true;
      clearDraftZones();
      const savedCenter = localStorage.getItem(CENTER_KEY);
      if (savedCenter) {
        try {
          const { lat, lng } = JSON.parse(savedCenter);
          setCenter(lat, lng, { skipPersist: true });
        } catch (e) {
          console.error("Error parsing saved center", e);
        }
      }
    }
  }

  function resetMapViewDefault() {
    clearDraftMapOverlays();
    map.setView([51.5074, -0.2214], 13);
  }

  function scenarioRadiusM(p) {
    if (p && p.radiusM != null && !Number.isNaN(Number(p.radiusM))) {
      return Number(p.radiusM);
    }
    return catalog.defaultRadiusM || 800;
  }

  function applyScenarioRadius(p) {
    radiusM = scenarioRadiusM(p);
    el("map-hint").textContent = `${radiusM} m shop radius · console → ${consoleEnvLabel}`;
    if (!hasCenter || !map) return;
    const lat = parseFloat(el("lat").value);
    const lng = parseFloat(el("lng").value);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    drawRadiusCircle(lat, lng);
    map.fitBounds(radiusCircle.getBounds(), { padding: [32, 32], maxZoom: 15 });
  }

  function drawRadiusCircle(lat, lng) {
    if (radiusCircle) map.removeLayer(radiusCircle);
    radiusCircle = L.circle([lat, lng], {
      radius: radiusM,
      color: "#f59207",
      weight: 2,
      fillColor: "#f59207",
      fillOpacity: 0.08,
      dashArray: "6 4",
      interactive: false,
    }).addTo(map);
  }

  function setCenter(lat, lng, opts = {}) {
    if (!map) return;
    hasCenter = true;
    el("lat").value = lat.toFixed(6);
    el("lng").value = lng.toFixed(6);
    if (!opts.skipPersist) {
      localStorage.setItem(CENTER_KEY, JSON.stringify({ lat, lng }));
    }
    updateRunButtons();

    if (centerMarker) map.removeLayer(centerMarker);
    centerMarker = L.marker([lat, lng], {
      icon: centrePinIcon,
      zIndexOffset: 1000,
      interactive: false,
    }).addTo(map);

    drawRadiusCircle(lat, lng);

    if (opts.pan !== false) map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }

  function clearShopMarkers() {
    shopMarkers.forEach((m) => map.removeLayer(m));
    shopMarkers = [];
    clearRunZoneOverlays();
  }

  function showRun(run) {
    const runEnv = String(run?.console_env || consoleEnvSlug).toLowerCase();
    if (runEnv !== consoleEnvSlug) {
      setStatus(
        `That run is on ${runEnv.toUpperCase()} — switch console to ${runEnv.toUpperCase()} to load it.`,
        false,
      );
      return;
    }
    currentRun = run;
    redeemExpectedForRun = playbookExpectsRedeem(run.playbook || []);
    syncPresetFromRun(run);
    clearShopMarkers();

    const r = run.radius_m || radiusM;
    const bounds = [];

    if (run.zones && run.zones.length > 0) {
      if (centerMarker) {
        map.removeLayer(centerMarker);
        centerMarker = null;
      }
      if (radiusCircle) {
        map.removeLayer(radiusCircle);
        radiusCircle = null;
      }
      run.zones.forEach((z) => {
        const marker = L.marker([z.lat, z.lng], {
          icon: centrePinIcon,
          zIndexOffset: 1000,
          interactive: false,
        }).addTo(map);

        const circle = L.circle([z.lat, z.lng], {
          radius: r,
          color: "#f59207",
          weight: 2,
          fillColor: "#f59207",
          fillOpacity: 0.08,
          dashArray: "6 4",
          interactive: false,
        }).addTo(map);

        runZoneOverlays.push(marker);
        runZoneOverlays.push(circle);
        bounds.push([z.lat, z.lng]);
      });
      updateDraftZonesUi();
    } else if (run.center) {
      radiusM = r;
      setCenter(run.center.lat, run.center.lng, { pan: false });
      drawRadiusCircle(run.center.lat, run.center.lng);
      bounds.push([run.center.lat, run.center.lng]);
    }

    const list = el("shop-list");
    list.innerHTML = ""; // Empty sidebar list since redeem elements are now in the map popup

    run.shops.forEach((shop, shopIndex) => {
      const popupOpts = {
        redeemExpected: redeemExpectedForRun,
        run,
      };
      const buildPopup = () =>
        window.ScenarioDisplay.formatShopPopupHtml(shop, shopIndex, popupOpts);

      const m = L.marker([shop.lat, shop.lng], { icon: shopPinIcon }).addTo(map)
        .bindPopup(buildPopup());
      m.on("popupopen", () => m.setPopupContent(buildPopup()));

      shopMarkers.push(m);
      bounds.push([shop.lat, shop.lng]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      refreshMapSize();
    }

    syncRedeemUi(run);

    renderPlaybook(run.playbook || [], run.field_log_expect || [], run.multi_day);
    syncRedeemUi(run);
    setStatus(formatRunSummary(run, r), true);
    updateRunButtons();
    updateCleanupHint(run);
    applyRunDevicesToPick(run.devices);
    refreshPlaybookStatus();
  }

  function stepMark(status) {
    if (status === "pass") return '<span class="step-mark step-pass">✓</span>';
    if (status === "fail") return '<span class="step-mark step-fail">✗</span>';
    if (status === "pending") return '<span class="step-mark step-pending">○</span>';
    return '<span class="step-mark step-manual">·</span>';
  }

  async function refreshPlaybookStatus() {
    const steps = lastPlaybook.steps;
    if (!steps.length) return;
    try {
      const body = {
        scenario_id: activeScenarioId(),
        run_id: currentRun?.run_id,
        run_active: !!currentRun,
      };
      const data = await api("/api/scenarios/playbook-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      playbookProgress = data.playbookSteps || [];
      paintPlaybookList();
    } catch (_) { /* keep last marks */ }
  }

  function paintPlaybookList() {
    const container = el("playbook-steps");
    const steps = lastPlaybook.steps;
    const byStep = Object.fromEntries(
      (playbookProgress || []).map((p) => [String(p.step), p])
    );
    container.innerHTML = "";
    const groups = window.ScenarioDisplay?.groupPlaybookBySection
      ? ScenarioDisplay.groupPlaybookBySection(steps)
      : [{ id: "all", label: "", steps }];
    groups.forEach((group) => {
      const block = document.createElement("div");
      block.className = group.id === "all"
        ? "playbook-section"
        : `playbook-section playbook-section-${group.id}`;
      if (group.label) {
        const head = document.createElement("div");
        head.className = "playbook-section-head";
        head.textContent = group.label;
        block.appendChild(head);
        if (group.id === "setup" && canControlRuns() && !currentRun) {
          const intro = document.createElement("p");
          intro.className = "hint playbook-setup-intro";
          intro.textContent = "On this Mac — use Scenario centre and Phones below.";
          block.appendChild(intro);
        }
      }
      const ol = document.createElement("ol");
      group.steps.forEach((s) => {
        const li = document.createElement("li");
        const prog = byStep[String(s.step)];
        const status = playbookStepStatus(s, prog);
        const mark = stepMark(status);
        const detail =
          prog?.detail && status !== "pass" && s.verify !== "manual"
            ? `<span class="step-detail">${escapeHtml(prog.detail)}</span>`
            : "";
        const doHtml = window.ScenarioDisplay?.formatPlaybookStepHtml
          ? ScenarioDisplay.formatPlaybookStepHtml(s.do)
          : escapeHtml(s.do || "");
        const doBlock = doHtml.includes("step-do-list")
          ? `<span class="step-body"><span class="who">${escapeHtml(playbookWhoLabel(s.who))}</span>${doHtml}${detail}</span>`
          : `<span class="step-body"><span class="who">${escapeHtml(playbookWhoLabel(s.who))}</span> — ${doHtml}${detail}</span>`;
        li.innerHTML = `${mark}${doBlock}`;
        if (status === "manual") {
          li.classList.add("playbook-tap-done");
          li.title = "Tap when you have done this step";
          li.addEventListener("click", () => {
            manualDoneSteps[String(s.step)] = true;
            paintPlaybookList();
          });
        }
        ol.appendChild(li);
      });
      block.appendChild(ol);
      container.appendChild(block);
    });
    updatePlaybookHeading();
  }

  function summaryAddsInfo(purpose, summary) {
    const p = String(purpose || "").trim().toLowerCase();
    const s = String(summary || "").trim().toLowerCase();
    if (!s) return false;
    if (!p) return true;
    if (p === s) return false;
    if (p.includes(s) || s.includes(p)) return false;
    return true;
  }

  function acceptanceIdsNotInLabel(p) {
    const label = String(p?.label || "");
    return (p?.acceptanceIds || []).filter((id) => id && !label.includes(id));
  }

  function renderScenarioBlurb(p) {
    const purposeEl = el("preset-purpose");
    const descEl = el("preset-desc");
    const traceEl = el("preset-trace");
    const purpose = (p.purpose || "").trim();
    const summary = (p.summary || "").trim();
    if (purposeEl) {
      purposeEl.textContent = purpose;
      purposeEl.hidden = !purpose;
    }
    if (descEl) {
      const showSummary = summaryAddsInfo(purpose, summary);
      descEl.textContent = showSummary ? summary : "";
      descEl.hidden = !showSummary;
    }
    const extraIds = acceptanceIdsNotInLabel(p);
    if (traceEl) {
      traceEl.textContent = extraIds.length ? `Test ID: ${extraIds.join(", ")}` : "";
      traceEl.hidden = !extraIds.length;
    }
  }

  function renderPlaybook(steps, expects, multiDay) {
    const box = el("playbook-preview");
    const expectBox = el("playbook-expect");
    const expectList = el("playbook-expect-list");
    const allSteps = steps || [];
    lastPlaybook = {
      steps: visiblePlaybookSteps(allSteps),
      allSteps,
      expects: expects || [],
      multiDay: !!multiDay,
    };
    if (!allSteps.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    paintPlaybookList();
    if (expects && expects.length) {
      expectBox.hidden = false;
      expectList.innerHTML = "";
      expects.forEach((e) => {
        const li = document.createElement("li");
        li.textContent = e;
        expectList.appendChild(li);
      });
    } else {
      expectBox.hidden = true;
    }
  }

  function isHostedConsole() {
    return typeof window.__hostedScenariosApi === "function";
  }

  function canControlRuns() {
    return true;
  }

  /** Drop or move the walk centre pin before a run starts. */
  function canPlaceCenterPin() {
    return canControlRuns() && !currentRun;
  }

  function applyConsoleModeBanner() {
    const banner = el("view-only-banner");
    if (!banner) return;
    if (canControlRuns()) {
      banner.hidden = true;
      return;
    }
    banner.hidden = true;
  }

  function normalizePhone(p) {
    return {
      ...p,
      app_id: p.app_id || (String(p.customer_app_id || "").trim() || null),
      backend_env: p.backend_env || "stage",
    };
  }

  function phonesForConsoleEnv(phones) {
    return (phones || [])
      .map(normalizePhone)
      .filter((p) => p.backend_env === consoleEnvSlug);
  }

  function runCustomerPhones(run) {
    const slots = new Set((run?.devices || []).map((d) => String(d.slot)));
    return phonesForConsoleEnv(customerPhones).filter((p) => slots.has(String(p.slot)));
  }

  function setRedeemPhonePickerVisible(visible) {
    const picker = el("redeem-phone-picker");
    if (picker) picker.hidden = !visible;
  }

  function applyRedeemPhoneFromRun(run) {
    const sel = el("phone");
    if (!sel) return;
    const fromRun = runCustomerPhones(run);
    const pool = fromRun.length ? fromRun : phonesForConsoleEnv(customerPhones);
    if (!pool.length) {
      setRedeemPhonePickerVisible(true);
      updatePhoneHint();
      return;
    }
    const saved = localStorage.getItem(PHONE_SLOT_KEY);
    const pick =
      (saved && pool.some((p) => p.slot === saved) && saved) ||
      pool.find((p) => p.app_id)?.slot ||
      pool[0].slot;
    sel.value = pick;
    localStorage.setItem(PHONE_SLOT_KEY, pick);
    if (fromRun.length === 1) {
      setRedeemPhonePickerVisible(false);
    } else {
      setRedeemPhonePickerVisible(pool.length > 1);
    }
    updatePhoneHint(fromRun.length === 1 ? pool[0] : null);
  }

  function selectedPhone() {
    const slot = el("phone").value;
    return customerPhones.find((p) => p.slot === slot) || null;
  }

  function resolveAppId(phone) {
    return phone?.app_id || null;
  }

  function devicesShVar(slot) {
    return slot === "user" ? "HOIBO_USER_APP_ID" : "HOIBO_USER2_APP_ID";
  }

  function updatePhoneHint(fixedPhone) {
    const phone = fixedPhone || selectedPhone();
    if (!phone) return;
    const appId = resolveAppId(phone);
    if (appId) {
      el("phone-hint").textContent =
        `${phone.name} — open that offer’s QR on the phone, then tap Redeem on the map pin.`;
      return;
    }
    if (isHostedConsole()) {
      el("phone-hint").textContent =
        `${phone.name} needs customer_app_id in Hoibo Admin devices.json, then rebuild GitHub Pages (build-walk-pages.sh). Copy app id from Deal alert test log on the phone.`;
      return;
    }
    el("phone-hint").textContent =
      `${phone.name} not linked yet. Copy app id from Deal alert test log on the phone → set ${devicesShVar(phone.slot)} in ${DEVICES_SH} → restart dev console.`;
  }

  function fillPhones(phones) {
    customerPhones = phones.map(normalizePhone);
    const visible = phonesForConsoleEnv(customerPhones);
    const sel = el("phone");
    sel.innerHTML = "";
    visible.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.slot;
      o.textContent = p.name;
      if (!p.app_id) o.textContent += " (no app_id)";
      sel.appendChild(o);
    });
    const saved = localStorage.getItem(PHONE_SLOT_KEY);
    if (saved && visible.some((p) => p.slot === saved)) sel.value = saved;
    else if (visible.length) sel.value = visible[0].slot;
    sel.onchange = () => {
      localStorage.setItem(PHONE_SLOT_KEY, sel.value);
      setRedeemPhonePickerVisible(true);
      updatePhoneHint();
    };
    setRedeemPhonePickerVisible(visible.length > 1);
    updatePhoneHint();
  }

  async function redeemShop(shopIndex, offerIndex, btn) {
    const phone = selectedPhone();
    const appId = resolveAppId(phone);
    
    let statusContainer = null;
    if (btn && btn.parentNode) {
      statusContainer = btn.parentNode.querySelector(".popup-status");
      if (!statusContainer) {
        statusContainer = document.createElement("div");
        statusContainer.className = "popup-status mt-1 font-xs";
        btn.parentNode.appendChild(statusContainer);
      }
      statusContainer.textContent = "Redeeming...";
      statusContainer.className = "popup-status mt-1 font-xs text-accent";
    }

    if (!appId) {
      const msg = `${phone?.name || "Phone"} not in devices.sh — set ${devicesShVar(phone?.slot || "user")} (copy from Deal alert test log on phone).`;
      setStatus(msg, false);
      if (statusContainer) {
        statusContainer.textContent = "Error: App ID not set";
        statusContainer.className = "popup-status mt-1 font-xs text-danger";
      }
      return;
    }
    if (!currentRun) {
      setStatus("No active run.", false);
      if (statusContainer) {
        statusContainer.textContent = "Error: No active run";
        statusContainer.className = "popup-status mt-1 font-xs text-danger";
      }
      return;
    }
    btn.disabled = true;
    try {
      const data = await api("/api/scenarios/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: currentRun.run_id,
          shop_index: shopIndex,
          offer_index: offerIndex,
          app_id: appId,
        }),
      });
      const msg = `${data.shop}\n${data.offer_title}: ${data.scan_result}\n${data.hint}`;
      setStatus(msg, data.ok);
      if (statusContainer) {
        if (data.ok) {
          statusContainer.textContent = `Success: ${data.scan_result}`;
          statusContainer.className = "popup-status mt-1 font-xs text-success";
        } else {
          statusContainer.textContent = `Failed: ${data.scan_result}`;
          statusContainer.className = "popup-status mt-1 font-xs text-danger";
        }
      }
    } catch (e) {
      const errorMsg = String(e.message || e);
      setStatus(errorMsg, false);
      if (statusContainer) {
        statusContainer.textContent = `Error: ${errorMsg}`;
        statusContainer.className = "popup-status mt-1 font-xs text-danger";
      }
    } finally {
      btn.disabled = false;
    }
  }

  function fillPresets() {
    const categorySel = el("category");
    const presetSel = el("preset");
    const categories = catalog?.categories || [{ id: "intent", label: "Intent field tests" }];
    categorySel.innerHTML = "";
    categories.forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.label;
      categorySel.appendChild(o);
    });
    const renderPresetOptions = () => {
      const cat = categorySel.value;
      presetSel.innerHTML = "";
      scenarioList
        .filter((p) => (p.category || "intent") === cat)
        .forEach((p) => {
          const o = document.createElement("option");
          o.value = p.id;
          o.textContent = p.label;
          presetSel.appendChild(o);
        });
      presetSel.dispatchEvent(new Event("change"));
    };
    categorySel.onchange = renderPresetOptions;
    presetSel.onchange = () => {
      const p = scenarioList.find((x) => x.id === presetSel.value);
      if (!p) return;
      renderScenarioBlurb(p);
      const seedEl = el("preset-seed");
      if (seedEl) {
        seedEl.textContent = "";
        seedEl.hidden = true;
      }
      if (!currentRun) syncScenarioUi(p);
      if (!currentRun) applyScenarioRadius(p);
      renderPlaybook(p.playbook || [], p.passCriteria || p.fieldLogExpect || [], p.multiDay);
      if (!currentRun) {
        resetOptionalDevicePick();
        updateCleanupHint(null);
      }
      refreshPlaybookStatus();
    };
    renderPresetOptions();
  }

  function prodRunConfirmed() {
    if (consoleEnvLabel !== "PROD") return true;
    const typed = prompt(
      "PROD pre-launch test mode.\nType PROD to wipe scenario test merchants and seed this scenario:"
    );
    return typed === "PROD";
  }

  function defaultAccountingFabric() {
    return {
      enabled: true,
      merchant_fraction: 0.7,
      date_spread_days: 90,
      redemption_intensity: "medium",
      attach_fixture_docs: true,
    };
  }

  let pendingRunBody = null;

  function openConfirmMapModal(deviceList) {
    const presetSel = el("preset");
    const p = scenarioList.find((x) => x.id === presetSel.value);
    const isMultiarea = !!(p && p.seed && p.seed.multiarea);

    const scenarioLabel =
      presetSel?.options[presetSel.selectedIndex]?.textContent?.trim() || presetSel?.value || "—";
    const coords = el("confirm-map-coords");
    const radius = el("confirm-map-radius");
    const phones = el("confirm-map-phones");
    const scenario = el("confirm-map-scenario");
    if (scenario) scenario.textContent = scenarioLabel;

    if (isMultiarea) {
      if (coords) {
        coords.textContent = draftZones
          .map((z, idx) => `Zone ${idx + 1}: ${z.lat.toFixed(6)}, ${z.lng.toFixed(6)}`)
          .join(" | ");
      }
      if (map && draftZones.length > 0) {
        const bounds = draftZones.map(z => [z.lat, z.lng]);
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
      }
    } else {
      const lat = parseFloat(el("lat").value);
      const lng = parseFloat(el("lng").value);
      if (coords) coords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (map && radiusCircle) {
        map.fitBounds(radiusCircle.getBounds(), { padding: [32, 32], maxZoom: 16 });
      }
    }

    if (radius) radius.textContent = `${radiusM} m`;
    if (phones) phones.textContent = deviceList.map((d) => d.name || d.slot).join(", ") || "—";

    const modal = el("confirm-map-modal");
    if (modal) modal.hidden = false;
  }

  function closeConfirmMapModal() {
    const modal = el("confirm-map-modal");
    if (modal) modal.hidden = true;
  }

  async function runScenario() {
    const presetSel = el("preset");
    const p = scenarioList.find((x) => x.id === presetSel.value);
    const isMultiarea = !!(p && p.seed && p.seed.multiarea);

    if (isMultiarea && draftZones.length === 0) {
      setStatus("Select at least one zone on the map first.", false);
      return;
    } else if (!isMultiarea && !hasCenter) {
      setStatus("Set centre pin first — tap map or GPS.", false);
      return;
    }

    const prep = phonesReadyForRun();
    if (!prep.ok) {
      setStatus(prep.reason, false);
      return;
    }
    if (currentRun) {
      setStatus(
        `Run ${currentRun.short_id} is still open. Finish & remove (or Abandon) before starting a new scenario.`,
        false,
      );
      return;
    }
    if (!prodRunConfirmed()) {
      setStatus("PROD run cancelled.", false);
      return;
    }
    renderDevicePick();
    const deviceList = selectedDevices();
    const excludeAcc = el("exclude-accounting")?.checked || false;

    let finalLat = parseFloat(el("lat").value);
    let finalLng = parseFloat(el("lng").value);
    let zonesPayload = null;

    if (isMultiarea) {
      finalLat = draftZones[0].lat;
      finalLng = draftZones[0].lng;
      zonesPayload = draftZones.map(z => ({ lat: z.lat, lng: z.lng }));
    }

    pendingRunBody = {
      preset_id: presetSel.value,
      lat: finalLat,
      lng: finalLng,
      radius_m: radiusM,
      confirm_prod: consoleEnvLabel === "PROD",
      devices: deviceList,
      accounting_fabric: defaultAccountingFabric(),
      exclude_accounting: excludeAcc,
      zones: zonesPayload,
    };
    openConfirmMapModal(deviceList);
  }

  async function executeRunScenario() {
    if (!pendingRunBody) return;
    const body = pendingRunBody;
    pendingRunBody = null;
    closeConfirmMapModal();
    runProgressLabel = (body.devices || []).map((d) => d.name || d.slot).join(", ");
    isSeeding = true;
    updateRunButtons();
    try {
      setRunProgress(
        `Mac is installing fresh apps on ${runProgressLabel} and seeding test shops on ${consoleEnvLabel}. This takes a few minutes — keep those devices unlocked.`,
        "Setting up your run…",
      );
      const data = await api("/api/scenarios/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showRun(data.run);
      const prepNames = (data.devicePrep?.devices || []).join(", ");
      const prepOk = data.devicePrep?.ok === true;
      const runCode =
        data.run?.short_id ||
        data.devicePrep?.run_short_id ||
        (data.run?.run_id || "").slice(0, 8);
      const wiped = data.prep?.wiped_runs?.length || 0;
      const seedLine = data.seedOutput
        ? data.seedOutput
        : appendLastOfferRefreshNote(
            wiped
              ? `Seeded on ${consoleEnvLabel} (replaced ${wiped} prior run${wiped === 1 ? "" : "s"}).`
              : `Seeded on ${consoleEnvLabel}.`,
            data.run,
          );
      const devicePart = prepOk && prepNames
        ? `Phones reset: ${prepNames}. `
        : prepOk
          ? "Phones reset. "
          : "";
      const syncPart = runCode ? `Run sync id on phone: ${runCode}. ` : "";
      const appIdPart =
        "⚠️ After fresh install: copy App id from Deal alert test log on phone — must match shared/devices.json before Field log. ";
      setStatus(`${devicePart}${syncPart}${appIdPart}${seedLine}`, true);
    } catch (e) {
      clearRunProgress();
      setStatus(String(e.message || e), false);
    } finally {
      isSeeding = false;
      runProgressLabel = "";
      clearRunProgress();
      updateRunButtons();
    }
  }

  async function tryLoadActiveRun({ silent = false, onProgress = null } = {}) {
    try {
      if (onProgress) onProgress("Checking for an active run…");
      const data = await api("/api/scenarios/runs");
      const runs = data.runs || [];
      if (!runs.length) {
        if (!silent) {
          setStatus(`No in-progress run on ${consoleEnvLabel}. Run a scenario or check Run log.`, false);
        }
        return false;
      }
      const pick = runs[0];
      if (onProgress) onProgress("Restoring active run on the map…");
      const full = await api(`/api/scenarios/run/${pick.run_id}`);
      showRun(full.run);
      if (runs.length > 1 && !silent) {
        setStatus(`Loaded newest active run ${pick.run_id.slice(0, 8)} (${runs.length} active on ${consoleEnvLabel}).`, true);
      }
      return true;
    } catch (e) {
      if (!silent) setStatus(String(e.message || e), false);
      return false;
    }
  }

  async function refreshAfterWalkTargetChange() {
    const envRes = await api("/api/environment");
    applyWalkEnvironment(envRes);
    renderDevicePick();
    currentRun = null;
    clearShopMarkers();
    el("shop-list").innerHTML = "";
    el("redeem-phone-block").hidden = true;
    setRedeemPhonePickerVisible(true);
    try {
      const phonesRes = await api("/api/scenarios/phones");
      fillPhones(phonesRes.phones || []);
      await loadDeviceReachabilityIfLocal();
      renderDevicePick();
    } catch (_) { /* keep prior list */ }
    updateRunButtons();
    await loadRunHistory();
    const loaded = await tryLoadActiveRun({ silent: true });
    if (!loaded && !canControlRuns()) resetMapViewDefault();
    setStatus(
      loaded
        ? `Console target → ${consoleEnvLabel}. Active run loaded.`
        : `Console target → ${consoleEnvLabel}. No active run — pick scenario and Run.`,
      true,
    );
  }

  async function setConsoleTarget(target) {
    await HoiboConsoleChrome.postConsoleTarget(target);
    await refreshAfterWalkTargetChange();
  }

  function applyWalkEnvironment(envRes) {
    envStatus = envRes;
    consoleEnvLabel = envRes?.console?.label || "STAGE";
    consoleEnvSlug = (envRes?.console?.env || "stage").toLowerCase();
    HoiboConsoleChrome.applyEnvironmentChrome(envRes);
  }

  function resolveFinishOutcomeFromLog() {
    if (!lastAnalysis) return undefined;
    if (typeof lastAnalysis.checkPassed === "boolean") {
      return lastAnalysis.checkPassed ? "pass" : "fail";
    }
    if (lastAnalysis.ok === true) return "pass";
    if (lastAnalysis.ok === false) return "fail";
    return undefined;
  }

  function paintFinishRunLogStatus() {
    const box = el("finish-run-log-status");
    if (!box) return;
    const outcome = resolveFinishOutcomeFromLog();
    box.hidden = false;
    if (outcome === "pass") {
      box.className = "finish-run-log-status pass";
      box.textContent = "Check log: pass — will be saved on archive.";
    } else if (outcome === "fail") {
      box.className = "finish-run-log-status fail";
      box.textContent = "Check log: fail — will be saved on archive.";
    } else {
      box.className = "finish-run-log-status pending";
      box.textContent = "No Check log yet — archive without pass/fail (run Check log first if you want that).";
    }
  }

  function openFinishRunModal() {
    if (!currentRun) return;
    const modal = el("finish-run-modal");
    const notes = el("finish-run-notes");
    const warn = el("finish-run-warn");
    if (notes) notes.value = "";
    paintFinishRunLogStatus();
    if (warn) {
      warn.innerHTML =
        `<strong>Run ${currentRun.short_id}</strong> on ${consoleEnvLabel}:<br>` +
        `• <strong>Remove</strong> — deletes seeded scenario shops/offers from ${consoleEnvLabel} DB; clears map &amp; active run.<br>` +
        `• <strong>Archive</strong> — keeps notes, devices &amp; Check log result in Run log.<br>` +
        `Does not reset phones — use a new Run for fresh installs.`;
    }
    if (modal) modal.hidden = false;
  }

  function closeFinishRunModal() {
    const modal = el("finish-run-modal");
    if (modal) modal.hidden = true;
  }

  function cleanupRun() {
    if (!currentRun) {
      setStatus("Nothing to remove.", false);
      return;
    }
    openFinishRunModal();
  }

  async function submitFinishRun() {
    if (!currentRun) return;
    const notesEl = el("finish-run-notes");
    const notes = notesEl?.value?.trim() || undefined;
    const outcome = resolveFinishOutcomeFromLog();
    const confirmBtn = el("btn-finish-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.classList.add("loading");
    }
    try {
      await api("/api/scenarios/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: currentRun.run_id, outcome, notes }),
      });
      closeFinishRunModal();
      currentRun = null;
      clearShopMarkers();
      el("shop-list").innerHTML = "";
      el("redeem-phone-block").hidden = true;
      setStatus(`Scenario finished and archived on ${consoleEnvLabel}.`, true);
      updateRunButtons();
      updateCleanupHint(null);
      refreshPlaybookStatus();
      await loadRunHistory();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.classList.remove("loading");
      }
    }
  }

  async function refreshRunSeed() {
    if (!currentRun) return;
    if (!confirm(`Refresh offers and credit economy for run ${currentRun.short_id}?\n\nSame shops — new expiry times and fresh synthetic purchases/redemptions. Then pull feed on the phone.`)) return;
    const btn = el("btn-refresh-seed");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
    }
    try {
      const data = await api("/api/scenarios/refresh-seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: currentRun.run_id }),
      });
      if (data.run) {
        showRun(data.run);
      }
      setStatus(data.seedOutput || appendLastOfferRefreshNote("Offers refreshed — pull feed on phone.", data.run), true);
      refreshPlaybookStatus();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      if (btn) {
        btn.disabled = !currentRun;
        btn.classList.remove("loading");
      }
    }
  }

  async function abandonRun() {
    if (!currentRun) return;
    const notes = prompt("Why abandon? (optional)") || undefined;
    const wipe = confirm("Also remove seeded shops from DB?\n\nOK = wipe DB · Cancel = keep seed for retry");
    if (!confirm(`Abandon run ${currentRun.short_id}?`)) return;
    const btn = el("btn-abandon");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
    }
    try {
      await api("/api/scenarios/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: currentRun.run_id, notes, cleanup_db: wipe }),
      });
      if (wipe) {
        currentRun = null;
        clearShopMarkers();
        el("shop-list").innerHTML = "";
        el("redeem-phone-block").hidden = true;
      } else {
        currentRun.status = "abandoned";
      }
      setStatus(wipe ? "Run abandoned — seed removed." : "Run abandoned — seed kept.", true);
      updateRunButtons();
      await loadRunHistory();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      if (btn) {
        btn.disabled = !currentRun;
        btn.classList.remove("loading");
      }
    }
  }

  el("btn-gps").onclick = () => {
    if (!navigator.geolocation) { setStatus("Geolocation not available.", false); return; }
    setStatus("Getting GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter(pos.coords.latitude, pos.coords.longitude);
        setStatus("Centre pin set from GPS.", true);
      },
      (err) => setStatus(err.message, false),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  el("btn-run").onclick = runScenario;
  el("btn-clear-zones").onclick = clearDraftZones;
  el("btn-refresh-phones")?.addEventListener("click", async () => {
    const btn = el("btn-refresh-phones");
    if (btn) {
      btn.disabled = true;
      btn.classList.add("loading");
    }
    try {
      await refreshPhonePanel();
    } catch (err) {
      setStatus(String(err.message || err), false);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("loading");
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      refreshPhonePanel().catch(() => {});
    }
  });
  el("btn-refresh-seed").onclick = refreshRunSeed;
  el("btn-cleanup").onclick = cleanupRun;
  el("btn-abandon").onclick = abandonRun;

  const confirmMapModal = el("confirm-map-modal");
  el("btn-close-confirm-map").onclick = closeConfirmMapModal;
  el("btn-confirm-map-cancel").onclick = closeConfirmMapModal;
  el("btn-confirm-map-run").onclick = () => executeRunScenario();
  confirmMapModal?.addEventListener("click", (e) => {
    if (e.target === confirmMapModal) closeConfirmMapModal();
  });

  const finishRunModal = el("finish-run-modal");
  el("btn-close-finish-modal").onclick = closeFinishRunModal;
  el("btn-finish-cancel").onclick = closeFinishRunModal;
  el("btn-finish-confirm").onclick = () => submitFinishRun();
  finishRunModal?.addEventListener("click", (e) => {
    if (e.target === finishRunModal) closeFinishRunModal();
  });

  (async () => {
    try {
      if (isHostedConsole()) {
        setBootStep("Unlocking config (enter admin API key if prompted)…");
      } else {
        setBootStep("Connecting to dev console…");
      }
      const [catalogRes, phonesRes, devicesRes, envRes] = await Promise.all([
        api("/api/scenarios/catalog"),
        api("/api/scenarios/phones"),
        api("/api/scenarios/devices").catch(() => ({ devices: [] })),
        api("/api/environment"),
      ]);

      setBootStep("Loading scenario list…");
      HoiboConsoleChrome.configure({
        fetchJson: (path, opts) => api(path, opts),
        postTarget: (target) =>
          api("/api/environment/target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target }),
          }),
      });
      applyWalkEnvironment(envRes);
      HoiboConsoleChrome.wireConsoleTargetButtons(async () => {
        try {
          await refreshAfterWalkTargetChange();
        } catch (err) {
          setStatus(String(err.message || err), false);
        }
      });

      catalog = catalogRes.catalog;
      const rawList = catalogRes.scenarios || catalog.scenarios || [];
      const hostedApi = typeof window.__hostedScenariosApi === "function";
      scenarioList = rawList.map((s) =>
        typeof ScenarioDisplay !== "undefined"
          ? ScenarioDisplay.applyHumanCopy(s)
          : s,
      );

      setBootStep("Loading phones…");
      fillPhones(phonesRes.phones);
      registryDevices = devicesRes.devices || [];
      renderDevicePick();
      radiusM = catalog.defaultRadiusM || 800;
      el("map-hint").textContent = `${radiusM} m shop radius · console → ${consoleEnvLabel}`;
      fillPresets();

      if (!isHostedConsole()) {
        setBootStep("Checking phones on this Mac…");
        await Promise.all([loadDeviceBuildsIfLocal(), loadDeviceReachabilityIfLocal()]);
        renderDevicePick();
      }

      finishBoot();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      ensureMapReady();

      await tryLoadActiveRun({
        silent: true,
        onProgress: (msg) => setBootStep(msg),
      });
      if (!currentRun) {
        if (canControlRuns()) {
          const savedCenter = localStorage.getItem(CENTER_KEY);
          if (savedCenter) {
            setBootStep("Restoring your last map centre…");
            const c = JSON.parse(savedCenter);
            setCenter(c.lat, c.lng);
          }
        } else {
          resetMapViewDefault();
        }
      }

      setBootStep("Loading run log…");
      updateRunButtons();
      await loadRunHistory();
      requestAnimationFrame(() => refreshMapSize());
    } catch (e) {
      failBoot(String(e.message || e));
    }
  })();

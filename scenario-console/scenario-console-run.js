/** Active run lifecycle — map, seed, env switching, buttons. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const btnLoading = SC.btnLoading;
  const api = SC.api;
  const apiPost = SC.apiPost;
  const isHostedConsole = SC.isHostedConsole;
  const formatRunWhen = SC.formatRunWhen;
  const deviceNames = SC.deviceNames;
  const isMultiareaScenario = SC.isMultiareaScenario;
  const formatRunSummary = SC.formatRunSummary;
  const lastOfferRefreshIso = SC.lastOfferRefreshIso;
  const appendLastOfferRefreshNote = SC.appendLastOfferRefreshNote;

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

  function activeMapHintText() {
    if (!S.currentRun) return "Pan anywhere · click map to set centre pin";
    return S.redeemExpectedForRun
      ? "Active run — visit the pins · tap a shop to test redeem"
      : "Active run — follow the playbook · move near the pins (no redeem)";
  }

  function updateRunUiMode() {
    const active = !!S.currentRun;
    const hosted = isHostedConsole();
    const toggle = (id, hidden) => {
      const e = el(id);
      if (e) e.hidden = hidden;
    };

    if (hosted && !active) {
      toggle("scenario-picker-block", true);
      toggle("scenario-setup-block", true);
      toggle("scenario-run-actions", true);
      toggle("playbook-preview", true);
      toggle("scenario-active-banner", true);
      toggle("run-history", false);
      toggle("hosted-idle-hint", false);
    } else {
      toggle("hosted-idle-hint", true);
      toggle("scenario-picker-block", active);
      toggle("scenario-setup-block", active);
      toggle("scenario-run-actions", !active);
      toggle("scenario-active-banner", !active);
      toggle("run-history", active);
      const pb = el("playbook-preview");
      if (pb) pb.hidden = active ? !S.lastPlaybook.allSteps.length : false;
    }

    toggle("phone-rows", active);
    toggle("phones-hint", active);

    const refreshSeedBtn = el("btn-refresh-seed");
    const abandonBtn = el("btn-abandon");
    el("btn-run")?.removeAttribute("hidden");
    el("btn-cleanup")?.removeAttribute("hidden");
    if (refreshSeedBtn) refreshSeedBtn.hidden = !active;
    if (abandonBtn) abandonBtn.hidden = !active;
    SC.syncRedeemUi(S.currentRun);
    el("btn-gps")?.toggleAttribute("disabled", active);

    const categorySel = el("category");
    const presetSel = el("preset");
    if (categorySel) categorySel.disabled = active || S.isSeeding;
    if (presetSel) presetSel.disabled = active || S.isSeeding;

    if (active) {
      const banner = el("scenario-active-banner");
      if (banner) {
        const label = S.currentRun.scenario_label || S.currentRun.preset_label || S.currentRun.scenario_id || "Scenario";
        const centre = S.currentRun.center
          ? `${S.currentRun.center.lat.toFixed(5)}, ${S.currentRun.center.lng.toFixed(5)}`
          : "—";
        const shortId = S.currentRun.short_id || (S.currentRun.run_id || "").slice(0, 8);
        el("active-run-title").textContent = label;
        el("active-run-meta").innerHTML =
          `<span class="run-id">${shortId}</span>` +
          ` · ${S.consoleEnvLabel} · ${deviceNames(S.currentRun.devices)}<br />` +
          `Started <strong>${formatRunWhen(S.currentRun.started_at)}</strong><br />` +
          `Phone field log should show run <strong>${shortId}</strong>` +
          `<br />After fresh install: verify <strong>App id</strong> on phone matches <code>shared/devices.json</code>` +
          `<br />Centre ${centre} · ${S.currentRun.radius_m || S.radiusM} m` +
          `<br />Last offer refresh: <strong>${formatRunWhen(lastOfferRefreshIso(S.currentRun))}</strong>`;
      }
    }

    const mapHint = el("map-hint");
    if (mapHint) mapHint.textContent = activeMapHintText();

    SC.updatePlaybookHeading();
    requestAnimationFrame(() => SC.refreshMapSize());
  }

  function updateRunButtons() {
    const runBtn = el("btn-run");
    const cleanupBtn = el("btn-cleanup");
    const refreshSeedBtn = el("btn-refresh-seed");
    const abandonBtn = el("btn-abandon");
    const hint = el("run-hint");
    const env = S.consoleEnvLabel || "STAGE";

    if (S.isSeeding) {
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = "Resetting phones…";
        runBtn.classList.add("loading");
      }
      cleanupBtn.disabled = true;
      if (refreshSeedBtn) refreshSeedBtn.disabled = true;
      if (abandonBtn) abandonBtn.disabled = true;
      if (hint) hint.hidden = true;
      return;
    }
    if (runBtn) runBtn.classList.remove("loading");
    clearRunProgress();

    runBtn.textContent = S.currentRun ? "Finish current run first" : `Run scenario on ${env}`;
    runBtn.disabled = !S.hasCenter || !!S.currentRun || !SC.phonesReadyForRun().ok;
    cleanupBtn.disabled = !S.currentRun;
    if (refreshSeedBtn) {
      refreshSeedBtn.hidden = !S.currentRun;
      refreshSeedBtn.disabled = !S.currentRun;
    }
    if (abandonBtn) {
      abandonBtn.hidden = !S.currentRun;
      abandonBtn.disabled = !S.currentRun;
    }

    const presetSel = el("preset");
    const p = S.scenarioList.find((x) => x.id === presetSel?.value);
    const isMultiarea = isMultiareaScenario(p);

    if (!S.hasCenter) {
      hint.hidden = false;
      hint.textContent = isMultiarea
        ? "Select commute zones (1-4) on map first — then Run scenario."
        : "Set centre pin first — then Run scenario.";
    } else if (S.currentRun) {
      hint.hidden = false;
      hint.textContent = `Run ${S.currentRun.short_id} is live. Follow the playbook, then Finish & remove (or Abandon). You cannot start another until this one is closed.`;
    } else {
      hint.hidden = false;
      const prep = SC.phonesReadyForRun();
      hint.textContent = prep.ok
        ? isMultiarea
          ? `Ready — confirm the commute zones on the map, then Run (fresh-install + seed on ${env}).`
          : `Ready — confirm the orange circle on the map, then Run (fresh-install + seed on ${env}).`
        : prep.reason;
    }
    updateRunUiMode();
  }

  function showRun(run) {
    const runEnv = String(run?.console_env || S.consoleEnvSlug).toLowerCase();
    if (runEnv !== S.consoleEnvSlug) {
      setStatus(`That run is on ${runEnv.toUpperCase()} — switch console to ${runEnv.toUpperCase()} to load it.`, false);
      return;
    }
    S.currentRun = run;
    S.lastAnalysis = null;
    S.redeemExpectedForRun = SC.playbookExpectsRedeem(run.playbook || []);
    SC.syncPresetFromRun(run);
    SC.clearShopMarkers();

    const r = run.radius_m || S.radiusM;
    const bounds = L.latLngBounds([]);
    let hasBounds = false;

    if (run.zones?.length) {
      if (S.centerMarker) {
        S.map.removeLayer(S.centerMarker);
        S.centerMarker = null;
      }
      if (S.radiusCircle) {
        S.map.removeLayer(S.radiusCircle);
        S.radiusCircle = null;
      }
      run.zones.forEach((z, i) => {
        const color = SC.zoneColor(i);
        const marker = L.marker([z.lat, z.lng], {
          icon: SC.zonePinIcon(i),
          zIndexOffset: 1000,
          interactive: false,
        }).addTo(S.map);
        const circle = L.circle([z.lat, z.lng], {
          radius: r,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.08,
          dashArray: "6 4",
          interactive: false,
        }).addTo(S.map);
        S.runZoneOverlays.push(marker, circle);
        bounds.extend(circle.getBounds());
        hasBounds = true;
      });
      SC.updateDraftZonesUi();
    } else if (run.center) {
      S.radiusM = r;
      SC.setCenter(run.center.lat, run.center.lng, { pan: false });
      SC.drawRadiusCircle(run.center.lat, run.center.lng);
      if (S.radiusCircle) {
        bounds.extend(S.radiusCircle.getBounds());
        hasBounds = true;
      }
    }

    el("shop-list").innerHTML = "";

    run.shops.forEach((shop, shopIndex) => {
      const popupOpts = { redeemExpected: S.redeemExpectedForRun, run };
      const buildPopup = () => window.ScenarioDisplay.formatShopPopupHtml(shop, shopIndex, popupOpts);
      const tone = SC.shopMarkerTone(shop, run);
      const m = L.marker([shop.lat, shop.lng], { icon: SC.createShopPinIcon(tone) })
        .addTo(S.map)
        .bindPopup(buildPopup());
      m.__shop = shop;
      m.__pinTone = tone;
      m.on("popupopen", () => {
        m.setPopupContent(buildPopup());
        const nextTone = SC.shopMarkerTone(shop, run);
        if (m.__pinTone !== nextTone) {
          m.setIcon(SC.createShopPinIcon(nextTone));
          m.__pinTone = nextTone;
        }
      });
      S.shopMarkers.push(m);
      bounds.extend([shop.lat, shop.lng]);
      hasBounds = true;
    });

    SC.refreshShopMarkerIcons(run);

    if (hasBounds && bounds.isValid()) {
      S.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      SC.refreshMapSize();
    }

    SC.syncRedeemUi(run);
    SC.renderPlaybook(run.playbook || [], run.field_log_expect || [], run.multi_day);
    setStatus(formatRunSummary(run, r), true);
    updateRunButtons();
    SC.updateCleanupHint(run);
    SC.applyRunDevicesToPick(run.devices);
    SC.refreshPlaybookStatus();
  }

  function prodRunConfirmed() {
    if (S.consoleEnvLabel !== "PROD") return true;
    return (
      prompt("PROD pre-launch test mode.\nType PROD to wipe scenario test merchants and seed this scenario:") === "PROD"
    );
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

  function openConfirmMapModal(deviceList) {
    const presetSel = el("preset");
    const p = S.scenarioList.find((x) => x.id === presetSel.value);
    const isMultiarea = isMultiareaScenario(p);
    const scenarioLabel = presetSel?.options[presetSel.selectedIndex]?.textContent?.trim() || presetSel?.value || "—";

    const scenarioEl = el("confirm-map-scenario");
    if (scenarioEl) scenarioEl.textContent = scenarioLabel;

    const coords = el("confirm-map-coords");
    if (isMultiarea) {
      if (coords)
        coords.textContent = S.draftZones
          .map((z, i) => `Zone ${i + 1}: ${z.lat.toFixed(6)}, ${z.lng.toFixed(6)}`)
          .join(" | ");
      if (S.map && S.draftZones.length > 0) S.map.fitBounds(SC.draftZoneBounds(), { padding: [32, 32], maxZoom: 16 });
    } else {
      const lat = parseFloat(el("lat").value);
      const lng = parseFloat(el("lng").value);
      if (coords) coords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (S.map && S.radiusCircle) S.map.fitBounds(S.radiusCircle.getBounds(), { padding: [32, 32], maxZoom: 16 });
    }

    const radius = el("confirm-map-radius");
    const phones = el("confirm-map-phones");
    if (radius) radius.textContent = `${S.radiusM} m`;
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
    const p = S.scenarioList.find((x) => x.id === presetSel.value);
    const isMultiarea = isMultiareaScenario(p);

    if (isMultiarea && S.draftZones.length === 0) {
      setStatus("Select at least one zone on the map first.", false);
      return;
    }
    if (!isMultiarea && !S.hasCenter) {
      setStatus("Set centre pin first — tap map or GPS.", false);
      return;
    }
    const prep = SC.phonesReadyForRun();
    if (!prep.ok) {
      setStatus(prep.reason, false);
      return;
    }
    if (S.currentRun) {
      setStatus(
        `Run ${S.currentRun.short_id} is still open. Finish & remove (or Abandon) before starting a new scenario.`,
        false,
      );
      return;
    }
    if (!prodRunConfirmed()) {
      setStatus("PROD run cancelled.", false);
      return;
    }

    SC.renderDevicePick();
    const deviceList = SC.selectedDevices();
    const excludeAcc = el("exclude-accounting")?.checked || false;
    let finalLat = parseFloat(el("lat").value);
    let finalLng = parseFloat(el("lng").value);
    let zonesPayload = null;

    const radiusM = S.radiusM;

    if (isMultiarea) {
      finalLat = S.draftZones[0].lat;
      finalLng = S.draftZones[0].lng;
      zonesPayload = S.draftZones.map((z) => ({ lat: z.lat, lng: z.lng }));
    }

    S.pendingRunBody = {
      preset_id: presetSel.value,
      lat: finalLat,
      lng: finalLng,
      radius_m: radiusM,
      confirm_prod: S.consoleEnvLabel === "PROD",
      devices: deviceList,
      accounting_fabric: defaultAccountingFabric(),
      exclude_accounting: excludeAcc,
      zones: zonesPayload,
    };
    openConfirmMapModal(deviceList);
  }

  async function executeRunScenario() {
    if (!S.pendingRunBody) return;
    const body = S.pendingRunBody;
    S.pendingRunBody = null;
    closeConfirmMapModal();
    S.runProgressLabel = (body.devices || []).map((d) => d.name || d.slot).join(", ");
    S.isSeeding = true;
    updateRunButtons();
    try {
      setRunProgress(
        `Mac is installing fresh apps on ${S.runProgressLabel} and seeding test shops on ${S.consoleEnvLabel}. This takes a few minutes — keep those devices unlocked.`,
        "Setting up your run…",
      );
      const data = await apiPost("/api/scenarios/run", body);
      showRun(data.run);
      const prepOk = data.devicePrep?.ok === true;
      const prepNames = (data.devicePrep?.devices || []).join(", ");
      const runCode = data.run?.short_id || data.devicePrep?.run_short_id || (data.run?.run_id || "").slice(0, 8);
      const wiped = data.prep?.wiped_runs?.length || 0;
      const seedLine = data.seedOutput
        ? data.seedOutput
        : appendLastOfferRefreshNote(
            wiped
              ? `Seeded on ${S.consoleEnvLabel} (replaced ${wiped} prior run${wiped === 1 ? "" : "s"}).`
              : `Seeded on ${S.consoleEnvLabel}.`,
            data.run,
          );
      const devicePart = prepOk && prepNames ? `Phones reset: ${prepNames}. ` : prepOk ? "Phones reset. " : "";
      const syncPart = runCode ? `Run sync id on phone: ${runCode}. ` : "";
      const appIdPart =
        "⚠️ After fresh install: copy App id from Deal alert test log on phone — must match shared/devices.json before Field log. ";
      setStatus(`${devicePart}${syncPart}${appIdPart}${seedLine}`, true);
    } catch (e) {
      clearRunProgress();
      setStatus(String(e.message || e), false);
    } finally {
      S.isSeeding = false;
      S.runProgressLabel = "";
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
        if (!silent) setStatus(`No in-progress run on ${S.consoleEnvLabel}. Run a scenario or check Run log.`, false);
        return false;
      }
      const pick = runs[0];
      if (onProgress) onProgress("Restoring active run on the map…");
      const full = await api(`/api/scenarios/run/${pick.run_id}`);
      showRun(full.run);
      if (runs.length > 1 && !silent) {
        setStatus(
          `Loaded newest active run ${pick.run_id.slice(0, 8)} (${runs.length} active on ${S.consoleEnvLabel}).`,
          true,
        );
      }
      return true;
    } catch (e) {
      if (!silent) setStatus(String(e.message || e), false);
      return false;
    }
  }

  function startActiveRunAutoSync() {
    if (S.activeRunSyncTimer) return;
    S.activeRunSyncTimer = setInterval(async () => {
      if (!S.currentRun?.run_id || document.visibilityState !== "visible") return;
      SC.refreshShopMarkerIcons(S.currentRun);
      try {
        const data = await api(`/api/scenarios/run/${S.currentRun.run_id}`);
        const run = data?.run;
        if (!run) return;
        if (lastOfferRefreshIso(S.currentRun) !== lastOfferRefreshIso(run)) {
          showRun(run);
          setStatus(appendLastOfferRefreshNote("Offers refreshed by cron — pull feed on phone.", run), true);
        }
      } catch (_) {
        /* ignore transient polling errors */
      }
    }, 60_000);
  }

  function applyWalkEnvironment(envRes) {
    S.envStatus = envRes;
    S.consoleEnvLabel = envRes?.console?.label || "STAGE";
    S.consoleEnvSlug = (envRes?.console?.env || "stage").toLowerCase();
    HoiboConsoleChrome.applyEnvironmentChrome(envRes);
  }

  async function refreshAfterWalkTargetChange() {
    const envRes = await api("/api/environment");
    applyWalkEnvironment(envRes);
    SC.renderDevicePick();
    S.currentRun = null;
    SC.clearShopMarkers();
    el("shop-list").innerHTML = "";
    el("redeem-phone-block").hidden = true;
    SC.setRedeemPhonePickerVisible(true);
    try {
      const phonesRes = await api("/api/scenarios/phones");
      SC.fillPhones(phonesRes.phones || []);
      await SC.loadDeviceReachabilityIfLocal();
      SC.renderDevicePick();
    } catch (_) {
      /* keep prior list */
    }
    updateRunButtons();
    await SC.loadRunHistory();
    const loaded = await tryLoadActiveRun({ silent: true });
    if (!loaded) SC.resetMapViewDefault();
    setStatus(
      loaded
        ? `Console target → ${S.consoleEnvLabel}. Active run loaded.`
        : `Console target → ${S.consoleEnvLabel}. No active run — pick scenario and Run.`,
      true,
    );
  }

  async function refreshRunSeed() {
    if (!S.currentRun) return;
    if (
      !confirm(
        `Refresh offers and credit economy for run ${S.currentRun.short_id}?\n\nSame shops — new expiry times and fresh synthetic purchases/redemptions. Then pull feed on the phone.`,
      )
    )
      return;
    const btn = el("btn-refresh-seed");
    btnLoading(btn, true);
    try {
      const data = await apiPost("/api/scenarios/refresh-seed", { run_id: S.currentRun.run_id });
      if (data.run) showRun(data.run);
      setStatus(data.seedOutput || appendLastOfferRefreshNote("Offers refreshed — pull feed on phone.", data.run), true);
      SC.refreshPlaybookStatus();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      if (btn) {
        btn.disabled = !S.currentRun;
        btn.classList.remove("loading");
      }
    }
  }

  async function abandonRun() {
    if (!S.currentRun) return;
    const notes = prompt("Why abandon? (optional)") || undefined;
    const wipe = confirm("Also remove seeded shops from DB?\n\nOK = wipe DB · Cancel = keep seed for retry");
    if (!confirm(`Abandon run ${S.currentRun.short_id}?`)) return;
    const btn = el("btn-abandon");
    btnLoading(btn, true);
    try {
      await apiPost("/api/scenarios/abandon", { run_id: S.currentRun.run_id, notes, cleanup_db: wipe });
      if (wipe) {
        S.currentRun = null;
        SC.clearShopMarkers();
        el("shop-list").innerHTML = "";
        el("redeem-phone-block").hidden = true;
      } else {
        S.currentRun.status = "abandoned";
      }
      setStatus(wipe ? "Run abandoned — seed removed." : "Run abandoned — seed kept.", true);
      updateRunButtons();
      await SC.loadRunHistory();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      if (btn) {
        btn.disabled = !S.currentRun;
        btn.classList.remove("loading");
      }
    }
  }

  Object.assign(SC, {
    updateRunButtons,
    showRun,
    runScenario,
    executeRunScenario,
    tryLoadActiveRun,
    startActiveRunAutoSync,
    applyWalkEnvironment,
    refreshAfterWalkTargetChange,
    refreshRunSeed,
    abandonRun,
    closeConfirmMapModal,
  });
})(typeof window !== "undefined" ? window : globalThis);

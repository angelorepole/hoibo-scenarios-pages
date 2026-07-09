/** Scenario console — bootstrap and event wiring. Logic lives in scenario-console-*.js */
(function () {
  const SC = window.ScenarioConsole;
  const S = SC.state;
  const C = SC.constants;
  const el = SC.el;

  (function redirectLocalWalkToHosted() {
    const h = location.hostname;
    const onDevConsole = (h === "127.0.0.1" || h === "localhost") && location.port === "8765";
    if ((h === "127.0.0.1" || h === "localhost") && !onDevConsole && !location.search.includes("local=1")) {
      location.replace("https://angelorepole.github.io/hoibo-scenarios-pages/scenario-console/");
    }
  })();

  el("btn-gps").onclick = () => {
    if (!navigator.geolocation) {
      SC.setStatus("Geolocation not available.", false);
      return;
    }
    SC.setStatus("Getting GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        SC.setCenter(pos.coords.latitude, pos.coords.longitude);
        SC.setStatus("Centre pin set from GPS.", true);
      },
      (err) => SC.setStatus(err.message, false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  el("btn-run").onclick = SC.runScenario;
  el("btn-clear-zones").onclick = SC.clearDraftZones;
  el("btn-refresh-seed").onclick = SC.refreshRunSeed;
  el("btn-cleanup").onclick = SC.cleanupRun;
  el("btn-abandon").onclick = SC.abandonRun;

  el("btn-refresh-phones")?.addEventListener("click", async () => {
    const btn = el("btn-refresh-phones");
    SC.btnLoading(btn, true);
    try {
      await SC.refreshPhonePanel();
    } catch (err) {
      SC.setStatus(String(err.message || err), false);
    } finally {
      SC.btnLoading(btn, false);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") SC.refreshPhonePanel().catch(() => {});
  });

  const confirmMapModal = el("confirm-map-modal");
  el("btn-close-confirm-map").onclick = SC.closeConfirmMapModal;
  el("btn-confirm-map-cancel").onclick = SC.closeConfirmMapModal;
  el("btn-confirm-map-run").onclick = () => SC.executeRunScenario();
  confirmMapModal?.addEventListener("click", (e) => {
    if (e.target === confirmMapModal) SC.closeConfirmMapModal();
  });

  const finishRunModal = el("finish-run-modal");
  el("btn-close-finish-modal").onclick = SC.closeFinishRunModal;
  el("btn-finish-cancel").onclick = SC.closeFinishRunModal;
  el("btn-finish-confirm").onclick = () => SC.submitFinishRun();
  finishRunModal?.addEventListener("click", (e) => {
    if (e.target === finishRunModal) SC.closeFinishRunModal();
  });

  SC.startActiveRunAutoSync();

  (async () => {
    try {
      SC.setBootStep(
        SC.isHostedConsole()
          ? "Unlocking config (enter admin API key if prompted)…"
          : "Connecting to dev console…",
      );

      const [catalogRes, phonesRes, devicesRes, envRes] = await Promise.all([
        SC.api("/api/scenarios/catalog"),
        SC.api("/api/scenarios/phones"),
        SC.api("/api/scenarios/devices").catch(() => ({ devices: [] })),
        SC.api("/api/environment"),
      ]);

      SC.setBootStep("Loading scenario list…");
      HoiboConsoleChrome.configure({
        fetchJson: (path, opts) => SC.api(path, opts),
        postTarget: (target) => SC.apiPost("/api/environment/target", { target }),
      });
      SC.applyWalkEnvironment(envRes);
      HoiboConsoleChrome.wireConsoleTargetButtons(async () => {
        try {
          await SC.refreshAfterWalkTargetChange();
        } catch (err) {
          SC.setStatus(String(err.message || err), false);
        }
      });

      S.catalog = catalogRes.catalog;
      const rawList = catalogRes.scenarios || S.catalog.scenarios || [];
      S.scenarioList = rawList.map((s) =>
        typeof ScenarioDisplay !== "undefined" ? ScenarioDisplay.applyHumanCopy(s) : s,
      );

      SC.setBootStep("Loading phones…");
      SC.fillPhones(phonesRes.phones);
      S.registryDevices = devicesRes.devices || [];
      SC.renderDevicePick();
      S.radiusM = S.catalog.defaultRadiusM || 800;
      el("map-hint").textContent = `${S.radiusM} m shop radius · console → ${S.consoleEnvLabel}`;
      SC.fillPresets();

      if (!SC.isHostedConsole()) {
        SC.setBootStep("Checking phones on this Mac…");
        await Promise.all([SC.loadDeviceBuildsIfLocal(), SC.loadDeviceReachabilityIfLocal()]);
        SC.renderDevicePick();
      }

      SC.finishBoot();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      SC.initMap();
      SC.refreshMapSize();
      requestAnimationFrame(() => SC.refreshMapSize());

      await SC.tryLoadActiveRun({ silent: true, onProgress: (msg) => SC.setBootStep(msg) });
      if (!S.currentRun) {
        const savedCenter = localStorage.getItem(C.CENTER_KEY);
        if (savedCenter) {
          SC.setBootStep("Restoring your last map centre…");
          const c = JSON.parse(savedCenter);
          SC.setCenter(c.lat, c.lng);
        }
      }

      SC.setBootStep("Loading run log…");
      SC.updateRunButtons();
      await SC.loadRunHistory();
      requestAnimationFrame(() => SC.refreshMapSize());
    } catch (e) {
      SC.failBoot(String(e.message || e));
    }
  })();
})();

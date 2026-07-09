/** Finish run modal — cloud Check log + archive outcome. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const btnLoading = SC.btnLoading;
  const api = SC.api;
  const apiPost = SC.apiPost;
  const activeScenarioId = SC.activeScenarioId;

  function checkLogAppIdForRun() {
    const run = S.currentRun;
    if (!run) return null;
    const slots = new Set((run.devices || []).map((d) => String(d.slot)));
    const phones = S.customerPhones
      .map((p) => ({
        ...p,
        app_id: p.app_id || String(p.customer_app_id || "").trim() || null,
        backend_env: p.backend_env || "stage",
      }))
      .filter((p) => p.backend_env === S.consoleEnvSlug && slots.has(String(p.slot)));
    return phones.find((p) => p.app_id)?.app_id || null;
  }

  async function fetchCloudLogEntries(appId) {
    const SFL = global.ScenarioFieldLog;
    if (!SFL?.pickCloudUpload) return null;
    const data = await api(
      `/api/scenarios/field-logs?app_id=${encodeURIComponent(appId)}&limit=20&include_entries=true`,
    );
    const uploads = data.uploads || [];
    if (!uploads.length) return null;
    uploads.sort(
      (a, b) => (Date.parse(b.uploaded_at || "") || 0) - (Date.parse(a.uploaded_at || "") || 0),
    );
    const picked = SFL.pickCloudUpload(uploads, S.currentRun);
    const latest = picked.upload;
    if (!latest) return null;
    const full = await apiPost("/api/scenarios/field-logs", { path: latest.path });
    const entries = full.entries || full.document?.entries || [];
    if (!entries.length) return null;
    const doc = full.document || {};
    S.lastCloudLogMeta = {
      scenario_id: doc.scenario_id || null,
      run_id: doc.run_id || null,
      uploaded_at: doc.uploaded_at || latest.uploaded_at || null,
      memory_trace: doc.memory_trace || full.memory_trace || null,
      tech_log: doc.tech_log || full.tech_log || null,
      tech_log_present: Boolean(doc.tech_log || full.tech_log),
      selected_path: latest.path || null,
      pick_reason: picked.reason || null,
    };
    return entries;
  }

  async function refreshCheckLogForFinish() {
    const box = el("finish-run-log-status");
    if (!S.currentRun || !box) return;
    const appId = checkLogAppIdForRun();
    if (!appId) {
      S.lastAnalysis = null;
      paintFinishRunLogStatus();
      return;
    }
    box.hidden = false;
    box.className = "finish-run-log-status pending";
    box.textContent = "Loading cloud log and Check log…";
    try {
      await SC.ensureFieldLogScripts();
    } catch (_) {
      S.lastAnalysis = null;
      paintFinishRunLogStatus();
      return;
    }
    try {
      const entries = await fetchCloudLogEntries(appId);
      if (!entries) {
        S.lastAnalysis = null;
        paintFinishRunLogStatus();
        return;
      }
      const body = global.ScenarioFieldLog.buildFieldLogRequestBody(JSON.stringify(entries), {
        activeScenarioId: activeScenarioId(),
        lastCloudLogMeta: S.lastCloudLogMeta,
        currentRun: S.currentRun,
        appId,
      });
      const data = await apiPost("/api/scenarios/analyze-log", body);
      S.lastAnalysis = data;
      if (data.playbookSteps?.length) SC.applyPlaybookProgress(data.playbookSteps);
      paintFinishRunLogStatus();
    } catch (err) {
      S.lastAnalysis = null;
      const box = el("finish-run-log-status");
      const details = el("finish-run-check-details");
      if (box) {
        box.hidden = false;
        box.className = "finish-run-log-status fail";
        box.textContent = `Check log error: ${String(err?.message || err)}`;
      }
      if (details) details.hidden = true;
    }
  }

  function resolveFinishOutcomeFromLog() {
    if (!S.lastAnalysis) return undefined;
    if (typeof S.lastAnalysis.checkPassed === "boolean") return S.lastAnalysis.checkPassed ? "pass" : "fail";
    if (S.lastAnalysis.ok === true) return "pass";
    if (S.lastAnalysis.ok === false) return "fail";
    return undefined;
  }

  function paintFinishRunLogStatus() {
    const box = el("finish-run-log-status");
    const details = el("finish-run-check-details");
    if (!box) return;

    const outcome = resolveFinishOutcomeFromLog();
    const analysis = S.lastAnalysis;
    const ui =
      global.ScenarioFieldLog?.formatCheckLogFinishUi?.(analysis) || {
        headline: null,
        failedLines: [],
        summary: null,
      };

    box.hidden = false;
    if (outcome === "pass") {
      box.className = "finish-run-log-status pass";
      box.textContent = ui.headline || "Check log: pass — will be saved on archive.";
      if (details) details.hidden = true;
    } else if (outcome === "fail") {
      box.className = "finish-run-log-status fail";
      box.textContent = ui.headline || "Check log: fail — will be saved on archive.";
      if (details) {
        if (ui.failedLines?.length) {
          details.hidden = false;
          details.innerHTML =
            (ui.summary
              ? `<div class="finish-check-summary">${escapeFinishHtml(ui.summary)}</div>`
              : "") +
            ui.failedLines
              .map((line) => `<p class="finish-check-line">${escapeFinishHtml(line)}</p>`)
              .join("");
        } else {
          details.hidden = true;
        }
      }
    } else if (S.lastCloudLogMeta?.selected_path) {
      box.className = "finish-run-log-status pending";
      box.textContent = "Cloud log loaded but Check log did not run — try again or archive without pass/fail.";
      if (details) details.hidden = true;
    } else {
      box.className = "finish-run-log-status pending";
      box.textContent =
        "No cloud log for this phone — upload from Settings → Deal alert test log, then open Finish again.";
      if (details) details.hidden = true;
    }
  }

  function escapeFinishHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function openFinishRunModal() {
    if (!S.currentRun) return;
    const modal = el("finish-run-modal");
    const notes = el("finish-run-notes");
    const warn = el("finish-run-warn");
    if (notes) notes.value = "";
    paintFinishRunLogStatus();
    if (warn) {
      const shortId = S.currentRun.short_id;
      warn.innerHTML =
        `<strong>Run ${shortId}</strong> on ${S.consoleEnvLabel}:<br>` +
        `• <strong>Remove</strong> — deletes seeded scenario shops/offers from ${S.consoleEnvLabel} DB; clears map &amp; active run.<br>` +
        `• <strong>Archive</strong> — keeps notes, devices &amp; Check log result in Run log.<br>` +
        `Does not reset phones — use a new Run for fresh installs.`;
    }
    if (modal) modal.hidden = false;
    refreshCheckLogForFinish();
  }

  function closeFinishRunModal() {
    const modal = el("finish-run-modal");
    if (modal) modal.hidden = true;
  }

  function cleanupRun() {
    if (!S.currentRun) {
      setStatus("Nothing to remove.", false);
      return;
    }
    openFinishRunModal();
  }

  async function submitFinishRun() {
    if (!S.currentRun) return;
    const notes = el("finish-run-notes")?.value?.trim() || undefined;
    const outcome = resolveFinishOutcomeFromLog();
    const confirmBtn = el("btn-finish-confirm");
    btnLoading(confirmBtn, true);
    try {
      await apiPost("/api/scenarios/cleanup", { run_id: S.currentRun.run_id, outcome, notes });
      closeFinishRunModal();
      S.currentRun = null;
      S.lastAnalysis = null;
      SC.clearShopMarkers();
      el("shop-list").innerHTML = "";
      el("redeem-phone-block").hidden = true;
      setStatus(`Scenario finished and archived on ${S.consoleEnvLabel}.`, true);
      SC.updateRunButtons();
      SC.updateCleanupHint(null);
      SC.refreshPlaybookStatus();
      await SC.loadRunHistory();
    } catch (e) {
      setStatus(String(e.message || e), false);
    } finally {
      btnLoading(confirmBtn, false);
    }
  }

  Object.assign(SC, {
    openFinishRunModal,
    closeFinishRunModal,
    cleanupRun,
    submitFinishRun,
    resolveFinishOutcomeFromLog,
    paintFinishRunLogStatus,
    refreshCheckLogForFinish,
  });
})(typeof window !== "undefined" ? window : globalThis);

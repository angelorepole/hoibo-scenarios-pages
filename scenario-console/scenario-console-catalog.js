/** Scenario picker — categories, presets, blurbs, cleanup hints. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const summaryAddsInfo = SC.summaryAddsInfo;
  const acceptanceIdsNotInLabel = SC.acceptanceIdsNotInLabel;

  function cleanupHintText(run) {
    if (run?.cleanup_when) return `When to remove: ${run.cleanup_when}`;
    const p = S.scenarioList.find((x) => x.id === (run?.scenario_id || run?.preset_id || el("preset").value));
    return p?.cleanupWhen
      ? `When to remove: ${p.cleanupWhen}`
      : "When to remove: after field log check PASS (see playbook last step).";
  }

  function updateCleanupHint(_run) {
    el("cleanup-hint").textContent = cleanupHintText(S.currentRun || null);
  }

  function syncPresetFromRun(run) {
    if (!run) return;
    const id = run.scenario_id || run.preset_id;
    if (!id) return;
    const match = S.scenarioList.find((s) => s.id === id);
    const catSel = el("category");
    const presetSel = el("preset");
    if (!match || !catSel || !presetSel) return;
    catSel.value = match.category || "intent";
    presetSel.innerHTML = "";
    S.scenarioList
      .filter((p) => (p.category || "intent") === catSel.value)
      .forEach((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.label;
        presetSel.appendChild(o);
      });
    presetSel.value = id;
    SC.syncScenarioUi(match);
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

  function fillPresets() {
    const categorySel = el("category");
    const presetSel = el("preset");
    const categories = S.catalog?.categories || [{ id: "intent", label: "Intent field tests" }];
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
      S.scenarioList
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
      const p = S.scenarioList.find((x) => x.id === presetSel.value);
      if (!p) return;
      renderScenarioBlurb(p);
      const seedEl = el("preset-seed");
      if (seedEl) {
        seedEl.textContent = "";
        seedEl.hidden = true;
      }
      if (!S.currentRun) SC.syncScenarioUi(p);
      SC.applyScenarioRadius(p);
      SC.renderPlaybook(p.playbook || [], p.passCriteria || p.fieldLogExpect || [], p.multiDay);
      if (!S.currentRun) {
        SC.resetOptionalDevicePick();
        updateCleanupHint(null);
      }
      SC.refreshPlaybookStatus();
    };
    renderPresetOptions();
  }

  Object.assign(SC, { updateCleanupHint, syncPresetFromRun, fillPresets });
})(typeof window !== "undefined" ? window : globalThis);

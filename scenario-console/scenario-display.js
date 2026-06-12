/** Plain-English copy from each scenario's pack `display` block. */
(function (global) {
  const WHO_LABELS = {
    Mac: "Setup",
    Console: "Setup",
    Check: "Verify",
    Field: "Walk",
    Phone: "Phone",
    Optional: "Optional",
    Setup: "Setup",
    Walk: "Walk",
    Verify: "Verify",
  };

  function normalizePlaybookWho(playbook) {
    return (playbook || []).map((step) => ({
      ...step,
      who: WHO_LABELS[step.who] || step.who || "Step",
    }));
  }

  function applyHumanCopy(scenario) {
    if (!scenario) return scenario;
    const overlay = scenario.display || {};
    const merged = { ...scenario };
    for (const key of ["purpose", "summary", "passCriteria", "playbook", "cleanupWhen"]) {
      if (overlay[key] !== undefined) merged[key] = overlay[key];
    }
    if (merged.playbook) merged.playbook = normalizePlaybookWho(merged.playbook);
    else if (scenario.playbook) merged.playbook = normalizePlaybookWho(scenario.playbook);
    merged.passCriteria = merged.passCriteria || merged.fieldLogExpect || [];
    merged.fieldLogExpect = merged.passCriteria;
    return merged;
  }

  function scenarioForDisplay(scenario) {
    return applyHumanCopy(scenario);
  }

  global.ScenarioDisplay = {
    applyHumanCopy,
    scenarioForDisplay,
    normalizePlaybookWho,
  };
})(typeof window !== "undefined" ? window : globalThis);

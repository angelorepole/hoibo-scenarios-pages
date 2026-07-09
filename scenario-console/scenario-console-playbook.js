/** Playbook list rendering and progress polling. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const escapeHtml = SC.escapeHtml;
  const activeScenarioId = SC.activeScenarioId;
  const playbookWhoLabel = SC.playbookWhoLabel;
  const isHostedConsole = SC.isHostedConsole;
  const apiPost = SC.apiPost;

  function playbookExpectsRedeem(playbook) {
    return window.ScenarioDisplay.playbookExpectsRedeem(playbook);
  }

  function playbookStepStatus(step, prog) {
    if (S.manualDoneSteps[String(step.step)]) return "pass";
    return prog?.status || (step.verify === "manual" ? "manual" : "pending");
  }

  function visiblePlaybookSteps(steps) {
    const list = steps || [];
    if (isHostedConsole() && S.currentRun && window.ScenarioDisplay?.filterPlaybookForHosted) {
      return ScenarioDisplay.filterPlaybookForHosted(list, true);
    }
    return list;
  }

  function stepMark(status) {
    if (status === "pass") return '<span class="step-mark step-pass">✓</span>';
    if (status === "fail") return '<span class="step-mark step-fail">✗</span>';
    if (status === "pending") return '<span class="step-mark step-pending">○</span>';
    return '<span class="step-mark step-manual">·</span>';
  }

  function updatePlaybookHeading() {
    const heading = el("playbook-heading");
    if (!heading) return;
    if (!S.currentRun) {
      heading.textContent = "What to do";
      return;
    }
    const steps = S.lastPlaybook.steps;
    const byStep = Object.fromEntries((S.playbookProgress || []).map((p) => [String(p.step), p]));
    const passed = steps.filter((s) => playbookStepStatus(s, byStep[String(s.step)]) === "pass").length;
    const failed = steps.filter((s) => playbookStepStatus(s, byStep[String(s.step)]) === "fail").length;
    let line = isHostedConsole()
      ? `Your steps — ${passed} of ${steps.length} done`
      : `Progress — ${passed} of ${steps.length} done`;
    if (failed) line += ` · ${failed} need attention`;
    heading.textContent = line;
  }

  async function refreshPlaybookStatus() {
    const steps = S.lastPlaybook.steps;
    if (!steps.length) return;
    try {
      const data = await apiPost("/api/scenarios/playbook-status", {
        scenario_id: activeScenarioId(),
        run_id: S.currentRun?.run_id,
        run_active: !!S.currentRun,
      });
      S.playbookProgress = data.playbookSteps || [];
      paintPlaybookList();
    } catch (_) {
      /* keep last marks */
    }
  }

  function paintPlaybookList() {
    const container = el("playbook-steps");
    const steps = S.lastPlaybook.steps;
    const byStep = Object.fromEntries((S.playbookProgress || []).map((p) => [String(p.step), p]));
    container.innerHTML = "";
    const groups = window.ScenarioDisplay?.groupPlaybookBySection
      ? ScenarioDisplay.groupPlaybookBySection(steps)
      : [{ id: "all", label: "", steps }];
    groups.forEach((group) => {
      const block = document.createElement("div");
      block.className = group.id === "all" ? "playbook-section" : `playbook-section playbook-section-${group.id}`;
      if (group.label) {
        const head = document.createElement("div");
        head.className = "playbook-section-head";
        head.textContent = group.label;
        block.appendChild(head);
        if (group.id === "setup" && !S.currentRun) {
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
        const whoHtml = escapeHtml(playbookWhoLabel(s.who));
        const doBlock = doHtml.includes("step-do-list")
          ? `<span class="step-body"><span class="who">${whoHtml}</span>${doHtml}${detail}</span>`
          : `<span class="step-body"><span class="who">${whoHtml}</span> — ${doHtml}${detail}</span>`;
        li.innerHTML = `${mark}${doBlock}`;
        if (status === "manual") {
          li.classList.add("playbook-tap-done");
          li.title = "Tap when you have done this step";
          li.addEventListener("click", () => {
            S.manualDoneSteps[String(s.step)] = true;
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

  function renderPlaybook(steps, expects, multiDay) {
    const box = el("playbook-preview");
    const expectBox = el("playbook-expect");
    const expectList = el("playbook-expect-list");
    const allSteps = steps || [];
    S.lastPlaybook = {
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

  function applyPlaybookProgress(steps) {
    if (steps?.length) S.playbookProgress = steps;
    paintPlaybookList();
  }

  Object.assign(SC, {
    playbookExpectsRedeem,
    updatePlaybookHeading,
    refreshPlaybookStatus,
    renderPlaybook,
    applyPlaybookProgress,
  });
})(typeof window !== "undefined" ? window : globalThis);

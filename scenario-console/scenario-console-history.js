/** Run history table — load, filter by env, delete archived rows. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const api = SC.api;
  const apiPost = SC.apiPost;
  const formatWhen = SC.formatWhen;
  const formatDuration = SC.formatDuration;
  const statusTag = SC.statusTag;
  const deviceNames = SC.deviceNames;

  function historyRowsForEnv(rows) {
    return (rows || []).filter((r) => String(r.console_env || "stage").toLowerCase() === S.consoleEnvSlug);
  }

  function updateRunHistoryHeading() {
    el("run-history-heading").textContent = `Run log — ${S.consoleEnvLabel}`;
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
        empty.textContent = `No runs on ${S.consoleEnvLabel} yet.`;
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
          const canDel = r.status !== "in_progress" && rid && rid !== S.currentRun?.run_id;
          const delBtn = canDel
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
      empty.textContent = `Could not load run log for ${S.consoleEnvLabel}.`;
      setStatus(String(e.message || e), false);
    }
  }

  async function deleteHistoryRun(runId) {
    if (!runId) return;
    if (!confirm("Remove this run from the log? (Archived copy in cloud storage is deleted.)")) return;
    try {
      await apiPost("/api/scenarios/cleanup", { run_id: runId, delete_log_only: true });
      setStatus("Run removed from log.", true);
      await loadRunHistory();
    } catch (e) {
      const msg = String(e.message || e);
      setStatus(
        msg.includes("404") ? "Remove failed — restart Dev Console (server.py) and try again." : msg,
        false,
      );
    }
  }

  Object.assign(SC, { loadRunHistory, deleteHistoryRun });
})(typeof window !== "undefined" ? window : globalThis);

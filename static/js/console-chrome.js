/** Shared Stage / Prod lane chrome — dev console + scenario console */
(function (global) {
  const LANE_CLASSES = ["console-lane-stage", "console-lane-prod", "console-lane-local"];

  async function defaultFetchJson(path, opts) {
    const res = await fetch(path, { cache: "no-store", ...(opts || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function defaultPostTarget(target) {
    return defaultFetchJson("/api/environment/target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
  }

  let fetchJson = defaultFetchJson;
  let postTarget = defaultPostTarget;

  function configure(options) {
    if (options && typeof options.fetchJson === "function") {
      fetchJson = options.fetchJson;
    }
    if (options && typeof options.postTarget === "function") {
      postTarget = options.postTarget;
    }
  }

  function applyEnvironmentChrome(envState, options) {
    const env = String(envState?.console?.env || "stage").toLowerCase();
    const roots = (options && options.roots) || [document.body];
    roots.forEach((root) => {
      if (!root) return;
      root.classList.remove(...LANE_CLASSES);
      if (env === "stage" || env === "prod" || env === "local") {
        root.classList.add(`console-lane-${env}`);
      }
    });
    const layout =
      document.getElementById("walk-layout") || document.querySelector(".layout");
    if (layout && !roots.includes(layout)) {
      layout.classList.remove(...LANE_CLASSES);
      if (env === "stage" || env === "prod" || env === "local") {
        layout.classList.add(`console-lane-${env}`);
      }
    }
    document.querySelectorAll("#env-target-btns button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === env);
    });
    const header = document.getElementById("app-header");
    if (header) {
      header.classList.remove("prod-locked");
      if (
        envState?.console?.env === "prod" &&
        !envState.allowsDataCommands &&
        !envState.allowsProdDatabaseWipe
      ) {
        header.classList.add("prod-locked");
      }
    }
  }

  async function fetchEnvironment() {
    return fetchJson("/api/environment");
  }

  async function postConsoleTarget(target) {
    return postTarget(target);
  }

  function wireConsoleTargetButtons(onChanged) {
    document.querySelectorAll("#env-target-btns button").forEach((btn) => {
      btn.onclick = async () => {
        const target = btn.dataset.target;
        if (!target || btn.classList.contains("active")) return;
        try {
          await postConsoleTarget(target);
          if (typeof onChanged === "function") {
            await onChanged();
          }
        } catch (err) {
          console.error("[HoiboConsoleChrome] lane switch failed:", err);
          throw err;
        }
      };
    });
  }

  global.HoiboConsoleChrome = {
    configure,
    applyEnvironmentChrome,
    fetchEnvironment,
    postConsoleTarget,
    wireConsoleTargetButtons,
  };
})(window);

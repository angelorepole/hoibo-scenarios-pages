/** Lazy-load field-log-engine, field-log-analyze, and playbook-evaluate (Mac defers until Finish). */
(function (global) {
  const SCRIPTS = ["field-log-engine.js", "field-log-analyze.js", "playbook-evaluate.js"];
  let inflight = null;

  function isFieldLogLoaded() {
    return Boolean(
      global.ScenarioFieldLog?.buildFieldLogRequestBody && global.ScenarioPlaybook?.evaluatePlaybook,
    );
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-scenario-field-log-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
          once: true,
        });
        return;
      }
      const el = document.createElement("script");
      el.src = src;
      el.dataset.scenarioFieldLogSrc = src;
      el.onload = () => {
        el.dataset.loaded = "1";
        resolve();
      };
      el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
  }

  async function ensureFieldLogScripts() {
    if (isFieldLogLoaded()) return;
    if (!inflight) {
      inflight = (async () => {
        for (const src of SCRIPTS) {
          await loadScript(src);
        }
        if (!isFieldLogLoaded()) {
          throw new Error("field-log scripts did not initialize");
        }
      })().catch((err) => {
        inflight = null;
        throw err;
      });
    }
    await inflight;
  }

  const api = { ensureFieldLogScripts, isFieldLogLoaded };
  global.ScenarioFieldLogLoader = api;
  if (global.ScenarioConsole) Object.assign(global.ScenarioConsole, api);
})(typeof globalThis !== "undefined" ? globalThis : window);

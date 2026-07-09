/** API transport — local dev server or hosted bootstrap shim. */
(function (global) {
  const SC = global.ScenarioConsole;

  function isHostedConsole() {
    return typeof window.__hostedScenariosApi === "function";
  }

  async function api(path, opts) {
    opts = opts || {};
    const method = (opts.method || "GET").toUpperCase();
    if (method === "GET" && opts.cache == null) opts = { ...opts, cache: "no-store" };
    if (isHostedConsole()) return window.__hostedScenariosApi(path, opts);
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function apiPost(path, body) {
    return api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  Object.assign(SC, { isHostedConsole, api, apiPost });
})(typeof window !== "undefined" ? window : globalThis);

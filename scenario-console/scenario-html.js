/** Shared HTML escaper for scenario console + display modules. */
(function (global) {
  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.ScenarioHtml = { escapeHtml };
})(typeof globalThis !== "undefined" ? globalThis : window);

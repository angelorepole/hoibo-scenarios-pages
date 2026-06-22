/**
 * Short-lived scenario unlock tokens (HMAC). Must match shared/scenario_unlock_token.py
 */
(function (global) {
  const VERSION = "v1";
  const PURPOSE = "scenario-decrypt";

  function b64urlEncode(bytes) {
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function b64urlDecode(text) {
    const pad = "=".repeat((4 - (text.length % 4)) % 4);
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function verifyScenarioUnlockToken(encryptKey, token) {
    const secret = String(encryptKey || "").trim();
    const raw = String(token || "").trim();
    if (!secret || !raw) return false;
    const parts = raw.split(".");
    if (parts.length !== 3 || parts[0] !== VERSION) return false;
    const payloadB64 = parts[1];
    const sigB64 = parts[2];
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    } catch (_) {
      return false;
    }
    if (payload.purpose !== PURPOSE) return false;
    const exp = Number(payload.exp || 0);
    if (!exp || exp <= Math.floor(Date.now() / 1000)) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    const given = b64urlDecode(sigB64);
    return crypto.subtle.verify("HMAC", key, given, new TextEncoder().encode(payloadB64));
  }

  global.ScenarioUnlockToken = { verifyScenarioUnlockToken, VERSION, PURPOSE };
})(typeof globalThis !== "undefined" ? globalThis : window);

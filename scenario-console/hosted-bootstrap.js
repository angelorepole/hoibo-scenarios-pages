(function () {
  const host = window.location.hostname;
  const isLocal = host === "127.0.0.1" || host === "localhost";
  if (isLocal) return;

  const LEGACY_KEY = "scenarios_admin_api_key";
  /** Decrypts catalog/devices/env blobs (Pages build uses .env.stage ADMIN_API_KEY). */
  const CRYPTO_KEY = "scenarios_crypto_admin_key";
  /** Per-env Supabase x-admin-api-key (STAGE and PROD differ). */
  const API_KEY_PREFIX = "scenarios_api_key_";
  /** User opted in to persist keys on this browser (localStorage). */
  const REMEMBER_PREF = "scenarios_remember_on_device";

  function rememberKeysEnabled() {
    return localStorage.getItem(REMEMBER_PREF) === "1";
  }

  function getStoredKey(name) {
    const session = (sessionStorage.getItem(name) || "").trim();
    if (session) return session;
    if (rememberKeysEnabled()) return (localStorage.getItem(name) || "").trim();
    return "";
  }

  function clearRememberedKeysOnly() {
    localStorage.removeItem(REMEMBER_PREF);
    localStorage.removeItem(CRYPTO_KEY);
    localStorage.removeItem(LEGACY_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(API_KEY_PREFIX)) localStorage.removeItem(k);
    }
  }

  function persistKey(name, value) {
    sessionStorage.setItem(name, value);
    const remember =
      typeof window.__adminKeyRememberOnDevice === "function" &&
      window.__adminKeyRememberOnDevice();
    if (remember) {
      localStorage.setItem(name, value);
      localStorage.setItem(REMEMBER_PREF, "1");
      return;
    }
    clearRememberedKeysOnly();
  }

  function removeStoredKey(name) {
    sessionStorage.removeItem(name);
    localStorage.removeItem(name);
  }

  function migrateLegacyAdminKey() {
    const legacy =
      sessionStorage.getItem(LEGACY_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    if (!getStoredKey(CRYPTO_KEY)) {
      sessionStorage.setItem(CRYPTO_KEY, legacy);
      if (rememberKeysEnabled()) localStorage.setItem(CRYPTO_KEY, legacy);
    }
    if (!getStoredKey(API_KEY_PREFIX + "stage")) {
      sessionStorage.setItem(API_KEY_PREFIX + "stage", legacy);
      if (rememberKeysEnabled()) {
        localStorage.setItem(API_KEY_PREFIX + "stage", legacy);
      }
    }
    removeStoredKey(LEGACY_KEY);
  }

  async function promptAdminKey(message) {
    if (typeof window.__promptAdminKey === "function") {
      return window.__promptAdminKey(message);
    }
    return prompt(message);
  }

  function clearCryptoCaches() {
    envConfigCache = null;
    catalogCache = null;
  }

  function clearAllScenarioKeys() {
    removeStoredKey(CRYPTO_KEY);
    removeStoredKey(LEGACY_KEY);
    localStorage.removeItem(REMEMBER_PREF);
    for (const store of [sessionStorage, localStorage]) {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k && k.startsWith(API_KEY_PREFIX)) store.removeItem(k);
      }
    }
    clearCryptoCaches();
  }

  window.__clearScenarioKeys = clearAllScenarioKeys;

  let cryptoKeyInflight = null;
  const supabaseKeyInflight = {};

  /** Key for decrypting *.enc.json (build-time; usually .env.stage). */
  async function cryptoAdminKey() {
    migrateLegacyAdminKey();
    const stored = getStoredKey(CRYPTO_KEY);
    if (stored) return stored;

    if (!cryptoKeyInflight) {
      cryptoKeyInflight = (async () => {
        const k = await promptAdminKey(
          "Admin API key for encrypted scenario files (Pages build key — usually from .env.stage):",
        );
        const trimmed = (k || "").trim();
        if (trimmed) persistKey(CRYPTO_KEY, trimmed);
        if (!trimmed) {
          throw new Error(
            "Admin API key required — enter ADMIN_API_KEY from Hoibo .env.stage to unlock scenario files.",
          );
        }
        return trimmed;
      })().catch((err) => {
        cryptoKeyInflight = null;
        throw err;
      });
    }
    return cryptoKeyInflight;
  }

  /** Key for scenario-runs / field-log Edge Functions on the selected env. */
  async function supabaseAdminKey(env) {
    migrateLegacyAdminKey();
    const slug = String(env || consoleEnv || "stage").toLowerCase();
    const storageKey = API_KEY_PREFIX + slug;
    const stored = getStoredKey(storageKey);
    if (stored) return stored;

    if (!supabaseKeyInflight[slug]) {
      supabaseKeyInflight[slug] = (async () => {
        const k = await promptAdminKey(
          `Supabase admin key for ${slug.toUpperCase()} (from Hoibo .env.${slug} — not the same as STAGE if PROD):`,
        );
        const trimmed = (k || "").trim();
        if (trimmed) persistKey(storageKey, trimmed);
        if (!trimmed) {
          throw new Error(
            `Supabase admin key required for ${slug.toUpperCase()} — enter ADMIN_API_KEY from Hoibo .env.${slug}.`,
          );
        }
        return trimmed;
      })().catch((err) => {
        delete supabaseKeyInflight[slug];
        throw err;
      });
    }
    return supabaseKeyInflight[slug];
  }

  function clearSupabaseAdminKey(env) {
    removeStoredKey(API_KEY_PREFIX + String(env || consoleEnv).toLowerCase());
  }

  const ENV_KEY = "scenarios_console_env";

  let envConfigCache = null;
  let catalogCache = null;

  async function getEnvConfig() {
    if (!envConfigCache) {
      envConfigCache = await ScenarioHostedCrypto.fetchEncryptedJson(
        "../environments.enc.json",
        await cryptoAdminKey(),
      );
    }
    return envConfigCache;
  }

  async function getCatalog() {
    if (!catalogCache) {
      catalogCache = await ScenarioHostedCrypto.fetchEncryptedJson(
        "../scenarios/catalog.enc.json",
        await cryptoAdminKey(),
      );
    }
    return catalogCache;
  }

  function mapScenarioBase(s) {
    return {
      id: s.id,
      label: s.label || s.id,
      purpose: s.purpose || "",
      summary: s.summary || "",
      category: s.category || "intent",
      engineRef: s.engineRef || "",
      acceptanceIds: s.acceptanceIds || [],
      multiDay: !!s.multiDay,
      playbook: s.playbook || [],
      fieldLogExpect: s.fieldLogExpect || [],
      fieldLogRules: s.fieldLogRules || {},
      passCriteria: s.passCriteria || s.fieldLogExpect || [],
      cleanupWhen: s.cleanupWhen || "",
    };
  }

  async function mapScenarioList(catalog) {
    return (catalog.scenarios || catalog.presets || []).map((s) => {
      const base = mapScenarioBase(s);
      const merged =
        typeof ScenarioDisplay !== "undefined"
          ? ScenarioDisplay.applyHumanCopy({ ...s, ...base })
          : base;
      return {
        ...mapScenarioBase(merged),
        passCriteria: merged.passCriteria || merged.fieldLogExpect || [],
        fieldLogExpect: merged.passCriteria || merged.fieldLogExpect || [],
      };
    });
  }

  let consoleEnv = sessionStorage.getItem(ENV_KEY) || "stage";

  async function envStatus() {
    const cfg = await getEnvConfig();
    const block = cfg[consoleEnv] || {};
    const preLaunch = !!cfg.preLaunchScenarioTesting;
    let message = "Hosted Scenarios — run, map, and log check from this page.";
    if (consoleEnv === "prod" && preLaunch) {
      message = "PROD pre-launch — scenarios only. No DB reset from here.";
    }
    return {
      ok: true,
      console: { env: consoleEnv, label: block.label || consoleEnv.toUpperCase() },
      app: { env: "unknown", label: "—" },
      preLaunchScenarioTesting: preLaunch,
      mismatch: false,
      message,
    };
  }

  async function supabaseFn(name, body) {
    const cfg = await getEnvConfig();
    const env = cfg[consoleEnv];
    if (!env || !env.supabaseUrl) throw new Error("Unknown env: " + consoleEnv);
    const res = await fetch(env.supabaseUrl + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-api-key": await supabaseAdminKey(consoleEnv),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearSupabaseAdminKey(consoleEnv);
      throw new Error(
        `Admin key rejected for ${consoleEnv.toUpperCase()} — use ADMIN_API_KEY from Hoibo .env.${consoleEnv} (not .env.stage). Refresh and try again.`,
      );
    }
    if (!res.ok || data.ok === false) {
      if (res.status === 404 && name === "report-field-log") {
        throw new Error(
          `Intent report not deployed on ${consoleEnv.toUpperCase()} — run: supabase functions deploy report-field-log (linked to that project), or switch to Stage.`,
        );
      }
      throw new Error(data.error || data.message || "HTTP " + res.status);
    }
    return data;
  }

  async function findScenario(scenarioId) {
    const catalog = await getCatalog();
    const scenarios = await mapScenarioList(catalog);
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) throw new Error("Unknown scenario: " + scenarioId);
    const raw = (catalog.scenarios || catalog.presets || []).find((s) => s.id === scenarioId);
    return { ...(raw || {}), ...scenario };
  }

  async function loadRunMeta(runId) {
    if (!runId) return null;
    try {
      const data = await supabaseFn("scenario-runs", {
        action: "get",
        run_id: runId,
        console_env: consoleEnv,
      });
      return data.run || null;
    } catch (_) {
      return { run_id: runId, note: "Run not found in storage" };
    }
  }

  window.__hostedScenariosApi = async function (path, opts) {
    opts = opts || {};
    const method = (opts.method || "GET").toUpperCase();
    const body = opts.body ? JSON.parse(opts.body) : {};

    if (path === "/api/environment") return envStatus();
    if (path === "/api/environment/target" && method === "POST") {
      consoleEnv = (body.target || "stage").toLowerCase();
      sessionStorage.setItem(ENV_KEY, consoleEnv);
      return envStatus();
    }
    if (path === "/api/scenarios/catalog") {
      const catalog = await getCatalog();
      const scenarios = await mapScenarioList(catalog);
      return { ok: true, catalog, scenarios };
    }
    if (path === "/api/scenarios/devices") {
      try {
        const devices = await ScenarioHostedCrypto.fetchEncryptedJson(
          "../devices.enc.json",
          await cryptoAdminKey(),
        );
        return { ok: true, devices: devices.devices || devices };
      } catch (_) {
        return { ok: true, devices: [] };
      }
    }
    if (path === "/api/scenarios/phones") {
      const d = await window.__hostedScenariosApi("/api/scenarios/devices");
      const phones = (d.devices || [])
        .filter((x) => (x.roles || []).includes("customer"))
        .filter((x) => (x.backend_env || "stage") === consoleEnv)
        .map((x) => ({
          slot: x.slot,
          name: x.name,
          device_id: x.id || x.device_id,
          app_id: String(x.customer_app_id || x.app_id || "").trim() || null,
          backend_env: x.backend_env || "stage",
          roles: x.roles || ["customer"],
        }));
      return { ok: true, phones };
    }
    if (path === "/api/scenarios/runs") {
      const data = await supabaseFn("scenario-runs", {
        action: "list",
        console_env: consoleEnv,
        active_only: true,
        limit: 20,
      });
      return { ok: true, runs: data.runs || [] };
    }
    if (path === "/api/scenarios/history") {
      const data = await supabaseFn("scenario-runs", {
        action: "list",
        console_env: consoleEnv,
        limit: 100,
      });
      return { ok: true, history: data.runs || [] };
    }
    if (path.startsWith("/api/scenarios/run/") && method === "GET") {
      const runId = path.split("/").pop();
      const data = await supabaseFn("scenario-runs", {
        action: "get",
        run_id: runId,
        console_env: consoleEnv,
      });
      return { ok: true, run: data.run };
    }
    if (path === "/api/scenarios/validate-run-sync" && method === "POST") {
      const appId = String(body.app_id || "").trim();
      const runId = String(body.run_id || "").trim();
      if (!appId) throw new Error("app_id required");
      if (!runId) throw new Error("run_id required");
      if (!globalThis.ScenarioFieldLog?.validateRunSyncDiagnostic) {
        throw new Error("field-log-analyze.js not loaded");
      }
      const runMeta = await loadRunMeta(runId);
      const listed = await supabaseFn("list-field-logs", {
        app_id: appId,
        limit: 10,
        include_entries: true,
        console_env: consoleEnv,
      });
      const diagnostic = globalThis.ScenarioFieldLog.validateRunSyncDiagnostic({
        appId,
        runMeta,
        uploads: listed.uploads || [],
      });
      const syncOk = Boolean(diagnostic.ok);
      const { ok: _dropOk, ...rest } = diagnostic;
      return { ok: true, syncOk, ...rest };
    }
    if (path === "/api/scenarios/analyze-log" && method === "POST") {
      const scenarioId = body.scenario_id || body.preset_id;
      if (!scenarioId) throw new Error("scenario_id required");
      const log = body.log ?? body.logJson ?? body.log_json;
      if (log == null) throw new Error("log or logJson required");
      if (!globalThis.ScenarioFieldLog) {
        throw new Error("field-log-analyze.js not loaded");
      }
      const scenario = await findScenario(String(scenarioId));
      const runMeta = body.run_id ? await loadRunMeta(String(body.run_id)) : null;
      const uploadScenarioId = body.upload_scenario_id || body.log_scenario_id || null;
      const uploadRunId = body.upload_run_id || body.log_run_id || null;
      const result = globalThis.ScenarioFieldLog.analyzeFieldLog(scenario, log, runMeta, {
        uploadScenarioId,
        uploadRunId,
      });
      const playbookSteps = globalThis.ScenarioPlaybook
        ? globalThis.ScenarioPlaybook.evaluatePlaybook(scenario, {
            runMeta,
            log,
            runActive: Boolean(runMeta?.shops?.length),
            fieldLogOk: result.ok,
          })
        : [];
      if (body.run_id && body.app_id) {
        try {
          const run = runMeta || (await loadRunMeta(String(body.run_id)));
          if (run?.run_id) {
            const checks = run.field_log_checks || [];
            checks.push({
              at: new Date().toISOString(),
              app_id: body.app_id,
              ok: result.ok,
              summary: result.summary,
            });
            run.field_log_checks = checks;
            await supabaseFn("scenario-runs", { action: "save", run, console_env: consoleEnv });
          }
        } catch (_) {
          /* optional persist */
        }
      }
      const { ok: checkPassed, ...analysis } = result;
      return { ok: true, checkPassed, ...analysis, playbookSteps };
    }
    if (path === "/api/scenarios/report-log" && method === "POST") {
      const log = body.log ?? body.logJson ?? body.log_json;
      if (log == null) throw new Error("log or logJson required");
      const payload = typeof log === "string" ? { logJson: log } : { log };
      const consoleScenarioId =
        body.scenario_id || body.preset_id || body.console_scenario_id;
      if (consoleScenarioId) payload.scenario_id = String(consoleScenarioId);
      if (body.upload_scenario_id) {
        payload.upload_scenario_id = String(body.upload_scenario_id);
      }
      if (body.upload_run_id) payload.upload_run_id = String(body.upload_run_id);
      // Active console run only — never fall back to cloud file stamp.
      const consoleRunId = body.console_run_id || body.run_id;
      if (consoleRunId) payload.console_run_id = String(consoleRunId);
      if (body.log_uploaded_at) payload.log_uploaded_at = String(body.log_uploaded_at);
      if (body.console_run_started_at) {
        payload.console_run_started_at = String(body.console_run_started_at);
      }
      if (body.memory_trace) payload.memory_trace = body.memory_trace;
      if (body.tech_log) payload.tech_log = body.tech_log;
      return supabaseFn("report-field-log", payload);
    }
    if (path === "/api/scenarios/playbook-status" && method === "POST") {
      const scenarioId = body.scenario_id || body.preset_id;
      if (!scenarioId) throw new Error("scenario_id required");
      if (!globalThis.ScenarioPlaybook) {
        throw new Error("playbook-evaluate.js not loaded");
      }
      const scenario = await findScenario(String(scenarioId));
      const runMeta = body.run_id ? await loadRunMeta(String(body.run_id)) : null;
      const log = body.log ?? body.logJson ?? body.log_json;
      const runActive = body.run_active != null ? Boolean(body.run_active) : Boolean(runMeta);
      const playbookSteps = globalThis.ScenarioPlaybook.evaluatePlaybook(scenario, {
        runMeta,
        log,
        runActive,
        fieldLogOk: body.field_log_ok,
      });
      return { ok: true, playbookSteps };
    }

    if (path.startsWith("/api/scenarios/field-logs")) {
      if (method === "GET") {
        const q = new URL(path, "http://x").searchParams;
        const data = await supabaseFn("list-field-logs", {
          app_id: q.get("app_id") || undefined,
          limit: Number(q.get("limit") || 5),
          include_entries: q.get("include_entries") === "true",
          console_env: consoleEnv,
        });
        return { ok: true, uploads: data.uploads || [] };
      }
      return supabaseFn("list-field-logs", { ...body, console_env: consoleEnv });
    }

    if (path === "/api/scenarios/run" && method === "POST") {
      const catalog = await getCatalog();
      const scenarios = catalog.scenarios || catalog.presets || [];
      const scenario = scenarios.find((s) => s.id === body.preset_id);
      if (!scenario) throw new Error("Unknown scenario: " + body.preset_id);
      const data = await supabaseFn("scenario-runs", {
        action: "run",
        console_env: consoleEnv,
        preset_id: body.preset_id,
        scenario,
        lat: body.lat,
        lng: body.lng,
        radius_m: body.radius_m,
        devices: body.devices,
        confirm_prod: body.confirm_prod,
        default_radius_m: catalog.defaultRadiusM,
      });
      return {
        ok: true,
        run: data.run,
        prep: data.prep,
        seedOutput: data.seedOutput,
      };
    }
    if (path.startsWith("/api/scenarios/run/") && method === "PATCH") {
      const runId = path.split("/").pop();
      if (!runId) throw new Error("run_id required");
      const data = await supabaseFn("scenario-runs", {
        action: "save",
        run: { ...(body.run || {}), ...body, run_id: runId, console_env: consoleEnv },
      });
      return { ok: true, ...data };
    }
    if (path === "/api/scenarios/prepare-devices" && method === "POST") {
      // Hosted pages cannot do local installs. Keep API shape for UI flow.
      return { ok: true, prepared: 0, skipped: "hosted" };
    }
    if (path === "/api/scenarios/cleanup" && method === "POST") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw new Error("run_id required");
      if (body.delete_log_only) {
        return supabaseFn("scenario-runs", {
          action: "delete",
          run_id: runId,
          console_env: consoleEnv,
        });
      }
      return supabaseFn("scenario-runs", {
        action: "finish",
        run_id: runId,
        console_env: consoleEnv,
        outcome: body.outcome,
        notes: body.notes,
      });
    }
    if (path === "/api/scenarios/abandon" && method === "POST") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw new Error("run_id required");
      return supabaseFn("scenario-runs", {
        action: "abandon",
        run_id: runId,
        console_env: consoleEnv,
        notes: body.notes,
        cleanup_db: Boolean(body.cleanup_db),
      });
    }
    if (path === "/api/scenarios/redeem" && method === "POST") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw new Error("run_id required");
      return supabaseFn("scenario-runs", {
        action: "redeem",
        run_id: runId,
        console_env: consoleEnv,
        app_id: body.app_id,
        shop_index: body.shop_index,
        offer_index: body.offer_index,
      });
    }
    if (path === "/api/scenarios/refresh-seed" && method === "POST") {
      const runId = String(body.run_id || "").trim();
      if (!runId) throw new Error("run_id required");
      const current = await supabaseFn("scenario-runs", {
        action: "get",
        run_id: runId,
        console_env: consoleEnv,
      });
      const run = current.run;
      if (!run) throw new Error("Run not found");
      const now = new Date();
      const seededAt = now.toISOString();
      const startsAt = new Date(now.getTime() - 15 * 60_000).toISOString();
      for (const shop of run.shops || []) {
        for (const offer of shop.offers || []) {
          const durationMin = Number(offer.duration_minutes) || 240;
          offer.starts_at = startsAt;
          offer.expires_at = new Date(now.getTime() + durationMin * 60_000).toISOString();
        }
      }
      run.seeded_at = seededAt;
      await supabaseFn("scenario-seed", {
        action: "seed",
        plan: {
          run_id: run.run_id,
          short_id: run.short_id,
          shops: run.shops || [],
        },
      });
      const fabricOpts = {
        enabled: true,
        merchant_fraction: 0.7,
        date_spread_days: 90,
        redemption_intensity: "medium",
        attach_fixture_docs: true,
        ...(run.accounting_fabric || {}),
      };
      const merchantIds = (run.shops || []).map((s) => s.merchant_id).filter(Boolean);
      await supabaseFn("scenario-seed", {
        action: "cleanup_accounting",
        run_id: run.run_id,
        merchant_ids: merchantIds,
      });
      const fabricResult = await supabaseFn("scenario-seed", {
        action: "fabric",
        run_id: run.run_id,
        shops: run.shops || [],
        accounting_fabric: fabricOpts,
        replace: true,
      });
      run.accounting_fabric = fabricOpts;
      run.accounting_fabric_result = fabricResult;
      await supabaseFn("scenario-runs", { action: "save", run });
      const fabricPart =
        fabricResult && fabricResult.purchases
          ? ` Accounting fabric: ${fabricResult.purchases} purchases, ${fabricResult.credits_sold} credits sold, ${fabricResult.credits_redeemed} redeemed, £${Math.round((fabricResult.deferred_liability_pence || 0) / 100)} deferred liability.`
          : "";
      const refreshWhen = now.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      return {
        ok: true,
        run,
        seedOutput: `Offers refreshed — pull feed on phone. Last offer refresh: ${refreshWhen}.${fabricPart}`,
      };
    }

    throw new Error("Unsupported hosted scenarios API: " + path);
  };
})();


/** Pure formatters and small scenario helpers (testable). */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const escapeHtml = global.ScenarioHtml.escapeHtml;

  function formatWhen(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch (_) {
      return iso.slice(0, 16);
    }
  }

  function formatRunWhen(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
      return d.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch (_) {
      return iso.slice(0, 16);
    }
  }

  function formatDuration(seconds) {
    if (seconds == null) return "";
    return seconds < 3600 ? `${Math.round(seconds / 60)}m` : `${(seconds / 3600).toFixed(1)}h`;
  }

  function lastOfferRefreshIso(run) {
    return run?.seeded_at || run?.started_at || null;
  }

  function appendLastOfferRefreshNote(message, run) {
    const base = String(message || "").trim();
    const when = formatRunWhen(lastOfferRefreshIso(run));
    if (!when || when === "—") return base;
    if (base.toLowerCase().includes("last offer refresh")) return base;
    return `${base} Last offer refresh: ${when}.`;
  }

  function statusTag(row) {
    const st = row.status || "unknown";
    const out = row.outcome;
    if (st === "in_progress") return '<span class="tag progress">in progress</span>';
    if (out === "pass") return '<span class="tag pass">pass</span>';
    if (out === "fail") return '<span class="tag fail">fail</span>';
    if (out === "partial") return '<span class="tag">partial</span>';
    if (out === "aborted") return '<span class="tag aborted">aborted</span>';
    if (st === "completed") return '<span class="tag pass">done</span>';
    if (st === "abandoned") return '<span class="tag fail">abandoned</span>';
    if (st === "superseded") return '<span class="tag">superseded</span>';
    if (st === "failed") return '<span class="tag fail">seed failed</span>';
    return `<span class="tag">${st}</span>`;
  }

  function deviceNames(devices) {
    if (!devices?.length) return "—";
    return devices.map((d) => d.name || d.slot || "?").join(", ");
  }

  function activeScenarioId() {
    return S.currentRun?.scenario_id || S.currentRun?.preset_id || el("preset").value;
  }

  function isMultiareaScenario(row) {
    if (!row) return false;
    return row.isMultiarea === true || !!(row.seed && row.seed.multiarea);
  }

  function playbookWhoLabel(who) {
    const label = String(who || "").trim();
    return label === "Walk" ? "Field" : label || "Step";
  }

  function summaryAddsInfo(purpose, summary) {
    const p = String(purpose || "").trim().toLowerCase();
    const s = String(summary || "").trim().toLowerCase();
    if (!s) return false;
    if (!p) return true;
    return p !== s && !p.includes(s) && !s.includes(p);
  }

  function acceptanceIdsNotInLabel(p) {
    const label = String(p?.label || "");
    return (p?.acceptanceIds || []).filter((id) => id && !label.includes(id));
  }

  function distMetres(aLat, aLng, bLat, bLng) {
    const R = 6371000;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(bLat - aLat);
    const dLng = toR(bLng - aLng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }

  function osmRetryZoneIndexes(run) {
    if (!run) return [];
    const status = run.osm_status;
    const fromStatus = [];
    if (status && typeof status === "object") {
      if (Array.isArray(status.failed_zone_indexes)) {
        for (const i of status.failed_zone_indexes) {
          const n = Number(i);
          if (Number.isFinite(n)) fromStatus.push(n);
        }
      }
      if (Array.isArray(status.zones)) {
        for (const z of status.zones) {
          if (z && Number(z.placed || 0) === 0 && Number.isFinite(Number(z.index))) {
            fromStatus.push(Number(z.index));
          }
        }
      }
    }

    // Older runs (or missing osm_status): infer empty commute circles from shop pins.
    const inferred = [];
    const shops = Array.isArray(run.shops) ? run.shops : [];
    const radius = Number(run.radius_m) || 2000;
    if (Array.isArray(run.zones) && run.zones.length) {
      run.zones.forEach((z, i) => {
        const zLat = Number(z?.lat);
        const zLng = Number(z?.lng);
        if (!Number.isFinite(zLat) || !Number.isFinite(zLng)) return;
        const count = shops.filter((s) => {
          if (s?.zone_index != null) return Number(s.zone_index) === i;
          const sLat = Number(s?.lat);
          const sLng = Number(s?.lng);
          if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) return false;
          return distMetres(zLat, zLng, sLat, sLng) <= radius + 1;
        }).length;
        if (count === 0) inferred.push(i);
      });
    } else if (shops.length === 0 && fromStatus.length === 0) {
      inferred.push(0);
    }

    return [...new Set([...fromStatus, ...inferred])].sort((a, b) => a - b);
  }

  function formatOsmStatusNote(run) {
    const indexes = osmRetryZoneIndexes(run);
    if (!indexes.length) return "";
    const rows = Array.isArray(run?.osm_status?.zones) ? run.osm_status.zones : [];
    const bits = indexes.map((idx) => {
      const row = rows.find((z) => Number(z?.index) === idx);
      const human = idx + 1;
      if (row?.error) return `zone ${human} (${row.error})`;
      return `zone ${human} (0 shops)`;
    });
    return `• OSM incomplete: ${bits.join("; ")}. Use Retry OSM for empty zones.`;
  }

  function formatRunSummary(run, r) {
    const title = `Run ${run.short_id} — ${run.scenario_label || run.preset_label}`;
    const seed = run.seed_line || `${run.shop_count} merchants, ${run.offer_count || "?"} offers`;
    const centre = run.center ? `${run.center.lat.toFixed(5)}, ${run.center.lng.toFixed(5)}` : "—";
    const bullets = [
      `• Started: ${formatRunWhen(run.started_at)}`,
      `• Seed: ${seed}`,
      `• Last offer refresh: ${formatRunWhen(lastOfferRefreshIso(run))}`,
      `• Centre: ${centre}`,
      `• Radius: ${r} m`,
    ];
    const osmNote = formatOsmStatusNote(run);
    if (osmNote) bullets.push(osmNote);
    if (run.summary) bullets.push(`• Summary: ${run.summary}`);
    if (run.purpose && run.purpose !== run.summary) bullets.push(`• Goal: ${run.purpose}`);
    if (run.multi_day) bullets.push("• Multi-day: do NOT cleanup until playbook finished.");
    const ids = (run.acceptance_ids || []).filter(Boolean).join(", ");
    if (ids) bullets.push(`• IDs: ${ids}`);
    return `${title}\n\n${bullets.join("\n")}`;
  }

  Object.assign(SC, {
    escapeHtml,
    formatWhen,
    formatRunWhen,
    formatDuration,
    lastOfferRefreshIso,
    appendLastOfferRefreshNote,
    statusTag,
    deviceNames,
    activeScenarioId,
    isMultiareaScenario,
    playbookWhoLabel,
    summaryAddsInfo,
    acceptanceIdsNotInLabel,
    formatRunSummary,
    osmRetryZoneIndexes,
    formatOsmStatusNote,
  });
})(typeof window !== "undefined" ? window : globalThis);

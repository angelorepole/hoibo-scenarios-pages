/** Leaflet map — init, centre pin, radius, pointer input. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const C = SC.constants;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const isMultiareaScenario = SC.isMultiareaScenario;

  const centrePinIcon = L.divIcon({
    className: "center-pin",
    html: '<div class="center-pin-dot"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  function canPlaceCenterPin() {
    return !S.currentRun;
  }

  function refreshMapSize() {
    if (S.map) S.map.invalidateSize({ pan: false });
  }

  function resetMapContainer() {
    const old = document.getElementById("map");
    if (!old) return null;
    const fresh = document.createElement("div");
    fresh.id = "map";
    old.replaceWith(fresh);
    return fresh;
  }

  function initMap() {
    const map = S.map;
    if (map) return;
    const container = document.getElementById("map");
    if (!container) return;
    if (container._leaflet_id != null) resetMapContainer();

    S.map = L.map("map", { tapTolerance: 15, minZoom: C.MAP_MIN_ZOOM });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      minZoom: C.MAP_MIN_ZOOM,
      maxZoom: 19,
    }).addTo(S.map);
    S.map.setView([51.5074, -0.2214], 13);

    if (!S.mapResizeHooked) {
      S.mapResizeHooked = true;
      window.addEventListener("resize", refreshMapSize);
    }

    S.map.on("click", (e) => {
      if (!canPlaceCenterPin()) return;
      if (S.suppressNextClick) {
        S.suppressNextClick = false;
        return;
      }
      if (placeCenterAt(e.latlng.lat, e.latlng.lng)) setStatus("Centre pin set.", true);
    });

    setupMapCenterInput();

    if (location.hostname === "127.0.0.1" && location.port === "8765") {
      window.__hoiboWalkMap = S.map;
    }
  }

  function ensureMapReady() {
    initMap();
    refreshMapSize();
    requestAnimationFrame(() => refreshMapSize());
  }

  function latLngFromPointerEvent(ev) {
    return S.map.containerPointToLatLng(S.map.mouseEventToContainerPoint(ev));
  }

  function drawRadiusCircle(lat, lng) {
    if (S.radiusCircle) S.map.removeLayer(S.radiusCircle);
    S.radiusCircle = L.circle([lat, lng], {
      radius: S.radiusM,
      color: "#f59207",
      weight: 2,
      fillColor: "#f59207",
      fillOpacity: 0.08,
      dashArray: "6 4",
      interactive: false,
    }).addTo(S.map);
  }

  function setCenter(lat, lng, opts = {}) {
    if (!S.map) return;
    S.hasCenter = true;
    el("lat").value = lat.toFixed(6);
    el("lng").value = lng.toFixed(6);
    if (!opts.skipPersist) localStorage.setItem(C.CENTER_KEY, JSON.stringify({ lat, lng }));
    SC.updateRunButtons();
    if (S.centerMarker) S.map.removeLayer(S.centerMarker);
    S.centerMarker = L.marker([lat, lng], { icon: centrePinIcon, zIndexOffset: 1000, interactive: false }).addTo(S.map);
    drawRadiusCircle(lat, lng);
    if (opts.pan !== false) S.map.setView([lat, lng], Math.max(S.map.getZoom(), 15));
  }

  function clearDraftMapOverlays() {
    if (S.centerMarker) {
      S.map.removeLayer(S.centerMarker);
      S.centerMarker = null;
    }
    if (S.radiusCircle) {
      S.map.removeLayer(S.radiusCircle);
      S.radiusCircle = null;
    }
    S.hasCenter = false;
    if (el("lat")) el("lat").value = "";
    if (el("lng")) el("lng").value = "";
    SC.clearDraftZones();
  }

  function syncScenarioUi(p) {
    const isMultiarea = isMultiareaScenario(p);
    const coordsRow = el("coords-row");
    const multiareaBlock = el("multiarea-zones-block");
    if (isMultiarea) {
      if (coordsRow) coordsRow.hidden = true;
      if (multiareaBlock) multiareaBlock.hidden = false;
      if (S.centerMarker) {
        S.map.removeLayer(S.centerMarker);
        S.centerMarker = null;
      }
      if (S.radiusCircle) {
        S.map.removeLayer(S.radiusCircle);
        S.radiusCircle = null;
      }
      S.hasCenter = S.draftZones.length > 0;
      SC.updateDraftZonesUi();
    } else {
      if (coordsRow) coordsRow.hidden = false;
      if (multiareaBlock) multiareaBlock.hidden = true;
      SC.clearDraftZones();
      const savedCenter = localStorage.getItem(C.CENTER_KEY);
      if (savedCenter) {
        try {
          const { lat, lng } = JSON.parse(savedCenter);
          setCenter(lat, lng, { skipPersist: true });
        } catch (e) {
          console.error("Error parsing saved center", e);
        }
      }
    }
  }

  function resetMapViewDefault() {
    clearDraftMapOverlays();
    S.map.setView([51.5074, -0.2214], 13);
  }

  function applyScenarioRadius(p) {
    S.radiusM = SC.scenarioRadiusM(p);
    el("map-hint").textContent = `${S.radiusM} m shop radius · console → ${S.consoleEnvLabel}`;
    SC.refreshDraftZoneCircleRadii(S.radiusM);
    if (!S.map) return;
    if (isMultiareaScenario(p)) {
      if (S.draftZones.length > 0) S.map.fitBounds(SC.draftZoneBounds(), { padding: [32, 32], maxZoom: 15 });
      return;
    }
    if (!S.hasCenter) return;
    const lat = parseFloat(el("lat").value);
    const lng = parseFloat(el("lng").value);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      drawRadiusCircle(lat, lng);
      S.map.fitBounds(S.radiusCircle.getBounds(), { padding: [32, 32], maxZoom: 15 });
    }
  }

  function placeCenterAt(lat, lng) {
    if (!canPlaceCenterPin()) return false;
    const now = Date.now();
    if (now - S.lastCenterPlaceMs < 80) return false;
    S.lastCenterPlaceMs = now;

    const p = S.scenarioList.find((x) => x.id === el("preset").value);
    if (isMultiareaScenario(p)) return SC.addDraftZoneAt(lat, lng, p);
    setCenter(lat, lng, { pan: false });
    return true;
  }

  function setupMapCenterInput() {
    const container = document.getElementById("map");
    if (!container || container.dataset.centerInputHooked === "1") return;
    container.dataset.centerInputHooked = "1";

    let pointerDown = null;
    let longPressTimer = null;
    const TAP_MOVE_PX = 12;

    const clearLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const finishTouchTap = (t, fromLongPress = false) => {
      if (!pointerDown) return;
      const down = pointerDown;
      pointerDown = null;
      clearLongPress();
      if (!canPlaceCenterPin()) return;
      if (S.suppressNextClick) {
        S.suppressNextClick = false;
        return;
      }
      if (!fromLongPress && Math.hypot(t.clientX - down.x, t.clientY - down.y) > TAP_MOVE_PX) return;
      const latlng = latLngFromPointerEvent(t);
      if (placeCenterAt(latlng.lat, latlng.lng)) {
        setStatus(fromLongPress ? "Centre pin set (long-press)." : "Centre pin set.", true);
      }
    };

    container.addEventListener("pointerdown", (ev) => {
      if (!canPlaceCenterPin()) return;
      const latlng = latLngFromPointerEvent(ev);
      pointerDown = { x: ev.clientX, y: ev.clientY, lat: latlng.lat, lng: latlng.lng };
      clearLongPress();
      if (ev.pointerType !== "touch") return;
      longPressTimer = setTimeout(() => {
        if (!pointerDown || !canPlaceCenterPin()) return;
        S.suppressNextClick = true;
        if (placeCenterAt(pointerDown.lat, pointerDown.lng)) setStatus("Centre pin set (long-press).", true);
        pointerDown = null;
        clearLongPress();
      }, 480);
    });
    container.addEventListener("pointermove", (ev) => {
      if (!pointerDown) return;
      if (Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y) > TAP_MOVE_PX) {
        pointerDown = null;
        clearLongPress();
      }
    });
    container.addEventListener("pointerup", (ev) => {
      if (!pointerDown) return;
      if (ev.pointerType === "touch") {
        finishTouchTap({ clientX: ev.clientX, clientY: ev.clientY });
        return;
      }
      pointerDown = null;
      clearLongPress();
    });
    container.addEventListener("pointercancel", () => {
      pointerDown = null;
      clearLongPress();
    });
  }

  Object.assign(SC, {
    canPlaceCenterPin,
    refreshMapSize,
    ensureMapReady,
    initMap,
    syncScenarioUi,
    resetMapViewDefault,
    applyScenarioRadius,
    setCenter,
    drawRadiusCircle,
    placeCenterAt,
  });
})(typeof window !== "undefined" ? window : globalThis);

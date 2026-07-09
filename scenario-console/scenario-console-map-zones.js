/** Leaflet map — commute zones (multiarea drafts and active run overlays). */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const C = SC.constants;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const isMultiareaScenario = SC.isMultiareaScenario;

  function zoneColor(index) {
    return C.ZONE_COLORS[index % C.ZONE_COLORS.length];
  }

  function zonePinIcon(index) {
    const color = zoneColor(index);
    return L.divIcon({
      className: "center-pin",
      html: `<div class="center-pin-dot" style="background:${color};border-color:${color};"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function scenarioRadiusM(p) {
    if (p?.radiusM != null && !Number.isNaN(Number(p.radiusM))) return Number(p.radiusM);
    const seedR = p?.seed?.radiusM;
    if (seedR != null && !Number.isNaN(Number(seedR))) return Number(seedR);
    return S.catalog.defaultRadiusM || 800;
  }

  function refreshDraftZoneCircleRadii(r) {
    S.draftZones.forEach((z) => {
      if (z.circle) z.circle.setRadius(r);
    });
  }

  function draftZoneBounds() {
    const bounds = L.latLngBounds([]);
    S.draftZones.forEach((z) => {
      if (z.circle) bounds.extend(z.circle.getBounds());
      else bounds.extend([z.lat, z.lng]);
    });
    return bounds;
  }

  function clearDraftZones() {
    S.draftZones.forEach((z) => {
      if (z.marker) S.map.removeLayer(z.marker);
      if (z.circle) S.map.removeLayer(z.circle);
    });
    S.draftZones = [];
    updateDraftZonesUi();
  }

  function clearRunZoneOverlays() {
    S.runZoneOverlays.forEach((ol) => S.map.removeLayer(ol));
    S.runZoneOverlays = [];
  }

  function updateDraftZonesUi() {
    const list = el("multiarea-zones-list");
    const clearBtn = el("btn-clear-zones");
    if (!list) return;
    list.innerHTML = "";

    const zonesSource = S.currentRun?.zones ? S.currentRun.zones : S.draftZones;
    const isEditing = !S.currentRun;

    if (zonesSource.length === 0) {
      list.innerHTML = "<li>No zones selected. Click the map to add a zone.</li>";
      if (clearBtn) clearBtn.style.display = "none";
      S.hasCenter = false;
    } else {
      zonesSource.forEach((z, i) => {
        const li = document.createElement("li");
        li.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
        const span = document.createElement("span");
        const color = zoneColor(i);
        span.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};margin-right:6px;vertical-align:middle;"></span>Zone ${i + 1}: ${z.lat.toFixed(5)}, ${z.lng.toFixed(5)}`;
        li.appendChild(span);
        if (isEditing) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-link btn-xs text-danger";
          btn.style.cssText = "padding:0;width:auto;";
          btn.textContent = "Remove";
          btn.onclick = (e) => {
            e.stopPropagation();
            removeDraftZoneAt(i);
          };
          li.appendChild(btn);
        }
        list.appendChild(li);
      });
      if (clearBtn) clearBtn.style.display = isEditing ? "block" : "none";
      S.hasCenter = true;
    }
    SC.updateRunButtons();
  }

  function removeDraftZoneAt(index) {
    const z = S.draftZones[index];
    if (z) {
      if (z.marker) S.map.removeLayer(z.marker);
      if (z.circle) S.map.removeLayer(z.circle);
    }
    S.draftZones.splice(index, 1);
    updateDraftZonesUi();
  }

  function addDraftZoneAt(lat, lng, p) {
    if (S.centerMarker) {
      S.map.removeLayer(S.centerMarker);
      S.centerMarker = null;
    }
    if (S.radiusCircle) {
      S.map.removeLayer(S.radiusCircle);
      S.radiusCircle = null;
    }
    if (S.draftZones.length >= 4) {
      setStatus("Max 4 commute zones allowed.", false);
      return false;
    }
    const zoneIdx = S.draftZones.length;
    const color = zoneColor(zoneIdx);
    const zoneRadiusM = scenarioRadiusM(p);
    S.radiusM = zoneRadiusM;
    const marker = L.marker([lat, lng], {
      icon: zonePinIcon(zoneIdx),
      zIndexOffset: 1000,
      interactive: true,
      draggable: true,
    }).addTo(S.map);
    const circle = L.circle([lat, lng], {
      radius: zoneRadiusM,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.08,
      dashArray: "6 4",
      interactive: false,
    }).addTo(S.map);
    const zone = { lat, lng, marker, circle };
    marker.on("drag", (ev) => {
      const ll = ev.target.getLatLng();
      zone.lat = ll.lat;
      zone.lng = ll.lng;
      zone.circle.setLatLng(ll);
    });
    marker.on("dragend", () => {
      updateDraftZonesUi();
      setStatus("Zone moved.", true);
    });
    S.draftZones.push(zone);
    updateDraftZonesUi();
    setStatus("Commute zone added.", true);
    return true;
  }

  Object.assign(SC, {
    zoneColor,
    zonePinIcon,
    scenarioRadiusM,
    refreshDraftZoneCircleRadii,
    draftZoneBounds,
    clearDraftZones,
    clearRunZoneOverlays,
    updateDraftZonesUi,
    addDraftZoneAt,
  });
})(typeof window !== "undefined" ? window : globalThis);

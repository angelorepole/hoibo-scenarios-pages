/** Leaflet map — shop pin markers and legend. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const el = SC.el;
  const lastOfferRefreshIso = SC.lastOfferRefreshIso;

  function createShopPinIcon(tone) {
    const SD = window.ScenarioDisplay;
    const color = SD?.shopPinColor ? SD.shopPinColor(tone) : "#6366f1";
    return L.divIcon({
      className: "shop-pin-marker",
      html: `<svg class="shop-pin-svg" viewBox="0 0 24 36" width="22" height="33" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#111827" stroke-width="1"/></svg>`,
      iconSize: [22, 33],
      iconAnchor: [11, 33],
      popupAnchor: [0, -30],
    });
  }

  function shopMarkerTone(shop, run) {
    const SD = window.ScenarioDisplay;
    if (!SD?.shopPinTone) return "long";
    return SD.shopPinTone(shop, lastOfferRefreshIso(run));
  }

  function updateShopPinLegend() {
    const legend = el("map-shop-legend");
    if (!legend) return;
    if (!S.currentRun || !window.ScenarioDisplay?.shopPinLegendHtml) {
      legend.hidden = true;
      legend.innerHTML = "";
      return;
    }
    legend.innerHTML = window.ScenarioDisplay.shopPinLegendHtml();
    legend.hidden = false;
  }

  function refreshShopMarkerIcons(run = S.currentRun) {
    if (!run || !S.map) return;
    S.shopMarkers.forEach((m) => {
      const shop = m.__shop;
      if (!shop) return;
      const tone = shopMarkerTone(shop, run);
      if (m.__pinTone !== tone) {
        m.setIcon(createShopPinIcon(tone));
        m.__pinTone = tone;
      }
    });
    updateShopPinLegend();
  }

  function clearShopMarkers() {
    S.shopMarkers.forEach((m) => S.map.removeLayer(m));
    S.shopMarkers = [];
    SC.clearRunZoneOverlays();
    updateShopPinLegend();
  }

  Object.assign(SC, {
    createShopPinIcon,
    shopMarkerTone,
    refreshShopMarkerIcons,
    clearShopMarkers,
  });
})(typeof window !== "undefined" ? window : globalThis);

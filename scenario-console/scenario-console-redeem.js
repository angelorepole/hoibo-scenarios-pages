/** Redeem phone picker and map popup redeem action. */
(function (global) {
  const SC = global.ScenarioConsole;
  const S = SC.state;
  const C = SC.constants;
  const el = SC.el;
  const setStatus = SC.setStatus;
  const isHostedConsole = SC.isHostedConsole;
  const apiPost = SC.apiPost;
  const playbookExpectsRedeem = SC.playbookExpectsRedeem;

  function syncRedeemUi(run) {
    const playbook = run?.playbook || S.lastPlaybook.allSteps || [];
    S.redeemExpectedForRun = playbookExpectsRedeem(playbook);
    const block = el("redeem-phone-block");
    if (block) block.hidden = !S.redeemExpectedForRun || isHostedConsole() || !S.currentRun;
    if (S.redeemExpectedForRun && run) applyRedeemPhoneFromRun(run);
    else if (el("phone-hint")) el("phone-hint").textContent = "";
  }

  function normalizePhone(p) {
    return {
      ...p,
      app_id: p.app_id || (String(p.customer_app_id || "").trim() || null),
      backend_env: p.backend_env || "stage",
    };
  }

  function phonesForConsoleEnv(phones) {
    return (phones || []).map(normalizePhone).filter((p) => p.backend_env === S.consoleEnvSlug);
  }

  function runCustomerPhones(run) {
    const slots = new Set((run?.devices || []).map((d) => String(d.slot)));
    return phonesForConsoleEnv(S.customerPhones).filter((p) => slots.has(String(p.slot)));
  }

  function setRedeemPhonePickerVisible(visible) {
    const picker = el("redeem-phone-picker");
    if (picker) picker.hidden = !visible;
  }

  function applyRedeemPhoneFromRun(run) {
    const sel = el("phone");
    if (!sel) return;
    const fromRun = runCustomerPhones(run);
    const pool = fromRun.length ? fromRun : phonesForConsoleEnv(S.customerPhones);
    if (!pool.length) {
      setRedeemPhonePickerVisible(true);
      updatePhoneHint();
      return;
    }
    const saved = localStorage.getItem(C.PHONE_SLOT_KEY);
    const pick =
      (saved && pool.some((p) => p.slot === saved) && saved) ||
      pool.find((p) => p.app_id)?.slot ||
      pool[0].slot;
    sel.value = pick;
    localStorage.setItem(C.PHONE_SLOT_KEY, pick);
    setRedeemPhonePickerVisible(fromRun.length === 1 ? false : pool.length > 1);
    updatePhoneHint(fromRun.length === 1 ? pool[0] : null);
  }

  function selectedPhone() {
    const slot = el("phone").value;
    return S.customerPhones.find((p) => p.slot === slot) || null;
  }

  function resolveAppId(phone) {
    return phone?.app_id || null;
  }

  function devicesShVar(slot) {
    return slot === "user" ? "HOIBO_USER_APP_ID" : "HOIBO_USER2_APP_ID";
  }

  function updatePhoneHint(fixedPhone) {
    const phone = fixedPhone || selectedPhone();
    if (!phone) return;
    const appId = resolveAppId(phone);
    let text;
    if (appId) {
      text = `${phone.name} — open that offer's QR on the phone, then tap Redeem on the map pin.`;
    } else if (isHostedConsole()) {
      text = `${phone.name} needs customer_app_id in Hoibo Admin devices.json, then rebuild GitHub Pages (build-walk-pages.sh). Copy app id from Deal alert test log on the phone.`;
    } else {
      text = `${phone.name} not linked yet. Copy app id from Deal alert test log on the phone → set ${devicesShVar(phone.slot)} in ${C.DEVICES_SH} → restart dev console.`;
    }
    el("phone-hint").textContent = text;
  }

  function fillPhones(phones) {
    S.customerPhones = phones.map(normalizePhone);
    const visible = phonesForConsoleEnv(S.customerPhones);
    const sel = el("phone");
    sel.innerHTML = "";
    visible.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.slot;
      o.textContent = p.name + (p.app_id ? "" : " (no app_id)");
      sel.appendChild(o);
    });
    const saved = localStorage.getItem(C.PHONE_SLOT_KEY);
    if (saved && visible.some((p) => p.slot === saved)) sel.value = saved;
    else if (visible.length) sel.value = visible[0].slot;
    sel.onchange = () => {
      localStorage.setItem(C.PHONE_SLOT_KEY, sel.value);
      setRedeemPhonePickerVisible(true);
      updatePhoneHint();
    };
    setRedeemPhonePickerVisible(visible.length > 1);
    updatePhoneHint();
  }

  async function redeemShop(shopIndex, offerIndex, btn) {
    const phone = selectedPhone();
    const appId = resolveAppId(phone);

    let statusContainer = null;
    if (btn?.parentNode) {
      statusContainer = btn.parentNode.querySelector(".popup-status");
      if (!statusContainer) {
        statusContainer = document.createElement("div");
        statusContainer.className = "popup-status mt-1 font-xs";
        btn.parentNode.appendChild(statusContainer);
      }
      statusContainer.textContent = "Redeeming...";
      statusContainer.className = "popup-status mt-1 font-xs text-accent";
    }

    const setPopupStatus = (text, cls) => {
      if (statusContainer) {
        statusContainer.textContent = text;
        statusContainer.className = `popup-status mt-1 font-xs ${cls}`;
      }
    };

    if (!appId) {
      const msg = `${phone?.name || "Phone"} not in devices.sh — set ${devicesShVar(phone?.slot || "user")} (copy from Deal alert test log on phone).`;
      setStatus(msg, false);
      setPopupStatus("Error: App ID not set", "text-danger");
      return;
    }
    if (!S.currentRun) {
      setStatus("No active run.", false);
      setPopupStatus("Error: No active run", "text-danger");
      return;
    }
    btn.disabled = true;
    try {
      const data = await apiPost("/api/scenarios/redeem", {
        run_id: S.currentRun.run_id,
        shop_index: shopIndex,
        offer_index: offerIndex,
        app_id: appId,
      });
      setStatus(`${data.shop}\n${data.offer_title}: ${data.scan_result}\n${data.hint}`, data.ok);
      setPopupStatus(
        data.ok ? `Success: ${data.scan_result}` : `Failed: ${data.scan_result}`,
        data.ok ? "text-success" : "text-danger",
      );
    } catch (e) {
      const errorMsg = String(e.message || e);
      setStatus(errorMsg, false);
      setPopupStatus(`Error: ${errorMsg}`, "text-danger");
    } finally {
      btn.disabled = false;
    }
  }

  global.redeemShop = redeemShop;

  Object.assign(SC, {
    syncRedeemUi,
    fillPhones,
    setRedeemPhonePickerVisible,
    redeemShop,
  });
})(typeof window !== "undefined" ? window : globalThis);

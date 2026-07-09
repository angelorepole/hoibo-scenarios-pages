/** Modal prompt for hosted scenario unlock / Supabase admin keys. */
(function (win) {
  const ADMIN_KEY_REMEMBER_PREF = "scenarios_remember_on_device";
  let adminKeyPromptInflight = null;

  win.__adminKeyRememberOnDevice = function () {
    return !!document.getElementById("admin-key-remember")?.checked;
  };

  win.__promptAdminKey = function (message) {
    if (adminKeyPromptInflight) {
      return adminKeyPromptInflight.then((key) => {
        if (key) return key;
        return win.__promptAdminKey(message);
      });
    }
    adminKeyPromptInflight = new Promise((resolve) => {
      const modal = document.getElementById("admin-key-modal");
      const promptEl = document.getElementById("admin-key-prompt");
      const input = document.getElementById("admin-key-input");
      const rememberEl = document.getElementById("admin-key-remember");
      const okBtn = document.getElementById("admin-key-ok");
      const cancelBtn = document.getElementById("admin-key-cancel");
      if (!modal || !input) {
        adminKeyPromptInflight = null;
        resolve(prompt(message));
        return;
      }
      promptEl.textContent = message;
      input.value = "";
      if (rememberEl) {
        rememberEl.checked = localStorage.getItem(ADMIN_KEY_REMEMBER_PREF) === "1";
      }
      modal.hidden = false;
      const done = (value) => {
        modal.hidden = true;
        okBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
        adminKeyPromptInflight = null;
        resolve(value);
      };
      okBtn.onclick = () => done(input.value.trim() || null);
      cancelBtn.onclick = () => done(null);
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          okBtn.click();
        }
      };
      requestAnimationFrame(() => input.focus());
    });
    return adminKeyPromptInflight;
  };
})(typeof window !== "undefined" ? window : globalThis);

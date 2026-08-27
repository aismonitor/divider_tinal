(() => {
  "use strict";

  const STRINGS = {
    en: {
      langLabel: "Language",
      langAria: "Interface language",
      tagline: "EIS XML utilities — split executions or edit documents",
      dividerTitle: "Divider",
      dividerDesc: "Import export.xml and split into one contractProcedure per execution",
      editorTitle: "Editor",
      editorDesc: "Import XML, browse and edit the tree, download the result",
      pageTitle: "Divider tools",
      updateTitle: "Server",
      updateDesc: "Pull the latest code from git and rebuild this VDS deployment.",
      updateBtn: "Update from git",
      updateTokenPrompt: "Enter UPDATE_TOKEN for this server:",
      updateStarting: "Starting update…",
      updateBusy: "Updating… fetch, pull, rebuild",
      updateOk: "Updated. Reloading…",
      updateFail: "Update failed",
      updateNotConfigured: "Remote update is not configured (set UPDATE_TOKEN in .env on the VDS).",
      updateUnauthorized: "Wrong token.",
      updateUnavailable: "Update API is unavailable.",
    },
    ru: {
      langLabel: "Язык",
      langAria: "Язык интерфейса",
      tagline: "Утилиты EIS XML — разделение исполнений или редактирование",
      dividerTitle: "Divider",
      dividerDesc: "Импорт export.xml и разделение на отдельные contractProcedure по исполнениям",
      editorTitle: "Editor",
      editorDesc: "Импорт XML, просмотр и правка дерева, скачивание результата",
      pageTitle: "Divider tools",
      updateTitle: "Сервер",
      updateDesc: "Скачать свежий код из git и пересобрать это развёртывание на VDS.",
      updateBtn: "Обновить из git",
      updateTokenPrompt: "Введите UPDATE_TOKEN для этого сервера:",
      updateStarting: "Запуск обновления…",
      updateBusy: "Обновление… fetch, pull, rebuild",
      updateOk: "Готово. Перезагрузка…",
      updateFail: "Ошибка обновления",
      updateNotConfigured: "Удалённое обновление не настроено (задайте UPDATE_TOKEN в .env на VDS).",
      updateUnauthorized: "Неверный токен.",
      updateUnavailable: "API обновления недоступен.",
    },
  };

  const LANG_KEY = "divider-lang";
  const TOKEN_KEY = "divider-update-token";
  const langSelect = document.getElementById("langSelect");
  const updateBtn = document.getElementById("updateFromGitBtn");
  const updateStatus = document.getElementById("updateStatus");

  /** @type {"en" | "ru"} */
  let lang = loadLang();

  function loadLang() {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "ru" || saved === "en" ? saved : "en";
  }

  /** @param {string} key */
  function t(key) {
    return STRINGS[lang][key] || STRINGS.en[key] || key;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    if (langSelect) {
      langSelect.value = lang;
      langSelect.setAttribute("aria-label", t("langAria"));
    }
  }

  /** @param {string} message @param {"ok" | "error" | ""} [kind] */
  function setUpdateStatus(message, kind = "") {
    if (!updateStatus) return;
    updateStatus.hidden = !message;
    updateStatus.textContent = message;
    updateStatus.classList.toggle("is-ok", kind === "ok");
    updateStatus.classList.toggle("is-error", kind === "error");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchStatus() {
    const res = await fetch("/api/update/status", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    return res.json();
  }

  async function pollUntilDone() {
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      try {
        const st = await fetchStatus();
        if (st.busy) {
          setUpdateStatus(t("updateBusy"), "");
          continue;
        }
        return st;
      } catch {
        setUpdateStatus(t("updateBusy"), "");
      }
    }
    return { ok: false, message: "Timed out waiting for update", log: "" };
  }

  async function runUpdate() {
    if (!updateBtn) return;
    let token = sessionStorage.getItem(TOKEN_KEY) || "";
    const entered = window.prompt(t("updateTokenPrompt"), token);
    if (entered == null) return;
    token = entered.trim();
    if (!token) {
      setUpdateStatus(t("updateUnauthorized"), "error");
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);

    updateBtn.disabled = true;
    setUpdateStatus(t("updateStarting"), "");

    try {
      const pre = await fetchStatus();
      if (!pre.configured) {
        setUpdateStatus(t("updateNotConfigured"), "error");
        return;
      }

      const res = await fetch("/api/update", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setUpdateStatus(t("updateUnauthorized"), "error");
        return;
      }
      if (res.status === 503) {
        setUpdateStatus(t("updateNotConfigured"), "error");
        return;
      }
      if (res.status === 409 || body.busy) {
        setUpdateStatus(t("updateBusy"), "");
      } else if (!res.ok && res.status !== 202) {
        setUpdateStatus(body.message || t("updateFail"), "error");
        return;
      } else {
        setUpdateStatus(t("updateBusy"), "");
      }

      const st = await pollUntilDone();
      if (st.ok) {
        setUpdateStatus(st.message || t("updateOk"), "ok");
        await sleep(1200);
        window.location.reload();
        return;
      }
      const detail = [st.message || t("updateFail"), st.log].filter(Boolean).join("\n\n");
      setUpdateStatus(detail, "error");
    } catch {
      setUpdateStatus(t("updateUnavailable"), "error");
    } finally {
      updateBtn.disabled = false;
    }
  }

  langSelect?.addEventListener("change", () => {
    lang = langSelect.value === "ru" ? "ru" : "en";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
  });

  updateBtn?.addEventListener("click", () => {
    runUpdate();
  });

  applyI18n();

  fetchStatus()
    .then((st) => {
      if (!st.configured) setUpdateStatus(t("updateNotConfigured"), "");
    })
    .catch(() => {
      /* local static server without updater — keep quiet */
    });
})();

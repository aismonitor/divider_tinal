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
    },
  };

  const LANG_KEY = "divider-lang";
  const langSelect = document.getElementById("langSelect");

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

  langSelect?.addEventListener("change", () => {
    lang = langSelect.value === "ru" ? "ru" : "en";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
  });

  applyI18n();
})();

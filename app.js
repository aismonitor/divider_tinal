(() => {
  "use strict";

  const STRINGS = {
    en: {
      langLabel: "Language",
      langAria: "Interface language",
      tagline: "Split EIS export.xml into one contractProcedure per execution",
      chooseFile: "Choose XML / ZIP",
      schemeVersion: "Contract scheme version",
      executionsFound: "Executions found",
      contractRegNum: "Contract registry number",
      selectAll: "Select all",
      deselectAll: "Deselect all",
      exportSelected: "Export selected",
      exportSelectedCount: "Export selected ({n})",
      parsedFile: "Parsed {name}",
      foundExecutions: "Found {n} executions:",
      listHint: "Click a row to open its XML in a new tab",
      exportedOk: "Exported {n} file(s) → {name}",
      nothingSelected: "Select at least one execution to export",
      openFailed: "Could not open XML in a new tab (check popup blocker)",
      jszipMissing: "JSZip is not loaded — cannot read ZIP files",
      zipNoXml: "ZIP contains no XML files",
      zipNoExport: "ZIP has XML files, but none look like ns3:export with a contract",
      invalidXml: "Invalid XML: {detail}",
      noExportRoot: 'Root element "export" not found',
      noContract: "No <ns3:contract> found — expected EIS export with a contract",
      noSchemeVersion: "<ns3:contract> has no schemeVersion attribute",
      noExecutions: "No <executions> blocks found inside contractProcedure",
      docAcceptanceFallback: "Acceptance document",
      payDocFallback: "Payment document",
      executionFallback: "Execution",
      pageTitle: "Divider — EIS executions",
      readFailed: "Failed to read file",
      dash: "—",
    },
    ru: {
      langLabel: "Язык",
      langAria: "Язык интерфейса",
      tagline: "Разделение EIS export.xml на отдельные contractProcedure по исполнениям",
      chooseFile: "Выбрать XML / ZIP",
      schemeVersion: "Версия схемы контракта",
      executionsFound: "Найдено исполнений",
      contractRegNum: "Реестровый номер контракта",
      selectAll: "Выбрать все",
      deselectAll: "Снять выбор",
      exportSelected: "Экспорт выбранных",
      exportSelectedCount: "Экспорт выбранных ({n})",
      parsedFile: "Разобран файл {name}",
      foundExecutions: "Найдено исполнений: {n}",
      listHint: "Нажмите на строку, чтобы открыть XML в новой вкладке",
      exportedOk: "Экспортировано файлов: {n} → {name}",
      nothingSelected: "Выберите хотя бы одно исполнение для экспорта",
      openFailed: "Не удалось открыть XML в новой вкладке (проверьте блокировку всплывающих окон)",
      jszipMissing: "JSZip не загружен — нельзя читать ZIP",
      zipNoXml: "В ZIP нет XML-файлов",
      zipNoExport: "В ZIP есть XML, но нет ns3:export с контрактом",
      invalidXml: "Некорректный XML: {detail}",
      noExportRoot: 'Корневой элемент "export" не найден',
      noContract: "Нет <ns3:contract> — ожидается выгрузка EIS с контрактом",
      noSchemeVersion: "У <ns3:contract> нет атрибута schemeVersion",
      noExecutions: "Блоки <executions> внутри contractProcedure не найдены",
      docAcceptanceFallback: "Документ о приемке",
      payDocFallback: "Платежный документ",
      executionFallback: "Исполнение",
      pageTitle: "Divider — исполнения EIS",
      readFailed: "Не удалось прочитать файл",
      dash: "—",
    },
  };

  const LANG_KEY = "divider-lang";

  const fileInput = document.getElementById("fileInput");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const schemeVersionEl = document.getElementById("schemeVersion");
  const execCountEl = document.getElementById("execCount");
  const regNumEl = document.getElementById("regNum");
  const resultsEl = document.getElementById("results");
  const parsedLineEl = document.getElementById("parsedLine");
  const contractLineEl = document.getElementById("contractLine");
  const foundLineEl = document.getElementById("foundLine");
  const execListEl = document.getElementById("execList");
  const exportBtn = document.getElementById("exportBtn");
  const selectAllEl = document.getElementById("selectAll");
  const selectAllLabelEl = document.getElementById("selectAllLabel");
  const langSelect = document.getElementById("langSelect");

  /** @type {"en" | "ru"} */
  let lang = loadLang();

  /**
   * @typedef {object} ExecutionItem
   * @property {Element} procedureEl
   * @property {string} id
   * @property {string} ordinalNumber
   * @property {string} kind
   * @property {string} name
   * @property {string} docDate
   * @property {string} paidRUR
   * @property {string} fileBase
   * @property {boolean} selected
   */

  /**
   * @typedef {object} AppState
   * @property {string} sourceFileName
   * @property {Document} doc
   * @property {string} contractSchemeVersion
   * @property {string} regNum
   * @property {string} customerShortName
   * @property {string} contractSubject
   * @property {ExecutionItem[]} executions
   */

  /** @type {AppState | null} */
  let state = null;

  /** @type {string | null} */
  let lastStatusKey = null;
  /** @type {Record<string, string | number> | null} */
  let lastStatusParams = null;
  /** @type {"ok" | "error" | ""} */
  let lastStatusKind = "";

  setLanguage(lang, { persist: false });

  langSelect.addEventListener("change", () => {
    setLanguage(langSelect.value === "ru" ? "ru" : "en");
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    resetUi();
    try {
      const xmlText = await readXmlFromFile(file);
      state = parseExport(xmlText, file.name);
      renderResults(state);
    } catch (err) {
      state = null;
      showCaughtError(err);
      exportBtn.disabled = true;
    }
  });

  selectAllEl.addEventListener("change", () => {
    if (!state) return;
    const checked = selectAllEl.checked;
    for (const item of state.executions) item.selected = checked;
    syncRowCheckboxes();
    updateExportButton();
    updateSelectAllLabel();
  });

  exportBtn.addEventListener("click", async () => {
    if (!state) return;
    const selected = state.executions.filter((item) => item.selected);
    if (!selected.length) {
      showStatusKey("nothingSelected", {}, "error");
      return;
    }
    exportBtn.disabled = true;
    try {
      const zip = new JSZip();
      for (const item of selected) {
        const xml = wrapProcedureAsExport(state.doc, item.procedureEl);
        zip.file(`${item.fileBase}.xml`, xml);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const name = `executions_${sanitizeFilePart(state.regNum || "unknown")}.zip`;
      downloadBlob(blob, name);
      showStatusKey("exportedOk", { n: selected.length, name }, "ok");
    } catch (err) {
      console.error(err);
      showCaughtError(err);
    } finally {
      updateExportButton();
    }
  });

  function loadLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "ru" || saved === "en") return saved;
    } catch (_) {
      /* ignore */
    }
    const nav = (navigator.language || "").toLowerCase();
    return nav.startsWith("ru") ? "ru" : "en";
  }

  /**
   * @param {"en" | "ru"} next
   * @param {{ persist?: boolean }} [opts]
   */
  function setLanguage(next, opts) {
    lang = next === "ru" ? "ru" : "en";
    langSelect.value = lang;
    if (opts?.persist !== false) {
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch (_) {
        /* ignore */
      }
    }
    applyInterfaceLanguage();
  }

  /**
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   */
  function t(key, params) {
    const dict = STRINGS[lang] || STRINGS.en;
    let text = dict[key] || STRINGS.en[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return text;
  }

  /**
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   */
  function fail(key, params) {
    const err = new Error(t(key, params));
    err.i18nKey = key;
    err.i18nParams = params || {};
    throw err;
  }

  function applyInterfaceLanguage() {
    document.documentElement.lang = lang;
    document.title = t("pageTitle");
    langSelect.setAttribute("aria-label", t("langAria"));
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    if (lastStatusKey) showStatusKey(lastStatusKey, lastStatusParams || {}, lastStatusKind);
    if (state) renderResults(state);
    else {
      updateSelectAllLabel();
      updateExportButton();
    }
  }

  function resetUi() {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    lastStatusKey = null;
    lastStatusParams = null;
    lastStatusKind = "";
    resultsEl.hidden = true;
    summaryEl.hidden = true;
    execListEl.innerHTML = "";
    selectAllEl.checked = true;
    selectAllEl.indeterminate = false;
    exportBtn.disabled = true;
    updateSelectAllLabel();
  }

  /**
   * @param {unknown} err
   */
  function showCaughtError(err) {
    if (err && typeof err === "object" && "i18nKey" in err && err.i18nKey) {
      showStatusKey(
        /** @type {{ i18nKey: string, i18nParams?: Record<string, string | number> }} */ (err).i18nKey,
        /** @type {{ i18nParams?: Record<string, string | number> }} */ (err).i18nParams || {},
        "error"
      );
      return;
    }
    showStatus(err instanceof Error ? err.message : String(err), "error");
  }

  function showStatus(message, kind) {
    lastStatusKey = null;
    lastStatusParams = null;
    lastStatusKind = kind || "";
    statusEl.hidden = false;
    statusEl.className = `status ${kind || ""}`.trim();
    statusEl.textContent = message;
  }

  /**
   * @param {string} key
   * @param {Record<string, string | number>} params
   * @param {string} [kind]
   */
  function showStatusKey(key, params, kind) {
    lastStatusKey = key;
    lastStatusParams = params;
    lastStatusKind = kind || "";
    statusEl.hidden = false;
    statusEl.className = `status ${kind || ""}`.trim();
    statusEl.textContent = t(key, params);
  }

  /**
   * @param {AppState} parsed
   */
  function renderResults(parsed) {
    summaryEl.hidden = false;
    schemeVersionEl.textContent = parsed.contractSchemeVersion;
    execCountEl.textContent = String(parsed.executions.length);
    regNumEl.textContent = parsed.regNum || t("dash");

    resultsEl.hidden = false;
    parsedLineEl.textContent = t("parsedFile", { name: parsed.sourceFileName });
    const shortName = parsed.customerShortName || t("dash");
    const subject = parsed.contractSubject || t("dash");
    contractLineEl.textContent = `${shortName} — ${subject}`;
    foundLineEl.textContent = t("foundExecutions", { n: parsed.executions.length });

    execListEl.innerHTML = "";
    for (const item of parsed.executions) {
      const li = document.createElement("li");
      li.className = "exec-row";

      const num = document.createElement("span");
      num.className = "exec-num";
      num.textContent = item.ordinalNumber;

      const paid = document.createElement("span");
      paid.className = "exec-paid";
      paid.textContent = item.paidRUR || t("dash");

      const name = document.createElement("span");
      name.className = "exec-name";
      name.textContent = item.name || displayNameFallback(item.kind);

      const date = document.createElement("span");
      date.className = "exec-date";
      date.textContent = item.docDate ? normalizeDate(item.docDate) : t("dash");

      const checkLabel = document.createElement("label");
      checkLabel.className = "exec-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.selected;
      checkbox.setAttribute("aria-label", `#${item.ordinalNumber}`);
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        item.selected = checkbox.checked;
        syncSelectAllState();
        updateExportButton();
        updateSelectAllLabel();
      });
      checkLabel.appendChild(checkbox);
      checkLabel.addEventListener("click", (e) => e.stopPropagation());

      li.append(num, paid, name, date, checkLabel);
      li.title = t("listHint");
      li.addEventListener("click", () => openExecutionXml(item));
      execListEl.appendChild(li);
    }

    syncSelectAllState();
    updateSelectAllLabel();
    updateExportButton();
  }

  /**
   * @param {string} kind
   */
  function displayNameFallback(kind) {
    if (kind === "payDoc") return t("payDocFallback");
    if (kind === "docAcceptance") return t("docAcceptanceFallback");
    return t("executionFallback");
  }

  /**
   * Preview only — does not download a file. Export still creates files only on button press.
   * @param {ExecutionItem} item
   */
  function openExecutionXml(item) {
    if (!state) return;
    try {
      const xml = wrapProcedureAsExport(state.doc, item.procedureEl);
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        showStatusKey("openFailed", {}, "error");
        URL.revokeObjectURL(url);
        return;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      showStatusKey("openFailed", {}, "error");
    }
  }

  function syncRowCheckboxes() {
    if (!state) return;
    const boxes = execListEl.querySelectorAll('input[type="checkbox"]');
    state.executions.forEach((item, i) => {
      const box = boxes[i];
      if (box) box.checked = item.selected;
    });
    syncSelectAllState();
  }

  function syncSelectAllState() {
    if (!state || !state.executions.length) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
      return;
    }
    const selectedCount = state.executions.filter((item) => item.selected).length;
    selectAllEl.checked = selectedCount === state.executions.length;
    selectAllEl.indeterminate = selectedCount > 0 && selectedCount < state.executions.length;
  }

  function updateSelectAllLabel() {
    if (!selectAllLabelEl) return;
    const allSelected =
      !!state &&
      state.executions.length > 0 &&
      state.executions.every((item) => item.selected);
    selectAllLabelEl.textContent = allSelected ? t("deselectAll") : t("selectAll");
  }

  function updateExportButton() {
    const selectedCount = state ? state.executions.filter((item) => item.selected).length : 0;
    exportBtn.disabled = !state || selectedCount === 0;
    exportBtn.textContent =
      selectedCount > 0 ? t("exportSelectedCount", { n: selectedCount }) : t("exportSelected");
  }

  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  async function readXmlFromFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip") || file.type === "application/zip") {
      if (typeof JSZip === "undefined") fail("jszipMissing");
      const zip = await JSZip.loadAsync(await readAsArrayBuffer(file));
      const xmlEntries = Object.keys(zip.files)
        .filter((name) => /\.xml$/i.test(name) && !zip.files[name].dir)
        .sort();
      if (!xmlEntries.length) fail("zipNoXml");
      for (const entryName of xmlEntries) {
        const text = await zip.files[entryName].async("string");
        if (looksLikeExport(text)) return text;
      }
      fail("zipNoExport");
    }
    return readAsText(file);
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  function readAsText(blob) {
    if (typeof blob.text === "function") return blob.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(Object.assign(new Error(t("readFailed")), { i18nKey: "readFailed", i18nParams: {} }));
      reader.readAsText(blob);
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<ArrayBuffer>}
   */
  function readAsArrayBuffer(blob) {
    if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
      reader.onerror = () =>
        reject(Object.assign(new Error(t("readFailed")), { i18nKey: "readFailed", i18nParams: {} }));
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * @param {string} text
   */
  function looksLikeExport(text) {
    return /<(?:[\w.]+:)?export\b/i.test(text) && /<(?:[\w.]+:)?contract\b/i.test(text);
  }

  /**
   * @param {string} xmlText
   * @param {string} sourceFileName
   * @returns {AppState}
   */
  function parseExport(xmlText, sourceFileName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      fail("invalidXml", {
        detail: (parseError.textContent || "parse error").trim().slice(0, 200),
      });
    }

    const exportEl = findLocal(doc, "export");
    if (!exportEl) fail("noExportRoot");

    const contractEl = findLocal(exportEl, "contract");
    if (!contractEl) fail("noContract");

    const contractSchemeVersion = contractEl.getAttribute("schemeVersion");
    if (!contractSchemeVersion) fail("noSchemeVersion");

    const customerEl = findLocal(contractEl, "customer");
    const customerShortName = textOf(findLocal(customerEl, "shortName"));
    const contractSubject = textOf(findLocal(contractEl, "contractSubject"));
    const contractRegNum = textOf(findLocal(contractEl, "regNum"));

    const procedures = findAllLocal(exportEl, "contractProcedure");
    /** @type {ExecutionItem[]} */
    const executions = [];

    for (const procedureEl of procedures) {
      const executionsEl = findLocal(procedureEl, "executions");
      if (!executionsEl) continue;

      const id = textOf(findLocal(procedureEl, "id"));
      const regNum = textOf(findLocal(procedureEl, "regNum")) || contractRegNum;
      const ordinalNumber = textOf(findLocal(executionsEl, "ordinalNumber")) || "?";
      const details = describeExecution(executionsEl);
      const fileBase = [
        sanitizeFilePart(regNum || "noreg"),
        "exec",
        sanitizeFilePart(ordinalNumber),
        sanitizeFilePart(id || "noid"),
      ].join("_");

      executions.push({
        procedureEl,
        id,
        ordinalNumber,
        kind: details.kind,
        name: details.name,
        docDate: details.docDate,
        paidRUR: details.paidRUR,
        fileBase,
        selected: true,
      });
    }

    if (!executions.length) fail("noExecutions");

    executions.sort((a, b) => Number(a.ordinalNumber) - Number(b.ordinalNumber));

    return {
      sourceFileName,
      doc,
      contractSchemeVersion,
      regNum: textOf(findLocal(executions[0].procedureEl, "regNum")) || contractRegNum || "",
      customerShortName,
      contractSubject,
      executions,
    };
  }

  /**
   * @param {Element} executionsEl
   */
  function describeExecution(executionsEl) {
    const executionEls = findAllLocal(executionsEl, "execution");
    let kind = "unknown";
    let name = "";
    let docDate = "";
    let paidSum = 0;
    let hasPaid = false;

    for (const executionEl of executionEls) {
      const paidText = textOf(findLocal(executionEl, "paidRUR"));
      if (paidText) {
        const n = Number(paidText.replace(/\s/g, "").replace(",", "."));
        if (!Number.isNaN(n)) {
          paidSum += n;
          hasPaid = true;
        }
      }

      if (!name) {
        const docAcceptance = findLocal(executionEl, "docAcceptance");
        if (docAcceptance) {
          kind = "docAcceptance";
          name = textOf(findLocal(docAcceptance, "name"));
          docDate = textOf(findLocal(docAcceptance, "documentDate"));
          continue;
        }
        const payDoc = findLocal(executionEl, "payDoc");
        if (payDoc) {
          kind = "payDoc";
          name = textOf(findLocal(payDoc, "documentName"));
          docDate = textOf(findLocal(payDoc, "documentDate"));
        }
      }
    }

    return {
      kind,
      name,
      docDate,
      paidRUR: hasPaid ? formatMoney(paidSum) : "",
    };
  }

  /**
   * @param {number} value
   */
  function formatMoney(value) {
    return value.toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * @param {string} date
   */
  function normalizeDate(date) {
    const m = String(date).match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : date;
  }

  /**
   * @param {Document} sourceDoc
   * @param {Element} procedureEl
   */
  function wrapProcedureAsExport(sourceDoc, procedureEl) {
    const exportEl = sourceDoc.documentElement;
    const out = document.implementation.createDocument(null, null, null);
    const root = /** @type {Element} */ (out.importNode(exportEl, false));
    out.appendChild(root);
    root.appendChild(out.importNode(procedureEl, true));
    return serializeXml(out);
  }

  /**
   * @param {Document} doc
   */
  function serializeXml(doc) {
    const serializer = new XMLSerializer();
    const body = serializer.serializeToString(doc);
    if (body.startsWith("<?xml")) return body;
    return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
  }

  /**
   * @param {ParentNode | null} parent
   * @param {string} localName
   * @returns {Element | null}
   */
  function findLocal(parent, localName) {
    if (!parent) return null;
    return directChildrenLocal(parent, localName)[0] || null;
  }

  /**
   * @param {ParentNode} parent
   * @param {string} localName
   * @returns {Element[]}
   */
  function findAllLocal(parent, localName) {
    return directChildrenLocal(parent, localName);
  }

  /**
   * @param {ParentNode} parent
   * @param {string} localName
   * @returns {Element[]}
   */
  function directChildrenLocal(parent, localName) {
    /** @type {Element[]} */
    const out = [];
    const children =
      parent.nodeType === 9
        ? [/** @type {Document} */ (parent).documentElement].filter(Boolean)
        : Array.from(/** @type {Element} */ (parent).children || []);
    for (const el of children) {
      if (el && el.localName === localName) out.push(/** @type {Element} */ (el));
    }
    return out;
  }

  /**
   * @param {Element | null} el
   */
  function textOf(el) {
    return el && el.textContent ? el.textContent.trim() : "";
  }

  /**
   * @param {string} value
   */
  function sanitizeFilePart(value) {
    return String(value).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "x";
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
})();

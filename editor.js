(() => {
  "use strict";

  const STRINGS = {
    en: {
      langLabel: "Language",
      langAria: "Interface language",
      backHome: "← Tools",
      tagline: "Import XML, edit data in a table, download the result",
      chooseFile: "Import XML",
      expandAll: "Expand all",
      collapseEmpty: "Collapse empty",
      download: "Download XML",
      fileName: "File",
      rootName: "Document",
      fieldCount: "Fields",
      tableHint: "All fields are listed. Filter by purchaseObjectsInfo (or any name) to jump to a block.",
      fieldFilter: "Filter fields…",
      fieldFilterLabel: "Filter",
      fieldFilterAria: "Filter fields by name or value",
      colField: "Field",
      colValue: "Value",
      loadedOk: "Loaded {name}",
      downloadedOk: "Downloaded {name}",
      invalidXml: "Invalid XML: {detail}",
      emptyFile: "File is empty",
      noRoot: "No root element found",
      readFailed: "Failed to read file",
      nothingLoaded: "Import an XML file first",
      pageTitle: "Editor — XML",
      fieldsInSection: "{n} fields",
      emptySection: "empty",
      valueLabel: "value",
      binaryLabel: "Binary attachment · {n} — not editable",
      binaryBytes: "{n} bytes",
      binaryKb: "{n} KB",
    },
    ru: {
      langLabel: "Язык",
      langAria: "Язык интерфейса",
      backHome: "← Инструменты",
      tagline: "Импорт XML, правка данных в таблице, скачивание результата",
      chooseFile: "Импорт XML",
      expandAll: "Развернуть всё",
      collapseEmpty: "Свернуть пустые",
      download: "Скачать XML",
      fileName: "Файл",
      rootName: "Документ",
      fieldCount: "Полей",
      tableHint: "Все поля в списке. Фильтр purchaseObjectsInfo (или другое имя) — чтобы перейти к блоку.",
      fieldFilter: "Фильтр полей…",
      fieldFilterLabel: "Фильтр",
      fieldFilterAria: "Фильтр полей по имени или значению",
      colField: "Поле",
      colValue: "Значение",
      loadedOk: "Загружен {name}",
      downloadedOk: "Скачан {name}",
      invalidXml: "Некорректный XML: {detail}",
      emptyFile: "Файл пустой",
      noRoot: "Корневой элемент не найден",
      readFailed: "Не удалось прочитать файл",
      nothingLoaded: "Сначала импортируйте XML",
      pageTitle: "Editor — XML",
      fieldsInSection: "полей: {n}",
      emptySection: "пусто",
      valueLabel: "значение",
      binaryLabel: "Двоичное вложение · {n} — не редактируется",
      binaryBytes: "{n} байт",
      binaryKb: "{n} КБ",
    },
  };

  const LANG_KEY = "divider-lang";

  const fileInput = document.getElementById("fileInput");
  const statusEl = document.getElementById("status");
  const metaEl = document.getElementById("meta");
  const fileNameEl = document.getElementById("fileName");
  const rootNameEl = document.getElementById("rootName");
  const fieldCountEl = document.getElementById("fieldCount");
  const tablePanel = document.getElementById("tablePanel");
  const dataBody = document.getElementById("dataBody");
  const editorActions = document.getElementById("editorActions");
  const expandAllBtn = document.getElementById("expandAllBtn");
  const collapseEmptyBtn = document.getElementById("collapseEmptyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const langSelect = document.getElementById("langSelect");
  const fieldFilter = document.getElementById("fieldFilter");
  const fieldFilterWrap = document.getElementById("fieldFilterWrap");
  /** @type {number | null} */
  let filterTimer = null;

  /** @type {"en" | "ru"} */
  let lang = loadLang();
  /** @type {Document | null} */
  let doc = null;
  /** @type {string} */
  let sourceName = "edited.xml";

  function loadLang() {
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "ru" || saved === "en" ? saved : "en";
  }

  /** @param {string} key @param {Record<string, string | number>} [vars] */
  function t(key, vars) {
    let s = STRINGS[lang][key] || STRINGS.en[key] || key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key && "placeholder" in el) el.placeholder = t(key);
    });
    if (langSelect) {
      langSelect.value = lang;
      langSelect.setAttribute("aria-label", t("langAria"));
    }
    if (fieldFilter) fieldFilter.setAttribute("aria-label", t("fieldFilterAria"));
  }

  /** @param {string} message @param {"ok" | "error" | ""} [kind] */
  function setStatus(message, kind = "") {
    statusEl.hidden = !message;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", kind === "error");
    statusEl.classList.toggle("ok", kind === "ok");
  }

  /** @param {Element} el */
  function displayName(el) {
    const name = el.localName || el.tagName;
    return name.includes(":") ? name.split(":").pop() : name;
  }

  /** @param {Element} el */
  function directText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        out += node.nodeValue || "";
      }
    }
    return out;
  }

  /** @param {Element} el @param {string} value */
  function setDirectText(el, value) {
    const toRemove = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        toRemove.push(node);
      }
    }
    toRemove.forEach((n) => el.removeChild(n));
    if (el.children.length === 0) {
      el.appendChild(doc.createTextNode(value));
      return;
    }
    if (value) el.insertBefore(doc.createTextNode(value), el.firstChild);
  }

  /** @param {Element} el */
  function isLeaf(el) {
    return el.children.length === 0;
  }

  /** @param {Attr} attr */
  function isXmlns(attr) {
    return attr.name === "xmlns" || attr.name.startsWith("xmlns:");
  }

  /** @param {Element} el */
  function dataAttrs(el) {
    return Array.from(el.attributes).filter((a) => !isXmlns(a));
  }

  /** @param {Element} el */
  function hasData(el) {
    if (dataAttrs(el).some((a) => a.value.trim())) return true;
    if (directText(el).trim()) return true;
    return Array.from(el.children).some((c) => hasData(c));
  }

  /**
   * @typedef {{
   *   label: string,
   *   value: string,
   *   apply: ((v: string) => void) | null,
   *   sourceEl: Element | null,
   *   binary?: boolean,
   *   binaryBytes?: number,
   * }} FieldItem
   */

  /** @param {string[]} parts */
  function joinPath(parts) {
    return parts.filter(Boolean).join(" / ");
  }

  /** @param {Element} el @param {Element | null} parent */
  function sectionTitle(el, parent) {
    const name = displayName(el);
    if (!parent) return name;
    const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (same.length <= 1) return name;
    return `${name} #${same.indexOf(el) + 1}`;
  }

  /** @param {string} text */
  function looksLikeBase64Payload(text) {
    const head = text.trim().slice(0, 240).replace(/\s+/g, "");
    return head.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(head);
  }

  /** @param {Element} el */
  function hasAttachmentAncestor(el) {
    let p = el.parentElement;
    while (p && p.nodeType === Node.ELEMENT_NODE) {
      const n = displayName(p).toLowerCase();
      if (n.includes("attachment") || n === "cryptosigns") return true;
      p = p.parentElement;
    }
    return false;
  }

  /**
   * Large base64 / attachment payloads — never put into editable inputs.
   * @param {Element | null} el
   * @param {string} [fieldLabel]
   * @param {string} [value]
   */
  function isBinaryPayload(el, fieldLabel, value) {
    const sample = value != null ? value : "";
    const len = sample.length;
    if (len >= 2048 && looksLikeBase64Payload(sample)) return true;

    const lastSeg = (fieldLabel || "").split("/").pop()?.trim() || "";
    const leaf = lastSeg.replace(/\s+#\d+$/, "").replace(/^@/, "").toLowerCase();
    const bulkyNames = new Set([
      "content",
      "attachmentcontent",
      "filecontent",
      "signature",
      "signaturevalue",
    ]);
    const nameHit =
      bulkyNames.has(leaf) ||
      (leaf.endsWith("content") && leaf !== "publishedcontentid" && leaf !== "contentid");
    if (!nameHit) return false;
    if (len >= 256) return true;
    if (el && hasAttachmentAncestor(el)) return true;
    return len >= 64 && looksLikeBase64Payload(sample);
  }

  /** @param {number} bytes */
  function formatBinarySize(bytes) {
    if (bytes >= 1024) return t("binaryKb", { n: Math.round(bytes / 1024) });
    return t("binaryBytes", { n: bytes });
  }

  /**
   * Collect every attribute and text leaf under el.
   * Binary payloads are marked and their content is not kept in memory twice.
   * @param {Element} el
   * @param {Element | null} parent
   * @param {string[]} path
   * @param {FieldItem[]} out
   */
  function collectFields(el, parent, path, out) {
    const title = sectionTitle(el, parent);
    const here = path.length ? [...path, title] : [title];

    for (const attr of dataAttrs(el)) {
      const binary = isBinaryPayload(el, attr.name, attr.value);
      out.push({
        label: joinPath([...here, `@${attr.name}`]),
        value: binary ? "" : attr.value,
        binary,
        binaryBytes: binary ? attr.value.length : 0,
        apply: binary ? null : (v) => el.setAttribute(attr.name, v),
        sourceEl: el,
      });
    }

    if (isLeaf(el)) {
      const text = directText(el);
      const binary = isBinaryPayload(el, title, text);
      out.push({
        label: joinPath(here),
        value: binary ? "" : text,
        binary,
        binaryBytes: binary ? text.length : 0,
        apply: binary ? null : (v) => setDirectText(el, v),
        sourceEl: el,
      });
      return;
    }

    const text = directText(el);
    if (text.trim()) {
      const binary = isBinaryPayload(el, title, text);
      out.push({
        label: joinPath([...here, t("valueLabel")]),
        value: binary ? "" : text,
        binary,
        binaryBytes: binary ? text.length : 0,
        apply: binary ? null : (v) => setDirectText(el, v),
        sourceEl: el,
      });
    }

    for (const child of el.children) {
      collectFields(child, el, here, out);
    }
  }

  /** @param {Element} el */
  function countFields(el) {
    let n = dataAttrs(el).length;
    if (isLeaf(el)) return n + 1;
    if (directText(el).trim()) n += 1;
    for (const child of el.children) n += countFields(child);
    return n;
  }

  /** @param {HTMLTextAreaElement | HTMLInputElement} el */
  function autosizeField(el) {
    if (!(el instanceof HTMLTextAreaElement)) return;
    if (el.closest("tr")?.hidden || el.closest("tr")?.classList.contains("filter-hide")) return;
    el.style.height = "auto";
    const next = el.scrollHeight;
    if (next > 0) el.style.height = `${Math.min(next, 240)}px`;
  }

  /**
   * @param {HTMLElement} cell
   * @param {FieldItem} field
   */
  function bindValueControl(cell, field) {
    if (field.binary) {
      const chip = document.createElement("div");
      chip.className = "binary-chip";
      chip.textContent = t("binaryLabel", { n: formatBinarySize(field.binaryBytes || 0) });
      cell.appendChild(chip);
      return;
    }

    const value = field.value || "";
    const multiline = value.includes("\n") || value.length > 100;
    const input = multiline
      ? document.createElement("textarea")
      : document.createElement("input");

    if (input instanceof HTMLInputElement) {
      input.type = "text";
      input.className = "data-input";
    } else {
      input.className = "data-input data-textarea";
      input.rows = 1;
    }

    input.value = value;
    input.spellcheck = false;
    input.addEventListener("focus", () => autosizeField(input));
    input.addEventListener("input", () => {
      if (field.apply) field.apply(input.value);
      autosizeField(input);
    });
    cell.appendChild(input);
  }

  /**
   * @param {FieldItem} field
   * @param {number} depth
   */
  function createFieldRow(field, depth) {
    const tr = document.createElement("tr");
    tr.className = "data-row";
    tr.style.setProperty("--depth", String(depth));
    tr.dataset.fullPath = field.label;
    tr.dataset.search = field.label.toLowerCase();
    tr.title = field.label;
    if (field.binary) tr.dataset.binary = "1";

    const th = document.createElement("td");
    th.className = "data-field";
    th.textContent = field.label.split(" / ").pop() || field.label;

    const td = document.createElement("td");
    td.className = "data-value";
    bindValueControl(td, field);

    tr.append(th, td);
    return tr;
  }

  /**
   * @typedef {HTMLTableRowElement & {
   *   _members?: HTMLTableRowElement[],
   *   _pendingFields?: FieldItem[],
   *   _pendingDepth?: number,
   * }} SectionHeader
   */

  /** @param {SectionHeader} header */
  function materializePending(header) {
    const pending = header._pendingFields;
    if (!pending || !pending.length) return;
    const depth = header._pendingDepth ?? 0;
    const frag = document.createDocumentFragment();
    /** @type {HTMLTableRowElement[]} */
    const members = header._members ? [...header._members] : [];
    for (const field of pending) {
      const row = createFieldRow(field, depth);
      row.classList.add("section-member");
      row.hidden = header.getAttribute("aria-expanded") !== "true";
      frag.appendChild(row);
      members.push(row);
    }
    header.parentNode?.insertBefore(frag, header.nextSibling);
    header._members = members;
    header._pendingFields = undefined;
  }

  /**
   * @param {SectionHeader} header
   * @param {boolean} expand
   */
  function setSectionExpanded(header, expand) {
    if (expand) materializePending(header);
    header.setAttribute("aria-expanded", expand ? "true" : "false");
    const caret = header.querySelector(".section-caret");
    if (caret) caret.textContent = expand ? "▾" : "▸";

    for (const row of header._members || []) {
      row.hidden = !expand;
      if (row.classList.contains("section-row") && expand) {
        // Keep nested groups collapsed until the user opens them.
        const nested = /** @type {SectionHeader} */ (row);
        if (nested.getAttribute("aria-expanded") === "true") {
          materializePending(nested);
          for (const m of nested._members || []) m.hidden = false;
        }
      } else if (row.classList.contains("section-row") && !expand) {
        for (const m of /** @type {SectionHeader} */ (row)._members || []) m.hidden = true;
      }
    }
  }

  /** @param {string} title @param {number} depth @param {number} fieldN @param {boolean} filled */
  function createGroupHeader(title, depth, fieldN, filled) {
    /** @type {SectionHeader} */
    const header = document.createElement("tr");
    header.className = "section-row";
    header.style.setProperty("--depth", String(depth));
    header.setAttribute("aria-expanded", "true");
    header.dataset.hasData = filled ? "1" : "0";
    header.dataset.hasFields = fieldN > 0 ? "1" : "0";
    header.dataset.sectionName = title;

    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.className = "section-cell";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "section-toggle";

    const caret = document.createElement("span");
    caret.className = "section-caret";
    caret.textContent = "▾";

    const titleEl = document.createElement("span");
    titleEl.className = "section-title";
    titleEl.textContent = title;

    const meta = document.createElement("span");
    meta.className = "section-meta";
    meta.textContent = fieldN > 0 ? t("fieldsInSection", { n: fieldN }) : t("emptySection");

    btn.append(caret, titleEl, meta);
    cell.appendChild(btn);
    header.appendChild(cell);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = header.getAttribute("aria-expanded") === "true";
      setSectionExpanded(header, !open);
    });

    return header;
  }

  /**
   * One collapsible block per top-level child. Inside: group headers for important
   * mid-level nodes (e.g. purchaseObjectsInfo) + every leaf/attr as a visible row.
   * @param {Element} el
   * @param {Element | null} parent
   * @param {number} depth
   */
  function renderSection(el, parent, depth) {
    const frag = document.createDocumentFragment();
    /** @type {FieldItem[]} */
    const fields = [];
    collectFields(el, parent, [], fields);

    const title = sectionTitle(el, parent);
    const filled = fields.some((f) => f.binary || String(f.value).trim().length > 0);
    const expanded = fields.length > 0;
    const header = createGroupHeader(title, depth, fields.length, filled);
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    const caret = header.querySelector(".section-caret");
    if (caret) caret.textContent = expanded ? "▾" : "▸";
    header.dataset.search = title.toLowerCase();
    frag.appendChild(header);

    /** @type {HTMLTableRowElement[]} */
    const members = [];
    /** @type {Map<string, FieldItem[]>} */
    const groups = new Map();

    /** @param {string} label */
    const groupKeyFor = (label) => {
      const parts = label.split(" / ");
      const parents = parts.slice(0, -1);
      if (!parents.length) return "";

      // Prefer one group per purchaseObject #N (the usual dense block)
      for (let i = parents.length - 1; i >= 0; i--) {
        if (/^purchaseObject(\s+#\d+)?$/.test(parents[i])) {
          return parents.slice(0, i + 1).join(" / ");
        }
      }

      // Milestone containers (show purchaseObjectsInfo as its own group when fields
      // sit directly under it, e.g. totalSum)
      const milestones =
        /^(purchaseObjectsInfo|notDrugPurchaseObjectsInfo|drugPurchaseObjectsInfo|notificationInfo|customerRequirementsInfo|procedureInfo|contractConditionsInfo|preferensesInfo|requirementsInfo|commonInfo|customerRequirementInfo)$/;
      for (let i = parents.length - 1; i >= 0; i--) {
        if (milestones.test(parents[i].replace(/\s+#\d+$/, ""))) {
          return parents.slice(0, i + 1).join(" / ");
        }
      }

      return parents.slice(0, Math.min(3, parents.length)).join(" / ");
    };

    for (const field of fields) {
      const groupKey = groupKeyFor(field.label);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(field);
    }

    for (const [groupKey, groupFields] of groups) {
      if (groupKey) {
        const segs = groupKey.split(" / ");
        const shortTitle = segs.slice(-2).join(" / ");
        /** @type {SectionHeader} */
        const groupHeader = createGroupHeader(shortTitle, depth + 1, groupFields.length, true);
        groupHeader.title = groupKey;
        groupHeader.dataset.fullPath = groupKey;
        // Include leaf labels so filter can match before rows are materialized.
        groupHeader.dataset.search = `${groupKey} ${groupFields.map((f) => f.label).join(" ")}`.toLowerCase();
        groupHeader.classList.add("section-member");
        groupHeader.hidden = !expanded;
        // Nested groups stay collapsed + lazy until opened (big win on large notices).
        groupHeader.setAttribute("aria-expanded", "false");
        const groupCaret = groupHeader.querySelector(".section-caret");
        if (groupCaret) groupCaret.textContent = "▸";
        groupHeader._pendingFields = groupFields;
        groupHeader._pendingDepth = depth + 2;
        groupHeader._members = [];
        members.push(groupHeader);
        frag.appendChild(groupHeader);
        continue;
      }

      for (const field of groupFields) {
        const row = createFieldRow(field, depth + 1);
        row.classList.add("section-member");
        row.hidden = !expanded;
        frag.appendChild(row);
        members.push(row);
      }
    }

    header._members = members;
    return frag;
  }

  /** @param {Element} root */
  function renderDocument(root) {
    const keptFilter = fieldFilter ? fieldFilter.value : "";
    dataBody.replaceChildren();

    const onlyNsAttrs = dataAttrs(root).length === 0;
    const skipRootShell = !isLeaf(root) && onlyNsAttrs && !directText(root).trim();

    if (skipRootShell) {
      for (const child of root.children) {
        dataBody.appendChild(renderSection(child, root, 0));
      }
    } else {
      dataBody.appendChild(renderSection(root, null, 0));
    }

    if (fieldFilter && keptFilter) {
      fieldFilter.value = keptFilter;
      applyFieldFilter(keptFilter);
    }
  }

  function expandAllSections() {
    dataBody.querySelectorAll(".section-row").forEach((h) => {
      setSectionExpanded(/** @type {any} */ (h), true);
    });
  }

  function collapseEmptyOnly() {
    dataBody.querySelectorAll(".section-row").forEach((h) => {
      const header = /** @type {SectionHeader} */ (h);
      const filled = header.dataset.hasFields === "1" || header.dataset.hasData === "1";
      if (!filled) {
        setSectionExpanded(header, false);
        return;
      }
      // Open top-level shells; keep nested (lazy) groups collapsed.
      setSectionExpanded(header, !header.classList.contains("section-member"));
    });
  }

  /**
   * Fast filter — do not call setSectionExpanded (that freezes typing on large XML).
   * @param {string} query
   */
  function applyFieldFilter(query) {
    const q = query.trim().toLowerCase();
    const rows = dataBody.querySelectorAll("tr");

    if (!q) {
      rows.forEach((row) => row.classList.remove("filter-hide"));
      dataBody.querySelectorAll(".section-row").forEach((h) => {
        const header = /** @type {SectionHeader} */ (h);
        const open = header.getAttribute("aria-expanded") === "true";
        for (const m of header._members || []) m.hidden = !open;
      });
      return;
    }

    /** @type {Set<Element>} */
    const keep = new Set();
    const depthOf = (row) =>
      Number(/** @type {HTMLElement} */ (row).style.getPropertyValue("--depth") || "0");

    // Materialize groups whose search blob matches so leaf rows can be shown.
    dataBody.querySelectorAll(".section-row").forEach((h) => {
      const header = /** @type {SectionHeader} */ (h);
      const hay = (header.dataset.search || header.dataset.fullPath || "").toLowerCase();
      if (hay.includes(q)) materializePending(header);
    });

    const allRows = dataBody.querySelectorAll("tr");
    allRows.forEach((row) => {
      const hay = (row.dataset.search || row.dataset.fullPath || "").toLowerCase();
      if (!hay.includes(q)) return;
      keep.add(row);
      if (row.classList.contains("section-row")) {
        const header = /** @type {SectionHeader} */ (row);
        materializePending(header);
        for (const m of header._members || []) {
          keep.add(m);
          if (m.classList.contains("section-row")) {
            const nested = /** @type {SectionHeader} */ (m);
            materializePending(nested);
            for (const leaf of nested._members || []) keep.add(leaf);
          }
        }
      }
    });
    for (const row of [...keep]) {
      let d = depthOf(row);
      let prev = row.previousElementSibling;
      while (prev) {
        if (prev.classList.contains("section-row") && depthOf(prev) < d) {
          keep.add(prev);
          d = depthOf(prev);
        }
        prev = prev.previousElementSibling;
      }
    }

    dataBody.querySelectorAll("tr").forEach((row) => {
      const on = keep.has(row);
      row.classList.toggle("filter-hide", !on);
      if (on) {
        row.hidden = false;
        if (row.classList.contains("section-row")) {
          row.setAttribute("aria-expanded", "true");
          const caret = row.querySelector(".section-caret");
          if (caret) caret.textContent = "▾";
        }
      }
    });
  }

  function scheduleFieldFilter() {
    if (!fieldFilter) return;
    if (filterTimer != null) window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => {
      filterTimer = null;
      applyFieldFilter(fieldFilter.value);
    }, 120);
  }

  function serializeXml(documentNode) {
    const serializer = new XMLSerializer();
    let xml = serializer.serializeToString(documentNode);
    if (!xml.startsWith("<?xml")) {
      xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
    }
    return xml;
  }

  function downloadXml() {
    if (!doc) {
      setStatus(t("nothingLoaded"), "error");
      return;
    }
    const xml = serializeXml(doc);
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = sourceName.replace(/\.zip$/i, "").replace(/\.xml$/i, "") || "edited";
    a.href = url;
    a.download = `${base}_edited.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(t("downloadedOk", { name: a.download }), "ok");
  }

  /**
   * @param {string} text
   * @param {string} name
   */
  function loadXmlText(text, name) {
    if (!text.trim()) throw new Error(t("emptyFile"));

    const parser = new DOMParser();
    const parsed = parser.parseFromString(text, "application/xml");
    const err = parsed.querySelector("parsererror");
    if (err) {
      throw new Error(t("invalidXml", { detail: err.textContent?.trim() || "parse error" }));
    }
    if (!parsed.documentElement) throw new Error(t("noRoot"));

    doc = parsed;
    sourceName = name;
    const root = parsed.documentElement;

    if (fieldFilter) fieldFilter.value = "";

    fileNameEl.textContent = name;
    rootNameEl.textContent = displayName(root);
    fieldCountEl.textContent = String(countFields(root));

    renderDocument(root);

    metaEl.hidden = false;
    tablePanel.hidden = false;
    editorActions.hidden = false;
    if (fieldFilterWrap) fieldFilterWrap.hidden = false;
    setStatus(t("loadedOk", { name }), "ok");
    fieldFilter?.focus();
  }

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      loadXmlText(text, file.name);
    } catch (e) {
      doc = null;
      metaEl.hidden = true;
      tablePanel.hidden = true;
      editorActions.hidden = true;
      if (fieldFilterWrap) fieldFilterWrap.hidden = true;
      dataBody.replaceChildren();
      setStatus(e instanceof Error ? e.message : t("readFailed"), "error");
    } finally {
      fileInput.value = "";
    }
  });

  expandAllBtn?.addEventListener("click", expandAllSections);
  collapseEmptyBtn?.addEventListener("click", collapseEmptyOnly);
  downloadBtn?.addEventListener("click", downloadXml);
  fieldFilter?.addEventListener("input", scheduleFieldFilter);
  fieldFilter?.addEventListener("keydown", (e) => {
    // keep typing snappy; Escape clears
    if (e.key === "Escape") {
      fieldFilter.value = "";
      applyFieldFilter("");
    }
  });

  langSelect?.addEventListener("change", () => {
    lang = langSelect.value === "ru" ? "ru" : "en";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
    if (doc) {
      renderDocument(doc.documentElement);
      if (fieldFilter?.value) applyFieldFilter(fieldFilter.value);
    }
  });

  applyI18n();
})();

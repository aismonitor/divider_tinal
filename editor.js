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
      tableHint: "Sections with data are expanded. Edit values in the Value column.",
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
      tableHint: "Секции с данными развёрнуты. Правите значения в колонке «Значение».",
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
    if (langSelect) {
      langSelect.value = lang;
      langSelect.setAttribute("aria-label", t("langAria"));
    }
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
      if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue || "";
    }
    return out;
  }

  /** @param {Element} el @param {string} value */
  function setDirectText(el, value) {
    const toRemove = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) toRemove.push(node);
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

  /** @param {Element} el */
  function countFields(el) {
    let n = dataAttrs(el).length;
    if (isLeaf(el)) return n + 1;
    if (directText(el).trim()) n += 1;
    for (const child of el.children) n += countFields(child);
    return n;
  }

  /** @param {Element} el @param {Element | null} parent */
  function sectionTitle(el, parent) {
    const name = displayName(el);
    if (!parent) return name;
    const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    if (same.length <= 1) return name;
    return `${name} #${same.indexOf(el) + 1}`;
  }

  /** @param {HTMLTextAreaElement} el */
  function autosizeField(el) {
    if (el.dataset.fixedHeight === "1") return;
    if (el.closest("tr")?.hidden) return;
    el.style.height = "auto";
    const next = el.scrollHeight;
    if (next > 0) el.style.height = `${next}px`;
  }

  /** @param {ParentNode} root */
  function autosizeFieldsIn(root) {
    root.querySelectorAll("textarea.data-input:not([data-fixed-height='1'])").forEach((el) => {
      autosizeField(/** @type {HTMLTextAreaElement} */ (el));
    });
  }

  /**
   * Attachment / crypto payload fields can be multi‑MB base64 — keep fixed height.
   * Seen in EIS samples: <content> under attachmentInfo; <signature> under cryptoSigns/attachment.
   * @param {Element | null} el
   * @param {string} [fieldLabel]
   * @param {string} [value]
   */
  function isFixedHeightValue(el, fieldLabel, value) {
    const fromEl = el ? displayName(el).toLowerCase() : "";
    const fromLabel = (fieldLabel || "").replace(/\s+#\d+$/, "").toLowerCase();
    const names = [fromEl, fromLabel].filter(Boolean);
    const bulkyNames = new Set([
      "content",
      "attachmentcontent",
      "filecontent",
      "signature",
    ]);
    if (names.some((n) => bulkyNames.has(n))) return true;

    for (const n of names) {
      if (
        n.endsWith("content") &&
        n !== "publishedcontentid" &&
        n !== "contentid" &&
        el &&
        hasAttachmentAncestor(el)
      ) {
        return true;
      }
    }

    const sample = value != null ? value : el ? directText(el) : "";
    if (sample.length >= 2048 && looksLikeBase64Payload(sample)) return true;
    return false;
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

  /** @param {string} text */
  function looksLikeBase64Payload(text) {
    const head = text.trim().slice(0, 240).replace(/\s+/g, "");
    return head.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(head);
  }

  /**
   * @param {HTMLElement} cell
   * @param {string} value
   * @param {(v: string) => void} onChange
   * @param {{ fixedHeight?: boolean }} [opts]
   */
  function bindValueInput(cell, value, onChange, opts) {
    const fixed = Boolean(opts && opts.fixedHeight);
    const input = document.createElement("textarea");
    input.className = fixed
      ? "data-input data-textarea data-textarea-fixed"
      : "data-input data-textarea";
    input.rows = fixed ? 3 : 1;
    if (fixed) input.dataset.fixedHeight = "1";
    input.value = value;
    input.spellcheck = false;
    input.addEventListener("input", () => {
      onChange(input.value);
      if (!fixed) autosizeField(input);
    });
    cell.appendChild(input);
    if (!fixed) {
      requestAnimationFrame(() => {
        autosizeField(input);
        requestAnimationFrame(() => autosizeField(input));
      });
    }
  }

  /**
   * @param {string} field
   * @param {string} value
   * @param {(v: string) => void} onChange
   * @param {number} depth
   * @param {Element | null} [sourceEl]
   */
  function createFieldRow(field, value, onChange, depth, sourceEl) {
    const tr = document.createElement("tr");
    tr.className = "data-row";
    tr.style.setProperty("--depth", String(depth));

    const th = document.createElement("td");
    th.className = "data-field";
    th.textContent = field;

    const td = document.createElement("td");
    td.className = "data-value";
    bindValueInput(td, value, onChange, {
      fixedHeight: isFixedHeightValue(sourceEl || null, field, value),
    });

    tr.append(th, td);
    return tr;
  }

  /**
   * @param {HTMLTableRowElement & {_members?: HTMLTableRowElement[]}} header
   * @param {boolean} expand
   */
  function setSectionExpanded(header, expand) {
    header.setAttribute("aria-expanded", expand ? "true" : "false");
    const caret = header.querySelector(".section-caret");
    if (caret) caret.textContent = expand ? "▾" : "▸";

    for (const row of header._members || []) {
      if (!expand) {
        row.hidden = true;
        if (row.classList.contains("section-row")) setSectionExpanded(/** @type {any} */ (row), false);
      } else {
        row.hidden = false;
        if (row.classList.contains("section-row")) {
          const nestedOpen = row.getAttribute("aria-expanded") === "true";
          setSectionExpanded(/** @type {any} */ (row), nestedOpen);
        } else {
          autosizeFieldsIn(row);
        }
      }
    }
    if (expand) {
      requestAnimationFrame(() => autosizeFieldsIn(header.parentElement || dataBody));
    }
  }

  /**
   * @param {Element} el
   * @param {Element | null} parent
   * @param {number} depth
   */
  function renderSection(el, parent, depth) {
    const frag = document.createDocumentFragment();

    if (isLeaf(el) && dataAttrs(el).length === 0) {
      frag.appendChild(
        createFieldRow(sectionTitle(el, parent), directText(el), (v) => setDirectText(el, v), depth, el),
      );
      return frag;
    }

    const title = sectionTitle(el, parent);
    const filled = hasData(el);
    const expanded = filled;
    const fieldN = countFields(el);

    /** @type {HTMLTableRowElement & {_members?: HTMLTableRowElement[]}} */
    const header = document.createElement("tr");
    header.className = "section-row";
    header.style.setProperty("--depth", String(depth));
    header.setAttribute("aria-expanded", expanded ? "true" : "false");
    header.dataset.hasData = filled ? "1" : "0";

    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.className = "section-cell";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "section-toggle";

    const caret = document.createElement("span");
    caret.className = "section-caret";
    caret.textContent = expanded ? "▾" : "▸";

    const titleEl = document.createElement("span");
    titleEl.className = "section-title";
    titleEl.textContent = title;

    const meta = document.createElement("span");
    meta.className = "section-meta";
    meta.textContent = filled ? t("fieldsInSection", { n: fieldN }) : t("emptySection");

    btn.append(caret, titleEl, meta);
    cell.appendChild(btn);
    header.appendChild(cell);
    frag.appendChild(header);

    /** @type {HTMLTableRowElement[]} */
    const members = [];

    /** @param {HTMLTableRowElement} row */
    const pushMember = (row) => {
      row.classList.add("section-member");
      row.hidden = !expanded;
      members.push(row);
      frag.appendChild(row);
    };

    /** @param {DocumentFragment} inner */
    const pushFrag = (inner) => {
      while (inner.firstChild) {
        pushMember(/** @type {HTMLTableRowElement} */ (inner.firstChild));
      }
    };

    for (const attr of dataAttrs(el)) {
      pushMember(
        createFieldRow(attr.name, attr.value, (v) => el.setAttribute(attr.name, v), depth + 1, el),
      );
    }

    if (isLeaf(el)) {
      pushMember(
        createFieldRow(t("valueLabel"), directText(el), (v) => setDirectText(el, v), depth + 1, el),
      );
    } else {
      const text = directText(el);
      if (text.trim()) {
        pushMember(
          createFieldRow("(text)", text, (v) => setDirectText(el, v), depth + 1, el),
        );
      }

      const childTagCounts = new Map();
      for (const child of el.children) {
        childTagCounts.set(child.tagName, (childTagCounts.get(child.tagName) || 0) + 1);
      }
      const seen = new Map();

      for (const child of el.children) {
        if (isLeaf(child) && dataAttrs(child).length === 0) {
          const base = displayName(child);
          const total = childTagCounts.get(child.tagName) || 1;
          let label = base;
          if (total > 1) {
            const idx = (seen.get(child.tagName) || 0) + 1;
            seen.set(child.tagName, idx);
            label = `${base} #${idx}`;
          }
          pushMember(
            createFieldRow(label, directText(child), (v) => setDirectText(child, v), depth + 1, child),
          );
        } else {
          pushFrag(renderSection(child, el, depth + 1));
        }
      }
    }

    header._members = members;
    btn.addEventListener("click", () => {
      const open = header.getAttribute("aria-expanded") === "true";
      setSectionExpanded(header, !open);
    });

    return frag;
  }

  /** @param {Element} root */
  function renderDocument(root) {
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
  }

  function expandAllSections() {
    dataBody.querySelectorAll(".section-row").forEach((h) => {
      setSectionExpanded(/** @type {any} */ (h), true);
    });
  }

  function collapseEmptyOnly() {
    dataBody.querySelectorAll(".section-row").forEach((h) => {
      const header = /** @type {any} */ (h);
      setSectionExpanded(header, header.dataset.hasData === "1");
    });
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

    fileNameEl.textContent = name;
    rootNameEl.textContent = displayName(root);
    fieldCountEl.textContent = String(countFields(root));

    renderDocument(root);

    metaEl.hidden = false;
    tablePanel.hidden = false;
    editorActions.hidden = false;
    setStatus(t("loadedOk", { name }), "ok");
    requestAnimationFrame(() => {
      autosizeFieldsIn(dataBody);
      requestAnimationFrame(() => autosizeFieldsIn(dataBody));
    });
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
      dataBody.replaceChildren();
      setStatus(e instanceof Error ? e.message : t("readFailed"), "error");
    } finally {
      fileInput.value = "";
    }
  });

  expandAllBtn?.addEventListener("click", expandAllSections);
  collapseEmptyBtn?.addEventListener("click", collapseEmptyOnly);
  downloadBtn?.addEventListener("click", downloadXml);

  langSelect?.addEventListener("change", () => {
    lang = langSelect.value === "ru" ? "ru" : "en";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
    if (doc) renderDocument(doc.documentElement);
  });

  applyI18n();
})();

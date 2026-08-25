(() => {
  "use strict";

  const STRINGS = {
    en: {
      langLabel: "Language",
      langAria: "Interface language",
      backHome: "← Tools",
      tagline: "Import XML, edit the tree, download the result",
      chooseFile: "Import XML",
      expandAll: "Expand all",
      collapseAll: "Collapse all",
      download: "Download XML",
      fileName: "File",
      rootName: "Root",
      nodeCount: "Elements",
      treeHint: "Click ▸/▾ to collapse nodes. Edit attribute values and text in place.",
      loadedOk: "Loaded {name}",
      downloadedOk: "Downloaded {name}",
      invalidXml: "Invalid XML: {detail}",
      emptyFile: "File is empty",
      noRoot: "No root element found",
      readFailed: "Failed to read file",
      nothingLoaded: "Import an XML file first",
      pageTitle: "Editor — XML",
      attrsLabel: "Attributes",
      textLabel: "Text",
      childrenLabel: "{n} children",
      dash: "—",
    },
    ru: {
      langLabel: "Язык",
      langAria: "Язык интерфейса",
      backHome: "← Инструменты",
      tagline: "Импорт XML, правка дерева, скачивание результата",
      chooseFile: "Импорт XML",
      expandAll: "Развернуть всё",
      collapseAll: "Свернуть всё",
      download: "Скачать XML",
      fileName: "Файл",
      rootName: "Корень",
      nodeCount: "Элементов",
      treeHint: "Нажмите ▸/▾ чтобы свернуть узлы. Правите атрибуты и текст на месте.",
      loadedOk: "Загружен {name}",
      downloadedOk: "Скачан {name}",
      invalidXml: "Некорректный XML: {detail}",
      emptyFile: "Файл пустой",
      noRoot: "Корневой элемент не найден",
      readFailed: "Не удалось прочитать файл",
      nothingLoaded: "Сначала импортируйте XML",
      pageTitle: "Editor — XML",
      attrsLabel: "Атрибуты",
      textLabel: "Текст",
      childrenLabel: "Дочерних: {n}",
      dash: "—",
    },
  };

  const LANG_KEY = "divider-lang";

  const fileInput = document.getElementById("fileInput");
  const statusEl = document.getElementById("status");
  const metaEl = document.getElementById("meta");
  const fileNameEl = document.getElementById("fileName");
  const rootNameEl = document.getElementById("rootName");
  const nodeCountEl = document.getElementById("nodeCount");
  const treePanel = document.getElementById("treePanel");
  const treeEl = document.getElementById("tree");
  const editorActions = document.getElementById("editorActions");
  const expandAllBtn = document.getElementById("expandAllBtn");
  const collapseAllBtn = document.getElementById("collapseAllBtn");
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
    return el.tagName.includes(":") ? el.tagName : el.localName || el.tagName;
  }

  /** @param {Element} el */
  function countElements(el) {
    return 1 + Array.from(el.children).reduce((n, child) => n + countElements(child), 0);
  }

  /**
   * Direct text content (excluding nested element text).
   * @param {Element} el
   */
  function directText(el) {
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) out += node.nodeValue || "";
    }
    return out;
  }

  /**
   * @param {Element} el
   * @param {string} value
   */
  function setDirectText(el, value) {
    const toRemove = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) toRemove.push(node);
    }
    toRemove.forEach((n) => el.removeChild(n));

    const trimmed = value;
    if (el.children.length === 0) {
      el.appendChild(doc.createTextNode(trimmed));
      return;
    }
    if (trimmed.trim()) {
      el.insertBefore(doc.createTextNode(trimmed), el.firstChild);
    }
  }

  /**
   * @param {Element} el
   * @param {number} depth
   * @param {boolean} startCollapsed
   */
  function renderNode(el, depth, startCollapsed) {
    const hasChildren = el.children.length > 0;
    const text = directText(el);
    const hasSignificantText = text.trim().length > 0;
    const attrs = Array.from(el.attributes);

    const item = document.createElement("div");
    item.className = "tree-node";
    item.style.setProperty("--depth", String(depth));
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-expanded", hasChildren ? (startCollapsed ? "false" : "true") : "true");

    const row = document.createElement("div");
    row.className = "tree-row";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.tabIndex = -1;
    if (hasChildren) {
      toggle.textContent = startCollapsed ? "▸" : "▾";
      toggle.setAttribute("aria-label", startCollapsed ? t("expandAll") : t("collapseAll"));
    } else {
      toggle.textContent = "·";
      toggle.classList.add("is-leaf");
      toggle.disabled = true;
    }

    const tag = document.createElement("span");
    tag.className = "tree-tag";
    tag.textContent = `<${displayName(el)}>`;

    const badge = document.createElement("span");
    badge.className = "tree-badge";
    if (hasChildren) {
      badge.textContent = t("childrenLabel", { n: el.children.length });
    } else if (hasSignificantText) {
      const preview = text.trim().slice(0, 48);
      badge.textContent = preview + (text.trim().length > 48 ? "…" : "");
    }

    row.append(toggle, tag, badge);
    item.appendChild(row);

    const body = document.createElement("div");
    body.className = "tree-body";
    if (hasChildren && startCollapsed) body.hidden = true;

    if (attrs.length) {
      const attrsBlock = document.createElement("div");
      attrsBlock.className = "tree-attrs";
      const attrsTitle = document.createElement("div");
      attrsTitle.className = "tree-section-label";
      attrsTitle.textContent = t("attrsLabel");
      attrsBlock.appendChild(attrsTitle);

      for (const attr of attrs) {
        const line = document.createElement("label");
        line.className = "tree-attr";
        const name = document.createElement("span");
        name.className = "tree-attr-name";
        name.textContent = attr.name;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "tree-input";
        input.value = attr.value;
        input.spellcheck = false;
        input.addEventListener("input", () => {
          el.setAttribute(attr.name, input.value);
        });
        line.append(name, input);
        attrsBlock.appendChild(line);
      }
      body.appendChild(attrsBlock);
    }

    if (hasSignificantText || (!hasChildren && text.length >= 0)) {
      const textBlock = document.createElement("label");
      textBlock.className = "tree-text";
      const textTitle = document.createElement("span");
      textTitle.className = "tree-section-label";
      textTitle.textContent = t("textLabel");
      const area = document.createElement("textarea");
      area.className = "tree-textarea";
      area.rows = Math.min(6, Math.max(1, text.split("\n").length));
      area.value = text.trim() ? text : text;
      area.spellcheck = false;
      area.addEventListener("input", () => {
        setDirectText(el, area.value);
        if (!hasChildren) {
          const preview = area.value.trim().slice(0, 48);
          badge.textContent = preview ? preview + (area.value.trim().length > 48 ? "…" : "") : "";
        }
      });
      textBlock.append(textTitle, area);
      body.appendChild(textBlock);
    }

    if (hasChildren) {
      const kids = document.createElement("div");
      kids.className = "tree-children";
      kids.setAttribute("role", "group");
      // Collapse deep levels by default for better UX on large EIS files
      const childStartCollapsed = depth >= 1;
      for (const child of el.children) {
        kids.appendChild(renderNode(child, depth + 1, childStartCollapsed));
      }
      body.appendChild(kids);

      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const expanded = item.getAttribute("aria-expanded") === "true";
        item.setAttribute("aria-expanded", expanded ? "false" : "true");
        body.hidden = expanded;
        toggle.textContent = expanded ? "▸" : "▾";
      });

      row.addEventListener("click", (e) => {
        if (e.target === toggle || e.target.closest("input, textarea, button, a, label")) return;
        toggle.click();
      });
    }

    item.appendChild(body);
    return item;
  }

  /** @param {boolean} expand */
  function setAllExpanded(expand) {
    treeEl.querySelectorAll(".tree-node").forEach((node) => {
      const toggle = node.querySelector(":scope > .tree-row > .tree-toggle");
      const body = node.querySelector(":scope > .tree-body");
      if (!toggle || toggle.classList.contains("is-leaf") || !body) return;
      node.setAttribute("aria-expanded", expand ? "true" : "false");
      body.hidden = !expand;
      toggle.textContent = expand ? "▾" : "▸";
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
    nodeCountEl.textContent = String(countElements(root));

    treeEl.replaceChildren();
    // Root expanded; deeper levels start collapsed
    treeEl.appendChild(renderNode(root, 0, false));

    metaEl.hidden = false;
    treePanel.hidden = false;
    editorActions.hidden = false;
    setStatus(t("loadedOk", { name }), "ok");
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
      treePanel.hidden = true;
      editorActions.hidden = true;
      treeEl.replaceChildren();
      setStatus(e instanceof Error ? e.message : t("readFailed"), "error");
    } finally {
      fileInput.value = "";
    }
  });

  expandAllBtn?.addEventListener("click", () => setAllExpanded(true));
  collapseAllBtn?.addEventListener("click", () => setAllExpanded(false));
  downloadBtn?.addEventListener("click", downloadXml);

  langSelect?.addEventListener("change", () => {
    lang = langSelect.value === "ru" ? "ru" : "en";
    localStorage.setItem(LANG_KEY, lang);
    applyI18n();
    if (doc) {
      // Re-render tree so labels update
      const root = doc.documentElement;
      treeEl.replaceChildren();
      treeEl.appendChild(renderNode(root, 0, false));
    }
  });

  applyI18n();
})();

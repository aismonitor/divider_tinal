(() => {
  "use strict";

  const fileInput = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const schemeVersionEl = document.getElementById("schemeVersion");
  const execCountEl = document.getElementById("execCount");
  const regNumEl = document.getElementById("regNum");
  const listSection = document.getElementById("listSection");
  const execListEl = document.getElementById("execList");
  const exportBtn = document.getElementById("exportBtn");

  /** @type {{ xmlText: string, doc: Document, contractSchemeVersion: string, regNum: string, executions: ExecutionItem[] } | null} */
  let state = null;

  /**
   * @typedef {object} ExecutionItem
   * @property {Element} procedureEl
   * @property {string} id
   * @property {string} procedureSchemeVersion
   * @property {string} ordinalNumber
   * @property {string} label
   * @property {string} kind
   * @property {string} docNum
   * @property {string} docDate
   * @property {string} fileBase
   */

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    resetUi();
    fileNameEl.hidden = false;
    fileNameEl.textContent = file.name;
    try {
      const xmlText = await readXmlFromFile(file);
      state = parseExport(xmlText);
      renderSuccess(state);
    } catch (err) {
      state = null;
      showStatus(err instanceof Error ? err.message : String(err), "error");
      exportBtn.disabled = true;
    }
  });

  exportBtn.addEventListener("click", async () => {
    if (!state || !state.executions.length) return;
    exportBtn.disabled = true;
    try {
      const zip = new JSZip();
      for (const item of state.executions) {
        const xml = wrapProcedureAsExport(state.doc, item.procedureEl);
        zip.file(`${item.fileBase}.xml`, xml);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const name = `executions_${sanitizeFilePart(state.regNum || "unknown")}.zip`;
      downloadBlob(blob, name);
      showStatus(`Exported ${state.executions.length} file(s) → ${name}`, "ok");
    } catch (err) {
      console.error(err);
      showStatus(err instanceof Error ? err.message : String(err), "error");
    } finally {
      exportBtn.disabled = !state || !state.executions.length;
    }
  });

  function resetUi() {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.className = "status";
    summaryEl.hidden = true;
    listSection.hidden = true;
    execListEl.innerHTML = "";
    exportBtn.disabled = true;
  }

  function showStatus(message, kind) {
    statusEl.hidden = false;
    statusEl.className = `status ${kind || ""}`.trim();
    statusEl.textContent = message;
  }

  /**
   * @param {ReturnType<typeof parseExport>} parsed
   */
  function renderSuccess(parsed) {
    showStatus(`Parsed OK — ${parsed.executions.length} execution(s)`, "ok");
    summaryEl.hidden = false;
    schemeVersionEl.textContent = parsed.contractSchemeVersion;
    execCountEl.textContent = String(parsed.executions.length);
    regNumEl.textContent = parsed.regNum || "—";

    listSection.hidden = false;
    execListEl.innerHTML = "";
    for (const item of parsed.executions) {
      const li = document.createElement("li");
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `#${item.ordinalNumber} · ${item.label}`;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `schemeVersion=${item.procedureSchemeVersion} · id=${item.id || "—"} · ${item.fileBase}.xml`;
      li.append(title, meta);
      execListEl.appendChild(li);
    }
    exportBtn.disabled = parsed.executions.length === 0;
  }

  /**
   * @param {File} file
   * @returns {Promise<string>}
   */
  async function readXmlFromFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".zip") || file.type === "application/zip") {
      if (typeof JSZip === "undefined") {
        throw new Error("JSZip is not loaded — cannot read ZIP files");
      }
      const zip = await JSZip.loadAsync(await readAsArrayBuffer(file));
      const xmlEntries = Object.keys(zip.files)
        .filter((name) => /\.xml$/i.test(name) && !zip.files[name].dir)
        .sort();
      if (!xmlEntries.length) {
        throw new Error("ZIP contains no XML files");
      }
      for (const entryName of xmlEntries) {
        const text = await zip.files[entryName].async("string");
        if (looksLikeExport(text)) return text;
      }
      throw new Error("ZIP has XML files, but none look like ns3:export with a contract");
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
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
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
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
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
   */
  function parseExport(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Invalid XML: " + (parseError.textContent || "parse error").trim().slice(0, 200));
    }

    const exportEl = findLocal(doc, "export");
    if (!exportEl) {
      throw new Error('Root element "export" not found');
    }

    const contractEl = findLocal(exportEl, "contract");
    if (!contractEl) {
      throw new Error('No <ns3:contract> found — expected EIS export with a contract');
    }

    const contractSchemeVersion = contractEl.getAttribute("schemeVersion");
    if (!contractSchemeVersion) {
      throw new Error('<ns3:contract> has no schemeVersion attribute');
    }

    const procedures = findAllLocal(exportEl, "contractProcedure");
    /** @type {ExecutionItem[]} */
    const executions = [];

    for (const procedureEl of procedures) {
      const executionsEl = findLocal(procedureEl, "executions");
      if (!executionsEl) continue;

      const id = textOf(findLocal(procedureEl, "id"));
      const regNum = textOf(findLocal(procedureEl, "regNum"));
      const ordinalNumber = textOf(findLocal(executionsEl, "ordinalNumber")) || "?";
      const procedureSchemeVersion = procedureEl.getAttribute("schemeVersion") || "—";
      const named = describeExecution(executionsEl);
      const fileBase = [
        sanitizeFilePart(regNum || "noreg"),
        "exec",
        sanitizeFilePart(ordinalNumber),
        sanitizeFilePart(id || "noid"),
      ].join("_");

      executions.push({
        procedureEl,
        id,
        procedureSchemeVersion,
        ordinalNumber,
        label: named.label,
        kind: named.kind,
        docNum: named.docNum,
        docDate: named.docDate,
        fileBase,
      });
    }

    if (!executions.length) {
      throw new Error("No <executions> blocks found inside contractProcedure");
    }

    executions.sort((a, b) => Number(b.ordinalNumber) - Number(a.ordinalNumber));

    const regNum =
      textOf(findLocal(executions[0].procedureEl, "regNum")) ||
      textOf(findLocal(contractEl, "regNum")) ||
      "";

    return {
      xmlText,
      doc,
      contractSchemeVersion,
      regNum,
      executions,
    };
  }

  /**
   * @param {Element} executionsEl
   */
  function describeExecution(executionsEl) {
    const executionEls = findAllLocal(executionsEl, "execution");
    for (const executionEl of executionEls) {
      const docAcceptance = findLocal(executionEl, "docAcceptance");
      if (docAcceptance) {
        const name = textOf(findLocal(docAcceptance, "name")) || "Документ о приемке";
        const docNum = textOf(findLocal(docAcceptance, "documentNum"));
        const docDate = textOf(findLocal(docAcceptance, "documentDate"));
        return {
          kind: "docAcceptance",
          docNum,
          docDate,
          label: formatDocLabel(name, docNum, docDate),
        };
      }
      const payDoc = findLocal(executionEl, "payDoc");
      if (payDoc) {
        const name = textOf(findLocal(payDoc, "documentName")) || "Платежный документ";
        const docNum = textOf(findLocal(payDoc, "documentNum"));
        const docDate = textOf(findLocal(payDoc, "documentDate"));
        return {
          kind: "payDoc",
          docNum,
          docDate,
          label: formatDocLabel(name, docNum, docDate),
        };
      }
    }

    const printForm = findLocal(executionsEl.parentElement, "printForm");
    const docRegNumber = printForm ? textOf(findLocal(printForm, "docRegNumber")) : "";
    return {
      kind: "unknown",
      docNum: docRegNumber,
      docDate: "",
      label: docRegNumber ? `Исполнение · ${docRegNumber}` : "Исполнение",
    };
  }

  /**
   * @param {string} name
   * @param {string} num
   * @param {string} date
   */
  function formatDocLabel(name, num, date) {
    const shortName = name.length > 80 ? name.slice(0, 77) + "…" : name;
    const parts = [shortName];
    if (num) parts.push(`№${num}`);
    if (date) parts.push(`от ${normalizeDate(date)}`);
    return parts.join(" ");
  }

  /**
   * @param {string} date
   */
  function normalizeDate(date) {
    // EIS sometimes sends "2026-08-13+03:00"
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
   * Direct child with the given local name (first match).
   * @param {ParentNode | null} parent
   * @param {string} localName
   * @returns {Element | null}
   */
  function findLocal(parent, localName) {
    if (!parent) return null;
    const direct = directChildrenLocal(parent, localName);
    return direct[0] || null;
  }

  /**
   * Direct children only (contractProcedure under export, execution under executions, …).
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

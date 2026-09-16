// Utilidad genérica de importación desde Excel/CSV, pensada para reusar en
// Pesadas, Ingresos, Egresos, Existencias, Labores, etc.
import { el } from "./utils.js";

let sheetJsPromise = null;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("No se pudo cargar la librería para leer Excel (revisá tu conexión a internet)"));
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

// Lee la primera hoja de un archivo .xlsx/.xls/.csv y devuelve un array de
// objetos { NombreColumna: valor, ... } usando la primera fila como encabezado.
export async function readRowsFromFile(file) {
  const XLSX = await loadSheetJS();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function findColumn(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const found = keys.find((k) => k.toLowerCase().trim().includes(cand));
    if (found) return found;
  }
  return null;
}

function isoFromDateVal(val) {
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

// columnDefs: [{ key: "fecha", type: "date", candidates: ["fecha"], required: true }, ...]
// Devuelve { validas: [...objetos convertidos], invalidas: cantidad }
export function mapRows(rawRows, columnDefs) {
  if (!rawRows.length) return { validas: [], invalidas: 0 };
  const colMap = {};
  columnDefs.forEach((def) => {
    colMap[def.key] = findColumn(rawRows[0], def.candidates);
  });

  const validas = [];
  let invalidas = 0;
  rawRows.forEach((raw) => {
    const out = {};
    let ok = true;
    columnDefs.forEach((def) => {
      const rawKey = colMap[def.key];
      let val = rawKey ? raw[rawKey] : undefined;
      if (def.type === "date") val = isoFromDateVal(val);
      else if (def.type === "number") val = parseFloat(val) || 0;
      else val = String(val ?? "").trim();
      if (def.required && !val) ok = false;
      out[def.key] = val;
    });
    if (ok) validas.push(out);
    else invalidas++;
  });
  return { validas, invalidas };
}

// Arma el bloque de UI: input de archivo + previsualización + confirmar.
// columnDefs define qué columnas mapear; onConfirm(filas) hace el guardado real.
export function buildImportPanel({ columnDefs, previewColumns, onConfirm, ejemploTexto }) {
  let pendientes = [];

  const wrap = el("div", { class: "import-panel" });
  const fileInput = el("input", { type: "file", accept: ".xlsx,.xls,.csv", id: "import-file-input" });
  const status = el("div", { class: "sub", style: "margin-top:8px" }, ejemploTexto || "");
  const previewWrap = el("div", { id: "import-preview-wrap" });
  const actions = el("div", { style: "display:none; gap:8px; margin-top:10px" }, [
    el("button", { class: "btn btn-primary", type: "button", id: "import-confirm-btn" }, "Confirmar importación"),
    el("button", { class: "btn btn-ghost", type: "button", id: "import-cancel-btn" }, "Cancelar"),
  ]);

  wrap.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Subir archivo (.xlsx, .xls o .csv)"),
    fileInput,
  ]));
  wrap.appendChild(status);
  wrap.appendChild(previewWrap);
  wrap.appendChild(actions);

  function reset() {
    pendientes = [];
    previewWrap.innerHTML = "";
    actions.style.display = "none";
    fileInput.value = "";
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = "Leyendo archivo…";
    previewWrap.innerHTML = "";
    actions.style.display = "none";
    try {
      const raw = await readRowsFromFile(file);
      const { validas, invalidas } = mapRows(raw, columnDefs);
      pendientes = validas;
      if (validas.length === 0) {
        status.textContent = "No encontré filas válidas. Revisá que el archivo tenga columnas de " +
          columnDefs.map((c) => c.label).join(", ") + ".";
        return;
      }
      status.textContent = `Encontré ${validas.length} fila(s) para importar` +
        (invalidas ? ` (${invalidas} se salteó por datos incompletos)` : "") + ". Revisá el preview:";
      const table = el("table", { class: "data-table" });
      table.appendChild(el("thead", {}, el("tr", {}, previewColumns.map((c) => el("th", {}, c.label)))));
      const tbody = el("tbody");
      validas.slice(0, 8).forEach((row) => {
        tbody.appendChild(el("tr", {}, previewColumns.map((c) => el("td", {}, String(row[c.key] ?? "")))));
      });
      table.appendChild(tbody);
      previewWrap.appendChild(table);
      if (validas.length > 8) {
        previewWrap.appendChild(el("p", { class: "sub" }, `...y ${validas.length - 8} fila(s) más.`));
      }
      actions.style.display = "flex";
    } catch (err) {
      status.textContent = "No se pudo leer el archivo: " + err.message;
    }
  });

  actions.querySelector("#import-confirm-btn").addEventListener("click", async () => {
    const btn = actions.querySelector("#import-confirm-btn");
    btn.disabled = true;
    btn.textContent = "Importando…";
    try {
      await onConfirm(pendientes);
      status.textContent = `Listo, se importaron ${pendientes.length} fila(s).`;
    } catch (err) {
      status.textContent = "Error al importar: " + err.message;
    }
    btn.disabled = false;
    btn.textContent = "Confirmar importación";
    reset();
  });
  actions.querySelector("#import-cancel-btn").addEventListener("click", reset);

  return wrap;
}

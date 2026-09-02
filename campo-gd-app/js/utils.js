export const CATEGORIAS_EGRESO = [
  "Sanidad", "Alimentación", "Combustible", "Mano de obra",
  "Insumos", "Impuestos", "Mantenimiento", "Otros"
];

export const CATEGORIAS_HACIENDA = [
  "Vacas de cría", "Vacas descarte", "Novillos 1-2", "Novillos 2-3",
  "Vaquillonas 1-2", "Vaquillonas 2-3", "Terneros", "Terneras", "Toros"
];

export const MOTIVOS_EXISTENCIAS = ["Nacimiento", "Compra", "Cambio de categoría", "Venta", "Muerte", "Otro"];

export const TIPOS_LABOR = ["Siembra", "Fertilización", "Movimiento de tierra", "Pulverización", "Rotativa", "Otro"];

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const CONCEPTOS_INGRESO = [
  "Venta de terneros", "Venta de terneras", "Venta de novillos", "Venta de vaquillonas",
  "Venta de vacas", "Venta de vacas de descarte", "Venta de toros", "Venta de vientres",
  "Venta de hacienda (general)", "Venta de granos / cosecha", "Arrendamiento de campo",
  "Pastaje / Pastoreo", "Servicios agrícolas prestados", "Subsidios", "Otro"
];

export const CONCEPTOS_EGRESO = [
  "Vacunación", "Desparasitación / Curación", "Sanidad (otro)",
  "Suplemento / Alimento balanceado", "Forraje / Rollos / Silo",
  "Nafta", "Gasoil", "Aceite / Lubricantes",
  "Sueldo / Jornal", "Changa / Contratista",
  "Alambre / Postes / Tranqueras", "Herramientas", "Semillas", "Agroquímicos",
  "Impuesto inmobiliario", "Impuesto a las ganancias", "Otro impuesto",
  "Reparación de maquinaria", "Reparación de instalaciones", "Service de vehículo",
  "Honorarios (veterinario, ingeniero, contador)", "Seguro", "Otro"
];

export const INSUMOS_SANIDAD = [
  "Saguaypicida", "Marca", "IATF", "IATF dispositivos", "IATF retiro",
  "Mancha y gangrena", "Nitroxinil", "Aftosa", "Clorsulon", "Cobre",
  "Caravana mosca", "Brucelosis", "Ricoverm", "Leptospira", "Carbuman",
  "Reproductiva", "Inseminación", "Ecografías", "Pesaje", "Otro"
];

export function fmtMoney(n, moneda) {
  const num = Number(n) || 0;
  const abs = Math.abs(num).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const sign = num < 0 ? "-" : "";
  return moneda === "USD" ? `${sign}USD ${abs}` : `${sign}$ ${abs}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function monthLabel(y, m) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${meses[m]}-${String(y).slice(2)}`;
}

export function years(from, to) {
  const arr = [];
  for (let y = from; y <= to; y++) arr.push(y);
  return arr;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

// Campo "select + Otro (especificar)": un desplegable con lista fija más una
// opción "Otro" que revela un input de texto libre. id-otro es el input extra.
export function fieldSelectOtro(label, id, options) {
  const wrap = el("div", { class: "field" });
  wrap.appendChild(el("label", { for: id }, label));
  const select = el("select", {
    id,
    onchange: (e) => {
      const otroInput = document.getElementById(id + "-otro");
      if (otroInput) otroInput.style.display = e.target.value === "Otro" ? "block" : "none";
    },
  });
  options.forEach((o) => select.appendChild(el("option", { value: o }, o)));
  wrap.appendChild(select);
  wrap.appendChild(el("input", {
    type: "text", id: id + "-otro", placeholder: "Especificar...",
    style: "display:none; margin-top:6px",
  }));
  return wrap;
}

export function getSelectOtroValue(id) {
  const select = document.getElementById(id);
  if (!select) return "";
  if (select.value === "Otro") {
    const otro = document.getElementById(id + "-otro");
    return (otro && otro.value.trim()) || "Otro";
  }
  return select.value;
}

// Completa un fieldSelectOtro con un valor guardado: si coincide con una
// opción de la lista la selecciona, si no cae en "Otro" y llena el texto libre.
export function setSelectOtroValue(id, value, options) {
  const select = document.getElementById(id);
  const otroInput = document.getElementById(id + "-otro");
  if (!select) return;
  if (options.includes(value)) {
    select.value = value;
    if (otroInput) otroInput.style.display = "none";
  } else if (value) {
    select.value = "Otro";
    if (otroInput) {
      otroInput.style.display = "block";
      otroInput.value = value;
    }
  } else {
    select.value = options[0];
    if (otroInput) otroInput.style.display = "none";
  }
}

let toastTimer = null;
export function toast(msg, isErr = false) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

export function confirmar(msg) {
  return window.confirm(msg);
}

// ---------- Exportar a Excel (SheetJS, cargado desde CDN la primera vez) ----------
let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("No se pudo cargar el generador de Excel (revisá tu conexión a internet)"));
    document.head.appendChild(script);
  });
  return xlsxPromise;
}

// headers: array de nombres de columna. rows: array de arrays con los valores de cada fila.
export async function exportToExcel(filename, sheetName, headers, rows) {
  const XLSX = await loadXLSX();
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

// Botón listo para insertar en cualquier módulo. getRows() se llama recién al
// tocar el botón, así siempre exporta los datos más actuales.
export function buildExportButton(filename, sheetName, headers, getRows) {
  const btn = el("button", { class: "btn btn-ghost btn-sm", type: "button" }, "⬇️ Exportar Excel");
  btn.addEventListener("click", async () => {
    const rows = getRows();
    if (!rows || rows.length === 0) {
      toast("Todavía no hay datos para exportar", true);
      return;
    }
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando...";
    try {
      await exportToExcel(filename, sheetName, headers, rows);
    } catch (err) {
      toast("No se pudo exportar: " + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });
  return btn;
}

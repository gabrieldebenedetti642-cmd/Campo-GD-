import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, CATEGORIAS_HACIENDA, MOTIVOS_EXISTENCIAS } from "./utils.js";

const COL = "existencias";
const COL_POTREROS = "potreros";
let items = [];
let potreros = [];
let pesadas = [];
let editingId = null;
let editingPotreroId = null;
let unsub = null;
let unsubPotreros = null;
let unsubPesadas = null;

export function renderExistencias(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Existencias")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar movimiento"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Stock actual por categoría"),
      el("div", { class: "table-wrap", id: "existencias-stock" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Potreros y hectáreas"),
      buildPotreroForm(),
      el("div", { class: "table-wrap", id: "potreros-table-wrap", style: "margin-top:14px" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Carga animal"),
      el("div", { class: "stat-grid", id: "carga-animal-stats" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Movimientos cargados"),
      el("div", { class: "table-wrap", id: "existencias-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  if (unsubPotreros) unsubPotreros();
  if (unsubPesadas) unsubPesadas();

  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderStock();
    renderTable();
    renderCargaAnimal();
  });
  unsubPotreros = listenTo(COL_POTREROS, (data) => {
    potreros = data.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    renderPotreros();
    renderCargaAnimal();
  });
  unsubPesadas = listenTo("pesadas", (data) => {
    pesadas = data;
    renderCargaAnimal();
  });
}

export function unmountExistencias() {
  if (unsub) unsub();
  if (unsubPotreros) unsubPotreros();
  if (unsubPesadas) unsubPesadas();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "ex-form" });
  const fFecha = fieldInput("Fecha", "date", "ex-fecha", todayISO());
  const fCategoria = fieldSelect("Categoría", "ex-categoria", CATEGORIAS_HACIENDA);
  const fMovimiento = fieldSelect("Movimiento", "ex-movimiento", ["Entrada", "Salida"]);
  const fMotivo = fieldSelect("Motivo", "ex-motivo", MOTIVOS_EXISTENCIAS);
  const fCantidad = fieldInput("Cantidad", "number", "ex-cantidad", "");
  const fObs = fieldInput("Observaciones", "text", "ex-obs", "");
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "ex-submit-btn" }, "Guardar"),
  ]);
  [fFecha, fCategoria, fMovimiento, fMotivo, fCantidad, fObs, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("ex-fecha").value,
      categoria: document.getElementById("ex-categoria").value,
      movimiento: document.getElementById("ex-movimiento").value,
      motivo: document.getElementById("ex-motivo").value,
      cantidad: parseInt(document.getElementById("ex-cantidad").value, 10) || 0,
      observaciones: document.getElementById("ex-obs").value.trim(),
    };
    if (!data.fecha || !data.cantidad) {
      toast("Completá al menos fecha y cantidad", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Movimiento actualizado");
        editingId = null;
        document.getElementById("ex-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Movimiento guardado");
      }
      form.reset();
      document.getElementById("ex-fecha").value = todayISO();
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });
  return form;
}

function fieldInput(label, type, id, value) {
  const wrap = el("div", { class: "field" });
  wrap.appendChild(el("label", { for: id }, label));
  wrap.appendChild(el("input", { type, id, value }));
  return wrap;
}
function fieldSelect(label, id, options) {
  const wrap = el("div", { class: "field" });
  wrap.appendChild(el("label", { for: id }, label));
  const select = el("select", { id });
  options.forEach((o) => select.appendChild(el("option", { value: o }, o)));
  wrap.appendChild(select);
  return wrap;
}

function buildPotreroForm() {
  const form = el("form", { class: "entry-form", id: "pot-form" });
  const fNombre = fieldInput("Potrero", "text", "pot-nombre", "");
  const fHa = fieldInput("Hectáreas", "number", "pot-ha", "");
  fHa.querySelector("input").step = "0.1";
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "pot-submit-btn" }, "Guardar"),
  ]);
  [fNombre, fHa, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      nombre: document.getElementById("pot-nombre").value.trim(),
      hectareas: parseFloat(document.getElementById("pot-ha").value) || 0,
    };
    if (!data.nombre) {
      toast("Completá el nombre del potrero", true);
      return;
    }
    try {
      if (editingPotreroId) {
        await updateDocIn(COL_POTREROS, editingPotreroId, data);
        toast("Potrero actualizado");
        editingPotreroId = null;
        document.getElementById("pot-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL_POTREROS, data);
        toast("Potrero guardado");
      }
      form.reset();
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });
  return form;
}

function renderPotreros() {
  const wrap = document.getElementById("potreros-table-wrap");
  if (!wrap) return;
  if (potreros.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "Todavía no cargaste ningún potrero.")]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [el("th", {}, "Potrero"), el("th", {}, "Hectáreas"), el("th", {}, "")])));
  const tbody = el("tbody");
  let total = 0;
  potreros.forEach((p) => {
    total += p.hectareas || 0;
    tbody.appendChild(el("tr", {}, [
      el("td", {}, p.nombre || ""),
      el("td", { class: "num" }, (p.hectareas ?? 0).toFixed(1)),
      el("td", {}, potreroActions(p)),
    ]));
  });
  tbody.appendChild(el("tr", { style: "font-weight:700;background:#F2F0E7" }, [
    el("td", {}, "TOTAL"), el("td", { class: "num" }, total.toFixed(1)), el("td", {}),
  ]));
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function potreroActions(p) {
  const wrap = el("div", { class: "row-actions" });
  const editBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Editar");
  editBtn.addEventListener("click", () => {
    editingPotreroId = p.id;
    document.getElementById("pot-nombre").value = p.nombre || "";
    document.getElementById("pot-ha").value = p.hectareas || "";
    document.getElementById("pot-submit-btn").textContent = "Guardar cambios";
  });
  const delBtn = el("button", { class: "btn btn-danger-ghost btn-sm" }, "Borrar");
  delBtn.addEventListener("click", async () => {
    if (!confirmar("¿Borrar este potrero?")) return;
    try {
      await deleteDocFrom(COL_POTREROS, p.id);
      toast("Potrero borrado");
    } catch (err) {
      toast("No se pudo borrar: " + err.message, true);
    }
  });
  wrap.appendChild(editBtn);
  wrap.appendChild(delBtn);
  return wrap;
}

function renderCargaAnimal() {
  const wrap = document.getElementById("carga-animal-stats");
  if (!wrap) return;
  const stockTotal = CATEGORIAS_HACIENDA.reduce((sum, cat) => {
    const deCat = items.filter((i) => i.categoria === cat);
    const entradas = deCat.filter((i) => i.movimiento === "Entrada").reduce((s, i) => s + (i.cantidad || 0), 0);
    const salidas = deCat.filter((i) => i.movimiento === "Salida").reduce((s, i) => s + (i.cantidad || 0), 0);
    return sum + (entradas - salidas);
  }, 0);
  const haTotal = potreros.reduce((s, p) => s + (p.hectareas || 0), 0);
  const pesos = pesadas.map((p) => p.peso).filter((p) => typeof p === "number");
  const pesoProm = pesos.length ? pesos.reduce((s, p) => s + p, 0) / pesos.length : 0;
  const cargaAnimal = haTotal > 0 ? stockTotal / haTotal : 0;
  const kgVivoHa = haTotal > 0 ? (stockTotal * pesoProm) / haTotal : 0;

  const stat = (label, value) => el("div", { class: "stat-card" }, [
    el("span", { class: "eyebrow" }, label),
    el("div", { class: "value" }, value),
  ]);
  wrap.innerHTML = "";
  wrap.appendChild(stat("Stock total (cabezas)", String(stockTotal)));
  wrap.appendChild(stat("Hectáreas totales", haTotal.toFixed(1)));
  wrap.appendChild(stat("Carga animal (cab/ha)", cargaAnimal.toFixed(2)));
  wrap.appendChild(stat("Peso promedio general (kg)", pesoProm.toFixed(1)));
  wrap.appendChild(stat("Kg vivo estimado/ha", kgVivoHa.toFixed(0)));
  wrap.appendChild(el("div", { class: "sub", style: "grid-column:1/-1;margin-top:4px" },
    "Estimación: aplica el peso promedio general a todo el stock, no reemplaza un pesaje real por categoría."));
}

function renderStock() {
  const wrap = document.getElementById("existencias-stock");
  if (!wrap) return;
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Categoría"), el("th", {}, "Stock actual"), el("th", {}, "Mortandad"),
    el("th", {}, "Ventas"), el("th", {}, "Compras"),
  ])));
  const tbody = el("tbody");
  let totStock = 0, totMort = 0, totVentas = 0, totCompras = 0;
  CATEGORIAS_HACIENDA.forEach((cat) => {
    const deCat = items.filter((i) => i.categoria === cat);
    const entradas = deCat.filter((i) => i.movimiento === "Entrada").reduce((s, i) => s + (i.cantidad || 0), 0);
    const salidas = deCat.filter((i) => i.movimiento === "Salida").reduce((s, i) => s + (i.cantidad || 0), 0);
    const stock = entradas - salidas;
    const mortandad = deCat.filter((i) => i.movimiento === "Salida" && i.motivo === "Muerte").reduce((s, i) => s + (i.cantidad || 0), 0);
    const ventas = deCat.filter((i) => i.movimiento === "Salida" && i.motivo === "Venta").reduce((s, i) => s + (i.cantidad || 0), 0);
    const compras = deCat.filter((i) => i.movimiento === "Entrada" && i.motivo === "Compra").reduce((s, i) => s + (i.cantidad || 0), 0);
    totStock += stock; totMort += mortandad; totVentas += ventas; totCompras += compras;
    tbody.appendChild(el("tr", {}, [
      el("td", {}, cat),
      el("td", { class: "num" }, String(stock)),
      el("td", { class: "num" }, String(mortandad)),
      el("td", { class: "num" }, String(ventas)),
      el("td", { class: "num" }, String(compras)),
    ]));
  });
  tbody.appendChild(el("tr", { style: "font-weight:700;background:#F2F0E7" }, [
    el("td", {}, "TOTAL"),
    el("td", { class: "num" }, String(totStock)),
    el("td", { class: "num" }, String(totMort)),
    el("td", { class: "num" }, String(totVentas)),
    el("td", { class: "num" }, String(totCompras)),
  ]));
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function renderTable() {
  const wrap = document.getElementById("existencias-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "tag-mark" }, el("span", {}, "GD")),
      el("p", {}, "Todavía no cargaste ningún movimiento."),
    ]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Categoría"), el("th", {}, "Mov."), el("th", {}, "Motivo"),
    el("th", {}, "Cant."), el("th", {}, "Obs."), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.categoria || ""),
      el("td", {}, el("span", { class: "badge " + (it.movimiento === "Entrada" ? "ars" : "usd") }, it.movimiento || "")),
      el("td", {}, it.motivo || ""),
      el("td", { class: "num" }, String(it.cantidad ?? "")),
      el("td", {}, it.observaciones || ""),
      el("td", {}, rowActions(it)),
    ]));
  });
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function rowActions(it) {
  const wrap = el("div", { class: "row-actions" });
  const editBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Editar");
  editBtn.addEventListener("click", () => startEdit(it));
  const delBtn = el("button", { class: "btn btn-danger-ghost btn-sm" }, "Borrar");
  delBtn.addEventListener("click", async () => {
    if (!confirmar("¿Borrar este movimiento?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Movimiento borrado");
    } catch (err) {
      toast("No se pudo borrar: " + err.message, true);
    }
  });
  wrap.appendChild(editBtn);
  wrap.appendChild(delBtn);
  return wrap;
}

function startEdit(it) {
  editingId = it.id;
  document.getElementById("ex-fecha").value = it.fecha || "";
  document.getElementById("ex-categoria").value = it.categoria || CATEGORIAS_HACIENDA[0];
  document.getElementById("ex-movimiento").value = it.movimiento || "Entrada";
  document.getElementById("ex-motivo").value = it.motivo || MOTIVOS_EXISTENCIAS[0];
  document.getElementById("ex-cantidad").value = it.cantidad || "";
  document.getElementById("ex-obs").value = it.observaciones || "";
  document.getElementById("ex-submit-btn").textContent = "Guardar cambios";
  document.getElementById("ex-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

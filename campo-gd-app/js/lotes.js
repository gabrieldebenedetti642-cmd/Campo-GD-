import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, CATEGORIAS_HACIENDA, daysBetween } from "./utils.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "lotes";
let items = [];
let editingId = null;
let unsub = null;

export function renderLotes(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Lotes de Ganado")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar lote"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Totales"),
      el("div", { class: "stat-grid", id: "lotes-stats" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Lotes cargados"),
      el("div", { class: "table-wrap", id: "lotes-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fechaCompra || "").localeCompare(a.fechaCompra || ""));
    renderAll();
  });
}

export function unmountLotes() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "lote-form" });
  const fId = fieldInput("ID Lote", "text", "lote-id", "");
  const fCategoria = fieldSelect("Categoría", "lote-categoria", CATEGORIAS_HACIENDA);
  const fCantidad = fieldInput("Cantidad (cab.)", "number", "lote-cantidad", "");
  const fMoneda = fieldSelect("Moneda", "lote-moneda", ["$", "USD"]);
  const fFechaCompra = fieldInput("Fecha compra", "date", "lote-fecha-compra", todayISO());
  const fKgCompra = fieldInput("Kg totales compra", "number", "lote-kg-compra", "");
  const fPrecioCompra = fieldInput("Precio compra (x kg)", "number", "lote-precio-compra", "");
  fPrecioCompra.querySelector("input").step = "0.01";
  const fFechaVenta = fieldInput("Fecha venta", "date", "lote-fecha-venta", "");
  const fKgVenta = fieldInput("Kg totales venta", "number", "lote-kg-venta", "");
  const fPrecioVenta = fieldInput("Precio venta (x kg)", "number", "lote-precio-venta", "");
  fPrecioVenta.querySelector("input").step = "0.01";
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "lote-submit-btn" }, "Guardar"),
  ]);
  [fId, fCategoria, fCantidad, fMoneda, fFechaCompra, fKgCompra, fPrecioCompra,
   fFechaVenta, fKgVenta, fPrecioVenta, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      idLote: document.getElementById("lote-id").value.trim(),
      categoria: document.getElementById("lote-categoria").value,
      cantidad: parseInt(document.getElementById("lote-cantidad").value, 10) || 0,
      moneda: document.getElementById("lote-moneda").value,
      fechaCompra: document.getElementById("lote-fecha-compra").value,
      kgCompra: parseFloat(document.getElementById("lote-kg-compra").value) || 0,
      precioCompra: parseFloat(document.getElementById("lote-precio-compra").value) || 0,
      fechaVenta: document.getElementById("lote-fecha-venta").value,
      kgVenta: parseFloat(document.getElementById("lote-kg-venta").value) || 0,
      precioVenta: parseFloat(document.getElementById("lote-precio-venta").value) || 0,
      usuario: getUsuarioActual(),
    };
    if (!data.idLote || !data.fechaCompra) {
      toast("Completá al menos ID de lote y fecha de compra", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Lote actualizado");
        editingId = null;
        document.getElementById("lote-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Lote guardado");
      }
      form.reset();
      document.getElementById("lote-fecha-compra").value = todayISO();
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

function calc(it) {
  const costoTotal = it.kgCompra * it.precioCompra;
  const vendido = !!it.fechaVenta && it.kgVenta > 0;
  const ingresoTotal = vendido ? it.kgVenta * it.precioVenta : null;
  const margen = vendido ? ingresoTotal - costoTotal : null;
  const margenKg = vendido ? it.kgVenta - it.kgCompra : null;
  const dias = it.fechaCompra ? daysBetween(it.fechaCompra, it.fechaVenta || todayISO()) : null;
  const gdp = vendido && dias > 0 && it.cantidad > 0 ? margenKg / it.cantidad / dias : null;
  const margenCabeza = vendido && it.cantidad > 0 ? margen / it.cantidad : null;
  const estado = vendido ? "Vendido" : "En campo";
  return { costoTotal, ingresoTotal, margen, margenKg, dias, gdp, margenCabeza, estado, vendido };
}

function renderAll() {
  renderStats();
  renderTable();
}

function renderStats() {
  const wrap = document.getElementById("lotes-stats");
  if (!wrap) return;
  const vendidos = items.filter((it) => calc(it).vendido);
  const margenArs = vendidos.filter((it) => it.moneda !== "USD").reduce((s, it) => s + calc(it).margen, 0);
  const margenUsd = vendidos.filter((it) => it.moneda === "USD").reduce((s, it) => s + calc(it).margen, 0);
  const gdps = vendidos.map((it) => calc(it).gdp).filter((g) => g !== null && !isNaN(g));
  const gdpProm = gdps.length ? gdps.reduce((s, g) => s + g, 0) / gdps.length : 0;

  const stat = (label, value, neg = false) => el("div", { class: "stat-card" }, [
    el("span", { class: "eyebrow" }, label),
    el("div", { class: "value" + (neg ? " neg" : "") }, value),
  ]);
  wrap.innerHTML = "";
  wrap.appendChild(stat("Lotes vendidos", String(vendidos.length)));
  wrap.appendChild(stat("Margen total $", "$ " + margenArs.toLocaleString("es-AR", { maximumFractionDigits: 0 }), margenArs < 0));
  wrap.appendChild(stat("Margen total USD", "USD " + margenUsd.toLocaleString("es-AR", { maximumFractionDigits: 0 }), margenUsd < 0));
  wrap.appendChild(stat("GDP promedio (kg/cab/día)", gdpProm.toFixed(3)));
}

function renderTable() {
  const wrap = document.getElementById("lotes-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "tag-mark" }, el("span", {}, "GD")),
      el("p", {}, "Todavía no cargaste ningún lote."),
    ]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "ID"), el("th", {}, "Categoría"), el("th", {}, "Cant."), el("th", {}, "Moneda"),
    el("th", {}, "F. compra"), el("th", {}, "Costo"), el("th", {}, "F. venta"), el("th", {}, "Ingreso"),
    el("th", {}, "Margen"), el("th", {}, "Días"), el("th", {}, "GDP"), el("th", {}, "$/cab"),
    el("th", {}, "Estado"), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    const c = calc(it);
    const margenClass = c.margen === null ? "" : c.margen >= 0 ? "gdp-pos" : "gdp-neg";
    tbody.appendChild(el("tr", {}, [
      el("td", {}, it.idLote || ""),
      el("td", {}, it.categoria || ""),
      el("td", { class: "num" }, String(it.cantidad ?? "")),
      el("td", {}, el("span", { class: "badge " + (it.moneda === "USD" ? "usd" : "ars") }, it.moneda || "$")),
      el("td", {}, fmtDate(it.fechaCompra)),
      el("td", { class: "num" }, c.costoTotal.toLocaleString("es-AR", { maximumFractionDigits: 0 })),
      el("td", {}, it.fechaVenta ? fmtDate(it.fechaVenta) : "-"),
      el("td", { class: "num" }, c.ingresoTotal === null ? "-" : c.ingresoTotal.toLocaleString("es-AR", { maximumFractionDigits: 0 })),
      el("td", { class: "num " + margenClass }, c.margen === null ? "-" : c.margen.toLocaleString("es-AR", { maximumFractionDigits: 0 })),
      el("td", { class: "num" }, c.dias === null ? "-" : String(c.dias)),
      el("td", { class: "num" }, c.gdp === null ? "-" : c.gdp.toFixed(3)),
      el("td", { class: "num" }, c.margenCabeza === null ? "-" : c.margenCabeza.toFixed(1)),
      el("td", {}, el("span", { class: "badge " + (c.vendido ? "ars" : "usd") }, c.estado)),
      el("td", {}, usuarioBadge(it.usuario)),
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
    if (!confirmar("¿Borrar este lote?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Lote borrado");
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
  document.getElementById("lote-id").value = it.idLote || "";
  document.getElementById("lote-categoria").value = it.categoria || CATEGORIAS_HACIENDA[0];
  document.getElementById("lote-cantidad").value = it.cantidad || "";
  document.getElementById("lote-moneda").value = it.moneda || "$";
  document.getElementById("lote-fecha-compra").value = it.fechaCompra || "";
  document.getElementById("lote-kg-compra").value = it.kgCompra || "";
  document.getElementById("lote-precio-compra").value = it.precioCompra || "";
  document.getElementById("lote-fecha-venta").value = it.fechaVenta || "";
  document.getElementById("lote-kg-venta").value = it.kgVenta || "";
  document.getElementById("lote-precio-venta").value = it.precioVenta || "";
  document.getElementById("lote-submit-btn").textContent = "Guardar cambios";
  document.getElementById("lote-id").scrollIntoView({ behavior: "smooth", block: "center" });
}

import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, CATEGORIAS_HACIENDA, daysBetween } from "./utils.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

// Un lote se carga en DOS pasos sobre el mismo registro:
//   1) El día que se compra: ID, categoría, cantidad, moneda, fecha, kg y precio de compra.
//   2) Cuando se vende (meses después): fecha, kg totales y precio de venta, desde el
//      botón "Registrar venta" del propio lote. La compra no se vuelve a escribir.
// Los nombres de campo (fechaVenta, kgVenta, precioVenta, ...) no cambian, porque el
// panel Comercialización del Dashboard y los totales de acá dependen de ellos.

const COL = "lotes";
let items = [];
let editingId = null; // lote cuya COMPRA se está corrigiendo
let ventaId = null;   // lote al que se le está cargando o corrigiendo la VENTA
let unsub = null;

const num = (n, dec = 0) => n.toLocaleString("es-AR", { maximumFractionDigits: dec });

// Comisión de intermediario (en %). En la compra se SUMA al costo; en la venta se RESTA al ingreso.
const pct = (v) => Math.min(100, Math.max(0, parseFloat(v) || 0));
const costoDe = (it) => (it.kgCompra || 0) * (it.precioCompra || 0) * (1 + pct(it.comisionCompra) / 100);
const ingresoDe = (it) => (it.kgVenta || 0) * (it.precioVenta || 0) * (1 - pct(it.comisionVenta) / 100);

export function renderLotes(container) {
  editingId = null;
  ventaId = null;
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Lotes de Ganado")]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Registrar compra"),
      el("p", { style: "margin:0 0 14px; font-size:13px; color:var(--ink-muted)" },
        "Cargá el lote el día que lo comprás. Cuando lo vendas, buscalo en la lista de abajo y tocá \"Registrar venta\": la compra queda guardada y solo completás la venta."),
      buildForm(),
    ])
  );

  container.appendChild(buildVentaPanel());

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
    // si el lote que se estaba editando ya no existe (lo borró otra persona), cerrar los paneles
    if (ventaId && !items.some((i) => i.id === ventaId)) closeVenta();
    if (editingId && !items.some((i) => i.id === editingId)) cancelEditCompra();
    renderAll();
  });
}

export function unmountLotes() {
  if (unsub) unsub();
}

/* ---------------------------- PASO 1: COMPRA ---------------------------- */

function buildForm() {
  const form = el("form", { class: "entry-form", id: "lote-form" });
  const fId = fieldInput("ID Lote", "text", "lote-id", "");
  const fCategoria = fieldSelect("Categoría", "lote-categoria", CATEGORIAS_HACIENDA);
  const fCantidad = fieldInput("Cantidad (cab.)", "number", "lote-cantidad", "");
  const fMoneda = fieldSelect("Moneda", "lote-moneda", ["$", "USD"]);
  const fFechaCompra = fieldInput("Fecha compra", "date", "lote-fecha-compra", todayISO());
  const fKgCompra = fieldInput("Kg totales compra", "number", "lote-kg-compra", "");
  fKgCompra.querySelector("input").step = "0.01";
  const fPrecioCompra = fieldInput("Precio compra (x kg)", "number", "lote-precio-compra", "");
  fPrecioCompra.querySelector("input").step = "0.01";
  const fComCompra = fieldInput("Comisión compra (%)", "number", "lote-com-compra", "");
  Object.assign(fComCompra.querySelector("input"), { step: "0.01", min: "0", max: "100", placeholder: "0" });
  const cancelBtn = el("button", { class: "btn btn-ghost", type: "button", id: "lote-cancel-btn", style: "display:none" }, "Cancelar");
  cancelBtn.addEventListener("click", cancelEditCompra);
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, " "),
    el("div", { style: "display:flex; gap:8px" }, [
      el("button", { class: "btn btn-primary", type: "submit", id: "lote-submit-btn" }, "Guardar compra"),
      cancelBtn,
    ]),
  ]);
  [fId, fCategoria, fCantidad, fMoneda, fFechaCompra, fKgCompra, fPrecioCompra, fComCompra, btnRow]
    .forEach((f) => form.appendChild(f));

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
      comisionCompra: pct(document.getElementById("lote-com-compra").value),
    };
    if (!data.idLote || !data.fechaCompra || data.cantidad <= 0 || data.kgCompra <= 0 || data.precioCompra <= 0) {
      toast("Completá ID, fecha, cantidad, kg y precio de la compra", true);
      return;
    }
    try {
      if (editingId) {
        // solo se tocan los datos de compra: la venta (si ya existe) queda como está
        await updateDocIn(COL, editingId, data);
        toast("Compra actualizada");
        cancelEditCompra();
      } else {
        await addDocTo(COL, {
          ...data,
          fechaVenta: "",
          kgVenta: 0,
          precioVenta: 0,
          comisionVenta: 0,
          usuario: getUsuarioActual(),
        });
        toast("Compra guardada. Cuando vendas el lote, registrá la venta desde la lista.");
        form.reset();
        document.getElementById("lote-fecha-compra").value = todayISO();
      }
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });
  return form;
}

function cancelEditCompra() {
  editingId = null;
  const form = document.getElementById("lote-form");
  if (form) {
    form.reset();
    document.getElementById("lote-fecha-compra").value = todayISO();
    document.getElementById("lote-submit-btn").textContent = "Guardar compra";
    document.getElementById("lote-cancel-btn").style.display = "none";
  }
}

function startEditCompra(it) {
  editingId = it.id;
  document.getElementById("lote-id").value = it.idLote || "";
  document.getElementById("lote-categoria").value = it.categoria || CATEGORIAS_HACIENDA[0];
  document.getElementById("lote-cantidad").value = it.cantidad || "";
  document.getElementById("lote-moneda").value = it.moneda || "$";
  document.getElementById("lote-fecha-compra").value = it.fechaCompra || "";
  document.getElementById("lote-kg-compra").value = it.kgCompra || "";
  document.getElementById("lote-precio-compra").value = it.precioCompra || "";
  document.getElementById("lote-com-compra").value = it.comisionCompra || "";
  document.getElementById("lote-submit-btn").textContent = "Guardar cambios";
  document.getElementById("lote-cancel-btn").style.display = "";
  document.getElementById("lote-id").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ----------------------------- PASO 2: VENTA ----------------------------- */

function buildVentaPanel() {
  const panel = el("div", { class: "panel", id: "lote-venta-panel", style: "display:none" });
  panel.appendChild(el("h2", { id: "lote-venta-title" }, "Registrar venta"));
  panel.appendChild(el("p", { id: "lote-venta-resumen", style: "margin:0 0 14px; font-size:13px; color:var(--ink-muted)" }));

  const form = el("form", { class: "entry-form", id: "lote-venta-form" });
  const fFecha = fieldInput("Fecha venta", "date", "lote-v-fecha", todayISO());
  const fKg = fieldInput("Kg totales venta", "number", "lote-v-kg", "");
  fKg.querySelector("input").step = "0.01";
  const fPrecio = fieldInput("Precio venta (x kg)", "number", "lote-v-precio", "");
  fPrecio.querySelector("input").step = "0.01";
  const fComVenta = fieldInput("Comisión venta (%)", "number", "lote-v-com", "");
  Object.assign(fComVenta.querySelector("input"), { step: "0.01", min: "0", max: "100", placeholder: "0" });

  const quitarBtn = el("button", { class: "btn btn-danger-ghost", type: "button", id: "lote-v-quitar", style: "display:none" }, "Quitar venta");
  quitarBtn.addEventListener("click", quitarVenta);
  const cancelBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Cancelar");
  cancelBtn.addEventListener("click", closeVenta);
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, " "),
    el("div", { style: "display:flex; gap:8px; flex-wrap:wrap" }, [
      el("button", { class: "btn btn-primary", type: "submit", id: "lote-v-submit" }, "Guardar venta"),
      cancelBtn,
      quitarBtn,
    ]),
  ]);
  [fFecha, fKg, fPrecio, fComVenta, btnRow].forEach((f) => form.appendChild(f));
  ["lote-v-fecha", "lote-v-kg", "lote-v-precio", "lote-v-com"].forEach((id) => {
    form.querySelector("#" + id).addEventListener("input", updateVentaPreview);
  });
  panel.appendChild(form);
  panel.appendChild(el("div", { id: "lote-v-preview", style: "margin-top:14px; font-size:13.5px" }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const it = items.find((i) => i.id === ventaId);
    if (!it) {
      closeVenta();
      toast("Ese lote ya no existe", true);
      return;
    }
    const fechaVenta = document.getElementById("lote-v-fecha").value;
    const kgVenta = parseFloat(document.getElementById("lote-v-kg").value) || 0;
    const precioVenta = parseFloat(document.getElementById("lote-v-precio").value) || 0;
    const comisionVenta = pct(document.getElementById("lote-v-com").value);
    if (!fechaVenta || kgVenta <= 0 || precioVenta <= 0) {
      toast("Completá fecha, kg totales y precio de la venta", true);
      return;
    }
    if (it.fechaCompra && fechaVenta < it.fechaCompra) {
      toast("La fecha de venta no puede ser anterior a la de compra (" + fmtDate(it.fechaCompra) + ")", true);
      return;
    }
    try {
      await updateDocIn(COL, it.id, { fechaVenta, kgVenta, precioVenta, comisionVenta, usuarioVenta: getUsuarioActual() });
      toast("Venta registrada en el lote " + (it.idLote || ""));
      closeVenta();
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });
  return panel;
}

function openVenta(it) {
  ventaId = it.id;
  const yaVendido = !!it.fechaVenta && it.kgVenta > 0;
  const mon = it.moneda || "$";
  document.getElementById("lote-venta-panel").style.display = "";
  document.getElementById("lote-venta-title").textContent =
    (yaVendido ? "Editar venta" : "Registrar venta") + " — lote " + (it.idLote || "");
  document.getElementById("lote-venta-resumen").textContent =
    `Compra: ${it.cantidad || 0} cab. ${it.categoria || ""} el ${fmtDate(it.fechaCompra)} · ` +
    `${num(it.kgCompra || 0, 1)} kg a ${mon} ${num(it.precioCompra || 0, 2)}/kg` +
    (pct(it.comisionCompra) > 0 ? ` + ${num(pct(it.comisionCompra), 2)}% de comisión` : "") +
    ` (costo ${mon} ${num(costoDe(it))}). La venta se carga en ${mon}, la moneda del lote.`;
  document.getElementById("lote-v-fecha").value = it.fechaVenta || todayISO();
  document.getElementById("lote-v-kg").value = yaVendido ? it.kgVenta : "";
  document.getElementById("lote-v-precio").value = yaVendido ? it.precioVenta : "";
  document.getElementById("lote-v-com").value = yaVendido && it.comisionVenta ? it.comisionVenta : "";
  document.getElementById("lote-v-submit").textContent = yaVendido ? "Guardar cambios" : "Guardar venta";
  document.getElementById("lote-v-quitar").style.display = yaVendido ? "" : "none";
  updateVentaPreview();
  document.getElementById("lote-venta-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("lote-v-kg").focus({ preventScroll: true });
}

function closeVenta() {
  ventaId = null;
  const panel = document.getElementById("lote-venta-panel");
  if (panel) panel.style.display = "none";
}

async function quitarVenta() {
  const it = items.find((i) => i.id === ventaId);
  if (!it) return;
  if (!confirmar("¿Quitar la venta de este lote? Vuelve a quedar \"En campo\" y la compra no se toca.")) return;
  try {
    await updateDocIn(COL, it.id, { fechaVenta: "", kgVenta: 0, precioVenta: 0, comisionVenta: 0, usuarioVenta: "" });
    toast("Venta quitada: el lote vuelve a estar en campo");
    closeVenta();
  } catch (err) {
    toast("No se pudo quitar: " + err.message, true);
  }
}

// Muestra en vivo cuánto da la venta mientras se escribe
function updateVentaPreview() {
  const box = document.getElementById("lote-v-preview");
  if (!box) return;
  const it = items.find((i) => i.id === ventaId);
  if (!it) { box.textContent = ""; return; }
  const fecha = document.getElementById("lote-v-fecha").value;
  const kg = parseFloat(document.getElementById("lote-v-kg").value) || 0;
  const precio = parseFloat(document.getElementById("lote-v-precio").value) || 0;
  if (!fecha || kg <= 0 || precio <= 0) {
    box.textContent = "Escribí los kg y el precio para ver el resultado.";
    box.style.color = "var(--ink-muted)";
    return;
  }
  const mon = it.moneda || "$";
  const costo = costoDe(it);
  const com = pct(document.getElementById("lote-v-com").value);
  const bruto = kg * precio;
  const ingreso = bruto * (1 - com / 100);
  const margen = ingreso - costo;
  const dias = it.fechaCompra ? daysBetween(it.fechaCompra, fecha) : 0;
  const gdp = dias > 0 && it.cantidad > 0 ? (kg - (it.kgCompra || 0)) / it.cantidad / dias : null;
  box.style.color = "";
  box.textContent =
    `Ingreso ${mon} ${num(ingreso)}` +
    (com > 0 ? ` (${mon} ${num(bruto)} menos ${num(com, 2)}% de comisión = ${mon} ${num(bruto - ingreso)})` : "") +
    ` · Margen ${mon} ${num(margen)}` +
    (it.cantidad > 0 ? ` (${mon} ${num(margen / it.cantidad)} por cabeza)` : "") +
    ` · ${dias} días en el campo` +
    (gdp !== null ? ` · GDP ${gdp.toFixed(3)} kg/cab/día` : "");
}

/* --------------------------- CAMPOS AUXILIARES --------------------------- */

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

/* ------------------------------- CÁLCULOS ------------------------------- */

function calc(it) {
  const costoTotal = costoDe(it);
  const vendido = !!it.fechaVenta && it.kgVenta > 0;
  const ingresoTotal = vendido ? ingresoDe(it) : null;
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
  const enCampo = items.filter((it) => !calc(it).vendido);
  const cabezasEnCampo = enCampo.reduce((s, it) => s + (it.cantidad || 0), 0);
  const margenArs = vendidos.filter((it) => it.moneda !== "USD").reduce((s, it) => s + calc(it).margen, 0);
  const margenUsd = vendidos.filter((it) => it.moneda === "USD").reduce((s, it) => s + calc(it).margen, 0);
  const gdps = vendidos.map((it) => calc(it).gdp).filter((g) => g !== null && !isNaN(g));
  const gdpProm = gdps.length ? gdps.reduce((s, g) => s + g, 0) / gdps.length : 0;

  const stat = (label, value, neg = false) => el("div", { class: "stat-card" }, [
    el("span", { class: "eyebrow" }, label),
    el("div", { class: "value" + (neg ? " neg" : "") }, value),
  ]);
  wrap.innerHTML = "";
  wrap.appendChild(stat("Lotes en campo", String(enCampo.length)));
  wrap.appendChild(stat("Cabezas en campo", String(cabezasEnCampo)));
  wrap.appendChild(stat("Lotes vendidos", String(vendidos.length)));
  wrap.appendChild(stat("Margen total $", "$ " + num(margenArs), margenArs < 0));
  wrap.appendChild(stat("Margen total USD", "USD " + num(margenUsd), margenUsd < 0));
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
    el("th", {}, "F. compra"), el("th", {}, "Kg compra"), el("th", {}, "Comisión"), el("th", {}, "Costo"),
    el("th", {}, "F. venta"), el("th", {}, "Kg venta"), el("th", {}, "Ingreso"),
    el("th", {}, "Margen"), el("th", {}, "Días"), el("th", {}, "GDP"), el("th", {}, "$/cab"),
    el("th", {}, "Estado"), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    const c = calc(it);
    const margenClass = c.margen === null ? "" : c.margen >= 0 ? "gdp-pos" : "gdp-neg";
    const mostrarUsuarioVenta = c.vendido && it.usuarioVenta && it.usuarioVenta !== it.usuario;
    tbody.appendChild(el("tr", {}, [
      el("td", {}, it.idLote || ""),
      el("td", {}, it.categoria || ""),
      el("td", { class: "num" }, String(it.cantidad ?? "")),
      el("td", {}, el("span", { class: "badge " + (it.moneda === "USD" ? "usd" : "ars") }, it.moneda || "$")),
      el("td", {}, fmtDate(it.fechaCompra)),
      el("td", { class: "num" }, num(it.kgCompra || 0, 1)),
      el("td", { class: "num" }, comisionTxt(it, c.vendido)),
      el("td", { class: "num" }, num(c.costoTotal || 0)),
      el("td", {}, it.fechaVenta ? fmtDate(it.fechaVenta) : "-"),
      el("td", { class: "num" }, c.vendido ? num(it.kgVenta, 1) : "-"),
      el("td", { class: "num" }, c.ingresoTotal === null ? "-" : num(c.ingresoTotal)),
      el("td", { class: "num " + margenClass }, c.margen === null ? "-" : num(c.margen)),
      el("td", { class: "num" }, c.dias === null ? "-" : String(c.dias)),
      el("td", { class: "num" }, c.gdp === null ? "-" : c.gdp.toFixed(3)),
      el("td", { class: "num" }, c.margenCabeza === null ? "-" : c.margenCabeza.toFixed(1)),
      el("td", {}, el("span", { class: "badge " + (c.vendido ? "ars" : "usd") }, c.estado)),
      el("td", {}, [
        el("span", { title: "Cargó la compra" }, usuarioBadge(it.usuario)),
        mostrarUsuarioVenta ? " " : null,
        mostrarUsuarioVenta ? el("span", { title: "Cargó la venta" }, usuarioBadge(it.usuarioVenta)) : null,
      ]),
      el("td", {}, rowActions(it, c.vendido)),
    ]));
  });
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

// "2% / 3%" = comisión de compra / de venta (con guion si no hubo)
function comisionTxt(it, vendido) {
  const cc = pct(it.comisionCompra), cv = pct(it.comisionVenta);
  if (!cc && !cv) return "-";
  return `${cc ? num(cc, 2) + "%" : "-"} / ${vendido && cv ? num(cv, 2) + "%" : "-"}`;
}

function rowActions(it, vendido) {
  const wrap = el("div", { class: "row-actions" });
  const ventaBtn = el(
    "button",
    { class: "btn btn-sm " + (vendido ? "btn-ghost" : "btn-primary"), type: "button", "data-accion": "venta" },
    vendido ? "Editar venta" : "Registrar venta"
  );
  ventaBtn.addEventListener("click", () => openVenta(it));
  const editBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button", "data-accion": "compra" }, "Editar compra");
  editBtn.addEventListener("click", () => startEditCompra(it));
  const delBtn = el("button", { class: "btn btn-danger-ghost btn-sm", type: "button", "data-accion": "borrar" }, "Borrar");
  delBtn.addEventListener("click", async () => {
    if (!confirmar("¿Borrar este lote completo (compra y venta)?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Lote borrado");
    } catch (err) {
      toast("No se pudo borrar: " + err.message, true);
    }
  });
  wrap.appendChild(ventaBtn);
  wrap.appendChild(editBtn);
  wrap.appendChild(delBtn);
  return wrap;
}

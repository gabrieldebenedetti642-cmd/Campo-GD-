import { listenTo, listenSetting, setSetting } from "./db.js";
import { el, years, toast, confirmar, fmtMoney, fmtDate, MESES_CORTOS, planDe, codigoConcepto, ubicarEnPlan } from "./utils.js";

// Flujo de caja mensual del año, ordenado por el plan de cuentas (rubro → concepto → factura)
// con sus códigos: 1 Ingresos (1.1, 1.1.01…) y 2 Egresos (2.1, 2.1.01…). Cada celda suma lo ya
// cargado en Ingresos/Egresos (real) más los "supuestos" que se agregan abajo (lo que todavía
// no pasó). Los egresos cuentan en el mes de VENCIMIENTO de la factura (si no tiene, en su fecha).
// Se puede ver en pesos, en dólares, o con todo pasado a dólares a la cotización del Dashboard.

const YEAR_MIN = 2026, YEAR_MAX = 2040;
const COTIZACION_DEFECTO = 1000; // la misma que usa el Dashboard hasta que se cargue otra

const TIPOS = [
  { t: "I", cod: "1", nombre: "INGRESOS" },
  { t: "E", cod: "2", nombre: "EGRESOS" },
];

// ---- Estado ----------------------------------------------------------------
let selectedYear = new Date().getFullYear();
let modo = "TOTAL"; // "ARS" | "USD" | "TOTAL"
// Códigos abiertos: "1"/"2" muestran los rubros, "1.1" sus conceptos, "1.1.01" sus facturas.
let abiertos = new Set(["1", "2"]);
let nivel = 2; // 1 totales · 2 rubros · 3 conceptos · 4 facturas (null si se abrió algo a mano)
let ingresos = [], egresos = [];
let cotizacion = COTIZACION_DEFECTO;
let datosAnio = { saldoArs: 0, saldoUsd: 0, supuestos: [] };
let unsubIng = null, unsubEg = null, unsubCot = null, unsubAnio = null;
let charts = {};

const settingKey = () => "flujoCaja_" + selectedYear;

export function renderFlujoCaja(container) {
  container.innerHTML = "";

  const yearOptions = years(YEAR_MIN, YEAR_MAX)
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");

  container.appendChild(
    el("div", { class: "page-head" }, [
      el("h1", {}, "Flujo de Caja"),
      el("div", { class: "year-filter" }, [
        el("label", {}, "Año"),
        el("select", {
          id: "fc-year",
          onchange: (e) => { selectedYear = parseInt(e.target.value, 10); cargarAnio(); },
          html: yearOptions,
        }),
      ]),
    ])
  );

  // Moneda + saldo inicial
  const segs = [["ARS", "Pesos"], ["USD", "Dólares"], ["TOTAL", "Total en dólares"]].map(([v, label]) => {
    const b = el("button", { class: "seg-btn" + (modo === v ? " active" : ""), type: "button", "data-modo": v }, label);
    b.addEventListener("click", () => {
      modo = v;
      document.querySelectorAll("#fc-seg .seg-btn").forEach((x) => x.classList.toggle("active", x.dataset.modo === modo));
      compute();
    });
    return b;
  });
  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "fc-toolbar" }, [
        el("div", { class: "fc-bloque" }, [
          el("span", { class: "eyebrow" }, "Moneda"),
          el("div", { class: "seg-toggle", id: "fc-seg" }, segs),
          el("p", { class: "sub", id: "fc-cot-nota", style: "margin:6px 0 0; font-size:12.5px; color:var(--ink-muted)" }),
        ]),
        el("div", { class: "fc-bloque" }, [
          el("span", { class: "eyebrow" }, "Saldo inicial de caja (1 de enero)"),
          el("div", { class: "fc-saldo-inputs" }, [
            saldoField("fc-saldo-ars", "$"),
            saldoField("fc-saldo-usd", "USD"),
          ]),
        ]),
      ]),
    ])
  );

  const nivBtns = [[1, "1", "Totales"], [2, "2", "Categorías"], [3, "3", "Conceptos"], [4, "4", "Facturas"]].map(([n, num, txt]) => {
    const b = el("button", { class: "seg-btn" + (nivel === n ? " active" : ""), type: "button", "data-nivel": String(n), title: "Ver hasta: " + txt }, [num, el("span", { class: "fc-niv-txt" }, " " + txt)]);
    b.addEventListener("click", () => abrirNivel(n));
    return b;
  });
  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "fc-barra" }, [
        el("div", { class: "fc-unidad", id: "fc-unidad" }),
        el("div", { class: "fc-niveles" }, [el("span", { class: "eyebrow" }, "Ver hasta"), el("div", { class: "seg-toggle", id: "fc-niveles" }, nivBtns)]),
      ]),
      el("div", { class: "table-wrap", id: "fc-table-wrap" }),
      el("p", { class: "sub", style: "margin-top:10px; font-size:12.5px; color:var(--ink-muted)" },
        "Tocá una categoría para ver sus conceptos, y un concepto para ver cada factura cargada. Los egresos se cuentan en el mes de vencimiento de la factura. Las celdas amarillas incluyen supuestos (lo que todavía no está cargado en Ingresos / Egresos)."),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "chart-box" }, el("canvas", { id: "chart-fc" })),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Supuestos"),
      el("p", { style: "margin:0 0 14px; font-size:13px; color:var(--ink-muted)" },
        "Cargá lo que pensás que va a pasar (una venta de hacienda, un gasto que viene). Cada supuesto va en su moneda y el sistema lo suma al flujo. Cuando ya lo cargues en Ingresos o Egresos, borrá el supuesto para no contarlo dos veces."),
      buildSupuestoForm(),
      el("div", { id: "fc-sup-lista", style: "margin-top:14px" }),
    ])
  );

  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCot) unsubCot();
  unsubIng = listenTo("ingresos", (d) => { ingresos = d; compute(); });
  unsubEg = listenTo("egresos", (d) => { egresos = d; compute(); });
  unsubCot = listenSetting("cotizacion_usd", (v) => {
    cotizacion = Number(v) > 0 ? Number(v) : COTIZACION_DEFECTO;
    compute();
  });
  cargarAnio();
}

export function unmountFlujoCaja() {
  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCot) unsubCot();
  if (unsubAnio) unsubAnio();
  Object.values(charts).forEach((c) => c && c.destroy());
  charts = {};
}

function saldoField(id, moneda) {
  const input = el("input", { type: "number", id, step: "0.01", value: 0, "aria-label": "Saldo inicial en " + moneda });
  input.addEventListener("change", guardarSaldo);
  return el("div", { class: "fc-saldo-campo" }, [el("span", { class: "fc-mon" }, moneda), input]);
}

function cargarAnio() {
  if (unsubAnio) unsubAnio();
  unsubAnio = listenSetting(settingKey(), (v) => {
    datosAnio = { saldoArs: 0, saldoUsd: 0, supuestos: [], ...(v || {}) };
    if (!Array.isArray(datosAnio.supuestos)) datosAnio.supuestos = [];
    const a = document.getElementById("fc-saldo-ars");
    const u = document.getElementById("fc-saldo-usd");
    if (a) a.value = datosAnio.saldoArs || 0;
    if (u) u.value = datosAnio.saldoUsd || 0;
    renderSupuestosLista();
    compute();
  });
}

async function guardarAnio(nuevo) {
  datosAnio = nuevo;
  await setSetting(settingKey(), datosAnio);
}

async function guardarSaldo() {
  const saldoArs = parseFloat(document.getElementById("fc-saldo-ars").value) || 0;
  const saldoUsd = parseFloat(document.getElementById("fc-saldo-usd").value) || 0;
  try {
    await guardarAnio({ ...datosAnio, saldoArs, saldoUsd });
    toast("Saldo inicial guardado");
  } catch (err) {
    toast("No se pudo guardar: " + err.message, true);
  }
  compute();
}

/* ------------------------------ SUPUESTOS ------------------------------ */

// Un supuesto guarda su "key": "I|Rubro|Concepto" o "E|Rubro|Concepto".
// Los que se cargaron con la versión anterior tienen "I|Concepto" y "E|Rubro": se siguen leyendo.
function ubicarSupuesto(key) {
  const p = String(key || "").split("|");
  const tipo = p[0] === "I" ? "I" : "E";
  let rec;
  if (p.length >= 3) rec = { categoria: p[1], concepto: p.slice(2).join("|") };
  else if (tipo === "I") rec = { concepto: p[1] };
  else rec = { categoria: p[1] };
  return { tipo, ...ubicarEnPlan(tipo, rec) };
}

function buildSupuestoForm() {
  const form = el("form", { class: "entry-form", id: "fc-sup-form" });

  const selTipo = el("select", { id: "fc-sup-tipo" }, [el("option", { value: "I" }, "Ingreso"), el("option", { value: "E" }, "Egreso")]);
  const selRubro = el("select", { id: "fc-sup-rubro" });
  const selConcepto = el("select", { id: "fc-sup-concepto" });
  const llenarRubros = () => {
    selRubro.innerHTML = "";
    planDe(selTipo.value).forEach((r) => selRubro.appendChild(el("option", { value: r.nombre }, r.codigo + " " + r.nombre)));
    llenarConceptos();
  };
  const llenarConceptos = () => {
    selConcepto.innerHTML = "";
    const r = planDe(selTipo.value).find((x) => x.nombre === selRubro.value);
    (r ? r.conceptos : []).forEach((c, i) => selConcepto.appendChild(el("option", { value: c }, codigoConcepto(r, i) + " " + c)));
  };
  selTipo.addEventListener("change", llenarRubros);
  selRubro.addEventListener("change", llenarConceptos);
  llenarRubros();

  const selMes = el("select", { id: "fc-sup-mes" }, MESES_CORTOS.map((m, i) => el("option", { value: String(i + 1) }, m)));
  selMes.value = String(Math.min(12, new Date().getMonth() + 2)); // por defecto, el mes que viene
  const monto = el("input", { type: "number", id: "fc-sup-monto", step: "0.01", min: "0" });
  const selMon = el("select", { id: "fc-sup-moneda" }, [el("option", { value: "USD" }, "USD"), el("option", { value: "$" }, "$")]);
  const repetir = el("input", { type: "checkbox", id: "fc-sup-repetir" });

  const campo = (label, id, control) => el("div", { class: "field" }, [el("label", { for: id }, label), control]);
  form.appendChild(campo("Tipo", "fc-sup-tipo", selTipo));
  form.appendChild(campo("Categoría (rubro)", "fc-sup-rubro", selRubro));
  form.appendChild(campo("Concepto (subrubro)", "fc-sup-concepto", selConcepto));
  form.appendChild(campo("Mes", "fc-sup-mes", selMes));
  form.appendChild(campo("Monto", "fc-sup-monto", monto));
  form.appendChild(campo("Moneda", "fc-sup-moneda", selMon));
  form.appendChild(el("div", { class: "field" }, [
    el("label", { for: "fc-sup-repetir" }, "Repetir"),
    el("label", { class: "fc-check", for: "fc-sup-repetir" }, [repetir, " cada mes hasta diciembre"]),
  ]));
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, " "),
    el("button", { class: "btn btn-primary", type: "submit" }, "Agregar supuesto"),
  ]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = [selTipo.value, selRubro.value, selConcepto.value].join("|");
    const mes = parseInt(selMes.value, 10);
    const m = parseFloat(monto.value) || 0;
    if (m <= 0) { toast("Escribí el monto del supuesto", true); return; }
    const hasta = repetir.checked ? 12 : mes;
    const nuevos = [];
    for (let i = mes; i <= hasta; i++) {
      nuevos.push({ id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i, key, mes: i, monto: m, moneda: selMon.value });
    }
    try {
      await guardarAnio({ ...datosAnio, supuestos: [...datosAnio.supuestos, ...nuevos] });
      toast(nuevos.length > 1 ? `${nuevos.length} supuestos agregados` : "Supuesto agregado");
      monto.value = "";
      repetir.checked = false;
      renderSupuestosLista();
      compute();
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });
  return form;
}

function renderSupuestosLista() {
  const wrap = document.getElementById("fc-sup-lista");
  if (!wrap) return;
  wrap.innerHTML = "";
  const lista = datosAnio.supuestos
    .map((s) => ({ s, u: ubicarSupuesto(s.key) }))
    .sort((a, b) => (a.u.tipo === b.u.tipo ? 0 : a.u.tipo === "I" ? -1 : 1) || a.u.codigo.localeCompare(b.u.codigo, "es", { numeric: true }) || a.s.mes - b.s.mes);
  if (lista.length === 0) {
    wrap.appendChild(el("p", { style: "font-size:13px; color:var(--ink-muted); margin:0" }, "Todavía no cargaste supuestos para " + selectedYear + "."));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, ["Tipo", "Categoría", "Concepto", "Mes", "Monto", "Moneda", ""].map((h) => el("th", {}, h)))));
  const tbody = el("tbody");
  lista.forEach(({ s, u }) => {
    const del = el("button", { class: "btn btn-danger-ghost btn-sm", type: "button" }, "Borrar");
    del.addEventListener("click", async () => {
      if (!confirmar("¿Borrar este supuesto?")) return;
      try {
        await guardarAnio({ ...datosAnio, supuestos: datosAnio.supuestos.filter((x) => x.id !== s.id) });
        renderSupuestosLista();
        compute();
      } catch (err) {
        toast("No se pudo borrar: " + err.message, true);
      }
    });
    tbody.appendChild(el("tr", {}, [
      el("td", {}, u.tipo === "I" ? "Ingreso" : "Egreso"),
      el("td", {}, u.rubro.codigo + " " + u.rubro.nombre),
      el("td", {}, u.codigo + " " + u.concepto),
      el("td", {}, MESES_CORTOS[s.mes - 1] || ""),
      el("td", { class: "num" }, (Number(s.monto) || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })),
      el("td", {}, el("span", { class: "badge " + (s.moneda === "USD" ? "usd" : "ars") }, s.moneda)),
      el("td", {}, del),
    ]));
  });
  table.appendChild(tbody);
  const det = el("details", {}, [el("summary", { style: "cursor:pointer; font-size:13px; font-weight:600; margin-bottom:8px" }, `Supuestos cargados (${lista.length})`), el("div", { class: "table-wrap" }, table)]);
  wrap.appendChild(det);
}

/* ------------------------------- CÁLCULO ------------------------------- */

const celdaVacia = () => ({ ars: 0, usd: 0, sup: 0 }); // sup = cuánto de la celda es supuesto (solo para marcarla)

// Arma el plan completo con lo real + los supuestos del año:
//   { I: [rubro…], E: [rubro…] }, rubro = { codigo, nombre, conceptos: [concepto…] }
//   concepto = { codigo, nombre, celdas: [12 × {ars, usd, sup}], items: [facturas y supuestos] }
function agregar() {
  const nuevoConcepto = (codigo, nombre) => ({ codigo, nombre, celdas: Array.from({ length: 12 }, celdaVacia), items: [] });
  const arbol = {};
  TIPOS.forEach(({ t }) => {
    arbol[t] = planDe(t).map((r) => ({
      codigo: r.codigo, nombre: r.nombre,
      conceptos: r.conceptos.map((c, i) => nuevoConcepto(codigoConcepto(r, i), c)),
    }));
  });
  // dónde cae un movimiento (si el rubro no tiene un concepto "otro", se crea "Otros conceptos" R.99)
  const buscar = (t, u) => {
    const r = arbol[t].find((x) => x.codigo === u.rubro.codigo);
    let c = r.conceptos.find((x) => x.codigo === u.codigo);
    if (!c) { c = nuevoConcepto(u.codigo, u.concepto); r.conceptos.push(c); }
    return c;
  };
  const sumar = (c, mes, moneda, monto, item) => {
    const celda = c.celdas[mes];
    if (moneda === "USD") celda.usd += monto; else celda.ars += monto;
    if (item.sup) celda.sup += 1;
    c.items.push({ mes, moneda: moneda === "USD" ? "USD" : "$", monto, ...item });
  };
  const anioMes = (iso) => ((iso || "").startsWith(String(selectedYear)) ? parseInt(iso.slice(5, 7), 10) - 1 : -1);

  ingresos.forEach((it) => {
    const mes = anioMes(it.fecha);
    if (mes < 0 || mes > 11) return;
    sumar(buscar("I", ubicarEnPlan("I", it)), mes, it.moneda, Number(it.monto) || 0, {
      fecha: it.fecha, numero: it.factura || "", parte: it.cliente || "", detalle: it.concepto || "",
    });
  });
  egresos.forEach((it) => {
    const cuando = it.vencimiento || it.fecha; // el egreso entra en el mes en que vence la factura
    const mes = anioMes(cuando);
    if (mes < 0 || mes > 11) return;
    sumar(buscar("E", ubicarEnPlan("E", it)), mes, it.moneda, Number(it.monto) || 0, {
      fecha: it.fecha, venc: it.vencimiento || "", numero: it.comprobante || "", parte: it.proveedor || "", detalle: it.concepto || "",
    });
  });
  datosAnio.supuestos.forEach((s) => {
    const mes = (s.mes || 0) - 1;
    if (mes < 0 || mes > 11) return;
    const u = ubicarSupuesto(s.key);
    sumar(buscar(u.tipo, u), mes, s.moneda, Number(s.monto) || 0, { sup: true });
  });
  return arbol;
}

// Valor de una celda en la moneda elegida. En "Total en dólares" los pesos se pasan a USD con la cotización.
const valorCelda = (c) => (modo === "ARS" ? c.ars : modo === "USD" ? c.usd : c.usd + c.ars / cotizacion);
const valorItem = (it) => (modo === "ARS" ? (it.moneda === "USD" ? 0 : it.monto) : modo === "USD" ? (it.moneda === "USD" ? it.monto : 0) : (it.moneda === "USD" ? it.monto : it.monto / cotizacion));
const sumaMeses = (arr) => arr.reduce((s, v) => s + v, 0);
const sumaCol = (arrs) => Array.from({ length: 12 }, (_, i) => arrs.reduce((s, a) => s + a[i], 0));

// Botones "Ver hasta": 1 solo totales · 2 + categorías · 3 + conceptos · 4 + facturas
function abrirNivel(n) {
  const arbol = agregar();
  abiertos = new Set();
  if (n >= 2) TIPOS.forEach(({ cod }) => abiertos.add(cod));
  if (n >= 3) TIPOS.forEach(({ t }) => arbol[t].forEach((r) => abiertos.add(r.codigo)));
  if (n >= 4) TIPOS.forEach(({ t }) => arbol[t].forEach((r) => r.conceptos.forEach((c) => { if (c.items.length) abiertos.add(c.codigo); })));
  nivel = n;
  compute();
}

function alternar(codigo) {
  if (abiertos.has(codigo)) abiertos.delete(codigo); else abiertos.add(codigo);
  nivel = null;
  compute();
}

function compute() {
  const wrap = document.getElementById("fc-table-wrap");
  if (!wrap) return;
  const arbol = agregar();

  // valores por mes (en la moneda elegida) de cada concepto, rubro y tipo
  const valores = (c) => c.celdas.map(valorCelda);
  const valoresRubro = (r) => sumaCol(r.conceptos.map(valores));
  const totTipo = {};
  TIPOS.forEach(({ t }) => { totTipo[t] = sumaCol(arbol[t].map(valoresRubro)); });
  const totIng = totTipo.I, totEg = totTipo.E;
  const neto = totIng.map((v, i) => v - totEg[i]);

  const saldoIni0 = modo === "ARS" ? datosAnio.saldoArs
    : modo === "USD" ? datosAnio.saldoUsd
    : datosAnio.saldoUsd + datosAnio.saldoArs / cotizacion;
  const saldoIni = [], saldoFin = [];
  let acum = saldoIni0 || 0;
  for (let i = 0; i < 12; i++) {
    saldoIni.push(acum);
    acum += neto[i];
    saldoFin.push(acum);
  }

  const unidad = modo === "ARS" ? "$" : "USD";
  const nota = document.getElementById("fc-cot-nota");
  if (nota) {
    nota.textContent = modo === "TOTAL"
      ? `Todo pasado a dólares a $ ${cotizacion.toLocaleString("es-AR", { maximumFractionDigits: 2 })} por USD, la cotización del Dashboard.`
      : modo === "USD" ? "Se muestran solo los movimientos en dólares." : "Se muestran solo los movimientos en pesos.";
  }
  const uni = document.getElementById("fc-unidad");
  if (uni) uni.textContent = `Valores en ${modo === "ARS" ? "pesos ($)" : modo === "USD" ? "dólares (USD)" : "dólares (USD), todo convertido"} — año ${selectedYear}`;
  document.querySelectorAll("#fc-niveles .seg-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.nivel) === nivel));

  // --- armado de la tabla ---
  const fmt = (n) => (Math.abs(n) < 0.5 ? "-" : (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 }));
  const numTd = (v, extra = "") => el("td", { class: "num " + extra }, fmt(v));
  const colorNeg = (v) => (v < -0.5 ? "neg" : "");
  const cod = (txt) => el("span", { class: "fc-cod" }, txt);

  const table = el("table", { class: "fc-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Plan de cuentas"),
    ...MESES_CORTOS.map((m) => el("th", {}, m)),
    el("th", {}, "Total anual"),
  ])));
  const tbody = el("tbody");

  // fila clickeable (sección, rubro o concepto): chevrón + código + nombre, 12 meses y total anual
  const filaDesplegable = (clase, codigo, nombre, valoresMes, supMes, tieneHijos) => {
    const abierto = abiertos.has(codigo);
    const nombreEl = tieneHijos
      ? el("button", { class: "fc-toggle", type: "button", "aria-expanded": String(abierto) }, [el("span", { class: "fc-chev" }, abierto ? "▾" : "▸"), cod(codigo), " " + nombre])
      : el("span", { class: "fc-toggle fc-sin-hijos" }, [el("span", { class: "fc-chev" }, " "), cod(codigo), " " + nombre]);
    const tr = el("tr", { class: clase + (tieneHijos ? " fc-click" : "") + (abierto ? " abierto" : ""), "data-codigo": codigo }, [
      el("td", {}, nombreEl),
      ...valoresMes.map((v, i) => {
        const td = numTd(v);
        if (supMes && supMes[i]) { td.classList.add("fc-sup"); td.title = "Incluye supuestos"; }
        return td;
      }),
      numTd(sumaMeses(valoresMes), "fc-tot"),
    ]);
    if (tieneHijos) tr.addEventListener("click", () => alternar(codigo));
    tbody.appendChild(tr);
  };

  const filaFactura = (it, nombreConcepto) => {
    const v = valorItem(it);
    if (Math.abs(v) < 0.0001) return; // en la vista en pesos no se listan las facturas en dólares y al revés
    const partes = it.sup
      ? ["Supuesto"]
      : [fmtDate(it.fecha), it.numero ? "N° " + it.numero : "", it.parte].filter(Boolean);
    if (!it.sup && it.detalle && it.detalle !== nombreConcepto) partes.push(it.detalle); // concepto escrito a mano
    if (!it.sup && it.venc && it.venc !== it.fecha) partes.push("vence " + fmtDate(it.venc));
    const celdasMes = Array.from({ length: 12 }, (_, i) => (i === it.mes ? v : 0));
    const orig = it.moneda === "USD" ? "" : (modo === "TOTAL" ? " (" + fmtMoney(it.monto, "$") + ")" : "");
    const texto = partes.join(" · ") + orig;
    const tr = el("tr", { class: "fc-factura" + (it.sup ? " fc-factura-sup" : "") }, [
      el("td", { title: texto }, [el("span", { class: "fc-fact-txt" }, texto)]),
      ...celdasMes.map((x) => numTd(x)),
      numTd(v, "fc-tot"),
    ]);
    tbody.appendChild(tr);
  };

  const filaTotal = (cls, txt, arr, tot) => tbody.appendChild(el("tr", { class: cls }, [
    el("td", {}, txt),
    ...arr.map((v) => numTd(v, colorNeg(v))),
    numTd(tot, "fc-tot " + colorNeg(tot)),
  ]));

  TIPOS.forEach(({ t, cod: codTipo, nombre }) => {
    const abiertoTipo = abiertos.has(codTipo);
    const rubros = arbol[t];
    // encabezado de sección (se toca para ver/ocultar las categorías)
    const toggle = el("button", { class: "fc-toggle", type: "button", "aria-expanded": String(abiertoTipo) },
      [el("span", { class: "fc-chev" }, abiertoTipo ? "▾" : "▸"), cod(codTipo), " " + nombre]);
    const filaSec = el("tr", { class: "fc-seccion fc-click" }, [el("td", { colspan: "14" }, toggle)]);
    filaSec.addEventListener("click", () => alternar(codTipo));
    tbody.appendChild(filaSec);

    if (abiertoTipo) {
      rubros.forEach((r) => {
        const supRubro = Array.from({ length: 12 }, (_, i) => r.conceptos.some((c) => c.celdas[i].sup));
        filaDesplegable("fc-rubro", r.codigo, r.nombre, valoresRubro(r), supRubro, true);
        if (!abiertos.has(r.codigo)) return;
        r.conceptos.forEach((c) => {
          const conItems = c.items.length > 0;
          filaDesplegable("fc-concepto", c.codigo, c.nombre, valores(c), c.celdas.map((x) => x.sup), conItems);
          if (conItems && abiertos.has(c.codigo)) {
            [...c.items]
              .sort((a, b) => a.mes - b.mes || (a.sup ? 1 : 0) - (b.sup ? 1 : 0) || (a.fecha || "").localeCompare(b.fecha || ""))
              .forEach((it) => filaFactura(it, c.nombre));
          }
        });
      });
    }
    filaTotal("fc-total", "TOTAL " + nombre, totTipo[t], sumaMeses(totTipo[t]));
  });

  tbody.appendChild(el("tr", { class: "fc-espacio" }, [el("td", { colspan: "14" })]));
  filaTotal("fc-neto", "FLUJO NETO DEL MES (Ingresos − Egresos)", neto, sumaMeses(neto));
  tbody.appendChild(el("tr", { class: "fc-saldo-ini" }, [
    el("td", {}, "Saldo inicial del mes"),
    ...saldoIni.map((v) => numTd(v, colorNeg(v))),
    numTd(saldoIni[0], "fc-tot " + colorNeg(saldoIni[0])),
  ]));
  tbody.appendChild(el("tr", { class: "fc-saldo" }, [
    el("td", {}, "SALDO ACUMULADO (fin de mes)"),
    ...saldoFin.map((v) => numTd(v, colorNeg(v))),
    numTd(saldoFin[11], "fc-tot " + colorNeg(saldoFin[11])),
  ]));
  table.appendChild(tbody);
  // con cifras de millones (típico en pesos) la tabla achica un poco la letra para que entre el año completo
  const mayor = Math.max(0, ...[totIng, totEg, neto, saldoIni, saldoFin].flat().map(Math.abs));
  if (mayor >= 1000000) table.classList.add("fc-compacta");
  wrap.innerHTML = "";
  wrap.appendChild(table);

  drawChart(neto, saldoFin, unidad);
}

function drawChart(neto, saldoFin, unidad) {
  const id = "chart-fc";
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return;
  charts[id] = new Chart(ctx, {
    data: {
      labels: MESES_CORTOS,
      datasets: [
        { type: "bar", label: `Flujo neto del mes (${unidad})`, data: neto, backgroundColor: neto.map((v) => (v >= 0 ? "#2E7D32" : "#B3261E")) },
        { type: "line", label: `Saldo acumulado (${unidad})`, data: saldoFin, borderColor: "#C9A227", backgroundColor: "transparent", tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 } } } },
      scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10.5 } } } },
    },
  });
}

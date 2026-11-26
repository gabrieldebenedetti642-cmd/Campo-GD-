import { listenTo, listenSetting, setSetting } from "./db.js";
import { el, years, toast, confirmar, MESES_CORTOS, CATEGORIAS_EGRESO, CONCEPTOS_INGRESO } from "./utils.js";

// Flujo de caja mensual del año: plan de cuentas a la izquierda, meses en las columnas.
// Cada celda suma lo ya cargado en Ingresos/Egresos (real) más los "supuestos" que se
// agregan acá abajo (lo que todavía no pasó). Se puede ver en pesos, en dólares, o con
// todo pasado a dólares a la cotización que tiene el sistema (la del Dashboard).

const YEAR_MIN = 2026, YEAR_MAX = 2040;
const COTIZACION_DEFECTO = 1000; // la misma que usa el Dashboard hasta que se cargue otra

// ---- Plan de cuentas -------------------------------------------------------
// Ingresos: las ventas de hacienda se agrupan en un solo renglón que se abre por categoría.
const ES_VENTA_HACIENDA = (c) => c.startsWith("Venta de") && c !== "Venta de granos / cosecha";
const HACIENDA_HIJOS = CONCEPTOS_INGRESO.filter(ES_VENTA_HACIENDA);
const OTROS_INGRESOS = CONCEPTOS_INGRESO.filter((c) => !ES_VENTA_HACIENDA(c));
const HOJAS_INGRESO = [...HACIENDA_HIJOS, ...OTROS_INGRESOS];

const kI = (concepto) => "I|" + concepto;
const kE = (categoria) => "E|" + categoria;
// Un concepto escrito a mano que no está en la lista cae en "Otro"; una categoría desconocida, en "Otros".
const conceptoPlan = (c) => (HOJAS_INGRESO.includes(c) ? c : "Otro");
const categoriaPlan = (c) => (CATEGORIAS_EGRESO.includes(c) ? c : "Otros");

// ---- Estado ----------------------------------------------------------------
let selectedYear = new Date().getFullYear();
let modo = "TOTAL"; // "ARS" | "USD" | "TOTAL"
let abiertos = { hacienda: false };
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

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "fc-unidad", id: "fc-unidad" }),
      el("div", { class: "table-wrap", id: "fc-table-wrap" }),
      el("p", { class: "sub", style: "margin-top:10px; font-size:12.5px; color:var(--ink-muted)" },
        "Tocá \"Ventas de hacienda\" para ver el detalle por categoría. Las celdas amarillas incluyen supuestos (lo que todavía no está cargado en Ingresos / Egresos)."),
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

function buildSupuestoForm() {
  const form = el("form", { class: "entry-form", id: "fc-sup-form" });

  const selConcepto = el("select", { id: "fc-sup-concepto" }, [
    el("optgroup", { label: "Ingresos" }, HOJAS_INGRESO.map((c) => el("option", { value: kI(c) }, c))),
    el("optgroup", { label: "Egresos" }, CATEGORIAS_EGRESO.map((c) => el("option", { value: kE(c) }, c))),
  ]);
  const selMes = el("select", { id: "fc-sup-mes" }, MESES_CORTOS.map((m, i) => el("option", { value: String(i + 1) }, m)));
  selMes.value = String(Math.min(12, new Date().getMonth() + 2)); // por defecto, el mes que viene
  const monto = el("input", { type: "number", id: "fc-sup-monto", step: "0.01", min: "0" });
  const selMon = el("select", { id: "fc-sup-moneda" }, [el("option", { value: "USD" }, "USD"), el("option", { value: "$" }, "$")]);
  const repetir = el("input", { type: "checkbox", id: "fc-sup-repetir" });

  const campo = (label, id, control) => el("div", { class: "field" }, [el("label", { for: id }, label), control]);
  form.appendChild(campo("Concepto", "fc-sup-concepto", selConcepto));
  form.appendChild(campo("Mes", "fc-sup-mes", selMes));
  form.appendChild(campo("Monto", "fc-sup-monto", monto));
  form.appendChild(campo("Moneda", "fc-sup-moneda", selMon));
  form.appendChild(el("div", { class: "field" }, [
    el("label", { for: "fc-sup-repetir" }, "Repetir"),
    el("label", { class: "fc-check", for: "fc-sup-repetir" }, [repetir, " cada mes hasta diciembre"]),
  ]));
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, " "),
    el("button", { class: "btn btn-primary", type: "submit" }, "Agregar supuesto"),
  ]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = selConcepto.value;
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

const nombreDeKey = (key) => key.slice(2);
const esIngresoKey = (key) => key.startsWith("I|");

function renderSupuestosLista() {
  const wrap = document.getElementById("fc-sup-lista");
  if (!wrap) return;
  wrap.innerHTML = "";
  const lista = [...datosAnio.supuestos].sort((a, b) =>
    (esIngresoKey(a.key) === esIngresoKey(b.key) ? 0 : esIngresoKey(a.key) ? -1 : 1) ||
    a.key.localeCompare(b.key) || a.mes - b.mes);
  if (lista.length === 0) {
    wrap.appendChild(el("p", { style: "font-size:13px; color:var(--ink-muted); margin:0" }, "Todavía no cargaste supuestos para " + selectedYear + "."));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, ["Tipo", "Concepto", "Mes", "Monto", "Moneda", ""].map((h) => el("th", {}, h)))));
  const tbody = el("tbody");
  lista.forEach((s) => {
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
      el("td", {}, esIngresoKey(s.key) ? "Ingreso" : "Egreso"),
      el("td", {}, nombreDeKey(s.key)),
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

// Devuelve { celdas: { key: [12 celdas] } } con lo real + supuestos, separado por moneda.
function agregar() {
  const celdas = {};
  const get = (key, mes) => {
    if (!celdas[key]) celdas[key] = Array.from({ length: 12 }, celdaVacia);
    return celdas[key][mes];
  };
  const enAnio = (it) => (it.fecha || "").startsWith(String(selectedYear));
  const mesDe = (it) => parseInt((it.fecha || "").slice(5, 7), 10) - 1;
  const suma = (c, moneda, monto, esSup) => {
    if (moneda === "USD") c.usd += monto; else c.ars += monto;
    if (esSup) c.sup += 1;
  };
  ingresos.filter(enAnio).forEach((it) => {
    const m = mesDe(it);
    if (m >= 0 && m < 12) suma(get(kI(conceptoPlan(it.concepto)), m), it.moneda, Number(it.monto) || 0, false);
  });
  egresos.filter(enAnio).forEach((it) => {
    const m = mesDe(it);
    if (m >= 0 && m < 12) suma(get(kE(categoriaPlan(it.categoria)), m), it.moneda, Number(it.monto) || 0, false);
  });
  datosAnio.supuestos.forEach((s) => {
    const m = (s.mes || 0) - 1;
    if (m >= 0 && m < 12) suma(get(s.key, m), s.moneda, Number(s.monto) || 0, true);
  });
  return celdas;
}

// Valor de una celda en la moneda elegida. En "Total en dólares" los pesos se pasan a USD con la cotización.
const valorCelda = (c) => (modo === "ARS" ? c.ars : modo === "USD" ? c.usd : c.usd + c.ars / cotizacion);
const sumaMeses = (arr) => arr.reduce((s, v) => s + v, 0);

function compute() {
  const wrap = document.getElementById("fc-table-wrap");
  if (!wrap) return;
  const celdas = agregar();
  const hoja = (key) => (celdas[key] || Array.from({ length: 12 }, celdaVacia));
  const meses = (key) => hoja(key).map(valorCelda);
  const suma2 = (keys) => Array.from({ length: 12 }, (_, i) => keys.reduce((s, k) => s + meses(k)[i], 0));

  const hijosKeys = HACIENDA_HIJOS.map(kI);
  const otrosKeys = OTROS_INGRESOS.map(kI);
  const egKeys = CATEGORIAS_EGRESO.map(kE);

  const totIng = suma2([...hijosKeys, ...otrosKeys]);
  const totEg = suma2(egKeys);
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

  // --- armado de la tabla ---
  const fmt = (n) => (Math.abs(n) < 0.5 ? "-" : (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 }));
  const numTd = (v, extra = "") => el("td", { class: "num " + extra }, fmt(v));
  const celdaTd = (key, i, v) => {
    const c = hoja(key)[i];
    const td = el("td", { class: "num" + (c.sup ? " fc-sup" : "") }, fmt(v));
    if (c.sup) td.title = "Incluye supuestos";
    return td;
  };
  const colorNeg = (v) => (v < -0.5 ? "neg" : "");

  const table = el("table", { class: "fc-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Concepto"),
    ...MESES_CORTOS.map((m) => el("th", {}, m)),
    el("th", {}, "Total año"),
  ])));
  const tbody = el("tbody");
  const seccion = (txt) => tbody.appendChild(el("tr", { class: "fc-seccion" }, [el("td", { colspan: "14" }, txt)]));
  const filaHoja = (key, nombre, esHijo) => {
    const m = meses(key);
    tbody.appendChild(el("tr", { class: esHijo ? "fc-hijo" : "fc-hoja" }, [
      el("td", {}, nombre),
      ...m.map((v, i) => celdaTd(key, i, v)),
      numTd(sumaMeses(m), "fc-tot"),
    ]));
  };
  const filaTotal = (cls, txt, arr, tot) => tbody.appendChild(el("tr", { class: cls }, [
    el("td", {}, txt),
    ...arr.map((v) => numTd(v, colorNeg(v))),
    numTd(tot, "fc-tot " + colorNeg(tot)),
  ]));

  seccion("INGRESOS");
  // Ventas de hacienda: un renglón que se abre por categoría
  const hacienda = suma2(hijosKeys);
  const abierto = abiertos.hacienda;
  const haciendaSup = hijosKeys.map((k) => hoja(k).map((c) => c.sup));
  const toggle = el("button", { class: "fc-toggle", type: "button", "aria-expanded": String(abierto), title: "Ver el detalle por categoría" },
    [el("span", { class: "fc-chev" }, abierto ? "▾" : "▸"), " Ventas de hacienda"]);
  const filaGrupo = el("tr", { class: "fc-grupo" + (abierto ? " abierto" : ""), title: "Tocá para " + (abierto ? "cerrar" : "ver") + " las categorías" }, [
    el("td", {}, toggle),
    ...hacienda.map((v, i) => {
      const td = el("td", { class: "num" + (haciendaSup.some((s) => s[i]) ? " fc-sup" : "") }, fmt(v));
      return td;
    }),
    numTd(sumaMeses(hacienda), "fc-tot"),
  ]);
  filaGrupo.addEventListener("click", () => { abiertos.hacienda = !abiertos.hacienda; compute(); });
  tbody.appendChild(filaGrupo);
  if (abierto) HACIENDA_HIJOS.forEach((c) => filaHoja(kI(c), c.replace(/^Venta de /, "").replace(/^./, (x) => x.toUpperCase()), true));
  OTROS_INGRESOS.forEach((c) => filaHoja(kI(c), c, false));
  filaTotal("fc-total", "TOTAL INGRESOS", totIng, sumaMeses(totIng));

  seccion("EGRESOS");
  CATEGORIAS_EGRESO.forEach((c) => filaHoja(kE(c), c, false));
  filaTotal("fc-total", "TOTAL EGRESOS", totEg, sumaMeses(totEg));

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

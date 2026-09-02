import { listenTo, listenSetting, setSetting } from "./db.js";
import { fmtMoney, el, years, CATEGORIAS_EGRESO, toast, buildExportButton } from "./utils.js";

let ingresos = [];
let egresos = [];
let presupuesto = { egresosArs: {}, egresosUsd: {}, ingresosArs: 0, ingresosUsd: 0 };
let selectedYear = new Date().getFullYear();
let lastComparisonRows = [];
let unsubIng = null, unsubEg = null, unsubPres = null;
let charts = {};

const YEAR_MIN = 2026, YEAR_MAX = 2035;

export function renderPresupuesto(container) {
  container.innerHTML = "";

  const yearOptions = years(YEAR_MIN, YEAR_MAX)
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");

  container.appendChild(
    el("div", { class: "page-head" }, [
      el("h1", {}, "Presupuesto vs Real"),
      el("div", { class: "year-filter" }, [
        el("label", {}, "Año"),
        el("select", {
          id: "pres-year",
          onchange: (e) => { selectedYear = parseInt(e.target.value, 10); loadPresupuesto(); },
          html: yearOptions,
        }),
      ]),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Presupuesto de egresos por categoría (anual)"),
      el("form", { class: "entry-form", id: "pres-form" }),
      el("div", { style: "margin-top:10px" }, [
        el("button", { class: "btn btn-primary", id: "pres-save-btn", type: "button" }, "Guardar presupuesto"),
      ]),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { style: "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px" }, [
        el("h2", {}, "Comparación"),
        buildExportButton(
          "presupuesto.xlsx", "Presupuesto vs Real",
          ["Categoría", "Presupuesto $", "Real $", "Diferencia $", "Presupuesto USD", "Real USD", "Diferencia USD"],
          () => lastComparisonRows
        ),
      ]),
      el("div", { class: "table-wrap", id: "pres-table-wrap" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "chart-grid" }, [
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-pres-ars" })),
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-pres-usd" })),
      ]),
    ])
  );

  buildBudgetInputs();

  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  unsubIng = listenTo("ingresos", (data) => { ingresos = data; renderComparison(); });
  unsubEg = listenTo("egresos", (data) => { egresos = data; renderComparison(); });

  loadPresupuesto();

  document.getElementById("pres-save-btn").addEventListener("click", savePresupuesto);
}

export function unmountPresupuesto() {
  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubPres) unsubPres();
  Object.values(charts).forEach((c) => c && c.destroy());
  charts = {};
}

function buildBudgetInputs() {
  const form = document.getElementById("pres-form");
  form.innerHTML = "";
  CATEGORIAS_EGRESO.forEach((cat) => {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", {}, cat + " ($)"));
    wrap.appendChild(el("input", { type: "number", id: "pb-ars-" + cat, value: 0 }));
    form.appendChild(wrap);
  });
  CATEGORIAS_EGRESO.forEach((cat) => {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", {}, cat + " (USD)"));
    wrap.appendChild(el("input", { type: "number", id: "pb-usd-" + cat, value: 0 }));
    form.appendChild(wrap);
  });
  const wIngArs = el("div", { class: "field" });
  wIngArs.appendChild(el("label", {}, "Ingresos totales ($)"));
  wIngArs.appendChild(el("input", { type: "number", id: "pb-ing-ars", value: 0 }));
  form.appendChild(wIngArs);
  const wIngUsd = el("div", { class: "field" });
  wIngUsd.appendChild(el("label", {}, "Ingresos totales (USD)"));
  wIngUsd.appendChild(el("input", { type: "number", id: "pb-ing-usd", value: 0 }));
  form.appendChild(wIngUsd);
}

function settingKey() {
  return "presupuesto_" + selectedYear;
}

function loadPresupuesto() {
  if (unsubPres) unsubPres();
  unsubPres = listenSetting(settingKey(), (v) => {
    presupuesto = v || { egresosArs: {}, egresosUsd: {}, ingresosArs: 0, ingresosUsd: 0 };
    fillBudgetInputs();
    renderComparison();
  });
}

function fillBudgetInputs() {
  CATEGORIAS_EGRESO.forEach((cat) => {
    const a = document.getElementById("pb-ars-" + cat);
    const u = document.getElementById("pb-usd-" + cat);
    if (a) a.value = (presupuesto.egresosArs && presupuesto.egresosArs[cat]) || 0;
    if (u) u.value = (presupuesto.egresosUsd && presupuesto.egresosUsd[cat]) || 0;
  });
  const ia = document.getElementById("pb-ing-ars");
  const iu = document.getElementById("pb-ing-usd");
  if (ia) ia.value = presupuesto.ingresosArs || 0;
  if (iu) iu.value = presupuesto.ingresosUsd || 0;
}

async function savePresupuesto() {
  const egresosArs = {}, egresosUsd = {};
  CATEGORIAS_EGRESO.forEach((cat) => {
    egresosArs[cat] = parseFloat(document.getElementById("pb-ars-" + cat).value) || 0;
    egresosUsd[cat] = parseFloat(document.getElementById("pb-usd-" + cat).value) || 0;
  });
  presupuesto = {
    egresosArs, egresosUsd,
    ingresosArs: parseFloat(document.getElementById("pb-ing-ars").value) || 0,
    ingresosUsd: parseFloat(document.getElementById("pb-ing-usd").value) || 0,
  };
  await setSetting(settingKey(), presupuesto);
  toast("Presupuesto guardado");
  renderComparison();
}

function realPorCategoria(list, cat, moneda) {
  return list
    .filter((it) => it.categoria === cat && (it.moneda === "USD") === (moneda === "USD") && inYear(it))
    .reduce((s, it) => s + (Number(it.monto) || 0), 0);
}
function inYear(it) {
  return (it.fecha || "").startsWith(String(selectedYear));
}
function realTotal(list, moneda) {
  return list.filter((it) => (it.moneda === "USD") === (moneda === "USD") && inYear(it))
    .reduce((s, it) => s + (Number(it.monto) || 0), 0);
}

function renderComparison() {
  const wrap = document.getElementById("pres-table-wrap");
  if (!wrap) return;

  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Categoría"), el("th", {}, "Presup. $"), el("th", {}, "Real $"), el("th", {}, "Dif. $"),
    el("th", {}, "Presup. USD"), el("th", {}, "Real USD"), el("th", {}, "Dif. USD"),
  ])));
  const tbody = el("tbody");
  const realArsArr = [], realUsdArr = [], presArsArr = [], presUsdArr = [];
  const exportRows = [];
  let totPresArs = 0, totRealArs = 0, totPresUsd = 0, totRealUsd = 0;
  CATEGORIAS_EGRESO.forEach((cat) => {
    const presArs = (presupuesto.egresosArs && presupuesto.egresosArs[cat]) || 0;
    const realArs = realPorCategoria(egresos, cat, "$");
    const difArs = presArs - realArs;
    const presUsd = (presupuesto.egresosUsd && presupuesto.egresosUsd[cat]) || 0;
    const realUsd = realPorCategoria(egresos, cat, "USD");
    const difUsd = presUsd - realUsd;
    totPresArs += presArs; totRealArs += realArs; totPresUsd += presUsd; totRealUsd += realUsd;
    presArsArr.push(presArs); realArsArr.push(realArs);
    presUsdArr.push(presUsd); realUsdArr.push(realUsd);
    exportRows.push([cat, presArs, realArs, difArs, presUsd, realUsd, difUsd]);
    tbody.appendChild(el("tr", {}, [
      el("td", {}, cat),
      el("td", { class: "num" }, fmtMoney(presArs, "$")),
      el("td", { class: "num" }, fmtMoney(realArs, "$")),
      el("td", { class: "num " + (difArs >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(difArs, "$")),
      el("td", { class: "num" }, fmtMoney(presUsd, "USD")),
      el("td", { class: "num" }, fmtMoney(realUsd, "USD")),
      el("td", { class: "num " + (difUsd >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(difUsd, "USD")),
    ]));
  });
  exportRows.push(["TOTAL EGRESOS", totPresArs, totRealArs, totPresArs - totRealArs, totPresUsd, totRealUsd, totPresUsd - totRealUsd]);
  tbody.appendChild(el("tr", { style: "font-weight:700;background:#F2F0E7" }, [
    el("td", {}, "TOTAL EGRESOS"),
    el("td", { class: "num" }, fmtMoney(totPresArs, "$")),
    el("td", { class: "num" }, fmtMoney(totRealArs, "$")),
    el("td", { class: "num " + (totPresArs - totRealArs >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(totPresArs - totRealArs, "$")),
    el("td", { class: "num" }, fmtMoney(totPresUsd, "USD")),
    el("td", { class: "num" }, fmtMoney(totRealUsd, "USD")),
    el("td", { class: "num " + (totPresUsd - totRealUsd >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(totPresUsd - totRealUsd, "USD")),
  ]));

  const realIngArs = realTotal(ingresos, "$");
  const realIngUsd = realTotal(ingresos, "USD");
  const difIngArs = realIngArs - (presupuesto.ingresosArs || 0);
  const difIngUsd = realIngUsd - (presupuesto.ingresosUsd || 0);
  exportRows.push(["Ingresos totales", presupuesto.ingresosArs || 0, realIngArs, difIngArs, presupuesto.ingresosUsd || 0, realIngUsd, difIngUsd]);
  tbody.appendChild(el("tr", { style: "border-top:2px solid var(--green)" }, [
    el("td", {}, "Ingresos totales (+ = a favor)"),
    el("td", { class: "num" }, fmtMoney(presupuesto.ingresosArs || 0, "$")),
    el("td", { class: "num" }, fmtMoney(realIngArs, "$")),
    el("td", { class: "num " + (difIngArs >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(difIngArs, "$")),
    el("td", { class: "num" }, fmtMoney(presupuesto.ingresosUsd || 0, "USD")),
    el("td", { class: "num" }, fmtMoney(realIngUsd, "USD")),
    el("td", { class: "num " + (difIngUsd >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(difIngUsd, "USD")),
  ]));

  lastComparisonRows = exportRows;

  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);

  makeBar("chart-pres-ars", CATEGORIAS_EGRESO, "Presupuesto vs Real ($ ARS)",
    [{ label: "Presupuesto", data: presArsArr, backgroundColor: "#C9A227" },
     { label: "Real", data: realArsArr, backgroundColor: "#1B5E20" }]);
  makeBar("chart-pres-usd", CATEGORIAS_EGRESO, "Presupuesto vs Real (USD)",
    [{ label: "Presupuesto", data: presUsdArr, backgroundColor: "#8A6D1D" },
     { label: "Real", data: realUsdArr, backgroundColor: "#2E7D32" }]);
}

function makeBar(id, labels, title, datasets) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return;
  charts[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { title: { display: true, text: title, font: { size: 12 } }, legend: { labels: { font: { size: 10.5 } } } },
      scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 10 } } } },
    },
  });
}

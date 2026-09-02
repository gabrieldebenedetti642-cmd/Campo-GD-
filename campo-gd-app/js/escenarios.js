import { listenTo, listenSetting } from "./db.js";
import { fmtMoney, el, years, buildExportButton } from "./utils.js";

let ingresos = [];
let egresos = [];
let cotizacion = 1000;
let selectedYear = new Date().getFullYear();
let lastGridRows = [];
let unsubIng = null, unsubEg = null, unsubCotiz = null;

const YEAR_MIN = 2026, YEAR_MAX = 2035;
const VARS = [-0.20, -0.10, 0, 0.10, 0.20];

export function renderEscenarios(container) {
  container.innerHTML = "";

  const yearOptions = years(YEAR_MIN, YEAR_MAX)
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");

  container.appendChild(
    el("div", { class: "page-head" }, [
      el("h1", {}, "Escenarios de Precio"),
      el("div", { class: "year-filter" }, [
        el("label", {}, "Año base"),
        el("select", {
          id: "esc-year",
          onchange: (e) => { selectedYear = parseInt(e.target.value, 10); compute(); },
          html: yearOptions,
        }),
      ]),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Valores base"),
      el("div", { class: "stat-grid", id: "esc-base" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { style: "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px" }, [
        el("h2", {}, "Balance consolidado ($) según variación de precio de hacienda y cotización dólar"),
        buildExportButton(
          "escenarios.xlsx", "Escenarios",
          ["Var. Precio hacienda (%)", "Var. Dólar (%)", "Balance consolidado ($)"],
          () => lastGridRows
        ),
      ]),
      el("p", { class: "sub", style: "margin-bottom:10px" },
        "El precio de hacienda ajusta los Ingresos; los Egresos quedan fijos. La cotización ajusta el peso del Balance USD."),
      el("div", { class: "table-wrap", id: "esc-grid" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Escenarios de referencia"),
      el("div", { class: "table-wrap", id: "esc-ref" }),
    ])
  );

  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCotiz) unsubCotiz();
  unsubIng = listenTo("ingresos", (data) => { ingresos = data; compute(); });
  unsubEg = listenTo("egresos", (data) => { egresos = data; compute(); });
  unsubCotiz = listenSetting("cotizacion_usd", (v) => { if (v !== undefined) cotizacion = v; compute(); });
}

export function unmountEscenarios() {
  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCotiz) unsubCotiz();
}

function inYear(it) {
  return (it.fecha || "").startsWith(String(selectedYear));
}
function sumBy(list, moneda) {
  return list.filter((it) => (it.moneda === "USD") === (moneda === "USD") && inYear(it))
    .reduce((s, it) => s + (Number(it.monto) || 0), 0);
}

function balanceConsolidado(ingArs, egArs, ingUsd, egUsd, cotiz, precioVar, dolarVar) {
  const ingArsAj = ingArs * (1 + precioVar);
  const balArsAj = ingArsAj - egArs;
  const ingUsdAj = ingUsd * (1 + precioVar);
  const balUsdAj = ingUsdAj - egUsd;
  const cotizAj = cotiz * (1 + dolarVar);
  return balArsAj + balUsdAj * cotizAj;
}

function compute() {
  const baseWrap = document.getElementById("esc-base");
  if (!baseWrap) return;

  const ingArs = sumBy(ingresos, "$");
  const egArs = sumBy(egresos, "$");
  const ingUsd = sumBy(ingresos, "USD");
  const egUsd = sumBy(egresos, "USD");
  const balBase = balanceConsolidado(ingArs, egArs, ingUsd, egUsd, cotizacion, 0, 0);

  const stat = (label, value) => el("div", { class: "stat-card" }, [
    el("span", { class: "eyebrow" }, label), el("div", { class: "value" }, value),
  ]);
  baseWrap.innerHTML = "";
  baseWrap.appendChild(stat("Ingresos $ (real)", fmtMoney(ingArs, "$")));
  baseWrap.appendChild(stat("Egresos $ (real)", fmtMoney(egArs, "$")));
  baseWrap.appendChild(stat("Ingresos USD (real)", fmtMoney(ingUsd, "USD")));
  baseWrap.appendChild(stat("Egresos USD (real)", fmtMoney(egUsd, "USD")));
  baseWrap.appendChild(stat("Cotización dólar base", cotizacion.toLocaleString("es-AR")));
  baseWrap.appendChild(stat("Balance consolidado base", fmtMoney(balBase, "$")));

  const gridWrap = document.getElementById("esc-grid");
  const table = el("table", { class: "data-table" });
  const headRow = el("tr", {}, [el("th", {}, "Precio ↓ / Dólar →"), ...VARS.map((v) => el("th", {}, (v * 100).toFixed(0) + "%"))]);
  table.appendChild(el("thead", {}, headRow));
  const tbody = el("tbody");
  const exportRows = [];
  VARS.forEach((pv) => {
    const tr = el("tr", {}, [el("td", { style: "font-weight:700;background:var(--green);color:#fff" }, (pv * 100).toFixed(0) + "%")]);
    VARS.forEach((dv) => {
      const val = balanceConsolidado(ingArs, egArs, ingUsd, egUsd, cotizacion, pv, dv);
      exportRows.push([(pv * 100).toFixed(0) + "%", (dv * 100).toFixed(0) + "%", val]);
      tr.appendChild(el("td", { class: "num " + (val >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(val, "$")));
    });
    tbody.appendChild(tr);
  });
  lastGridRows = exportRows;
  table.appendChild(tbody);
  gridWrap.innerHTML = "";
  gridWrap.appendChild(table);

  const refWrap = document.getElementById("esc-ref");
  const refTable = el("table", { class: "data-table" });
  refTable.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Escenario"), el("th", {}, "Var. precio"), el("th", {}, "Var. dólar"), el("th", {}, "Balance consolidado"),
  ])));
  const refBody = el("tbody");
  [["Conservador", -0.10, -0.10], ["Base", 0, 0], ["Optimista", 0.10, 0.10]].forEach(([nombre, pv, dv]) => {
    const val = balanceConsolidado(ingArs, egArs, ingUsd, egUsd, cotizacion, pv, dv);
    refBody.appendChild(el("tr", {}, [
      el("td", { style: "font-weight:600" }, nombre),
      el("td", { class: "num" }, (pv * 100).toFixed(0) + "%"),
      el("td", { class: "num" }, (dv * 100).toFixed(0) + "%"),
      el("td", { class: "num " + (val >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(val, "$")),
    ]));
  });
  refTable.appendChild(refBody);
  refWrap.innerHTML = "";
  refWrap.appendChild(refTable);
}

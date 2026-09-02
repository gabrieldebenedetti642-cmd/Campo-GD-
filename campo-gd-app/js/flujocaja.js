import { listenSetting, setSetting } from "./db.js";
import { fmtMoney, el, monthLabel, buildExportButton } from "./utils.js";

const SETTING_KEY = "flujoCaja";
let sup = {
  ingresosArs: 1000000, egresosArs: 700000, ingresosUsd: 3000, egresosUsd: 1500,
  crecIngresos: 0, crecEgresos: 0, saldoArs: 0, saldoUsd: 0, mesInicio: todayFirstOfMonth(),
};
let lastRows = [];
let unsub = null;
let charts = {};

function todayFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function renderFlujoCaja(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Flujo de Caja Proyectado")]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Supuestos"),
      buildAssumptionsForm(),
      el("p", { class: "sub", style: "margin-top:10px" },
        "El crecimiento se aplica mes a mes de forma compuesta sobre los montos base."),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { style: "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px" }, [
        el("h2", {}, "Proyección mensual (24 meses)"),
        buildExportButton(
          "flujo-de-caja.xlsx", "Flujo de Caja",
          ["Mes", "Ingresos $", "Egresos $", "Flujo $", "Saldo $", "Ingresos USD", "Egresos USD", "Flujo USD", "Saldo USD"],
          () => lastRows.map((r) => [r.mes, r.ingArs, r.egArs, r.flujoArs, r.saldoArs, r.ingUsd, r.egUsd, r.flujoUsd, r.saldoUsd])
        ),
      ]),
      el("div", { class: "table-wrap", id: "fc-table-wrap" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "chart-grid" }, [
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-fc-ars" })),
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-fc-usd" })),
      ]),
    ])
  );

  if (unsub) unsub();
  unsub = listenSetting(SETTING_KEY, (v) => {
    if (v) sup = { ...sup, ...v };
    fillForm();
    compute();
  });
}

export function unmountFlujoCaja() {
  if (unsub) unsub();
  Object.values(charts).forEach((c) => c && c.destroy());
  charts = {};
}

function buildAssumptionsForm() {
  const form = el("form", { class: "entry-form", id: "fc-form" });
  const fields = [
    ["Ingresos $ mensual base", "number", "fc-ing-ars", sup.ingresosArs],
    ["Egresos $ mensual base", "number", "fc-eg-ars", sup.egresosArs],
    ["Ingresos USD mensual base", "number", "fc-ing-usd", sup.ingresosUsd],
    ["Egresos USD mensual base", "number", "fc-eg-usd", sup.egresosUsd],
    ["Crecimiento mensual Ingresos (%)", "number", "fc-crec-ing", sup.crecIngresos],
    ["Crecimiento mensual Egresos (%)", "number", "fc-crec-eg", sup.crecEgresos],
    ["Saldo inicial $ (caja actual)", "number", "fc-saldo-ars", sup.saldoArs],
    ["Saldo inicial USD (caja actual)", "number", "fc-saldo-usd", sup.saldoUsd],
    ["Mes de inicio", "date", "fc-mes-inicio", sup.mesInicio],
  ];
  fields.forEach(([label, type, id, value]) => {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", { for: id }, label));
    const input = el("input", { type, id, value });
    if (type === "number") input.step = "0.1";
    wrap.appendChild(input);
    form.appendChild(wrap);
  });
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit" }, "Guardar supuestos"),
  ]);
  form.appendChild(btnRow);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    sup = {
      ingresosArs: parseFloat(document.getElementById("fc-ing-ars").value) || 0,
      egresosArs: parseFloat(document.getElementById("fc-eg-ars").value) || 0,
      ingresosUsd: parseFloat(document.getElementById("fc-ing-usd").value) || 0,
      egresosUsd: parseFloat(document.getElementById("fc-eg-usd").value) || 0,
      crecIngresos: parseFloat(document.getElementById("fc-crec-ing").value) || 0,
      crecEgresos: parseFloat(document.getElementById("fc-crec-eg").value) || 0,
      saldoArs: parseFloat(document.getElementById("fc-saldo-ars").value) || 0,
      saldoUsd: parseFloat(document.getElementById("fc-saldo-usd").value) || 0,
      mesInicio: document.getElementById("fc-mes-inicio").value || todayFirstOfMonth(),
    };
    await setSetting(SETTING_KEY, sup);
    compute();
  });
  return form;
}

function fillForm() {
  const map = {
    "fc-ing-ars": sup.ingresosArs, "fc-eg-ars": sup.egresosArs,
    "fc-ing-usd": sup.ingresosUsd, "fc-eg-usd": sup.egresosUsd,
    "fc-crec-ing": sup.crecIngresos, "fc-crec-eg": sup.crecEgresos,
    "fc-saldo-ars": sup.saldoArs, "fc-saldo-usd": sup.saldoUsd,
    "fc-mes-inicio": sup.mesInicio,
  };
  Object.entries(map).forEach(([id, val]) => {
    const inp = document.getElementById(id);
    if (inp) inp.value = val;
  });
}

function compute() {
  const wrap = document.getElementById("fc-table-wrap");
  if (!wrap) return;
  const [y0, m0] = (sup.mesInicio || todayFirstOfMonth()).split("-").map(Number);

  const rows = [];
  let saldoArs = sup.saldoArs, saldoUsd = sup.saldoUsd;
  for (let n = 1; n <= 24; n++) {
    const d = new Date(y0, m0 - 1 + (n - 1), 1);
    const ingArs = sup.ingresosArs * Math.pow(1 + sup.crecIngresos / 100, n);
    const egArs = sup.egresosArs * Math.pow(1 + sup.crecEgresos / 100, n);
    const flujoArs = ingArs - egArs;
    saldoArs += flujoArs;
    const ingUsd = sup.ingresosUsd * Math.pow(1 + sup.crecIngresos / 100, n);
    const egUsd = sup.egresosUsd * Math.pow(1 + sup.crecEgresos / 100, n);
    const flujoUsd = ingUsd - egUsd;
    saldoUsd += flujoUsd;
    rows.push({
      mes: monthLabel(d.getFullYear(), d.getMonth()),
      ingArs, egArs, flujoArs, saldoArs, ingUsd, egUsd, flujoUsd, saldoUsd,
    });
  }
  lastRows = rows;

  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Mes"), el("th", {}, "Ingresos $"), el("th", {}, "Egresos $"), el("th", {}, "Flujo $"),
    el("th", {}, "Saldo $"), el("th", {}, "Ingresos USD"), el("th", {}, "Egresos USD"),
    el("th", {}, "Flujo USD"), el("th", {}, "Saldo USD"),
  ])));
  const tbody = el("tbody");
  rows.forEach((r) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, r.mes),
      el("td", { class: "num" }, fmtMoney(r.ingArs, "$")),
      el("td", { class: "num" }, fmtMoney(r.egArs, "$")),
      el("td", { class: "num " + (r.flujoArs >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(r.flujoArs, "$")),
      el("td", { class: "num " + (r.saldoArs >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(r.saldoArs, "$")),
      el("td", { class: "num" }, fmtMoney(r.ingUsd, "USD")),
      el("td", { class: "num" }, fmtMoney(r.egUsd, "USD")),
      el("td", { class: "num " + (r.flujoUsd >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(r.flujoUsd, "USD")),
      el("td", { class: "num " + (r.saldoUsd >= 0 ? "gdp-pos" : "gdp-neg") }, fmtMoney(r.saldoUsd, "USD")),
    ]));
  });
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);

  drawCharts(rows);
}

function drawCharts(rows) {
  const labels = rows.map((r) => r.mes);
  makeLine("chart-fc-ars", labels, "Saldo acumulado ($ ARS)", rows.map((r) => r.saldoArs), "#1B5E20");
  makeLine("chart-fc-usd", labels, "Saldo acumulado (USD)", rows.map((r) => r.saldoUsd), "#C9A227");
}

function makeLine(id, labels, label, data, color) {
  if (charts[id]) charts[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx || typeof Chart === "undefined") return;
  charts[id] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: "transparent", tension: 0.3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 } } } },
      scales: { x: { ticks: { font: { size: 9.5 } } }, y: { ticks: { font: { size: 10.5 } } } },
    },
  });
}

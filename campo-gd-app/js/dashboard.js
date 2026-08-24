import { listenTo, listenSetting, setSetting } from "./db.js";
import { fmtMoney, el, monthLabel, years, CATEGORIAS_EGRESO, toast } from "./utils.js";

let ingresos = [];
let egresos = [];
let cotizacion = 1000;
let selectedYear = new Date().getFullYear();
let unsubIng = null, unsubEg = null, unsubCotiz = null;
let charts = {};

const YEAR_MIN = 2026, YEAR_MAX = 2035;

export function renderDashboard(container) {
  container.innerHTML = "";

  const yearOptions = years(YEAR_MIN, YEAR_MAX)
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");

  container.appendChild(
    el("div", { class: "page-head" }, [
      el("h1", {}, "Dashboard"),
      el("div", { class: "year-filter" }, [
        el("label", {}, "Año"),
        el("select", {
          id: "dash-year",
          onchange: (e) => {
            selectedYear = parseInt(e.target.value, 10);
            recompute();
          },
          html: yearOptions,
        }),
      ]),
    ])
  );

  container.appendChild(
    el("div", { class: "settings-row" }, [
      el("div", { class: "eyebrow" }, "Cotización"),
      el("div", { class: "field" }, [
        el("label", {}, "$ por USD"),
        el("input", {
          type: "number",
          id: "dash-cotiz",
          value: cotizacion,
          onchange: async (e) => {
            const v = parseFloat(e.target.value) || 0;
            cotizacion = v;
            await setSetting("cotizacion_usd", v);
            recompute();
            toast("Cotización actualizada");
          },
        }),
      ]),
    ])
  );

  container.appendChild(el("div", { class: "kpi-grid", id: "dash-kpis" }));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Ingresos vs Egresos por mes"),
      el("div", { class: "chart-grid" }, [
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-ie-ars" })),
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-ie-usd" })),
      ]),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Balance mensual"),
      el("div", { class: "chart-grid" }, [
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-balance" })),
        el("div", { class: "chart-box" }, el("canvas", { id: "chart-categoria" })),
      ]),
    ])
  );

  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCotiz) unsubCotiz();

  unsubIng = listenTo("ingresos", (data) => {
    ingresos = data;
    recompute();
  });
  unsubEg = listenTo("egresos", (data) => {
    egresos = data;
    recompute();
  });
  unsubCotiz = listenSetting("cotizacion_usd", (v) => {
    if (v !== undefined) {
      cotizacion = v;
      const inp = document.getElementById("dash-cotiz");
      if (inp) inp.value = v;
    }
    recompute();
  });
}

export function unmountDashboard() {
  if (unsubIng) unsubIng();
  if (unsubEg) unsubEg();
  if (unsubCotiz) unsubCotiz();
  Object.values(charts).forEach((c) => c && c.destroy());
  charts = {};
}

function sumBy(list, pred) {
  return list.filter(pred).reduce((s, x) => s + (Number(x.monto) || 0), 0);
}

function inYear(item, y) {
  return (item.fecha || "").startsWith(String(y));
}

function recompute() {
  const kpisEl = document.getElementById("dash-kpis");
  if (!kpisEl) return;

  const ingY = ingresos.filter((i) => inYear(i, selectedYear));
  const egY = egresos.filter((e) => inYear(e, selectedYear));

  const ingArs = sumBy(ingY, (i) => i.moneda !== "USD");
  const ingUsd = sumBy(ingY, (i) => i.moneda === "USD");
  const egArs = sumBy(egY, (e) => e.moneda !== "USD");
  const egUsd = sumBy(egY, (e) => e.moneda === "USD");
  const balArs = ingArs - egArs;
  const balUsd = ingUsd - egUsd;
  const balConsolidado = balArs + balUsd * cotizacion;

  kpisEl.innerHTML = "";
  kpisEl.appendChild(kpiCard("Ingresos $", fmtMoney(ingArs, "$")));
  kpisEl.appendChild(kpiCard("Egresos $", fmtMoney(egArs, "$")));
  kpisEl.appendChild(kpiCard("Ingresos USD", fmtMoney(ingUsd, "USD")));
  kpisEl.appendChild(kpiCard("Egresos USD", fmtMoney(egUsd, "USD")));
  kpisEl.appendChild(kpiCard("Balance $", fmtMoney(balArs, "$"), balArs < 0));
  kpisEl.appendChild(kpiCard("Balance USD", fmtMoney(balUsd, "USD"), balUsd < 0));
  kpisEl.appendChild(kpiCard("Balance consolidado ($)", fmtMoney(balConsolidado, "$"), balConsolidado < 0, "usa la cotización de arriba"));

  drawCharts(ingY, egY);
}

function kpiCard(label, value, neg = false, sub = "") {
  return el("div", { class: "kpi-card" }, [
    el("span", { class: "eyebrow" }, label),
    el("div", { class: "value" + (neg ? " neg" : "") }, value),
    sub ? el("div", { class: "sub" }, sub) : null,
  ]);
}

function monthlyTotals(list, year, currencyFilter) {
  const totals = new Array(12).fill(0);
  list.forEach((it) => {
    if (!it.fecha || !it.fecha.startsWith(String(year))) return;
    if ((it.moneda === "USD") !== (currencyFilter === "USD")) return;
    const m = parseInt(it.fecha.slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) totals[m] += Number(it.monto) || 0;
  });
  return totals;
}

const CHART_GREEN = "#1B5E20";
const CHART_GOLD = "#C9A227";
const CHART_RED = "#B3261E";
const PALETTE = ["#1B5E20", "#C9A227", "#5C7F67", "#8A6D1D", "#2E7D32", "#9E7B1E", "#405C48", "#B08B2A"];

function drawCharts(ingY, egY) {
  const labels = Array.from({ length: 12 }, (_, m) => monthLabel(selectedYear, m));

  const ingArsM = monthlyTotals(ingY, selectedYear, "$");
  const egArsM = monthlyTotals(egY, selectedYear, "$");
  const ingUsdM = monthlyTotals(ingY, selectedYear, "USD");
  const egUsdM = monthlyTotals(egY, selectedYear, "USD");
  const balArsM = ingArsM.map((v, i) => v - egArsM[i]);

  makeBarChart("chart-ie-ars", labels, [
    { label: "Ingresos $", data: ingArsM, backgroundColor: CHART_GREEN },
    { label: "Egresos $", data: egArsM, backgroundColor: CHART_RED },
  ]);
  makeBarChart("chart-ie-usd", labels, [
    { label: "Ingresos USD", data: ingUsdM, backgroundColor: CHART_GOLD },
    { label: "Egresos USD", data: egUsdM, backgroundColor: "#8A6D1D" },
  ]);
  makeLineChart("chart-balance", labels, [
    { label: "Balance $", data: balArsM, borderColor: CHART_GREEN, backgroundColor: "transparent" },
  ]);

  const catTotals = CATEGORIAS_EGRESO.map((cat) =>
    egY.filter((e) => e.categoria === cat && e.moneda !== "USD").reduce((s, e) => s + (Number(e.monto) || 0), 0)
  );
  makePieChart("chart-categoria", CATEGORIAS_EGRESO, catTotals);
}

function destroyIfExists(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

function makeBarChart(canvasId, labels, datasets) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;
  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: chartBaseOptions(),
  });
}
function makeLineChart(canvasId, labels, datasets) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;
  charts[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: datasets.map((d) => ({ ...d, tension: 0.3, fill: false })) },
    options: chartBaseOptions(),
  });
}
function makePieChart(canvasId, labels, data) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === "undefined") return;
  charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: PALETTE }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 10.5 } } } } },
  });
}
function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { font: { size: 11 } } } },
    scales: {
      x: { ticks: { font: { size: 10.5 } } },
      y: { ticks: { font: { size: 10.5 } } },
    },
  };
}

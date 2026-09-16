import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, daysBetween } from "./utils.js";
import { buildImportPanel } from "./importar.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "pesadas";
let items = [];
let editingId = null;
let unsub = null;

export function renderPesadas(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Pesadas")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar pesada"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Importar varias desde Excel"),
      buildImportPanel({
        columnDefs: [
          { key: "fecha", label: "Fecha", type: "date", candidates: ["fecha"], required: true },
          { key: "caravana", label: "Caravana", type: "text", candidates: ["caravana"], required: false },
          { key: "peso", label: "Peso (kg)", type: "number", candidates: ["peso", "kg"], required: true },
        ],
        previewColumns: [
          { key: "fecha", label: "Fecha" },
          { key: "caravana", label: "Caravana" },
          { key: "peso", label: "Peso (kg)" },
        ],
        ejemploTexto: "El archivo debe tener columnas Fecha, Caravana y Peso (en cualquier orden; los nombres pueden variar un poco, por ejemplo \"Peso (kg)\").",
        onConfirm: async (filas) => {
          for (const f of filas) {
            await addDocTo(COL, { fecha: f.fecha, caravana: f.caravana, peso: f.peso, usuario: getUsuarioActual() });
          }
        },
      })
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Resumen"),
      el("div", { class: "stat-grid", id: "pesadas-stats" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Pesadas cargadas"),
      el("div", { class: "table-wrap", id: "pesadas-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderAll();
  });
}

export function unmountPesadas() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "pes-form" });
  const fFecha = fieldInput("Fecha", "date", "pes-fecha", todayISO());
  const fCaravana = fieldInput("Caravana", "text", "pes-caravana", "");
  const fPeso = fieldInput("Peso (kg)", "number", "pes-peso", "");
  fPeso.querySelector("input").step = "0.1";
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "pes-submit-btn" }, "Guardar"),
  ]);
  [fFecha, fCaravana, fPeso, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("pes-fecha").value,
      caravana: document.getElementById("pes-caravana").value.trim(),
      peso: parseFloat(document.getElementById("pes-peso").value) || 0,
      usuario: getUsuarioActual(),
    };
    if (!data.fecha || !data.peso) {
      toast("Completá al menos fecha y peso", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Pesada actualizada");
        editingId = null;
        document.getElementById("pes-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Pesada guardada");
      }
      form.reset();
      document.getElementById("pes-fecha").value = todayISO();
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

// Para cada pesada, calcula el GDP contra la pesada anterior de la misma caravana
function withGDP(list) {
  const byCaravana = {};
  list.forEach((it) => {
    if (!it.caravana) return;
    (byCaravana[it.caravana] = byCaravana[it.caravana] || []).push(it);
  });
  Object.values(byCaravana).forEach((arr) => {
    arr.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
    for (let i = 1; i < arr.length; i++) {
      const dias = daysBetween(arr[i - 1].fecha, arr[i].fecha);
      arr[i]._gdp = dias > 0 ? (arr[i].peso - arr[i - 1].peso) / dias : null;
    }
  });
  return list;
}

function renderAll() {
  withGDP(items);
  renderStats();
  renderTable();
}

function renderStats() {
  const wrap = document.getElementById("pesadas-stats");
  if (!wrap) return;
  const pesos = items.map((i) => i.peso).filter((p) => typeof p === "number");
  const gdps = items.map((i) => i._gdp).filter((g) => g !== null && g !== undefined);
  const stat = (label, value) => el("div", { class: "stat-card" }, [
    el("span", { class: "eyebrow" }, label),
    el("div", { class: "value" }, value),
  ]);
  wrap.innerHTML = "";
  wrap.appendChild(stat("Cantidad", String(pesos.length)));
  wrap.appendChild(stat("Mínimo (kg)", pesos.length ? Math.min(...pesos).toFixed(1) : "-"));
  wrap.appendChild(stat("Máximo (kg)", pesos.length ? Math.max(...pesos).toFixed(1) : "-"));
  wrap.appendChild(stat("Promedio (kg)", pesos.length ? (pesos.reduce((s, p) => s + p, 0) / pesos.length).toFixed(1) : "-"));
  wrap.appendChild(stat("GDP promedio (kg/día)", gdps.length ? (gdps.reduce((s, g) => s + g, 0) / gdps.length).toFixed(3) : "-"));
}

function renderTable() {
  const wrap = document.getElementById("pesadas-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "tag-mark" }, el("span", {}, "GD")),
        el("p", {}, "Todavía no cargaste ninguna pesada."),
      ])
    );
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Caravana"), el("th", {}, "Peso (kg)"),
    el("th", {}, "GDP (kg/día)"), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    const gdpTxt = it._gdp === null || it._gdp === undefined ? "-" : it._gdp.toFixed(3);
    const gdpClass = it._gdp > 0 ? "gdp-pos" : it._gdp < 0 ? "gdp-neg" : "";
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.caravana || ""),
      el("td", { class: "num" }, (it.peso ?? "").toString()),
      el("td", { class: "num " + gdpClass }, gdpTxt),
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
    if (!confirmar("¿Borrar esta pesada?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Pesada borrada");
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
  document.getElementById("pes-fecha").value = it.fecha || "";
  document.getElementById("pes-caravana").value = it.caravana || "";
  document.getElementById("pes-peso").value = it.peso || "";
  document.getElementById("pes-submit-btn").textContent = "Guardar cambios";
  document.getElementById("pes-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

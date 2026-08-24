import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, years, MESES_CORTOS } from "./utils.js";

const COL = "lluvias";
let items = [];
let editingId = null;
let unsub = null;
let selectedYear = new Date().getFullYear();
const YEAR_MIN = 2026, YEAR_MAX = 2035;

export function renderLluvias(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Lluvias")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar lluvia del día"), buildForm()]));

  const yearOptions = years(YEAR_MIN, YEAR_MAX)
    .map((y) => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}</option>`)
    .join("");

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { class: "page-head", style: "margin-bottom:12px" }, [
        el("h2", {}, "Grilla mensual"),
        el("div", { class: "year-filter" }, [
          el("label", {}, "Año"),
          el("select", {
            id: "lluvia-year",
            onchange: (e) => { selectedYear = parseInt(e.target.value, 10); renderGrid(); },
            html: yearOptions,
          }),
        ]),
      ]),
      el("div", { class: "rain-grid-wrap", id: "lluvias-grid" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Registros cargados"),
      el("div", { class: "table-wrap", id: "lluvias-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderGrid();
    renderTable();
  });
}

export function unmountLluvias() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "ll-form" });
  const fFecha = fieldInput("Fecha", "date", "ll-fecha", todayISO());
  const fMm = fieldInput("Milímetros (mm)", "number", "ll-mm", "");
  fMm.querySelector("input").step = "0.1";
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "ll-submit-btn" }, "Guardar"),
  ]);
  [fFecha, fMm, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("ll-fecha").value,
      mm: parseFloat(document.getElementById("ll-mm").value) || 0,
    };
    if (!data.fecha) {
      toast("Completá la fecha", true);
      return;
    }
    try {
      // si ya existe un registro para esa fecha, lo actualiza en vez de duplicar
      const existente = items.find((i) => i.fecha === data.fecha && i.id !== editingId);
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Registro actualizado");
        editingId = null;
        document.getElementById("ll-submit-btn").textContent = "Guardar";
      } else if (existente) {
        await updateDocIn(COL, existente.id, data);
        toast("Ya había un registro ese día — lo actualicé");
      } else {
        await addDocTo(COL, data);
        toast("Lluvia guardada");
      }
      form.reset();
      document.getElementById("ll-fecha").value = todayISO();
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

function renderGrid() {
  const wrap = document.getElementById("lluvias-grid");
  if (!wrap) return;
  const byDate = {};
  items.forEach((it) => { if (it.fecha) byDate[it.fecha] = it.mm || 0; });

  const table = el("table", { class: "rain-grid" });
  const headRow = el("tr", {}, [el("th", {}, "Día"), ...MESES_CORTOS.map((m) => el("th", {}, m))]);
  table.appendChild(el("thead", {}, headRow));
  const tbody = el("tbody");

  for (let d = 1; d <= 31; d++) {
    const tr = el("tr", {}, [el("td", { class: "day-col" }, String(d))]);
    for (let m = 0; m < 12; m++) {
      const iso = `${selectedYear}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const val = byDate[iso];
      tr.appendChild(el("td", { class: val ? "has-rain" : "" }, val ? val.toFixed(1) : ""));
    }
    tbody.appendChild(tr);
  }

  const totalRow = el("tr", { class: "total-row" }, [el("td", {}, "Total")]);
  let totalAnual = 0;
  for (let m = 0; m < 12; m++) {
    let totalMes = 0;
    for (let d = 1; d <= 31; d++) {
      const iso = `${selectedYear}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      totalMes += byDate[iso] || 0;
    }
    totalAnual += totalMes;
    totalRow.appendChild(el("td", {}, totalMes ? totalMes.toFixed(1) : "0"));
  }
  tbody.appendChild(totalRow);
  table.appendChild(tbody);

  wrap.innerHTML = "";
  wrap.appendChild(table);
  wrap.appendChild(el("div", { class: "stat-grid", style: "margin-top:14px" }, [
    el("div", { class: "stat-card" }, [
      el("span", { class: "eyebrow" }, `Total anual ${selectedYear}`),
      el("div", { class: "value" }, totalAnual.toFixed(1) + " mm"),
    ]),
  ]));
}

function renderTable() {
  const wrap = document.getElementById("lluvias-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "tag-mark" }, el("span", {}, "GD")),
      el("p", {}, "Todavía no cargaste ninguna lluvia."),
    ]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [el("th", {}, "Fecha"), el("th", {}, "mm"), el("th", {}, "")])));
  const tbody = el("tbody");
  items.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", { class: "num" }, (it.mm ?? 0).toFixed(1)),
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
    if (!confirmar("¿Borrar este registro de lluvia?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Registro borrado");
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
  document.getElementById("ll-fecha").value = it.fecha || "";
  document.getElementById("ll-mm").value = it.mm || "";
  document.getElementById("ll-submit-btn").textContent = "Guardar cambios";
  document.getElementById("ll-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

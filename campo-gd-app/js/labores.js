import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, TIPOS_LABOR } from "./utils.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "labores";
let items = [];
let editingId = null;
let unsub = null;

export function renderLabores(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Labores")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar labor"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Totales por tipo de labor"),
      el("div", { class: "table-wrap", id: "labores-resumen" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Labores cargadas"),
      el("div", { class: "table-wrap", id: "labores-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderResumen();
    renderTable();
  });
}

export function unmountLabores() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "lab-form" });
  const fFecha = fieldInput("Fecha", "date", "lab-fecha", todayISO());
  const fPotrero = fieldInput("Potrero", "text", "lab-potrero", "");
  const fArea = fieldInput("Área (ha)", "number", "lab-area", "");
  fArea.querySelector("input").step = "0.1";
  const fLabor = fieldSelect("Labor", "lab-labor", TIPOS_LABOR);
  const fHoras = fieldInput("Horas", "number", "lab-horas", "");
  fHoras.querySelector("input").step = "0.5";
  const fGasoil = fieldInput("Gasoil (L)", "number", "lab-gasoil", "");
  const fObs = fieldInput("Observaciones", "text", "lab-obs", "");
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "lab-submit-btn" }, "Guardar"),
  ]);
  [fFecha, fPotrero, fArea, fLabor, fHoras, fGasoil, fObs, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("lab-fecha").value,
      potrero: document.getElementById("lab-potrero").value.trim(),
      area: parseFloat(document.getElementById("lab-area").value) || 0,
      labor: document.getElementById("lab-labor").value,
      horas: parseFloat(document.getElementById("lab-horas").value) || 0,
      gasoil: parseFloat(document.getElementById("lab-gasoil").value) || 0,
      observaciones: document.getElementById("lab-obs").value.trim(),
      usuario: getUsuarioActual(),
    };
    if (!data.fecha) {
      toast("Completá al menos la fecha", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Labor actualizada");
        editingId = null;
        document.getElementById("lab-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Labor guardada");
      }
      form.reset();
      document.getElementById("lab-fecha").value = todayISO();
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

function renderResumen() {
  const wrap = document.getElementById("labores-resumen");
  if (!wrap) return;
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [el("th", {}, "Labor"), el("th", {}, "Horas"), el("th", {}, "Gasoil (L)")])));
  const tbody = el("tbody");
  let totHoras = 0, totGasoil = 0;
  TIPOS_LABOR.forEach((tipo) => {
    const deTipo = items.filter((i) => i.labor === tipo);
    const horas = deTipo.reduce((s, i) => s + (i.horas || 0), 0);
    const gasoil = deTipo.reduce((s, i) => s + (i.gasoil || 0), 0);
    totHoras += horas; totGasoil += gasoil;
    tbody.appendChild(el("tr", {}, [
      el("td", {}, tipo),
      el("td", { class: "num" }, horas.toFixed(1)),
      el("td", { class: "num" }, gasoil.toFixed(1)),
    ]));
  });
  tbody.appendChild(el("tr", { style: "font-weight:700;background:#F2F0E7" }, [
    el("td", {}, "TOTAL"),
    el("td", { class: "num" }, totHoras.toFixed(1)),
    el("td", { class: "num" }, totGasoil.toFixed(1)),
  ]));
  table.appendChild(tbody);
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

function renderTable() {
  const wrap = document.getElementById("labores-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "tag-mark" }, el("span", {}, "GD")),
      el("p", {}, "Todavía no cargaste ninguna labor."),
    ]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Potrero"), el("th", {}, "Área"), el("th", {}, "Labor"),
    el("th", {}, "Horas"), el("th", {}, "Gasoil"), el("th", {}, "Obs."), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.potrero || ""),
      el("td", { class: "num" }, (it.area ?? "").toString()),
      el("td", {}, it.labor || ""),
      el("td", { class: "num" }, (it.horas ?? "").toString()),
      el("td", { class: "num" }, (it.gasoil ?? "").toString()),
      el("td", {}, it.observaciones || ""),
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
    if (!confirmar("¿Borrar esta labor?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Labor borrada");
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
  document.getElementById("lab-fecha").value = it.fecha || "";
  document.getElementById("lab-potrero").value = it.potrero || "";
  document.getElementById("lab-area").value = it.area || "";
  document.getElementById("lab-labor").value = it.labor || TIPOS_LABOR[0];
  document.getElementById("lab-horas").value = it.horas || "";
  document.getElementById("lab-gasoil").value = it.gasoil || "";
  document.getElementById("lab-obs").value = it.observaciones || "";
  document.getElementById("lab-submit-btn").textContent = "Guardar cambios";
  document.getElementById("lab-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

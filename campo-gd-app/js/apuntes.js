import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar } from "./utils.js";

const COL = "apuntes";
const TIPOS_APUNTE = [
  "Service", "Cambio de aceite", "Cambio de filtro de gasoil",
  "Cambio de filtro de aire", "Cambio de cubiertas", "Cambio de batería", "Otro"
];
let items = [];
let editingId = null;
let unsub = null;

export function renderApuntes(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Apuntes")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Mantenimiento y notas"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Registros cargados"),
      el("div", { class: "table-wrap", id: "apuntes-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderTable();
  });
}

export function unmountApuntes() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "ap-form" });
  const fFecha = fieldInput("Fecha", "date", "ap-fecha", todayISO());
  const fVehiculo = fieldInput("Vehículo / Equipo", "text", "ap-vehiculo", "");
  const fTipo = fieldSelect("Tipo", "ap-tipo", TIPOS_APUNTE);
  const fDetalle = fieldInput("Detalle", "text", "ap-detalle", "");
  const fProximo = fieldInput("Próximo control", "date", "ap-proximo", "");
  const fObs = fieldInput("Observaciones", "text", "ap-obs", "");
  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "ap-submit-btn" }, "Guardar"),
  ]);
  [fFecha, fVehiculo, fTipo, fDetalle, fProximo, fObs, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("ap-fecha").value,
      vehiculo: document.getElementById("ap-vehiculo").value.trim(),
      tipo: document.getElementById("ap-tipo").value,
      detalle: document.getElementById("ap-detalle").value.trim(),
      proximoControl: document.getElementById("ap-proximo").value,
      observaciones: document.getElementById("ap-obs").value.trim(),
    };
    if (!data.fecha) {
      toast("Completá al menos la fecha", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Registro actualizado");
        editingId = null;
        document.getElementById("ap-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Registro guardado");
      }
      form.reset();
      document.getElementById("ap-fecha").value = todayISO();
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

function proximosVencimientos() {
  const hoy = todayISO();
  const en30 = new Date();
  en30.setDate(en30.getDate() + 30);
  const limite = en30.toISOString().slice(0, 10);
  return items.filter((it) => it.proximoControl && it.proximoControl >= hoy && it.proximoControl <= limite);
}

function renderTable() {
  const wrap = document.getElementById("apuntes-table-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const proximos = proximosVencimientos();
  if (proximos.length) {
    wrap.appendChild(el("div", { class: "stat-grid", style: "margin-bottom:14px" },
      proximos.map((it) => el("div", { class: "stat-card", style: "border-left:3px solid var(--gold)" }, [
        el("span", { class: "eyebrow" }, "Vence " + fmtDate(it.proximoControl)),
        el("div", { class: "value", style: "font-size:16px" }, `${it.vehiculo || "-"} · ${it.tipo || ""}`),
      ]))
    ));
  }

  if (items.length === 0) {
    wrap.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "tag-mark" }, el("span", {}, "GD")),
      el("p", {}, "Todavía no cargaste ningún registro."),
    ]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Vehículo/Equipo"), el("th", {}, "Tipo"),
    el("th", {}, "Detalle"), el("th", {}, "Próximo control"), el("th", {}, "Obs."), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.vehiculo || ""),
      el("td", {}, it.tipo || ""),
      el("td", {}, it.detalle || ""),
      el("td", {}, it.proximoControl ? fmtDate(it.proximoControl) : ""),
      el("td", {}, it.observaciones || ""),
      el("td", {}, rowActions(it)),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function rowActions(it) {
  const wrap = el("div", { class: "row-actions" });
  const editBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Editar");
  editBtn.addEventListener("click", () => startEdit(it));
  const delBtn = el("button", { class: "btn btn-danger-ghost btn-sm" }, "Borrar");
  delBtn.addEventListener("click", async () => {
    if (!confirmar("¿Borrar este registro?")) return;
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
  document.getElementById("ap-fecha").value = it.fecha || "";
  document.getElementById("ap-vehiculo").value = it.vehiculo || "";
  document.getElementById("ap-tipo").value = it.tipo || TIPOS_APUNTE[0];
  document.getElementById("ap-detalle").value = it.detalle || "";
  document.getElementById("ap-proximo").value = it.proximoControl || "";
  document.getElementById("ap-obs").value = it.observaciones || "";
  document.getElementById("ap-submit-btn").textContent = "Guardar cambios";
  document.getElementById("ap-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

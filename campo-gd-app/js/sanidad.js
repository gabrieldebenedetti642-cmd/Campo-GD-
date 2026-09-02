import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar, CATEGORIAS_HACIENDA, INSUMOS_SANIDAD } from "./utils.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "sanidad";
let items = [];
let editingId = null;
let unsub = null;
let insumoRowCount = 0;

export function renderSanidad(container) {
  container.innerHTML = "";
  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Sanidad")]));

  container.appendChild(el("div", { class: "panel" }, [el("h2", {}, "Cargar tratamiento"), buildForm()]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Buscar historial por lote"),
      buildBuscarForm(),
      el("div", { class: "table-wrap", id: "sanidad-historial-wrap", style: "margin-top:14px" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Totales por categoría"),
      el("div", { class: "table-wrap", id: "sanidad-resumen-categoria" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Totales por insumo"),
      el("div", { class: "table-wrap", id: "sanidad-resumen-insumo" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Tratamientos cargados"),
      el("div", { class: "table-wrap", id: "sanidad-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderResumenCategoria();
    renderResumenInsumo();
    renderTable();
  });
}

export function unmountSanidad() {
  if (unsub) unsub();
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

function buildForm() {
  const form = el("form", { class: "entry-form", id: "san-form" });

  const fFecha = fieldInput("Fecha", "date", "san-fecha", todayISO());
  const fPotrero = fieldInput("Potrero", "text", "san-potrero", "");
  const fCategoria = fieldSelect("Categoría", "san-categoria", CATEGORIAS_HACIENDA);
  const fCantidad = fieldInput("Cantidad de animales", "number", "san-cantidad", "");

  const insumosWrap = el("div", { class: "field", style: "grid-column:1/-1" });
  insumosWrap.appendChild(el("label", {}, "Insumos / tratamientos aplicados"));
  insumosWrap.appendChild(el("div", { id: "san-insumos-list" }));
  const addInsumoBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button" }, "+ Agregar insumo");
  addInsumoBtn.addEventListener("click", () => addInsumoRow());
  insumosWrap.appendChild(addInsumoBtn);

  const fObs = fieldInput("Observaciones", "text", "san-obs", "");
  fObs.style.gridColumn = "1/-1";

  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "san-submit-btn" }, "Guardar"),
  ]);

  [fFecha, fPotrero, fCategoria, fCantidad, insumosWrap, fObs, btnRow].forEach((f) => form.appendChild(f));

  insumoRowCount = 0;
  setTimeout(() => addInsumoRow(), 0);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const insumos = Array.from(document.querySelectorAll(".san-insumo-select"))
      .map((s) => {
        if (s.value === "Otro") {
          const otro = s.parentElement.querySelector(".san-insumo-otro");
          return (otro && otro.value.trim()) || "Otro";
        }
        return s.value;
      })
      .filter(Boolean);

    const data = {
      fecha: document.getElementById("san-fecha").value,
      potrero: document.getElementById("san-potrero").value.trim(),
      categoria: document.getElementById("san-categoria").value,
      cantidad: parseInt(document.getElementById("san-cantidad").value, 10) || 0,
      insumos,
      observaciones: document.getElementById("san-obs").value.trim(),
      usuario: getUsuarioActual(),
    };
    if (!data.fecha || !data.potrero || !data.cantidad || insumos.length === 0) {
      toast("Completá fecha, potrero, cantidad y al menos un insumo", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Tratamiento actualizado");
        editingId = null;
        document.getElementById("san-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Tratamiento guardado");
      }
      form.reset();
      document.getElementById("san-fecha").value = todayISO();
      document.getElementById("san-insumos-list").innerHTML = "";
      insumoRowCount = 0;
      addInsumoRow();
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });

  return form;
}

function addInsumoRow(value) {
  const list = document.getElementById("san-insumos-list");
  if (!list) return;
  insumoRowCount++;

  const row = el("div", { style: "display:flex; gap:8px; align-items:center; margin-bottom:6px; flex-wrap:wrap" });

  const select = el("select", { class: "san-insumo-select" });
  INSUMOS_SANIDAD.forEach((o) => select.appendChild(el("option", { value: o }, o)));

  const otroInput = el("input", {
    type: "text", class: "san-insumo-otro", placeholder: "Especificar...",
    style: "display:none; flex:1; min-width:120px",
  });
  select.addEventListener("change", () => {
    otroInput.style.display = select.value === "Otro" ? "block" : "none";
  });

  if (value) {
    if (INSUMOS_SANIDAD.includes(value)) {
      select.value = value;
    } else {
      select.value = "Otro";
      otroInput.style.display = "block";
      otroInput.value = value;
    }
  }

  const removeBtn = el("button", { class: "btn btn-danger-ghost btn-sm", type: "button" }, "Quitar");
  removeBtn.addEventListener("click", () => {
    if (document.querySelectorAll(".san-insumo-select").length <= 1) return;
    row.remove();
  });

  row.appendChild(select);
  row.appendChild(otroInput);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function buildBuscarForm() {
  const wrap = el("div", { style: "display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end" });
  const fPotrero = fieldInput("Potrero", "text", "san-buscar-potrero", "");
  const fCategoria = fieldSelect("Categoría", "san-buscar-categoria", ["Todas", ...CATEGORIAS_HACIENDA]);
  const btnBuscar = el("button", { class: "btn btn-primary", type: "button" }, "Buscar");
  btnBuscar.addEventListener("click", renderHistorial);

  wrap.appendChild(fPotrero);
  wrap.appendChild(fCategoria);
  wrap.appendChild(el("div", { class: "field" }, [el("label", {}, "\u00A0"), btnBuscar]));
  return wrap;
}

function renderHistorial() {
  const wrap = document.getElementById("sanidad-historial-wrap");
  if (!wrap) return;
  const potreroInput = document.getElementById("san-buscar-potrero");
  const categoriaSelect = document.getElementById("san-buscar-categoria");
  const potrero = (potreroInput.value || "").trim().toLowerCase();
  const categoria = categoriaSelect.value;

  wrap.innerHTML = "";
  if (!potrero) {
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "Ingresá un potrero para ver el historial.")]));
    return;
  }

  const encontrados = items.filter((it) => {
    const matchPotrero = (it.potrero || "").trim().toLowerCase() === potrero;
    const matchCategoria = categoria === "Todas" || it.categoria === categoria;
    return matchPotrero && matchCategoria;
  });

  if (encontrados.length === 0) {
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "No hay tratamientos cargados para ese lote.")]));
    return;
  }

  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Categoría"), el("th", {}, "Cant."), el("th", {}, "Insumos"), el("th", {}, "Obs."),
  ])));
  const tbody = el("tbody");
  encontrados.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.categoria || ""),
      el("td", { class: "num" }, String(it.cantidad ?? "")),
      el("td", {}, (it.insumos || []).join(", ")),
      el("td", {}, it.observaciones || ""),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function renderResumenCategoria() {
  const wrap = document.getElementById("sanidad-resumen-categoria");
  if (!wrap) return;
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [el("th", {}, "Categoría"), el("th", {}, "Animales tratados")])));
  const tbody = el("tbody");
  let hayDatos = false;
  CATEGORIAS_HACIENDA.forEach((cat) => {
    const total = items.filter((i) => i.categoria === cat).reduce((s, i) => s + (i.cantidad || 0), 0);
    if (total > 0) {
      hayDatos = true;
      tbody.appendChild(el("tr", {}, [el("td", {}, cat), el("td", { class: "num" }, String(total))]));
    }
  });
  table.appendChild(tbody);
  wrap.innerHTML = "";
  if (!hayDatos) {
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "Todavía no hay tratamientos cargados.")]));
    return;
  }
  wrap.appendChild(table);
}

function renderResumenInsumo() {
  const wrap = document.getElementById("sanidad-resumen-insumo");
  if (!wrap) return;
  const totales = {};
  items.forEach((it) => {
    (it.insumos || []).forEach((ins) => {
      totales[ins] = (totales[ins] || 0) + (it.cantidad || 0);
    });
  });
  const entries = Object.entries(totales).sort((a, b) => b[1] - a[1]);
  wrap.innerHTML = "";
  if (entries.length === 0) {
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "Todavía no hay tratamientos cargados.")]));
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [el("th", {}, "Insumo"), el("th", {}, "Animales tratados")])));
  const tbody = el("tbody");
  entries.forEach(([ins, total]) => {
    tbody.appendChild(el("tr", {}, [el("td", {}, ins), el("td", { class: "num" }, String(total))]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function renderTable() {
  const wrap = document.getElementById("sanidad-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "tag-mark" }, el("span", {}, "GD")),
        el("p", {}, "Todavía no cargaste ningún tratamiento."),
      ])
    );
    return;
  }
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Potrero"), el("th", {}, "Categoría"), el("th", {}, "Cant."),
    el("th", {}, "Insumos"), el("th", {}, "Obs."), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    tbody.appendChild(el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.potrero || ""),
      el("td", {}, it.categoria || ""),
      el("td", { class: "num" }, String(it.cantidad ?? "")),
      el("td", {}, (it.insumos || []).join(", ")),
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
    if (!confirmar("¿Borrar este tratamiento? No se puede deshacer.")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Tratamiento borrado");
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
  document.getElementById("san-fecha").value = it.fecha || "";
  document.getElementById("san-potrero").value = it.potrero || "";
  document.getElementById("san-categoria").value = it.categoria || CATEGORIAS_HACIENDA[0];
  document.getElementById("san-cantidad").value = it.cantidad || "";
  document.getElementById("san-obs").value = it.observaciones || "";

  document.getElementById("san-insumos-list").innerHTML = "";
  insumoRowCount = 0;
  const insumos = it.insumos && it.insumos.length ? it.insumos : [undefined];
  insumos.forEach((ins) => addInsumoRow(ins));

  document.getElementById("san-submit-btn").textContent = "Guardar cambios";
  document.getElementById("san-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

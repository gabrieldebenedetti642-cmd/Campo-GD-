import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtMoney, fmtDate, todayISO, el, toast, confirmar, CATEGORIAS_EGRESO, CONCEPTOS_EGRESO, fieldSelectOtro, getSelectOtroValue, setSelectOtroValue, buildExportButton } from "./utils.js";
import { buildScannerPanel } from "./facturaScanner.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "egresos";
let items = [];
let editingId = null;
let unsub = null;

export function renderEgresos(container) {
  container.innerHTML = "";

  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Egresos")]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Escanear factura"),
      buildScannerPanel({
        onData: (parsed) => {
          if (parsed.fecha) document.getElementById("eg-fecha").value = parsed.fecha;
          if (parsed.monto) document.getElementById("eg-monto").value = parsed.monto;
          if (parsed.moneda) document.getElementById("eg-moneda").value = parsed.moneda;
          if (parsed.comprobante) document.getElementById("eg-comprobante").value = parsed.comprobante;
          document.getElementById("eg-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
        },
      }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [el("h2", {}, "Cargar gasto"), buildForm()])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { style: "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px" }, [
        el("h2", {}, "Gastos cargados"),
        buildExportButton(
          "egresos.xlsx", "Egresos",
          ["Fecha", "Concepto", "Categoría", "Proveedor", "N° Comprobante", "Moneda", "Monto", "Usuario"],
          () => items.map((it) => [
            fmtDate(it.fecha), it.concepto || "", it.categoria || "", it.proveedor || "",
            it.comprobante || "", it.moneda || "$", it.monto || 0, it.usuario || "",
          ])
        ),
      ]),
      el("div", { class: "table-wrap", id: "egresos-table-wrap" }),
    ])
  );

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderTable();
  });
}

export function unmountEgresos() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "egreso-form" });

  const fFecha = fieldInput("Fecha", "date", "eg-fecha", todayISO());
  const fConcepto = fieldSelectOtro("Concepto", "eg-concepto", CONCEPTOS_EGRESO);
  const fCategoria = fieldSelect("Categoría", "eg-categoria", CATEGORIAS_EGRESO);
  const fProveedor = fieldInput("Proveedor", "text", "eg-proveedor", "");
  const fComprobante = fieldInput("N° Comprobante", "text", "eg-comprobante", "");
  const fMoneda = fieldSelect("Moneda", "eg-moneda", ["$", "USD"]);
  const fMonto = fieldInput("Monto", "number", "eg-monto", "");
  fMonto.querySelector("input").step = "0.01";

  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "eg-submit-btn" }, "Guardar"),
  ]);

  [fFecha, fConcepto, fCategoria, fProveedor, fComprobante, fMoneda, fMonto, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("eg-fecha").value,
      concepto: getSelectOtroValue("eg-concepto"),
      categoria: document.getElementById("eg-categoria").value,
      proveedor: document.getElementById("eg-proveedor").value.trim(),
      comprobante: document.getElementById("eg-comprobante").value.trim(),
      moneda: document.getElementById("eg-moneda").value,
      monto: parseFloat(document.getElementById("eg-monto").value) || 0,
      usuario: getUsuarioActual(),
    };
    if (!data.fecha || !data.monto) {
      toast("Completá al menos fecha y monto", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Gasto actualizado");
        editingId = null;
        document.getElementById("eg-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Gasto guardado");
      }
      form.reset();
      document.getElementById("eg-fecha").value = todayISO();
      setSelectOtroValue("eg-concepto", "", CONCEPTOS_EGRESO);
    } catch (err) {
      console.error(err);
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

function renderTable() {
  const wrap = document.getElementById("egresos-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "tag-mark" }, el("span", {}, "GD")),
        el("p", {}, "Todavía no cargaste ningún gasto."),
        el("p", {}, "Usá el formulario de arriba para agregar el primero."),
      ])
    );
    return;
  }
  const table = el("table", { class: "data-table" });
  const thead = el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Concepto"), el("th", {}, "Categoría"),
    el("th", {}, "Proveedor"), el("th", {}, "N° Comp."), el("th", {}, "Moneda"), el("th", {}, "Monto"), el("th", {}, "Usuario"), el("th", {}, ""),
  ]));
  const tbody = el("tbody");
  items.forEach((it) => {
    const tr = el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.concepto || ""),
      el("td", {}, it.categoria || ""),
      el("td", {}, it.proveedor || ""),
      el("td", {}, it.comprobante || ""),
      el("td", {}, el("span", { class: "badge " + (it.moneda === "USD" ? "usd" : "ars") }, it.moneda || "$")),
      el("td", { class: "num" }, fmtMoney(it.monto, it.moneda)),
      el("td", {}, usuarioBadge(it.usuario)),
      el("td", {}, rowActions(it)),
    ]);
    tbody.appendChild(tr);
  });
  table.appendChild(thead);
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
    if (!confirmar("¿Borrar este gasto? No se puede deshacer.")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Gasto borrado");
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
  document.getElementById("eg-fecha").value = it.fecha || "";
  setSelectOtroValue("eg-concepto", it.concepto || "", CONCEPTOS_EGRESO);
  document.getElementById("eg-categoria").value = it.categoria || CATEGORIAS_EGRESO[0];
  document.getElementById("eg-proveedor").value = it.proveedor || "";
  document.getElementById("eg-comprobante").value = it.comprobante || "";
  document.getElementById("eg-moneda").value = it.moneda || "$";
  document.getElementById("eg-monto").value = it.monto || "";
  document.getElementById("eg-submit-btn").textContent = "Guardar cambios";
  document.getElementById("eg-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

export function getEgresosSnapshot() {
  return items;
}

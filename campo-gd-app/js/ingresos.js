import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtMoney, fmtDate, todayISO, el, toast, confirmar, CONCEPTOS_INGRESO, fieldSelectOtro, getSelectOtroValue, setSelectOtroValue, buildExportButton } from "./utils.js";
import { buildScannerPanel } from "./facturaScanner.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "ingresos";
let items = [];
let editingId = null;
let unsub = null;
let mountedContainer = null;

export function renderIngresos(container) {
  mountedContainer = container;
  container.innerHTML = "";

  container.appendChild(
    el("div", { class: "page-head" }, [
      el("h1", {}, "Ingresos"),
    ])
  );

  const scanPanel = el("div", { class: "panel" }, [
    el("h2", {}, "Escanear factura"),
    buildScannerPanel({
      onData: (parsed) => {
        if (parsed.fecha) document.getElementById("ing-fecha").value = parsed.fecha;
        if (parsed.monto) document.getElementById("ing-monto").value = parsed.monto;
        if (parsed.moneda) document.getElementById("ing-moneda").value = parsed.moneda;
        if (parsed.comprobante) document.getElementById("ing-factura").value = parsed.comprobante;
        document.getElementById("ing-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
      },
    }),
  ]);
  container.appendChild(scanPanel);

  const formPanel = el("div", { class: "panel" }, [
    el("h2", {}, "Cargar factura"),
    buildForm(),
  ]);
  container.appendChild(formPanel);

  const tablePanel = el("div", { class: "panel" }, [
    el("div", { style: "display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px" }, [
      el("h2", {}, "Facturas cargadas"),
      buildExportButton(
        "ingresos.xlsx", "Ingresos",
        ["Fecha", "N° Factura", "Concepto", "Cliente", "Moneda", "Monto", "Usuario"],
        () => items.map((it) => [
          fmtDate(it.fecha), it.factura || "", it.concepto || "", it.cliente || "",
          it.moneda || "$", it.monto || 0, it.usuario || "",
        ])
      ),
    ]),
    el("div", { class: "table-wrap", id: "ingresos-table-wrap" }),
  ]);
  container.appendChild(tablePanel);

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    renderTable();
  });
}

export function unmountIngresos() {
  if (unsub) unsub();
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "ingreso-form" });

  const fFecha = fieldInput("Fecha", "date", "ing-fecha", todayISO());
  const fFactura = fieldInput("N° Factura", "text", "ing-factura", "");
  const fConcepto = fieldSelectOtro("Concepto", "ing-concepto", CONCEPTOS_INGRESO);
  const fCliente = fieldInput("Cliente", "text", "ing-cliente", "");
  const fMoneda = fieldSelect("Moneda", "ing-moneda", ["$", "USD"]);
  const fMonto = fieldInput("Monto", "number", "ing-monto", "");
  fMonto.querySelector("input").step = "0.01";

  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "ing-submit-btn" }, "Guardar"),
  ]);

  [fFecha, fFactura, fConcepto, fCliente, fMoneda, fMonto, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      fecha: document.getElementById("ing-fecha").value,
      factura: document.getElementById("ing-factura").value.trim(),
      concepto: getSelectOtroValue("ing-concepto"),
      cliente: document.getElementById("ing-cliente").value.trim(),
      moneda: document.getElementById("ing-moneda").value,
      monto: parseFloat(document.getElementById("ing-monto").value) || 0,
      usuario: getUsuarioActual(),
    };
    if (!data.fecha || !data.monto) {
      toast("Completá al menos fecha y monto", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Factura actualizada");
        editingId = null;
        document.getElementById("ing-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Factura guardada");
      }
      form.reset();
      document.getElementById("ing-fecha").value = todayISO();
      setSelectOtroValue("ing-concepto", "", CONCEPTOS_INGRESO);
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
  const input = el("input", { type, id, value });
  wrap.appendChild(input);
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
  const wrap = document.getElementById("ingresos-table-wrap");
  if (!wrap) return;
  if (items.length === 0) {
    wrap.innerHTML = "";
    wrap.appendChild(
      el("div", { class: "empty-state" }, [
        el("div", { class: "tag-mark" }, el("span", {}, "GD")),
        el("p", {}, "Todavía no cargaste ninguna factura."),
        el("p", {}, "Usá el formulario de arriba para agregar la primera."),
      ])
    );
    return;
  }
  const table = el("table", { class: "data-table" });
  const thead = el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "N° Factura"), el("th", {}, "Concepto"),
    el("th", {}, "Cliente"), el("th", {}, "Moneda"), el("th", {}, "Monto"), el("th", {}, "Usuario"), el("th", {}, ""),
  ]));
  const tbody = el("tbody");
  items.forEach((it) => {
    const tr = el("tr", {}, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.factura || ""),
      el("td", {}, it.concepto || ""),
      el("td", {}, it.cliente || ""),
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
    if (!confirmar("¿Borrar esta factura? No se puede deshacer.")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Factura borrada");
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
  document.getElementById("ing-fecha").value = it.fecha || "";
  document.getElementById("ing-factura").value = it.factura || "";
  setSelectOtroValue("ing-concepto", it.concepto || "", CONCEPTOS_INGRESO);
  document.getElementById("ing-cliente").value = it.cliente || "";
  document.getElementById("ing-moneda").value = it.moneda || "$";
  document.getElementById("ing-monto").value = it.monto || "";
  document.getElementById("ing-submit-btn").textContent = "Guardar cambios";
  document.getElementById("ing-fecha").scrollIntoView({ behavior: "smooth", block: "center" });
}

export function getIngresosSnapshot() {
  return items;
}

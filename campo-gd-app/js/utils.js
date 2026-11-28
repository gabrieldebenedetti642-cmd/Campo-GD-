export const CATEGORIAS_HACIENDA = [
  "Vacas de cría", "Vacas descarte", "Novillos 1-2", "Novillos 2-3",
  "Vaquillonas 1-2", "Vaquillonas 2-3", "Terneros", "Terneras", "Toros"
];

export const MOTIVOS_EXISTENCIAS = ["Nacimiento", "Compra", "Cambio de categoría", "Venta", "Muerte", "Otro"];

// Equivalencia en Unidad Ganadera (UG) por categoría — 1 UG = una vaca de
// ~380-400 kg que gesta y desteta un ternero. Tabla basada en Cocimano et al.
// (1975), la referencia clásica usada en Argentina/Uruguay para carga animal.
export const UG_POR_CATEGORIA = {
  "Vacas de cría": 1.0,
  "Vacas descarte": 1.0,
  "Novillos 1-2": 0.7,
  "Novillos 2-3": 1.0,
  "Vaquillonas 1-2": 0.7,
  "Vaquillonas 2-3": 1.0,
  "Terneros": 0.4,
  "Terneras": 0.4,
  "Toros": 1.2,
};

export const TIPOS_LABOR = ["Siembra", "Fertilización", "Movimiento de tierra", "Pulverización", "Rotativa", "Otro"];

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// ---- Plan de cuentas -------------------------------------------------------
// Rubro (categoría) → conceptos (subrubros). Cada rubro tiene un código (1.1, 2.3…) y cada
// concepto el suyo (1.1.01, 2.3.02…), que se arma con el lugar que ocupa en la lista.
// "otro" es el concepto donde caen los gastos o ingresos que no calzan en ningún otro.
export const PLAN_INGRESOS = [
  { codigo: "1.1", nombre: "Venta de hacienda", conceptos: [
    "Venta de terneros", "Venta de terneras", "Venta de novillos", "Venta de vaquillonas",
    "Venta de vacas", "Venta de vacas de descarte", "Venta de toros", "Venta de vientres",
    "Venta de hacienda (general)"] },
  { codigo: "1.2", nombre: "Agricultura", conceptos: ["Venta de granos / cosecha"] },
  { codigo: "1.3", nombre: "Rentas y servicios", conceptos: [
    "Arrendamiento de campo", "Pastaje / Pastoreo", "Servicios agrícolas prestados"] },
  { codigo: "1.4", nombre: "Otros ingresos", conceptos: ["Subsidios", "Otro"], otro: "Otro" },
];

export const PLAN_EGRESOS = [
  { codigo: "2.1", nombre: "Sanidad", conceptos: ["Vacunación", "Desparasitación / Curación", "Sanidad (otro)"], otro: "Sanidad (otro)" },
  { codigo: "2.2", nombre: "Alimentación", conceptos: ["Suplemento / Alimento balanceado", "Forraje / Rollos / Silo"] },
  { codigo: "2.3", nombre: "Combustible", conceptos: ["Nafta", "Gasoil", "Aceite / Lubricantes"] },
  { codigo: "2.4", nombre: "Mano de obra", conceptos: ["Sueldo / Jornal", "Changa / Contratista"] },
  { codigo: "2.5", nombre: "Insumos", conceptos: ["Alambre / Postes / Tranqueras", "Herramientas", "Semillas", "Agroquímicos"] },
  { codigo: "2.6", nombre: "Impuestos", conceptos: ["Impuesto inmobiliario", "Impuesto a las ganancias", "Otro impuesto"], otro: "Otro impuesto" },
  { codigo: "2.7", nombre: "Mantenimiento", conceptos: [
    "Reparación de maquinaria", "Reparación de instalaciones", "Mantenimiento de casas", "Service de vehículo"] },
  { codigo: "2.8", nombre: "Otros", conceptos: ["Honorarios (veterinario, ingeniero, contador)", "Seguro", "Otro"], otro: "Otro" },
];

export const planDe = (tipo) => (tipo === "I" ? PLAN_INGRESOS : PLAN_EGRESOS);

// Listas planas que ya usaban otras pantallas (Presupuesto, Dashboard…)
export const CATEGORIAS_EGRESO = PLAN_EGRESOS.map((r) => r.nombre);
export const CONCEPTOS_INGRESO = PLAN_INGRESOS.flatMap((r) => r.conceptos);
export const CONCEPTOS_EGRESO = PLAN_EGRESOS.flatMap((r) => r.conceptos);

// Código de un concepto dentro de su rubro: 1.1 + lugar 3 → "1.1.03"
export const codigoConcepto = (rubro, i) => rubro.codigo + "." + String(i + 1).padStart(2, "0");

// A qué rubro y concepto del plan corresponde un movimiento guardado.
//  - rubro: el que se eligió al cargarlo (campo "categoria"); si es un dato viejo sin rubro,
//    se busca por el concepto; si tampoco se encuentra, va a "Otros ingresos" / "Otros".
//  - concepto: el de la lista; si fue escrito a mano o no pertenece a ese rubro, cae en el
//    concepto "otro" del rubro (o en "Otros conceptos", código R.99, si el rubro no tiene).
export function ubicarEnPlan(tipo, rec) {
  const plan = planDe(tipo);
  let rubro = plan.find((r) => r.nombre === rec.categoria)
    || plan.find((r) => r.conceptos.includes(rec.concepto))
    || plan[plan.length - 1];
  const i = rubro.conceptos.indexOf(rec.concepto);
  if (i >= 0) return { rubro, codigo: codigoConcepto(rubro, i), concepto: rec.concepto };
  if (rubro.otro) {
    const j = rubro.conceptos.indexOf(rubro.otro);
    return { rubro, codigo: codigoConcepto(rubro, j), concepto: rubro.otro };
  }
  return { rubro, codigo: rubro.codigo + ".99", concepto: "Otros conceptos" };
}

export function fmtMoney(n, moneda) {
  const num = Number(n) || 0;
  const abs = Math.abs(num).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const sign = num < 0 ? "-" : "";
  return moneda === "USD" ? `${sign}USD ${abs}` : `${sign}$ ${abs}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function monthLabel(y, m) {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${meses[m]}-${String(y).slice(2)}`;
}

export function years(from, to) {
  const arr = [];
  for (let y = from; y <= to; y++) arr.push(y);
  return arr;
}

export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

// Campo "select + Otro (especificar)": un desplegable con lista fija más una
// opción "Otro" que revela un input de texto libre. id-otro es el input extra.
export function fieldSelectOtro(label, id, options) {
  const wrap = el("div", { class: "field" });
  wrap.appendChild(el("label", { for: id }, label));
  const select = el("select", {
    id,
    onchange: (e) => {
      const otroInput = document.getElementById(id + "-otro");
      if (otroInput) otroInput.style.display = e.target.value === "Otro" ? "block" : "none";
    },
  });
  options.forEach((o) => select.appendChild(el("option", { value: o }, o)));
  wrap.appendChild(select);
  wrap.appendChild(el("input", {
    type: "text", id: id + "-otro", placeholder: "Especificar...",
    style: "display:none; margin-top:6px",
  }));
  return wrap;
}

export function getSelectOtroValue(id) {
  const select = document.getElementById(id);
  if (!select) return "";
  if (select.value === "Otro") {
    const otro = document.getElementById(id + "-otro");
    return (otro && otro.value.trim()) || "Otro";
  }
  return select.value;
}

// Cambia las opciones de un fieldSelectOtro (cuando se elige otro rubro): queda elegida la
// primera y se esconde el texto libre.
export function cargarOpcionesSelectOtro(id, options) {
  const select = document.getElementById(id);
  const otroInput = document.getElementById(id + "-otro");
  if (!select) return;
  select.innerHTML = "";
  options.forEach((o) => select.appendChild(el("option", { value: o }, o)));
  if (otroInput) { otroInput.style.display = "none"; otroInput.value = ""; }
}

// Completa un fieldSelectOtro con un valor guardado: si coincide con una
// opción de la lista la selecciona, si no cae en "Otro" y llena el texto libre.
// Si la lista no tiene "Otro" (rubro sin esa opción), el valor viejo se agrega como
// opción para no perderlo al editar.
export function setSelectOtroValue(id, value, options) {
  const select = document.getElementById(id);
  const otroInput = document.getElementById(id + "-otro");
  if (!select) return;
  if (options.includes(value)) {
    select.value = value;
    if (otroInput) otroInput.style.display = "none";
  } else if (value && options.includes("Otro")) {
    select.value = "Otro";
    if (otroInput) {
      otroInput.style.display = "block";
      otroInput.value = value;
    }
  } else if (value) {
    select.appendChild(el("option", { value }, value));
    select.value = value;
    if (otroInput) otroInput.style.display = "none";
  } else {
    select.value = options[0];
    if (otroInput) otroInput.style.display = "none";
  }
}

// Par "Categoría (rubro)" + "Concepto (subrubro)": al elegir el rubro, el concepto
// muestra solo los de ese rubro. Devuelve los dos campos para meter en el formulario.
export function fieldsRubroConcepto(plan, idRubro, idConcepto) {
  const fRubro = el("div", { class: "field" });
  fRubro.appendChild(el("label", { for: idRubro }, "Categoría (rubro)"));
  const selRubro = el("select", { id: idRubro });
  plan.forEach((r) => selRubro.appendChild(el("option", { value: r.nombre }, r.nombre)));
  fRubro.appendChild(selRubro);
  const fConcepto = fieldSelectOtro("Concepto (subrubro)", idConcepto, plan[0].conceptos);
  selRubro.addEventListener("change", () => {
    const r = plan.find((x) => x.nombre === selRubro.value) || plan[0];
    cargarOpcionesSelectOtro(idConcepto, r.conceptos);
  });
  return [fRubro, fConcepto];
}

// Elige el rubro y deja el concepto en su lista (para editar o limpiar el formulario).
export function setRubroConcepto(plan, idRubro, idConcepto, rubroNombre, concepto) {
  const r = plan.find((x) => x.nombre === rubroNombre)
    || plan.find((x) => x.conceptos.includes(concepto))
    || plan[0];
  document.getElementById(idRubro).value = r.nombre;
  cargarOpcionesSelectOtro(idConcepto, r.conceptos);
  setSelectOtroValue(idConcepto, concepto || "", r.conceptos);
}

let toastTimer = null;
export function toast(msg, isErr = false) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), 2600);
}

export function confirmar(msg) {
  return window.confirm(msg);
}

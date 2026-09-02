import { addDocTo, updateDocIn, deleteDocFrom, listenTo } from "./db.js";
import { fmtDate, todayISO, el, toast, confirmar } from "./utils.js";
import { getUsuarioActual, usuarioBadge } from "./usuario.js";

const COL = "recordatorios";
let items = [];
let editingId = null;
let unsub = null;
let notifyTimer = null;
let notifiedIds = new Set();
let viewYear, viewMonth;
let selectedDate = todayISO();

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function renderCalendario(container) {
  container.innerHTML = "";
  const hoy = new Date();
  viewYear = hoy.getFullYear();
  viewMonth = hoy.getMonth();
  selectedDate = todayISO();

  container.appendChild(el("div", { class: "page-head" }, [el("h1", {}, "Calendario")]));

  container.appendChild(
    el("div", { class: "panel" }, [
      el("div", { id: "cal-notif-row", style: "margin-bottom:10px" }),
      el("div", { id: "cal-grid-wrap" }),
    ])
  );

  container.appendChild(
    el("div", { class: "panel" }, [el("h2", {}, "Nuevo recordatorio"), buildForm()])
  );

  container.appendChild(
    el("div", { class: "panel" }, [
      el("h2", {}, "Próximos recordatorios"),
      el("div", { class: "table-wrap", id: "cal-lista-wrap" }),
    ])
  );

  renderNotifRow();
  renderGrid();

  if (unsub) unsub();
  unsub = listenTo(COL, (data) => {
    items = data.sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
    renderGrid();
    renderLista();
  });

  startNotifyLoop();
}

export function unmountCalendario() {
  if (unsub) unsub();
  stopNotifyLoop();
}

function fieldInput(label, type, id, value) {
  const wrap = el("div", { class: "field" });
  wrap.appendChild(el("label", { for: id }, label));
  wrap.appendChild(el("input", { type, id, value }));
  return wrap;
}

function buildForm() {
  const form = el("form", { class: "entry-form", id: "cal-form" });
  const fTitulo = fieldInput("Título", "text", "cal-titulo", "");
  const fFecha = fieldInput("Fecha", "date", "cal-fecha", selectedDate);
  const fHora = fieldInput("Hora (opcional)", "time", "cal-hora", "");
  const fNotas = fieldInput("Notas", "text", "cal-notas", "");
  fNotas.style.gridColumn = "1/-1";

  const fAvisar = el("div", { class: "field", style: "grid-column:1/-1" }, [
    el("label", { style: "display:flex; align-items:center; gap:6px; font-weight:400" }, [
      el("input", { type: "checkbox", id: "cal-avisar", checked: "checked" }),
      "Avisarme con notificación mientras tenga la app abierta",
    ]),
  ]);

  const btnRow = el("div", { class: "field" }, [
    el("label", {}, "\u00A0"),
    el("button", { class: "btn btn-primary", type: "submit", id: "cal-submit-btn" }, "Guardar"),
  ]);

  [fTitulo, fFecha, fHora, fNotas, fAvisar, btnRow].forEach((f) => form.appendChild(f));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      titulo: document.getElementById("cal-titulo").value.trim(),
      fecha: document.getElementById("cal-fecha").value,
      hora: document.getElementById("cal-hora").value,
      notas: document.getElementById("cal-notas").value.trim(),
      avisar: document.getElementById("cal-avisar").checked,
      usuario: getUsuarioActual(),
    };
    if (!data.titulo || !data.fecha) {
      toast("Completá al menos título y fecha", true);
      return;
    }
    try {
      if (editingId) {
        await updateDocIn(COL, editingId, data);
        toast("Recordatorio actualizado");
        editingId = null;
        document.getElementById("cal-submit-btn").textContent = "Guardar";
      } else {
        await addDocTo(COL, data);
        toast("Recordatorio guardado");
      }
      form.reset();
      document.getElementById("cal-fecha").value = selectedDate;
      document.getElementById("cal-avisar").checked = true;
    } catch (err) {
      toast("No se pudo guardar: " + err.message, true);
    }
  });

  return form;
}

function renderNotifRow() {
  const wrap = document.getElementById("cal-notif-row");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (!("Notification" in window)) {
    wrap.appendChild(el("div", { class: "sub" }, "Este navegador no soporta notificaciones; los recordatorios igual se ven acá cuando abrís la app."));
    return;
  }
  if (Notification.permission === "granted") {
    wrap.appendChild(el("div", { class: "sub" }, "Notificaciones activadas ✓ (avisan mientras tengas la app abierta)."));
    return;
  }
  if (Notification.permission === "denied") {
    wrap.appendChild(el("div", { class: "sub" }, "Notificaciones bloqueadas en este navegador. Los recordatorios igual se ven acá abajo."));
    return;
  }
  const btn = el("button", { class: "btn btn-ghost btn-sm", type: "button" }, "🔔 Activar notificaciones");
  btn.addEventListener("click", async () => {
    const perm = await Notification.requestPermission();
    renderNotifRow();
    if (perm === "granted") toast("Notificaciones activadas");
  });
  wrap.appendChild(btn);
  wrap.appendChild(el("div", { class: "sub", style: "margin-top:4px" },
    "Avisan solo mientras tengas esta app abierta (no con el celular bloqueado o la app cerrada)."));
}

function renderGrid() {
  const wrap = document.getElementById("cal-grid-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const header = el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px" });
  const prevBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button" }, "←");
  prevBtn.addEventListener("click", () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderGrid();
  });
  const nextBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button" }, "→");
  nextBtn.addEventListener("click", () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderGrid();
  });
  header.appendChild(prevBtn);
  header.appendChild(el("strong", {}, `${MESES[viewMonth]} ${viewYear}`));
  header.appendChild(nextBtn);
  wrap.appendChild(header);

  const grid = el("div", { style: "display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center" });
  DIAS.forEach((d) => grid.appendChild(el("div", { style: "font-weight:700; font-size:12px; opacity:0.7; padding:4px 0" }, d)));

  const first = new Date(viewYear, viewMonth, 1);
  let startOffset = first.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) grid.appendChild(el("div", {}));

  const hoyISO = todayISO();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const delDia = items.filter((it) => it.fecha === iso);
    const esHoy = iso === hoyISO;
    const cellStyle = "padding:6px 2px; border-radius:8px; cursor:pointer; font-size:13px;" +
      (esHoy ? " background:#2C4835; color:#F3EBD9; font-weight:700;" : delDia.length ? " background:#F2F0E7;" : "");
    const cell = el("div", { style: cellStyle }, [
      el("div", {}, String(d)),
      delDia.length ? el("div", { style: "font-size:10px; margin-top:2px" }, "●".repeat(Math.min(delDia.length, 3))) : null,
    ]);
    cell.addEventListener("click", () => {
      selectedDate = iso;
      const fFecha = document.getElementById("cal-fecha");
      if (fFecha) fFecha.value = iso;
      const titulo = document.getElementById("cal-titulo");
      if (titulo) titulo.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
}

function renderLista() {
  const wrap = document.getElementById("cal-lista-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";
  if (items.length === 0) {
    wrap.appendChild(el("div", { class: "empty-state" }, [el("p", {}, "Todavía no cargaste ningún recordatorio.")]));
    return;
  }
  const hoyISO = todayISO();
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, el("tr", {}, [
    el("th", {}, "Fecha"), el("th", {}, "Hora"), el("th", {}, "Título"), el("th", {}, "Notas"), el("th", {}, "Usuario"), el("th", {}, ""),
  ])));
  const tbody = el("tbody");
  items.forEach((it) => {
    const vencido = it.fecha < hoyISO;
    const esHoy = it.fecha === hoyISO;
    const rowStyle = vencido ? "background:#FBEAEA" : esHoy ? "background:#FFF6D9" : "";
    tbody.appendChild(el("tr", { style: rowStyle }, [
      el("td", {}, fmtDate(it.fecha)),
      el("td", {}, it.hora || ""),
      el("td", {}, it.titulo || ""),
      el("td", {}, it.notas || ""),
      el("td", {}, usuarioBadge(it.usuario)),
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
    if (!confirmar("¿Borrar este recordatorio?")) return;
    try {
      await deleteDocFrom(COL, it.id);
      toast("Recordatorio borrado");
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
  document.getElementById("cal-titulo").value = it.titulo || "";
  document.getElementById("cal-fecha").value = it.fecha || "";
  document.getElementById("cal-hora").value = it.hora || "";
  document.getElementById("cal-notas").value = it.notas || "";
  document.getElementById("cal-avisar").checked = it.avisar !== false;
  document.getElementById("cal-submit-btn").textContent = "Guardar cambios";
  document.getElementById("cal-titulo").scrollIntoView({ behavior: "smooth", block: "center" });
}

function startNotifyLoop() {
  stopNotifyLoop();
  checkDue();
  notifyTimer = setInterval(checkDue, 30000);
}

function stopNotifyLoop() {
  if (notifyTimer) clearInterval(notifyTimer);
  notifyTimer = null;
}

function checkDue() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hoyISO = todayISO();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  items.forEach((it) => {
    if (!it.avisar || !it.id) return;
    if (notifiedIds.has(it.id)) return;
    const esHoy = it.fecha === hoyISO;
    const horaOk = !it.hora || it.hora <= hhmm;
    if (esHoy && horaOk) {
      try {
        new Notification(it.titulo || "Recordatorio", { body: it.notas || "" });
      } catch {
        // algunos navegadores requieren interacción previa; el recordatorio igual queda visible en la lista
      }
      notifiedIds.add(it.id);
    }
  });
}

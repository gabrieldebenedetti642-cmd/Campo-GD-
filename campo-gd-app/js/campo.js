// Selector de campo: al entrar se elige con cuál campo (o negocio) se va a trabajar.
// Cada campo tiene sus propios datos (ingresos, egresos, hacienda, lluvias, etc.),
// separados de los de los otros campos. La lista de campos es compartida por todos
// (se guarda en la base), así que un campo agregado desde un aparato aparece en los demás.
//
// El primer campo ("Campo GD" por defecto, id vacío) usa los datos que ya estaban
// cargados antes de que existiera este selector, así no se pierde nada.
import { el } from "./utils.js";
import { listenSetting, setSetting, setCampoActivo } from "./db.js";

const SS_SESION = "campogd_campo_sesion";   // campo elegido en esta sesión (se pregunta de nuevo al reabrir)
const LS_ULTIMO = "campogd_campo_ultimo";   // último campo usado en este aparato (para marcarlo)
const LS_CACHE = "campogd_campos_cache";    // última lista conocida, por si no hay señal
const CAMPO_INICIAL = { id: "", nombre: "Campo GD" };

function leer(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}
function guardar(storage, key, val) {
  try { storage.setItem(key, JSON.stringify(val)); } catch { /* sin almacenamiento: no pasa nada */ }
}

export function getCampoActual() {
  return leer(sessionStorage, SS_SESION);
}

function listaValida(v) {
  return Array.isArray(v) && v.length > 0 && v.every((c) => c && typeof c.nombre === "string" && typeof c.id === "string");
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// Si ya se eligió campo en esta sesión entra directo; si no, muestra la pantalla de elección.
export function ensureCampo(onReady) {
  const actual = getCampoActual();
  if (actual && typeof actual.id === "string") {
    setCampoActivo(actual.id);
    onReady(actual);
    return;
  }

  let lista = leer(localStorage, LS_CACHE);
  if (!listaValida(lista)) lista = [CAMPO_INICIAL];
  const ultimoId = (leer(localStorage, LS_ULTIMO) || {}).id;
  let cargado = false;

  const overlay = el("div", { class: "user-gate" });
  const listaEl = el("div", { class: "campo-lista" });
  const estadoEl = el("p", { class: "sub campo-estado" }, "Buscando tus campos…");
  const nuevoInput = el("input", { type: "text", id: "campo-nuevo-input", placeholder: "Nombre del campo nuevo" });
  const agregarBtn = el("button", { class: "btn btn-ghost", type: "button", id: "campo-agregar-btn", style: "margin-top:8px; width:100%" }, "+ Agregar campo");
  const box = el("div", { class: "user-gate-box", style: "max-width:380px" }, [
    el("div", { class: "tag-mark", style: "margin:0 auto 14px" }, el("span", {}, "GD")),
    el("h2", {}, "¿Qué campo vas a manejar?"),
    el("p", { class: "sub" }, "Cada campo tiene sus propios números. Elegí uno para entrar."),
    listaEl,
    estadoEl,
    el("div", { class: "campo-nuevo" }, [nuevoInput, agregarBtn]),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let dejarDeEscuchar = () => {};

  function entrar(campo) {
    guardar(sessionStorage, SS_SESION, campo);
    guardar(localStorage, LS_ULTIMO, campo);
    dejarDeEscuchar();
    setCampoActivo(campo.id);
    overlay.remove();
    onReady(campo);
  }

  function renderLista() {
    listaEl.innerHTML = "";
    lista.forEach((c) => {
      const entrarBtn = el("button", {
        class: "campo-opcion" + (c.id === ultimoId ? " ultimo" : ""),
        type: "button",
        "data-campo-id": c.id,
      }, [
        el("span", { class: "campo-nombre" }, c.nombre),
        c.id === ultimoId ? el("span", { class: "campo-ultimo" }, "último usado") : null,
      ]);
      entrarBtn.addEventListener("click", () => entrar(c));
      const renBtn = el("button", { class: "campo-renombrar", type: "button", title: "Cambiar el nombre", "data-renombrar": c.id }, "renombrar");
      renBtn.addEventListener("click", () => renombrar(c));
      listaEl.appendChild(el("div", { class: "campo-fila" }, [entrarBtn, renBtn]));
    });
  }

  async function guardarLista(nueva) {
    lista = nueva;
    guardar(localStorage, LS_CACHE, lista);
    renderLista();
    try {
      await setSetting("campos", lista);
    } catch (err) {
      estadoEl.textContent = "No se pudo guardar la lista de campos: " + err.message;
    }
  }

  function renombrar(c) {
    const nombre = (window.prompt("Nuevo nombre para este campo:", c.nombre) || "").trim();
    if (!nombre || nombre === c.nombre) return;
    if (lista.some((x) => x.id !== c.id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
      estadoEl.textContent = "Ya hay un campo con ese nombre.";
      return;
    }
    guardarLista(lista.map((x) => (x.id === c.id ? { ...x, nombre } : x)));
  }

  async function agregar() {
    const nombre = nuevoInput.value.trim();
    if (!nombre) { nuevoInput.focus(); return; }
    if (lista.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) {
      estadoEl.textContent = "Ya hay un campo con ese nombre.";
      return;
    }
    const campo = { id: nuevoId(), nombre };
    // se guarda la lista completa (incluido el primer campo) y se entra al nuevo
    await guardarLista([...lista, campo]);
    entrar(campo);
  }
  agregarBtn.addEventListener("click", agregar);
  nuevoInput.addEventListener("keydown", (e) => { if (e.key === "Enter") agregar(); });

  renderLista();

  // Trae la lista compartida (puede haber campos agregados desde otro aparato).
  dejarDeEscuchar = listenSetting("campos", (v) => {
    cargado = true;
    if (listaValida(v)) {
      lista = v;
      guardar(localStorage, LS_CACHE, lista);
      renderLista();
    }
    estadoEl.textContent = "";
  });
  setTimeout(() => {
    if (!cargado) estadoEl.textContent = "Sin conexión por ahora: se muestran los campos que se conocen en este aparato.";
  }, 9000);
}

// En la barra de arriba: "Campo: La Estancia · cambiar". Al cambiar se vuelve a la pantalla de elección.
export function buildCampoPill(container) {
  const campo = getCampoActual() || CAMPO_INICIAL;
  container.innerHTML = "";
  container.appendChild(el("span", { class: "campo-pill-label" }, "Campo: "));
  container.appendChild(el("strong", { class: "campo-pill-name", id: "campo-pill-name" }, campo.nombre));
  const cambiar = el("button", { class: "user-pill-change", type: "button", id: "campo-cambiar-btn", style: "margin-left:6px" }, "cambiar");
  cambiar.addEventListener("click", () => {
    try { sessionStorage.removeItem(SS_SESION); } catch { /* nada */ }
    window.location.hash = "";
    window.location.reload();
  });
  container.appendChild(cambiar);
}

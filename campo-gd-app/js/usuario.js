// Identificación simple de usuario: no es login con contraseña, es "decime tu
// nombre" una vez por aparato, así sabemos quién cargó cada dato. El color se
// calcula a partir del nombre (mismo nombre = mismo color en cualquier
// aparato, sin necesidad de sincronizar nada).
import { el } from "./utils.js";

const LS_KEY = "campogd_usuario";
const PALETTE = [
  "#1B5E20", "#0D47A1", "#B71C1C", "#E65100",
  "#4A148C", "#00695C", "#795548", "#37474F",
];

export function getUsuarioActual() {
  return (localStorage.getItem(LS_KEY) || "").trim();
}

export function setUsuarioActual(nombre) {
  localStorage.setItem(LS_KEY, nombre.trim());
}

export function colorParaUsuario(nombre) {
  if (!nombre) return "#9E9E9E";
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// Insignia coloreada para usar en las tablas (columna "Usuario").
export function usuarioBadge(nombre) {
  if (!nombre) return el("span", { class: "user-badge", style: "background:#9E9E9E" }, "—");
  return el("span", { class: "user-badge", style: `background:${colorParaUsuario(nombre)}` }, nombre);
}

// Bloquea el uso de la app hasta que el aparato tenga un nombre guardado.
// onReady(nombre) se llama apenas hay uno (guardado antes, o recién elegido).
export function ensureUsuario(onReady) {
  const actual = getUsuarioActual();
  if (actual) {
    onReady(actual);
    return;
  }
  const overlay = el("div", { class: "user-gate" });
  const box = el("div", { class: "user-gate-box" }, [
    el("div", { class: "tag-mark", style: "margin:0 auto 14px" }, el("span", {}, "GD")),
    el("h2", {}, "¿Quién sos?"),
    el("p", { class: "sub" }, "Escribí tu nombre — lo vamos a mostrar en cada dato que cargues desde este aparato."),
    el("input", { type: "text", id: "user-gate-input", placeholder: "Tu nombre" }),
    el("button", { class: "btn btn-primary", type: "button", id: "user-gate-btn", style: "margin-top:12px; width:100%" }, "Empezar"),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const submit = () => {
    const val = document.getElementById("user-gate-input").value.trim();
    if (!val) return;
    setUsuarioActual(val);
    overlay.remove();
    onReady(val);
  };
  document.getElementById("user-gate-btn").addEventListener("click", submit);
  document.getElementById("user-gate-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  document.getElementById("user-gate-input").focus();
}

// Pill "Estás como: Fulano (cambiar)" para mostrar en la barra de arriba.
export function buildUsuarioPill(onChange) {
  const pill = el("div", { class: "user-pill", id: "user-pill" });
  function render() {
    const nombre = getUsuarioActual();
    pill.innerHTML = "";
    pill.appendChild(usuarioBadge(nombre));
    const changeBtn = el("button", { class: "user-pill-change", type: "button" }, "cambiar");
    changeBtn.addEventListener("click", () => {
      localStorage.removeItem(LS_KEY);
      ensureUsuario((nombre2) => {
        render();
        if (onChange) onChange(nombre2);
      });
    });
    pill.appendChild(changeBtn);
  }
  render();
  return pill;
}

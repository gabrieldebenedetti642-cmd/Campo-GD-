import { renderDashboard, unmountDashboard } from "./dashboard.js";
import { renderIngresos, unmountIngresos } from "./ingresos.js";
import { renderEgresos, unmountEgresos } from "./egresos.js";
import { renderPesadas, unmountPesadas } from "./pesadas.js";
import { renderExistencias, unmountExistencias } from "./existencias.js";
import { renderLluvias, unmountLluvias } from "./lluvias.js";
import { renderLabores, unmountLabores } from "./labores.js";
import { renderLotes, unmountLotes } from "./lotes.js";
import { renderApuntes, unmountApuntes } from "./apuntes.js";
import { renderFlujoCaja, unmountFlujoCaja } from "./flujocaja.js";
import { renderPresupuesto, unmountPresupuesto } from "./presupuesto.js";
import { renderEscenarios, unmountEscenarios } from "./escenarios.js";
import { modoLocal } from "./db.js";
import { ensureUsuario, buildUsuarioPill } from "./usuario.js";

const views = {
  dashboard: { render: renderDashboard, unmount: unmountDashboard, label: "Dashboard" },
  ingresos: { render: renderIngresos, unmount: unmountIngresos, label: "Ingresos" },
  egresos: { render: renderEgresos, unmount: unmountEgresos, label: "Egresos" },
  flujocaja: { render: renderFlujoCaja, unmount: unmountFlujoCaja, label: "Flujo de Caja" },
  presupuesto: { render: renderPresupuesto, unmount: unmountPresupuesto, label: "Presupuesto" },
  escenarios: { render: renderEscenarios, unmount: unmountEscenarios, label: "Escenarios" },
  pesadas: { render: renderPesadas, unmount: unmountPesadas, label: "Pesadas" },
  existencias: { render: renderExistencias, unmount: unmountExistencias, label: "Existencias" },
  lotes: { render: renderLotes, unmount: unmountLotes, label: "Lotes de Ganado" },
  lluvias: { render: renderLluvias, unmount: unmountLluvias, label: "Lluvias" },
  labores: { render: renderLabores, unmount: unmountLabores, label: "Labores" },
  apuntes: { render: renderApuntes, unmount: unmountApuntes, label: "Apuntes" },
};

const GRUPOS_NAV = [
  { label: "", keys: ["dashboard"] },
  { label: "Contabilidad", keys: ["ingresos", "egresos", "flujocaja", "presupuesto", "escenarios"] },
  { label: "Hacienda y campo", keys: ["pesadas", "existencias", "lotes"] },
  { label: "Campo", keys: ["lluvias", "labores", "apuntes"] },
];

let current = null;

function switchTo(name) {
  if (current && views[current]) views[current].unmount && views[current].unmount();
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  const container = document.getElementById("view-container");
  views[name].render(container);
  current = name;
  window.location.hash = name;
}

function initTabs() {
  const navEl = document.getElementById("nav-groups");
  GRUPOS_NAV.forEach((grupo) => {
    const groupEl = document.createElement("div");
    groupEl.className = "nav-group";
    if (grupo.label) {
      const labelEl = document.createElement("span");
      labelEl.className = "nav-group-label";
      labelEl.textContent = grupo.label;
      groupEl.appendChild(labelEl);
    }
    grupo.keys.forEach((key) => {
      const v = views[key];
      const btn = document.createElement("button");
      btn.className = "tab-btn";
      btn.dataset.view = key;
      btn.textContent = v.label;
      btn.addEventListener("click", () => switchTo(key));
      groupEl.appendChild(btn);
    });
    navEl.appendChild(groupEl);
  });
}

function initSyncPill() {
  const pill = document.getElementById("sync-pill");
  const dot = pill.querySelector(".sync-dot");
  const label = pill.querySelector(".sync-label");
  if (modoLocal) {
    dot.classList.add("off");
    label.textContent = "Modo local (este aparato)";
  } else {
    label.textContent = "Sincronizado";
  }
}

function initUsuarioPill() {
  const syncPill = document.getElementById("sync-pill");
  const rightWrap = document.createElement("div");
  rightWrap.className = "topbar-right";
  rightWrap.style.marginLeft = "auto";
  syncPill.parentElement.insertBefore(rightWrap, syncPill);
  syncPill.style.marginLeft = "0";
  rightWrap.appendChild(buildUsuarioPill());
  rightWrap.appendChild(syncPill);
}

document.addEventListener("DOMContentLoaded", () => {
  ensureUsuario(() => {
    initTabs();
    initSyncPill();
    initUsuarioPill();
    const startView = (window.location.hash || "#dashboard").slice(1);
    switchTo(views[startView] ? startView : "dashboard");
  });
});

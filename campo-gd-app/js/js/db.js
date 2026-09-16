import { firebaseConfig, FIREBASE_CONFIGURADO } from "./firebase-config.js";

export const modoLocal = !FIREBASE_CONFIGURADO;

let db = null;
let fs = null; // funciones de firestore, cargadas dinámicamente solo si hace falta
let initPromise = null;

function initFirestore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
    fs = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    const app = initializeApp(firebaseConfig);
    db = fs.getFirestore(app);
  })();
  return initPromise;
}

// Arranca la conexión en segundo plano apenas carga el archivo, SIN bloquear
// nada (la app tiene que poder mostrarse aunque no haya señal en el campo).
if (!modoLocal) {
  initFirestore().catch((e) => {
    console.error("No se pudo conectar a Firebase, sigo en modo local:", e);
  });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Espera hasta `ms` a que Firestore esté listo. Si tarda más (sin señal, etc.)
// devuelve false y quien llama sigue con el respaldo local — nunca se cuelga.
async function firestoreListo(ms = 8000) {
  if (modoLocal) return false;
  try {
    await withTimeout(initFirestore(), ms);
    return !!db;
  } catch {
    return false;
  }
}

// Para la pastilla de estado en la barra de arriba: no bloquea la carga de
// la app, se puede llamar aparte y actualizar la UI cuando responda.
export async function estaConectado() {
  return firestoreListo(6000);
}

// ------------------------------------------------------------
// Modo local (localStorage) — mismo formato/API que la versión Firestore
// ------------------------------------------------------------
function localGetAll(coleccion) {
  try {
    return JSON.parse(localStorage.getItem("campogd_" + coleccion) || "[]");
  } catch {
    return [];
  }
}
function localSaveAll(coleccion, items) {
  localStorage.setItem("campogd_" + coleccion, JSON.stringify(items));
}
function uid() {
  return "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const listenersLocal = {}; // coleccion -> [callbacks]
function notifyLocal(coleccion) {
  (listenersLocal[coleccion] || []).forEach((cb) => cb(localGetAll(coleccion)));
}

function localAdd(coleccion, data) {
  const items = localGetAll(coleccion);
  const item = { id: uid(), ...data };
  items.push(item);
  localSaveAll(coleccion, items);
  notifyLocal(coleccion);
  return item.id;
}
function localUpdate(coleccion, id, data) {
  const items = localGetAll(coleccion);
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) items[idx] = { ...items[idx], ...data };
  localSaveAll(coleccion, items);
  notifyLocal(coleccion);
}
function localDelete(coleccion, id) {
  const items = localGetAll(coleccion).filter((i) => i.id !== id);
  localSaveAll(coleccion, items);
  notifyLocal(coleccion);
}
function localListen(coleccion, callback) {
  listenersLocal[coleccion] = listenersLocal[coleccion] || [];
  listenersLocal[coleccion].push(callback);
  callback(localGetAll(coleccion));
  return () => {
    listenersLocal[coleccion] = listenersLocal[coleccion].filter((c) => c !== callback);
  };
}

// ------------------------------------------------------------
// API pública: funciona igual esté en modo local o con Firestore.
// Nunca se cuelga: si Firestore no contesta rápido, usa el respaldo local.
// ------------------------------------------------------------
export async function addDocTo(coleccion, data) {
  if (await firestoreListo()) {
    return fs.addDoc(fs.collection(db, coleccion), data).then((ref) => ref.id);
  }
  return localAdd(coleccion, data);
}

export async function updateDocIn(coleccion, id, data) {
  if (await firestoreListo()) {
    return fs.updateDoc(fs.doc(db, coleccion, id), data);
  }
  return localUpdate(coleccion, id, data);
}

export async function deleteDocFrom(coleccion, id) {
  if (await firestoreListo()) {
    return fs.deleteDoc(fs.doc(db, coleccion, id));
  }
  return localDelete(coleccion, id);
}

// callback recibe un array de {id, ...campos}. Devuelve una función para
// dejar de escuchar (unsubscribe), disponible de inmediato aunque la
// conexión a Firestore todavía se esté resolviendo.
export function listenTo(coleccion, callback) {
  if (modoLocal) return localListen(coleccion, callback);

  let cancelado = false;
  let unsub = null;
  firestoreListo().then((listo) => {
    if (cancelado) return;
    if (listo) {
      const q = fs.query(fs.collection(db, coleccion));
      unsub = fs.onSnapshot(
        q,
        (snap) => {
          const items = [];
          snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
          callback(items);
        },
        (err) => {
          console.error("Error escuchando " + coleccion + ":", err);
          callback([], err);
        }
      );
    } else {
      unsub = localListen(coleccion, callback);
    }
  });
  return () => {
    cancelado = true;
    if (unsub) unsub();
  };
}

// settings: documento único por clave (ej. cotización dólar)
export async function setSetting(key, value) {
  if (await firestoreListo()) {
    return fs.setDoc(fs.doc(db, "settings", key), { value }, { merge: true });
  }
  const settings = JSON.parse(localStorage.getItem("campogd_settings") || "{}");
  settings[key] = value;
  localStorage.setItem("campogd_settings", JSON.stringify(settings));
  notifyLocal("settings");
}

export function listenSetting(key, callback) {
  if (modoLocal) return listenSettingLocal(key, callback);

  let cancelado = false;
  let unsub = null;
  firestoreListo().then((listo) => {
    if (cancelado) return;
    if (listo) {
      unsub = fs.onSnapshot(fs.doc(db, "settings", key), (d) => {
        callback(d.exists() ? d.data().value : undefined);
      });
    } else {
      unsub = listenSettingLocal(key, callback);
    }
  });
  return () => {
    cancelado = true;
    if (unsub) unsub();
  };
}

function listenSettingLocal(key, callback) {
  const read = () => {
    const settings = JSON.parse(localStorage.getItem("campogd_settings") || "{}");
    callback(settings[key]);
  };
  listenersLocal["settings"] = listenersLocal["settings"] || [];
  listenersLocal["settings"].push(read);
  read();
  return () => {
    listenersLocal["settings"] = listenersLocal["settings"].filter((c) => c !== read);
  };
}

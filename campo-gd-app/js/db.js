import { firebaseConfig, FIREBASE_CONFIGURADO } from "./firebase-config.js";

export const modoLocal = !FIREBASE_CONFIGURADO;

let db = null;
let fs = null; // funciones de firestore, cargadas dinámicamente solo si hace falta

async function initFirestore() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js");
  fs = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
  const app = initializeApp(firebaseConfig);
  db = fs.getFirestore(app);
}

if (!modoLocal) {
  try {
    await initFirestore();
  } catch (e) {
    console.error("No se pudo conectar a Firebase, sigo en modo local:", e);
  }
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
// API pública: funciona igual esté en modo local o con Firestore
// ------------------------------------------------------------
export function addDocTo(coleccion, data) {
  if (modoLocal || !db) return Promise.resolve(localAdd(coleccion, data));
  return fs.addDoc(fs.collection(db, coleccion), data).then((ref) => ref.id);
}

export function updateDocIn(coleccion, id, data) {
  if (modoLocal || !db) return Promise.resolve(localUpdate(coleccion, id, data));
  return fs.updateDoc(fs.doc(db, coleccion, id), data);
}

export function deleteDocFrom(coleccion, id) {
  if (modoLocal || !db) return Promise.resolve(localDelete(coleccion, id));
  return fs.deleteDoc(fs.doc(db, coleccion, id));
}

// callback recibe un array de {id, ...campos}
export function listenTo(coleccion, callback) {
  if (modoLocal || !db) return localListen(coleccion, callback);
  const q = fs.query(fs.collection(db, coleccion));
  return fs.onSnapshot(
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
}

// settings: documento único por clave (ej. cotización dólar)
export function setSetting(key, value) {
  if (modoLocal || !db) {
    const settings = JSON.parse(localStorage.getItem("campogd_settings") || "{}");
    settings[key] = value;
    localStorage.setItem("campogd_settings", JSON.stringify(settings));
    notifyLocal("settings");
    return Promise.resolve();
  }
  return fs.setDoc(fs.doc(db, "settings", key), { value }, { merge: true });
}

export function listenSetting(key, callback) {
  if (modoLocal || !db) {
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
  return fs.onSnapshot(fs.doc(db, "settings", key), (d) => {
    callback(d.exists() ? d.data().value : undefined);
  });
}

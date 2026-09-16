// Escanea una foto de factura (sacada con la cámara o subida) buscando el
// código QR de AFIP y extrayendo fecha, monto, moneda y N° de comprobante.
import { el, toast } from "./utils.js";

let jsQrPromise = null;

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQrPromise) return jsQrPromise;
  jsQrPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload = () => resolve(window.jsQR);
    script.onerror = () => reject(new Error("No se pudo cargar el lector de QR (revisá tu conexión a internet)"));
    document.head.appendChild(script);
  });
  return jsQrPromise;
}

// Las fotos de celular (sobre todo iPhone) vienen con una etiqueta EXIF que
// las "rota" al mostrarlas, pero si no se respeta esa rotación al dibujar en
// el canvas, el QR queda de costado y el lector no lo reconoce. Por eso acá
// pedimos explícitamente la orientación correcta al navegador.
async function cargarImagenOrientada(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // algún navegador viejo no soporta la opción — seguimos con el método de respaldo
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo abrir la imagen")); };
    img.src = url;
  });
}

function dibujarEnCanvas(source, maxSide) {
  const w = source.width, h = source.height;
  const scale = maxSide ? Math.min(1, maxSide / Math.max(w, h)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Prueba a distintas resoluciones — a veces una foto grande tiene el QR
// chiquito y se lee mejor entero; a veces se lee mejor un poco reducida.
async function buscarQR(file) {
  const jsQR = await loadJsQR();
  const source = await cargarImagenOrientada(file);
  for (const maxSide of [1800, null, 1000]) {
    const imageData = dibujarEnCanvas(source, maxSide);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });
    if (code) return code;
  }
  return null;
}

// Decodifica el payload del QR de AFIP (URL con ?p=<base64 JSON>).
// Devuelve { fecha, monto, moneda, comprobante, cuit } o null si no matchea el formato.
export function parseAfipQR(qrText) {
  try {
    const url = new URL(qrText);
    const p = url.searchParams.get("p");
    if (!p) return null;
    const json = JSON.parse(atob(p));
    const monedaMap = { DOL: "USD" };
    const moneda = monedaMap[(json.moneda || "").toUpperCase()] || "$";
    const ptoVta = json.ptoVta ? String(json.ptoVta).padStart(4, "0") : "";
    const nroCmp = json.nroCmp ? String(json.nroCmp).padStart(8, "0") : "";
    return {
      fecha: json.fecha || "",
      monto: typeof json.importe === "number" ? json.importe : parseFloat(json.importe) || 0,
      moneda,
      comprobante: ptoVta && nroCmp ? `${ptoVta}-${nroCmp}` : "",
      cuit: json.cuit ? String(json.cuit) : "",
    };
  } catch {
    return null;
  }
}

function fmtFechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// { onData(parsed) } — se llama recién cuando el usuario confirma la tarjeta
// con los datos leídos (no apenas se detecta el QR).
export function buildScannerPanel({ onData }) {
  const wrap = el("div", { class: "scanner-panel" });
  const status = el("div", { class: "sub", style: "margin-top:8px" },
    "Sacá la foto bien de cerca del cuadrado QR (que ocupe buena parte de la foto, con luz y de frente) — completamos fecha, monto, moneda y N° de comprobante solos.");
  const reviewWrap = el("div", { id: "scan-review-wrap" });

  const inputCamera = el("input", {
    type: "file", accept: "image/*", capture: "environment", id: "scan-camera-input", style: "display:none",
  });
  const inputFile = el("input", {
    type: "file", accept: "image/*", id: "scan-file-input", style: "display:none",
  });

  const btnCamera = el("button", { class: "btn btn-primary", type: "button" }, "📷 Sacar foto");
  btnCamera.addEventListener("click", () => inputCamera.click());
  const btnFile = el("button", { class: "btn btn-ghost", type: "button" }, "Subir foto");
  btnFile.addEventListener("click", () => inputFile.click());
  const btnRow = el("div", { style: "display:flex; gap:8px; flex-wrap:wrap" }, [btnCamera, btnFile]);

  function setScanning(isScanning) {
    btnCamera.disabled = isScanning;
    btnFile.disabled = isScanning;
    btnCamera.textContent = isScanning ? "Leyendo…" : "📷 Sacar foto";
  }

  function mostrarTarjetaConfirmacion(parsed) {
    reviewWrap.innerHTML = "";
    const filas = [
      ["Fecha", fmtFechaLarga(parsed.fecha) || "(no encontrada)"],
      ["Monto", parsed.monto ? `${parsed.moneda} ${parsed.monto.toLocaleString("es-AR")}` : "(no encontrado)"],
      ["N° Comprobante", parsed.comprobante || "(no encontrado)"],
    ];
    if (parsed.cuit) filas.push(["CUIT emisor", parsed.cuit]);

    const card = el("div", { class: "scan-review-card" }, [
      el("div", { class: "eyebrow" }, "QR leído — revisá y confirmá"),
      el("div", { class: "scan-review-rows" }, filas.map(([label, val]) =>
        el("div", { class: "scan-review-row" }, [
          el("span", { class: "scan-review-label" }, label),
          el("span", { class: "scan-review-value" }, val),
        ])
      )),
      el("div", { style: "display:flex; gap:8px; margin-top:12px; flex-wrap:wrap" }, [
        el("button", { class: "btn btn-primary", type: "button", id: "scan-confirm-btn" }, "✓ Usar estos datos"),
        el("button", { class: "btn btn-ghost", type: "button", id: "scan-discard-btn" }, "Descartar"),
      ]),
    ]);
    reviewWrap.appendChild(card);

    document.getElementById("scan-confirm-btn").addEventListener("click", () => {
      onData(parsed);
      toast("Datos completados — revisá Concepto y Proveedor");
      reviewWrap.innerHTML = "";
      status.textContent = "Listo. Completá lo que falte (Concepto, Proveedor/Cliente) y guardá.";
    });
    document.getElementById("scan-discard-btn").addEventListener("click", () => {
      reviewWrap.innerHTML = "";
      status.textContent = "Descartado. Podés sacar la foto de nuevo cuando quieras.";
    });
  }

  async function handleFile(file) {
    if (!file) return;
    reviewWrap.innerHTML = "";
    setScanning(true);
    status.textContent = "Leyendo la imagen…";
    try {
      const code = await buscarQR(file);
      if (!code) {
        status.textContent = "No encontré el QR. Probá de nuevo bien de cerca del cuadrado QR solo (no toda la hoja), con buena luz y sin reflejos — o cargá los datos a mano.";
        return;
      }
      const parsed = parseAfipQR(code.data);
      if (!parsed) {
        status.textContent = "Encontré un QR pero no tiene el formato de factura de AFIP. Cargá los datos a mano.";
        return;
      }
      status.textContent = "";
      mostrarTarjetaConfirmacion(parsed);
    } catch (err) {
      status.textContent = "No se pudo leer la foto: " + err.message;
    } finally {
      setScanning(false);
    }
  }

  inputCamera.addEventListener("change", () => handleFile(inputCamera.files[0]));
  inputFile.addEventListener("change", () => handleFile(inputFile.files[0]));

  wrap.appendChild(btnRow);
  wrap.appendChild(inputCamera);
  wrap.appendChild(inputFile);
  wrap.appendChild(status);
  wrap.appendChild(reviewWrap);
  return wrap;
}

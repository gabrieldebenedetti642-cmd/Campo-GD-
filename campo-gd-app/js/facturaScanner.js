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

function fileToImageData(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // limitamos el lado más largo para que no sea lentísimo con fotos de 12MP+
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo abrir la imagen"));
    };
    img.src = url;
  });
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

// { onData(parsed) } — se llama cuando se detecta y decodifica un QR válido.
export function buildScannerPanel({ onData }) {
  const wrap = el("div", { class: "scanner-panel" });
  const status = el("div", { class: "sub", style: "margin-top:8px" },
    "Sacá una foto de la factura (o subí una) — si tiene el QR de AFIP, completamos fecha, monto, moneda y N° de comprobante solos.");

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

  async function handleFile(file) {
    if (!file) return;
    status.textContent = "Leyendo la imagen...";
    try {
      const imageData = await fileToImageData(file);
      const jsQR = await loadJsQR();
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (!code) {
        status.textContent = "No encontré ningún QR en la foto. Probá con más luz o más de cerca, o cargá los datos a mano.";
        return;
      }
      const parsed = parseAfipQR(code.data);
      if (!parsed) {
        status.textContent = "Encontré un QR pero no tiene el formato de factura de AFIP. Cargá los datos a mano.";
        return;
      }
      status.textContent = `Listo — factura ${parsed.comprobante || ""} del ${parsed.fecha}, ${parsed.moneda} ${parsed.monto}.`;
      onData(parsed);
      toast("Datos de la factura completados");
    } catch (err) {
      status.textContent = "No se pudo leer la foto: " + err.message;
    }
  }

  inputCamera.addEventListener("change", () => handleFile(inputCamera.files[0]));
  inputFile.addEventListener("change", () => handleFile(inputFile.files[0]));

  wrap.appendChild(btnRow);
  wrap.appendChild(inputCamera);
  wrap.appendChild(inputFile);
  wrap.appendChild(status);
  return wrap;
}

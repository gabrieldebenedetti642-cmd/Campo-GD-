// Escanea una foto de factura (sacada con la cámara o subida).
// 1) Intenta leer el código QR de AFIP (más preciso cuando está presente).
// 2) Si no hay QR o no es de AFIP, lee el texto impreso con OCR y trata de
//    extraer fecha, monto, moneda y N° de comprobante con expresiones regulares.
// En los dos casos, los datos completan el formulario pero quedan editables
// para que se revisen antes de guardar (nunca se guarda solo).
import { el, toast } from "./utils.js";

let jsQrPromise = null;
let tesseractPromise = null;

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

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("No se pudo cargar el lector de texto (revisá tu conexión a internet)"));
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

// Convierte el archivo de imagen en un <canvas> redimensionado (lado más
// largo = maxSide) para que tanto el lector de QR como el OCR trabajen rápido
// incluso con fotos de 12MP+.
function fileToCanvas(file, maxSide) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
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

// Intenta leer el texto de una factura impresa (sin QR) y sacar fecha, monto,
// moneda y N° de comprobante con patrones típicos de facturas argentinas.
// Devuelve null si no se pudo sacar nada útil.
export function parseInvoiceText(text) {
  if (!text) return null;
  const norm = text.replace(/\r/g, "");

  let fecha = "";
  const fechaMatch = norm.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (fechaMatch) {
    const [, d, m, y] = fechaMatch;
    fecha = `${y}-${m}-${d}`;
  }

  let comprobante = "";
  const compMatch = norm.match(/(\d{4})\s*-\s*(\d{8})/);
  if (compMatch) {
    comprobante = `${compMatch[1]}-${compMatch[2]}`;
  }

  const moneda = /U\$S|USD|US\$/i.test(norm) ? "USD" : "$";

  let monto = 0;
  const lineas = norm.split("\n");
  for (const linea of lineas) {
    const l = linea.toLowerCase();
    if (l.includes("total") && !l.includes("subtotal")) {
      const numMatch = linea.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g);
      if (numMatch && numMatch.length) {
        const raw = numMatch[numMatch.length - 1];
        const val = parseFloat(raw.replace(/\./g, "").replace(",", "."));
        if (val > 0) {
          monto = val;
          break;
        }
      }
    }
  }

  if (!fecha && !monto && !comprobante) return null;
  return { fecha, monto, moneda, comprobante };
}

async function ocrCanvas(canvas, onProgress) {
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(canvas, "spa", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  return result.data.text;
}

// { onData(parsed) } — se llama cuando se detecta y decodifica un QR válido,
// o cuando el OCR logra sacar al menos un dato de la factura.
export function buildScannerPanel({ onData }) {
  const wrap = el("div", { class: "scanner-panel" });
  const status = el("div", { class: "sub", style: "margin-top:8px" },
    "Sacá una foto de la factura (o subí una). Si tiene el QR de AFIP lo leemos ahí; si no, tratamos de leer el texto impreso. Revisá siempre los datos antes de guardar.");

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
      // 1) QR de AFIP primero (resolución más alta para que se lean bien
      // QRs chicos dentro de fotos grandes).
      const qrCanvas = await fileToCanvas(file, 2000);
      const jsQR = await loadJsQR();
      const qrCtx = qrCanvas.getContext("2d");
      const imageData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "attemptBoth" });

      if (code) {
        const parsed = parseAfipQR(code.data);
        if (parsed) {
          status.textContent = `Listo (QR) — factura ${parsed.comprobante || ""} del ${parsed.fecha}, ${parsed.moneda} ${parsed.monto}.`;
          onData(parsed);
          toast("Datos de la factura completados");
          return;
        }
      }

      // 2) No hay QR (o no es de AFIP): leemos el texto impreso.
      status.textContent = "No encontré un QR válido. Leyendo el texto de la factura, puede tardar unos segundos...";
      const ocrCanvasEl = await fileToCanvas(file, 2200);
      const text = await ocrCanvas(ocrCanvasEl, (pct) => {
        status.textContent = `Leyendo el texto de la factura... ${pct}%`;
      });
      const parsedText = parseInvoiceText(text);

      if (!parsedText) {
        status.textContent = "No pude leer los datos automáticamente (ni QR ni texto). Cargá los campos a mano.";
        return;
      }
      status.textContent = "Listo — completé lo que pude leer del texto. Revisá los datos antes de guardar.";
      onData(parsedText);
      toast("Datos completados, revisalos antes de guardar");
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

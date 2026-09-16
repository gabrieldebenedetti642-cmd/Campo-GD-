// Escanea una foto de factura (cámara o archivo). Primero prueba el QR
// (AFIP Argentina o DGI Uruguay); si no encuentra uno legible, cae
// automáticamente a leer el texto completo de la factura (OCR) y sugiere
// los datos para que el usuario los confirme o corrija.
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

let tesseractPromise = null;
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

// Las fotos de celular a veces vienen con una etiqueta EXIF que las "rota"
// al mostrarlas; si no se respeta esa rotación al dibujar en el canvas, el
// QR queda de costado y no se reconoce. Por eso pedimos la orientación
// correcta explícitamente.
async function cargarImagenOrientada(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // navegador viejo sin soporte — sigue con el método de respaldo
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

// Decodifica el payload del QR de AFIP Argentina (URL con ?p=<base64 JSON>).
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

// Decodifica el QR de DGI Uruguay (e-Factura / CFE):
// https://www.efactura.dgi.gub.uy/consultaQR/cfe?ruc,tipoCFE,serie,nroCFE,monto,fecha,hash
export function parseDgiUruguayQR(qrText) {
  try {
    const url = new URL(qrText);
    if (!url.hostname.includes("efactura.dgi.gub.uy")) return null;
    const p = url.searchParams;
    const getAny = (...keys) => keys.map((k) => p.get(k)).find((v) => v) || "";
    const serie = getAny("serie", "Serie");
    const nro = getAny("nroCFE", "nro", "numero", "Nro");
    const monto = parseFloat((getAny("monto", "importe", "Monto") || "0").replace(",", "."));
    const fecha = getAny("fecha", "Fecha");
    let fechaIso = "";
    const m = fecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) fechaIso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}/.test(fecha)) fechaIso = fecha.slice(0, 10);
    return {
      fecha: fechaIso,
      monto,
      moneda: "$",
      comprobante: serie && nro ? `${serie}-${nro}` : "",
      cuit: getAny("ruc", "RUC"),
    };
  } catch {
    return null;
  }
}

export function parseComprobanteQR(qrText) {
  return parseAfipQR(qrText) || parseDgiUruguayQR(qrText);
}

function fmtFechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ------------------------------------------------------------------
// OCR de respaldo: lee todo el texto de la foto y sugiere candidatos.
// ------------------------------------------------------------------
export function extraerCandidatosImporte(texto) {
  // acepta tanto coma como punto como separador decimal (el OCR a veces confunde uno con otro)
  const regex = /\d{1,3}(?:[.,\s]\d{3})*[.,]\d{2}\b/g;
  const matches = [...texto.matchAll(regex)].map((m) => m[0]);
  const unicos = [...new Set(matches)];
  const parsed = unicos
    .map((s) => {
      const limpio = s.trim();
      const posSep = limpio.length - 3; // separador decimal = 3 caracteres antes del final
      const enteros = limpio.slice(0, posSep).replace(/[.,\s]/g, "");
      const decimales = limpio.slice(posSep + 1);
      return { texto: limpio, valor: parseFloat(`${enteros}.${decimales}`) };
    })
    .filter((x) => x.valor > 0 && isFinite(x.valor));
  parsed.sort((a, b) => b.valor - a.valor); // el más grande primero (suele ser el total)
  return parsed.slice(0, 6);
}

export function extraerFecha(texto) {
  const m = texto.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return "";
  const [, d, mo, y] = m;
  const dd = parseInt(d, 10), mm = parseInt(mo, 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function extraerCandidatoComprobante(texto) {
  const regex = /\b([A-Z])\s?[-.]?\s?(\d{4,8})\b/g;
  const vistos = new Set();
  const out = [];
  for (const m of texto.matchAll(regex)) {
    const val = `${m[1]}-${m[2]}`;
    if (!vistos.has(val)) { vistos.add(val); out.push(val); }
    if (out.length >= 4) break;
  }
  return out;
}

const LINEA_IGNORAR = /^(RUT|TIPO|CFE|SERIE|NUMERO|N.MERO|FECHA|CLIENTE|DOMICILIO|CODIGO|C.DIGO|DESCRIPCION|DESCRIPCI.N|CANTIDAD|SUBTOT|IVA|TOTAL|ADENDA|RESOLUCION|RESOLUCI.N|VERIFICAR|COD\.|F\. DE PAGO|LOCALIDAD|DEPARTAMENTO|NRO|PAIS|PA.S|CR.DITO|CREDITO|e-Factura)/i;

export function extraerCandidatosProveedor(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const candidatos = lineas.filter((l) =>
    l.length > 3 && l.length < 60 && !LINEA_IGNORAR.test(l) && !/^[\d.,\-\/\s]+$/.test(l)
  );
  // preferimos líneas con pocos números sueltos (más probable que sean un nombre y no un RUT/teléfono/código)
  candidatos.sort((a, b) => (a.match(/\d/g) || []).length - (b.match(/\d/g) || []).length);
  return candidatos.slice(0, 5);
}

async function leerTextoFactura(file, onProgress) {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, "spa", {
    logger: (m) => {
      if (onProgress && m.status === "recognizing text") {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  return data.text || "";
}

// ------------------------------------------------------------------
// UI
// ------------------------------------------------------------------
function fieldChips(candidatos, onPick) {
  const chipsWrap = el("div", { class: "chip-picker" });
  candidatos.forEach((c, i) => {
    const label = typeof c === "object" ? c.texto : c;
    const chip = el("button", { class: "chip-btn" + (i === 0 ? " active" : ""), type: "button" }, label);
    chip.addEventListener("click", () => {
      chipsWrap.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
      chip.classList.add("active");
      onPick(typeof c === "object" ? c.valor : c);
    });
    chipsWrap.appendChild(chip);
  });
  return chipsWrap;
}

// { onData(parsed) } — se llama recién cuando el usuario confirma la tarjeta
// (con datos de QR o de OCR) con el botón "Usar estos datos".
export function buildScannerPanel({ onData }) {
  const wrap = el("div", { class: "scanner-panel" });
  const status = el("div", { class: "sub", style: "margin-top:8px" },
    "Sacá una foto de la factura (o subí una). Primero probamos el QR; si no se puede leer, leemos el texto de la factura y te sugerimos los datos.");
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

  function setScanning(isScanning, label) {
    btnCamera.disabled = isScanning;
    btnFile.disabled = isScanning;
    btnCamera.textContent = isScanning ? "Leyendo…" : "📷 Sacar foto";
    if (label) status.textContent = label;
  }

  function confirmarYCerrar(parsed) {
    onData(parsed);
    toast("Datos completados — revisá antes de guardar");
    reviewWrap.innerHTML = "";
    status.textContent = "Listo. Revisá los campos (sobre todo los que vinieron de una sugerencia) y guardá.";
  }

  function mostrarTarjetaQR(parsed) {
    reviewWrap.innerHTML = "";
    const filas = [
      ["Fecha", fmtFechaLarga(parsed.fecha) || "(no encontrada)"],
      ["Monto", parsed.monto ? `${parsed.moneda} ${parsed.monto.toLocaleString("es-AR")}` : "(no encontrado)"],
      ["N° Comprobante", parsed.comprobante || "(no encontrado)"],
    ];
    if (parsed.cuit) filas.push(["RUC/CUIT emisor", parsed.cuit]);
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
    document.getElementById("scan-confirm-btn").addEventListener("click", () => confirmarYCerrar(parsed));
    document.getElementById("scan-discard-btn").addEventListener("click", () => {
      reviewWrap.innerHTML = "";
      status.textContent = "Descartado. Podés sacar la foto de nuevo cuando quieras.";
    });
  }

  function mostrarTarjetaOCR({ fecha, importes, proveedores, comprobantes }) {
    reviewWrap.innerHTML = "";
    const actual = {
      fecha: fecha || "",
      monto: importes[0] ? importes[0].valor : 0,
      moneda: "$",
      comprobante: comprobantes[0] || "",
      proveedor: proveedores[0] || "",
    };

    const fFecha = el("div", { class: "field" }, [
      el("label", {}, "Fecha"),
      el("input", {
        type: "date", value: actual.fecha,
        onchange: (e) => { actual.fecha = e.target.value; },
      }),
    ]);

    const fMonto = el("div", { class: "field" }, [
      el("label", {}, "Monto (elegí uno o corregilo)"),
      el("input", {
        type: "number", value: actual.monto || "", step: "0.01",
        onchange: (e) => { actual.monto = parseFloat(e.target.value) || 0; },
      }),
    ]);
    const chipsMonto = importes.length
      ? fieldChips(importes, (v) => {
          actual.monto = v;
          fMonto.querySelector("input").value = v;
        })
      : el("div", { class: "sub" }, "No encontré ningún monto en la foto.");

    const fProveedor = el("div", { class: "field" }, [
      el("label", {}, "Proveedor / Cliente (revisá, el OCR se equivoca fácil acá)"),
      el("input", {
        type: "text", value: actual.proveedor,
        onchange: (e) => { actual.proveedor = e.target.value; },
      }),
    ]);
    const chipsProveedor = proveedores.length > 1
      ? fieldChips(proveedores, (v) => {
          actual.proveedor = v;
          fProveedor.querySelector("input").value = v;
        })
      : null;

    const fComprobante = el("div", { class: "field" }, [
      el("label", {}, "N° Comprobante"),
      el("input", {
        type: "text", value: actual.comprobante,
        onchange: (e) => { actual.comprobante = e.target.value; },
      }),
    ]);
    const chipsComprobante = comprobantes.length > 1
      ? fieldChips(comprobantes, (v) => {
          actual.comprobante = v;
          fComprobante.querySelector("input").value = v;
        })
      : null;

    const fMoneda = el("div", { class: "field" }, [
      el("label", {}, "Moneda"),
      el("select", {
        onchange: (e) => { actual.moneda = e.target.value; },
      }, [el("option", { value: "$" }, "$"), el("option", { value: "USD" }, "USD")]),
    ]);

    const card = el("div", { class: "scan-review-card" }, [
      el("div", { class: "eyebrow" }, "No encontré QR — esto es lo que leí en el texto. Revisá antes de confirmar:"),
      el("div", { class: "scan-ocr-fields" }, [
        fFecha, fMonto, chipsMonto, fMoneda, fComprobante,
        chipsComprobante, fProveedor, chipsProveedor,
      ].filter(Boolean)),
      el("div", { style: "display:flex; gap:8px; margin-top:14px; flex-wrap:wrap" }, [
        el("button", { class: "btn btn-primary", type: "button", id: "scan-confirm-btn" }, "✓ Usar estos datos"),
        el("button", { class: "btn btn-ghost", type: "button", id: "scan-discard-btn" }, "Descartar"),
      ]),
    ]);
    reviewWrap.appendChild(card);
    document.getElementById("scan-confirm-btn").addEventListener("click", () => confirmarYCerrar(actual));
    document.getElementById("scan-discard-btn").addEventListener("click", () => {
      reviewWrap.innerHTML = "";
      status.textContent = "Descartado. Podés sacar la foto de nuevo cuando quieras.";
    });
  }

  async function intentarOCR(file) {
    setScanning(true, "No encontré QR. Leyendo el texto de la factura (puede tardar unos segundos la primera vez)…");
    try {
      const texto = await leerTextoFactura(file, (pct) => {
        setScanning(true, `Leyendo el texto de la factura… ${pct}%`);
      });
      const importes = extraerCandidatosImporte(texto);
      const proveedores = extraerCandidatosProveedor(texto);
      const comprobantes = extraerCandidatoComprobante(texto);
      const fecha = extraerFecha(texto);
      if (!importes.length && !proveedores.length && !comprobantes.length) {
        status.textContent = "No pude leer nada útil en la foto. Probá con más luz, de frente y sin que tiemble, o cargá los datos a mano.";
        return;
      }
      status.textContent = "";
      mostrarTarjetaOCR({ fecha, importes, proveedores, comprobantes });
    } catch (err) {
      status.textContent = "No se pudo leer el texto de la factura: " + err.message;
    } finally {
      setScanning(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    reviewWrap.innerHTML = "";
    setScanning(true, "Buscando el QR…");
    try {
      const code = await buscarQR(file);
      if (code) {
        const parsed = parseComprobanteQR(code.data);
        if (parsed) {
          setScanning(false);
          status.textContent = "";
          mostrarTarjetaQR(parsed);
          return;
        }
      }
      // no hubo QR legible o no era un formato conocido -> pasar a OCR
      await intentarOCR(file);
    } catch (err) {
      status.textContent = "No se pudo leer la foto: " + err.message;
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
